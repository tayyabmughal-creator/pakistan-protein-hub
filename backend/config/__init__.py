# Import the Celery app at Django startup so @shared_task decorators bind to it.
from .celery import app as celery_app

__all__ = ("celery_app",)
