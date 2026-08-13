from typing import Any

from app.config import Settings
from app.core.ids import new_id
from app.core.time import utc_now
from app.events import EventBroker
from app.models.schemas import AgentMode, InvestigationCreate, MemorySearch
from app.security import TenantContext
from app.services.audit import AuditService
from app.services.jobs import JobService
from app.services.memory import MemoryService
from app.services.repository import OpenAICompatibleClient, RepositoryEvidence, RepositoryInspector
from app.storage import Store, new_document, tenant_query


class InvestigationService:
    def __init__(
        self,
        store: Store,
        events: EventBroker,
        jobs: JobService,
        memory: MemoryService,
        audit: AuditService,
        settings: Settings,
    ) -> None:
        self.store = store
        self.events = events
        self.jobs = jobs
        self.memory = memory
        self.audit = audit
        self.settings = settings
        self.inspector = RepositoryInspector(settings)
        self.ai = OpenAICompatibleClient(settings)
        self.inline_runner: Any = None

    async def start(
        self,
        tenant: TenantContext,
        incident: dict[str, Any],
        payload: InvestigationCreate,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if payload.mode in {AgentMode.monitor, AgentMode.advisor}:
            raise ValueError("An investigation requires investigator mode or higher")
        now = utc_now()
        investigation = new_document(
            tenant.organization_id,
            tenant.project_id,
            investigationId=new_id("inv"),
            incidentId=incident["incidentId"],
            mode=payload.mode.value,
            stage="queued",
            status="queued",
            requestedBy=payload.requested_by,
            question=payload.question,
            repositoryPath=payload.repository_path or str(self.settings.repository_path),
            permissions={
                "readRepository": True,
                "runReproduction": True,
                "writeBranch": payload.mode in {AgentMode.fixer, AgentMode.guarded_autopilot}
                and self.settings.allow_repository_writes,
                "openPullRequest": False,
                "mergeOrDeploy": False,
            },
            budgets={"maxFiles": self.settings.max_repository_files, "maxSteps": 20},
            result=None,
        )
        investigation = await self.store.insert_one("investigations", investigation)
        await self.store.update_one(
            "incidents",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                incidentId=incident["incidentId"],
            ),
            {
                "$set": {
                    "status": "investigating",
                    "activeInvestigationId": investigation["investigationId"],
                    "updatedAt": now,
                },
                "$inc": {"version": 1},
            },
        )
        job = await self.jobs.enqueue(
            tenant,
            "investigate_incident",
            {
                "investigationId": investigation["investigationId"],
                "incidentId": incident["incidentId"],
            },
        )
        await self.audit.record(
            tenant,
            "investigation.started",
            "investigation",
            investigation["investigationId"],
            details={"mode": payload.mode.value, "incidentId": incident["incidentId"]},
        )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "investigation.requested",
            {
                "investigationId": investigation["investigationId"],
                "incidentId": incident["incidentId"],
                "mode": payload.mode.value,
            },
        )
        if self.settings.run_worker_inline and self.inline_runner is not None:
            await self.inline_runner.run_job(job)
        return investigation, job

    async def add_step(
        self,
        tenant: TenantContext,
        investigation_id: str,
        work_mode: str,
        block_type: str,
        summary: str,
        *,
        evidence_refs: list[str] | None = None,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        step = new_document(
            tenant.organization_id,
            tenant.project_id,
            agentStepId=new_id("step"),
            investigationId=investigation_id,
            workMode=work_mode,
            blockType=block_type,
            summary=summary,
            evidenceRefs=evidence_refs or [],
            details=details or {},
        )
        stored = await self.store.insert_one("agentSteps", step)
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "investigation.step",
            {
                "investigationId": investigation_id,
                "step": stored,
            },
        )
        return stored


