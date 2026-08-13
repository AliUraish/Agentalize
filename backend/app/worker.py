import asyncio

from app.config import get_settings
from app.container import Container


async def run_worker() -> None:
    settings = get_settings()
    container = await Container.create(settings)
    print(f"Agentalize worker started with {container.store.backend_name} storage")
    try:
        while True:
            job = await container.jobs.claim()
            if not job:
                await asyncio.sleep(settings.worker_poll_seconds)
                continue
            try:
                await container.runner.run_job(job)
            except Exception as exc:
                print(f"Job {job.get('jobId')} failed: {exc}")
    finally:
        await container.close()


if __name__ == "__main__":
    asyncio.run(run_worker())

