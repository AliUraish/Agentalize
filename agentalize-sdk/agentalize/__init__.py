from typing import Optional
from .client import Agentalize, AgentalizeAPIError
from .decorators import trace
from .context import (
    context,
    set_user,
    set_session,
    set_conversation,
    set_run,
    set_metadata,
    with_context,
    AgentalizeContext,
)


def init(
    api_key: Optional[str] = None,
    agent_id: Optional[str] = None,
    api_url: Optional[str] = None,
    environment: Optional[str] = None,
    service_name: Optional[str] = None,
    service_version: Optional[str] = None,
    deployment_id: Optional[str] = None,
    git_commit_sha: Optional[str] = None,
    request_timeout: Optional[float] = None,
) -> Agentalize:
    """
    Initialize the Agentalize SDK.
    
    Args:
        api_key: Your Agentalize API Key. If not provided, reads from AGENTALIZE_API_KEY env var.
        agent_id: The ID of the agent to track. If not provided, reads from AGENTALIZE_AGENT_ID env var.
    Returns:
        The initialized Agentalize client instance.
    """
    return Agentalize.initialize(
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


def evaluate(metric: str, **kwargs):
    """Send an evaluation using the initialized client."""
    return Agentalize.get_instance().evaluate(metric, **kwargs)


def feedback(**kwargs):
    """Send user or application feedback using the initialized client."""
    return Agentalize.get_instance().feedback(**kwargs)


def flush(timeout_millis: int = 30000) -> bool:
    """
    Force flush all pending telemetry data.
    
    This is useful when you want to ensure all traces are sent before
    a critical operation, at specific checkpoints, or before exiting.
    
    Note: The SDK automatically flushes on normal Python exit via atexit.
    
    Args:
        timeout_millis: Maximum time to wait for flush (default 30 seconds).
        
    Returns:
        True if flush completed successfully, False if timed out or not initialized.
        
    Example:
        >>> agentalize.init(api_key="...", agent_id="...")
        >>> # ... your agent code ...
        >>> agentalize.flush()  # Ensure all data is sent
    """
    try:
        client = Agentalize.get_instance()
        return client.flush(timeout_millis)
    except RuntimeError:
        # SDK not initialized
        return False


def shutdown():
    """
    Manually shut down the SDK and flush all pending data.
    
    This is automatically called on Python exit, but can be called
    manually if you need to shut down the SDK before the process ends.
    
    This method is idempotent - calling it multiple times is safe.
    """
    try:
        client = Agentalize.get_instance()
        client.shutdown()
    except RuntimeError:
        # SDK not initialized
        pass


__all__ = [
    "init",
    "Agentalize",
    "AgentalizeAPIError",
    "trace",
    "flush",
    "shutdown",
    "evaluate",
    "feedback",
    # Context management
    "context",
    "set_user",
    "set_session",
    "set_conversation",
    "set_run",
    "set_metadata",
    "with_context",
    "AgentalizeContext",
]
