import asyncio
import time

from database import init_db
from task_manager import STATUS_FAILED, TaskManager

POLL_SECONDS = 2


async def run_worker() -> None:
    init_db()
    manager = TaskManager()
    print("EcoCode worker started.")
    while True:
        try:
            task = manager.dequeue_task()
            if not task:
                await asyncio.sleep(POLL_SECONDS)
                continue
            await manager.process_task(task.id)
        except Exception as exc:
            # If processing fails before task status update, try marking current task failed.
            try:
                if "task" in locals() and task:
                    manager.update_task_status(
                        task.id,
                        STATUS_FAILED,
                        progress=100,
                        error_message=str(exc),
                    )
            finally:
                print(f"[worker] error: {exc}")
                time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run_worker())
