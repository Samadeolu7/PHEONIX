"""
jobs/views.py

Read-only visibility + manual controls over the Celery Beat schedule
(django_celery_beat.PeriodicTask), for the "Scheduled Jobs" admin page.
"""
from celery import current_app
from django_celery_beat.models import PeriodicTask
from django_celery_results.models import TaskResult
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from jobs.permissions import IsSystemAdmin
from jobs.serializers import ScheduledJobSerializer


class ScheduledJobViewSet(viewsets.ViewSet):
    """
    GET    /api/jobs/scheduled/            — list all periodic tasks
    POST   /api/jobs/scheduled/<id>/toggle/    — flip enabled/disabled
    POST   /api/jobs/scheduled/<id>/run_now/   — queue an immediate run
    """
    permission_classes = [IsSystemAdmin]

    def _get_queryset(self):
        return (
            PeriodicTask.objects
            .exclude(task='celery.backend_cleanup')
            .select_related('crontab', 'interval')
            .order_by('name')
        )

    def list(self, request):
        tasks = list(self._get_queryset())
        task_names = [t.task for t in tasks]
        last_results = {}
        for task_name in set(task_names):
            result = (
                TaskResult.objects
                .filter(task_name=task_name)
                .order_by('-date_done')
                .first()
            )
            if result is not None:
                last_results[task_name] = result

        for t in tasks:
            t.last_result = last_results.get(t.task)

        serializer = ScheduledJobSerializer(tasks, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        task = self._get_queryset().get(pk=pk)
        task.last_result = (
            TaskResult.objects
            .filter(task_name=task.task)
            .order_by('-date_done')
            .first()
        )
        serializer = ScheduledJobSerializer(task)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        task = self._get_queryset().get(pk=pk)
        task.enabled = not task.enabled
        task.save(update_fields=['enabled'])
        return Response({'id': task.id, 'enabled': task.enabled})

    @action(detail=True, methods=['post'], url_path='run-now')
    def run_now(self, request, pk=None):
        task = self._get_queryset().get(pk=pk)
        async_result = current_app.send_task(task.task)
        return Response({'id': task.id, 'task_id': async_result.id, 'queued': True})
