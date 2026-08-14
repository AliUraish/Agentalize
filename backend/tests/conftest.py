from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path: Path):
    repo = tmp_path / "repo"
    repo.mkdir()
    source = repo / "python_gpt_agent"
    source.mkdir()
    (source / "fetcher.py").write_text(
        "import requests\n\ndef fetch_article(url):\n    return requests.get(url, timeout=15)\n",
        encoding="utf-8",
    )
    settings = Settings(
        storage_backend="memory",
        run_worker_inline=True,
        demo_repository_path=repo,
        sdk_api_key="test-sdk-key",
        debug=False,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def sdk_headers() -> dict[str, str]:
    return {"x-api-key": "test-sdk-key"}


@pytest.fixture
def ui_headers() -> dict[str, str]:
    return {
        "x-organization-id": "org_demo",
        "x-project-id": "project_demo",
        "x-actor-id": "test-user",
    }
