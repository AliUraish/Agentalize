from typing import Any, Dict, List, Optional
import atexit
import requests
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

from .config import Config
from .context import get_run


class AgentalizeAPIError(RuntimeError):
    """Raised when an explicit evaluation or feedback API request fails."""


class Agentalize:
    """
    The main Agentalize client.
    Manages OpenTelemetry configuration and data transmission.
    """
    _instance: Optional['Agentalize'] = None
    _shutdown_registered: bool = False

    def __init__(self, config: Config):
        self.config = config
        self._is_shutdown = False
        
        # 1. Create Resource (Metadata about who is sending data)
        attributes = {
            "service.name": config.service_name,
            "deployment.environment.name": config.environment,
            "agentalize.sdk.name": "agentalize-python",
            "agentalize.sdk.version": "0.1.0",
        }
        
        # Add agent_id if present (it should be, as Config validates it)
        if config.agent_id:
            attributes["service.instance.id"] = config.agent_id
            # Also adding a custom attribute just in case we want to query by it explicitly later
            attributes["agentalize.agent.id"] = config.agent_id

        if config.service_version:
            attributes["service.version"] = config.service_version
        if config.deployment_id:
            attributes["deployment.id"] = config.deployment_id
        if config.git_commit_sha:
            attributes["vcs.ref.head.revision"] = config.git_commit_sha

        resource = Resource.create(attributes=attributes)

        # 2. Initialize Tracer Provider
        self.tracer_provider = TracerProvider(resource=resource)

        # 3. Configure Exporter
        endpoint = f"{config.api_url}/api/v1/traces" 
        exporter = OTLPSpanExporter(
            endpoint=endpoint,
            headers={"x-api-key": config.api_key}
        )

        # 4. Add Batch Processor (Background thread for sending)
        self._processor = BatchSpanProcessor(exporter)
        self.tracer_provider.add_span_processor(self._processor)

        # 5. Register as Global Tracer
        # This allows trace.get_tracer(__name__) to work anywhere in the user's code
        trace.set_tracer_provider(self.tracer_provider)
        self._http = requests.Session()
        self._http.headers.update(
            {
                "x-api-key": config.api_key,
                "user-agent": "agentalize-python/0.1.0",
            }
        )
        
        # 6. Register atexit handler for graceful shutdown
        self._register_atexit()

    def _register_atexit(self):
        """
        Register the shutdown handler to run when Python exits.
        Only registers once to avoid duplicate handlers.
        """
        if not Agentalize._shutdown_registered:
            atexit.register(self._atexit_handler)
            Agentalize._shutdown_registered = True

    def _atexit_handler(self):
        """
        Handler called when Python exits. Flushes and shuts down gracefully.
        """
        self.shutdown()

    @classmethod
    def initialize(
        cls,
        api_key: Optional[str] = None,
        agent_id: Optional[str] = None,
        api_url: Optional[str] = None,
        environment: Optional[str] = None,
        service_name: Optional[str] = None,
        service_version: Optional[str] = None,
        deployment_id: Optional[str] = None,
        git_commit_sha: Optional[str] = None,
        request_timeout: Optional[float] = None,
    ) -> 'Agentalize':
        """
        Initializes the global Agentalize client.
        """
        config = Config(
            api_key=api_key,
            agent_id=agent_id,
            api_url=api_url,
            environment=environment,
            service_name=service_name,
            service_version=service_version,
            deployment_id=deployment_id,
            git_commit_sha=git_commit_sha,
            request_timeout=request_timeout,
        )
        config.validate()
        
        cls._instance = cls(config)
        return cls._instance

    def _target_id(self, target_id: Optional[str]) -> str:
        if target_id:
            return target_id
        run_id = get_run()
        if run_id:
            return run_id
        span_context = trace.get_current_span().get_span_context()
        if span_context.is_valid:
            return format(span_context.trace_id, "032x")
        raise ValueError(
            "target_id is required outside an active trace or agentalize.context(run_id='...')"
        )

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if self._is_shutdown:
            raise AgentalizeAPIError("Agentalize client is shut down")
        try:
            response = self._http.post(
                f"{self.config.api_url}/api/v1/{path.lstrip('/')}",
                json=payload,
                timeout=self.config.request_timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            detail = ""
            if getattr(exc, "response", None) is not None:
                detail = f": {exc.response.text[:500]}"
            raise AgentalizeAPIError(f"Agentalize API request failed{detail}") from exc
        try:
            return response.json()
        except ValueError as exc:
            raise AgentalizeAPIError("Agentalize API returned invalid JSON") from exc

    def evaluate(
        self,
        metric: str,
        *,
        passed: Optional[bool] = None,
        score: Optional[float] = None,
        label: Optional[str] = None,
        reason: str = "",
        target_id: Optional[str] = None,
        target_type: str = "run",
        rubric_version: str = "v1",
        evaluator_type: str = "application",
        evaluator_name: str = "sdk",
        confidence: float = 1.0,
        evidence_refs: Optional[List[str]] = None,
        triggers_incident: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send an explicit evaluation to the Agentalize backend."""
        payload = {
            "target": {"type": target_type, "id": self._target_id(target_id)},
            "agent_id": self.config.agent_id,
            "environment": self.config.environment,
            "metric": metric,
            "rubric_version": rubric_version,
            "evaluator_type": evaluator_type,
            "evaluator_name": evaluator_name,
            "score": score,
            "label": label,
            "passed": passed,
            "confidence": confidence,
            "reason": reason,
            "evidence_refs": evidence_refs or [],
            "triggers_incident": triggers_incident,
            "metadata": metadata or {},
        }
        return self._post("evaluations", payload)

    def feedback(
        self,
        *,
        rating: Optional[int] = None,
        sentiment: Optional[str] = None,
        category: str = "general",
        comment: str = "",
        target_id: Optional[str] = None,
        target_type: str = "run",
        source_user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send user or application feedback to the Agentalize backend."""
        payload = {
            "target": {"type": target_type, "id": self._target_id(target_id)},
            "agent_id": self.config.agent_id,
            "environment": self.config.environment,
            "rating": rating,
            "sentiment": sentiment,
            "category": category,
            "comment": comment,
            "source_user_id": source_user_id,
            "metadata": metadata or {},
        }
        return self._post("feedback", payload)

    @classmethod
    def get_instance(cls) -> 'Agentalize':
        """
        Returns the global Agentalize client instance.
        """
        if cls._instance is None:
            raise RuntimeError(
                "Agentalize is not initialized. "
                "Please call `agentalize.init(api_key='...', agent_id='...')` first."
            )
        return cls._instance

    def flush(self, timeout_millis: int = 30000) -> bool:
        """
        Forces a flush of all pending spans.
        
        This is useful when you want to ensure all telemetry is sent before
        a critical operation, or at specific checkpoints in your application.
        
        Args:
            timeout_millis: Maximum time to wait for flush to complete (default 30 seconds).
            
        Returns:
            True if flush completed successfully, False if timed out.
        """
        if self._is_shutdown:
            return False
            
        if self.tracer_provider and hasattr(self.tracer_provider, 'force_flush'):
            return self.tracer_provider.force_flush(timeout_millis)
        return True

    def shutdown(self):
        """
        Flushes remaining spans and shuts down the provider.
        
        This method is idempotent - calling it multiple times is safe.
        It's automatically called when Python exits via atexit.
        """
        if self._is_shutdown:
            return
            
        self._is_shutdown = True
        
        if self.tracer_provider:
            try:
                self.tracer_provider.shutdown()
            except Exception:
                # Silently ignore shutdown errors to avoid noise during exit
                pass
        self._http.close()
