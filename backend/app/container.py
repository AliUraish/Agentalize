from dataclasses import dataclass

from app.config import Settings
from app.events import EventBroker
from app.services.audit import AuditService
from app.services.deployments import DeploymentService
from app.services.evaluations import EvaluationService
from app.services.feedback import FeedbackService
from app.services.incidents import IncidentService
from app.services.investigations import InvestigationRunner, InvestigationService
from app.services.jobs import JobService
from app.services.memory import MemoryService
from app.services.telemetry import TelemetryService
from app.storage import Store, create_store


@dataclass
class Container:
    settings: Settings
    store: Store
    events: EventBroker
    incidents: IncidentService
    evaluations: EvaluationService
    feedback: FeedbackService
    telemetry: TelemetryService
    deployments: DeploymentService
    jobs: JobService
    memory: MemoryService
    audit: AuditService
    investigations: InvestigationService
    runner: InvestigationRunner

    @classmethod
    async def create(cls, settings: Settings) -> "Container":
        store = await create_store(settings)
        events = EventBroker()
        incidents = IncidentService(store, events)
        evaluations = EvaluationService(store, events, incidents)
        feedback = FeedbackService(store, events, evaluations)
        telemetry = TelemetryService(store, events, incidents)
        deployments = DeploymentService(store, events)
        jobs = JobService(store)
        memory = MemoryService(store, settings)
        audit = AuditService(store, events)
        investigations = InvestigationService(
            store, events, jobs, memory, audit, settings
        )
        runner = InvestigationRunner(store, events, jobs, investigations, memory)
        investigations.inline_runner = runner
        return cls(
            settings=settings,
            store=store,
            events=events,
            incidents=incidents,
            evaluations=evaluations,
            feedback=feedback,
            telemetry=telemetry,
            deployments=deployments,
            jobs=jobs,
            memory=memory,
            audit=audit,
            investigations=investigations,
            runner=runner,
        )

    async def close(self) -> None:
        await self.store.close()