class InvestigationRunner:
    def __init__(
        self,
        store: Store,
        events: EventBroker,
        jobs: JobService,
        service: InvestigationService,
        memory: MemoryService,
    ) -> None:
        self.store = store
        self.events = events
        self.jobs = jobs
        self.service = service
        self.memory = memory

    async def run_job(self, job: dict[str, Any]) -> dict[str, Any]:
        if job["type"] != "investigate_incident":
            raise ValueError(f"Unsupported job type: {job['type']}")
        tenant = TenantContext(job["organizationId"], job["projectId"], "repo-agent")
        try:
            result = await self.run_investigation(tenant, job["payload"]["investigationId"])
            await self.jobs.complete(job["jobId"], result)
            return result
        except Exception as exc:
            await self.jobs.fail(job, str(exc))
            await self.store.update_one(
                "investigations",
                tenant_query(
                    tenant.organization_id,
                    tenant.project_id,
                    investigationId=job["payload"]["investigationId"],
                ),
                {
                    "$set": {
                        "status": "failed",
                        "stage": "failed",
                        "error": str(exc)[:2_000],
                        "updatedAt": utc_now(),
                    }
                },
            )
            raise

    async def run_investigation(
        self, tenant: TenantContext, investigation_id: str
    ) -> dict[str, Any]:
        investigation = await self.store.find_one(
            "investigations",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                investigationId=investigation_id,
            ),
        )
        if not investigation:
            raise ValueError("Investigation not found")
        incident = await self.store.find_one(
            "incidents",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                incidentId=investigation["incidentId"],
            ),
        )
        if not incident:
            raise ValueError("Incident not found")

        await self._stage(tenant, investigation_id, "retrieve_memory")
        memories = await self.memory.search(
            tenant,
            MemorySearch(
                query=f"{incident.get('title', '')} {incident.get('summary', '')}",
                agent_id=incident.get("agentId"),
                limit=5,
            ),
        )
        await self.service.add_step(
            tenant,
            investigation_id,
            "retrieve_memory",
            "result",
            f"Retrieved {len(memories)} relevant historical memories.",
            evidence_refs=[item["memoryId"] for item in memories],
        )

        await self._stage(tenant, investigation_id, "diagnose")
        root = self.service.inspector.validate_root(investigation.get("repositoryPath"))
        evidence = self.service.inspector.search(
            root, f"{incident.get('title', '')} {incident.get('summary', '')}"
        )
        await self.service.add_step(
            tenant,
            investigation_id,
            "diagnose",
            "observation",
            f"Inspected the repository and found {len(evidence)} candidate code locations.",
            evidence_refs=[f"{item.path}:{item.line}" for item in evidence],
            details={"repositoryEvidence": [item.__dict__ for item in evidence]},
        )

        ai_result = await self.service.ai.analyze(incident, evidence, memories)
        diagnosis = ai_result or self._deterministic_diagnosis(incident, evidence, memories)
        hypothesis = new_document(
            tenant.organization_id,
            tenant.project_id,
            hypothesisId=new_id("hyp"),
            incidentId=incident["incidentId"],
            investigationId=investigation_id,
            claim=diagnosis["hypothesis"],
            confidence=float(diagnosis.get("confidence", 0.55)),
            reasoningSummary=diagnosis.get("reasoning_summary", ""),
            evidenceRefs=[f"{item.path}:{item.line}" for item in evidence],
            status="proposed",
        )
        hypothesis = await self.store.insert_one("hypotheses", hypothesis)
        await self.service.add_step(
            tenant,
            investigation_id,
            "diagnose",
            "hypothesis",
            diagnosis["hypothesis"],
            evidence_refs=hypothesis["evidenceRefs"],
            details={"confidence": hypothesis["confidence"]},
        )

        mode = investigation["mode"]
        remediation = None
        if mode in {"fixer", "guarded_autopilot"}:
            await self._stage(tenant, investigation_id, "remediate")
            remediation = await self._create_remediation(
                tenant, incident, investigation, diagnosis, evidence
            )
            await self.service.add_step(
                tenant,
                investigation_id,
                "remediate",
                "result",
                "Prepared a dry-run regression test and remediation proposal for review.",
                evidence_refs=[remediation["remediationId"]],
            )

        status = "completed"
        stage = "fix_proposed" if remediation else "diagnosed"
        result = {
            "hypothesisId": hypothesis["hypothesisId"],
            "remediationId": remediation["remediationId"] if remediation else None,
            "memoryIds": [item["memoryId"] for item in memories],
            "repositoryEvidenceCount": len(evidence),
        }
        await self.store.update_one(
            "investigations",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                investigationId=investigation_id,
            ),
            {
                "$set": {
                    "status": status,
                    "stage": stage,
                    "result": result,
                    "completedAt": utc_now(),
                    "updatedAt": utc_now(),
                }
            },
        )
        await self.store.update_one(
            "incidents",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                incidentId=incident["incidentId"],
            ),
            {
                "$set": {
                    "status": "fix_proposed" if remediation else "investigating",
                    "bestHypothesis": {
                        "hypothesisId": hypothesis["hypothesisId"],
                        "claim": hypothesis["claim"],
                        "confidence": hypothesis["confidence"],
                    },
                    "updatedAt": utc_now(),
                },
                "$inc": {"version": 1},
            },
        )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "investigation.completed",
            {"investigationId": investigation_id, "incidentId": incident["incidentId"], **result},
        )
        return result

    async def _stage(
        self, tenant: TenantContext, investigation_id: str, stage: str
    ) -> None:
        await self.store.update_one(
            "investigations",
            tenant_query(
                tenant.organization_id,
                tenant.project_id,
                investigationId=investigation_id,
            ),
            {"$set": {"status": "running", "stage": stage, "updatedAt": utc_now()}},
        )
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "investigation.stage_changed",
            {"investigationId": investigation_id, "stage": stage},
        )

    @staticmethod
    def _deterministic_diagnosis(
        incident: dict[str, Any],
        evidence: list[RepositoryEvidence],
        memories: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if evidence:
            top = evidence[0]
            hypothesis = (
                f"The failure is likely connected to {top.path}:{top.line}, where code matches "
                "the production signal. Confirm by reproducing the failing trace input."
            )
        else:
            hypothesis = (
                "No direct code match was found. The next step is to reproduce the failing run "
                "using its redacted input and deployed commit."
            )
        if memories:
            hypothesis += f" A related verified memory is '{memories[0].get('title', 'previous incident')}'."
        return {
            "hypothesis": hypothesis,
            "confidence": 0.62 if evidence else 0.35,
            "reasoning_summary": "Based on incident text, scoped repository matches, and verified memory.",
            "recommended_test": f"Add a regression test for: {incident.get('title', 'the failing run')}",
            "recommended_change": "Apply the smallest change at the confirmed failing code path.",
            "risk": "medium",
        }

    async def _create_remediation(
        self,
        tenant: TenantContext,
        incident: dict[str, Any],
        investigation: dict[str, Any],
        diagnosis: dict[str, Any],
        evidence: list[RepositoryEvidence],
    ) -> dict[str, Any]:
        target = evidence[0] if evidence else None
        suggested_diff = (
            f"# Dry-run proposal only\n"
            f"# Target: {target.path + ':' + str(target.line) if target else 'requires reproduction'}\n"
            f"# Test: {diagnosis.get('recommended_test')}\n"
            f"# Change: {diagnosis.get('recommended_change')}\n"
        )
        remediation = new_document(
            tenant.organization_id,
            tenant.project_id,
            remediationId=new_id("rem"),
            incidentId=incident["incidentId"],
            investigationId=investigation["investigationId"],
            status="awaiting_review",
            baseSha=incident.get("gitCommitSha"),
            branch=None,
            dryRun=not investigation["permissions"]["writeBranch"],
            proposedFiles=[target.path] if target else [],
            suggestedDiff=suggested_diff,
            regressionTest=diagnosis.get("recommended_test"),
            recommendedChange=diagnosis.get("recommended_change"),
            risk=diagnosis.get("risk", "medium"),
            testPlan=[
                {"name": "regression", "status": "not_run"},
                {"name": "targeted_suite", "status": "not_run"},
            ],
            approvals=[],
        )
        stored = await self.store.insert_one("remediations", remediation)
        await self.events.publish(
            tenant.organization_id,
            tenant.project_id,
            "remediation.proposed",
            {"remediationId": stored["remediationId"], "incidentId": incident["incidentId"]},
        )
        return stored
