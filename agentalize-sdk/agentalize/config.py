import os
from typing import Optional

class Config:
    """
    Configuration settings for the Agentalize SDK.
    Handles API keys and Agent IDs.
    """
    def __init__(
        self,
        api_key: Optional[str] = None,
        agent_id: Optional[str] = None,
        api_url: Optional[str] = None,
        environment: Optional[str] = None,
        service_name: Optional[str] = None,
        service_version: Optional[str] = None,
        deployment_id: Optional[str] = None,
        git_commit_sha: Optional[str] = None,
        request_timeout: Optional[float] = None,
    ):
        self.api_key = api_key or os.environ.get("AGENTALIZE_API_KEY")
        self.agent_id = agent_id or os.environ.get("AGENTALIZE_AGENT_ID")
        self.api_url = (api_url or os.environ.get("AGENTALIZE_API_URL", "https://api.agentalize.co")).rstrip("/")
        self.environment = environment or os.environ.get("AGENTALIZE_ENVIRONMENT", "production")
        self.service_name = service_name or os.environ.get("AGENTALIZE_SERVICE_NAME", "agentalize-python-agent")
        self.service_version = service_version or os.environ.get("AGENTALIZE_SERVICE_VERSION")
        self.deployment_id = deployment_id or os.environ.get("AGENTALIZE_DEPLOYMENT_ID")
        self.git_commit_sha = git_commit_sha or os.environ.get("AGENTALIZE_GIT_COMMIT_SHA")
        timeout_value = request_timeout or os.environ.get("AGENTALIZE_REQUEST_TIMEOUT", "10")
        self.request_timeout = float(timeout_value)

    def validate(self):
        """
        Checks if the configuration is valid (i.e., has an API key and Agent ID).
        Raises a ValueError if the key is missing.
        """
        if not self.api_key:
            raise ValueError(
                "Agentalize API Key is missing. "
                "Please provide it via `agentalize.init(api_key='...')` "
                "or set the `AGENTALIZE_API_KEY` environment variable."
            )
            
        if not self.agent_id:
            raise ValueError(
                "Agentalize Agent ID is missing. "
                "Please provide it via `agentalize.init(agent_id='...')` "
                "or set the `AGENTALIZE_AGENT_ID` environment variable."
            )

        if not self.api_url.startswith(("http://", "https://")):
            raise ValueError("Agentalize API URL must start with http:// or https://")

        if self.request_timeout <= 0:
            raise ValueError("Agentalize request timeout must be greater than zero")
