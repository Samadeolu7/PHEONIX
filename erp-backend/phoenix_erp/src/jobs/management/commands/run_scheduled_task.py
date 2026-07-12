"""
Management command: run_scheduled_task
========================================
Generic manual/backfill entry point for any Celery Beat periodic task, for
use when the schedule missed a run (e.g. beat was down). Looks the task up
by its PeriodicTask name (the CELERY_BEAT_SCHEDULE dict key, e.g.
'apply-smart-savings-interest') rather than needing a bespoke command per
task.

Usage
-----
# List every scheduled job and whether it's enabled
    python manage.py run_scheduled_task --list

# Run synchronously, in this process, and print the result immediately
    python manage.py run_scheduled_task apply-smart-savings-interest

# Queue it through the real broker/worker instead (non-blocking)
    python manage.py run_scheduled_task apply-smart-savings-interest --async
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Manually run (or queue) a Celery Beat periodic task by name."

    def add_arguments(self, parser):
        parser.add_argument(
            "name", nargs="?", default=None,
            help="PeriodicTask name (see --list for valid names).",
        )
        parser.add_argument(
            "--async", dest="run_async", action="store_true",
            help="Queue via the real broker/worker instead of running synchronously here.",
        )
        parser.add_argument(
            "--list", action="store_true",
            help="List all scheduled jobs and exit.",
        )

    def handle(self, *args, **options):
        from django_celery_beat.models import PeriodicTask

        if options["list"] or not options["name"]:
            self.stdout.write("Scheduled jobs:")
            for pt in PeriodicTask.objects.exclude(task='celery.backend_cleanup').order_by('name'):
                self.stdout.write(f"  {'[ON] ' if pt.enabled else '[OFF]'} {pt.name} -> {pt.task}")
            if not options["name"]:
                return

        try:
            task = PeriodicTask.objects.get(name=options["name"])
        except PeriodicTask.DoesNotExist:
            raise CommandError(f"No PeriodicTask named '{options['name']}'. Use --list to see valid names.")

        if options["run_async"]:
            from celery import current_app
            async_result = current_app.send_task(task.task)
            self.stdout.write(self.style.SUCCESS(f"Queued '{task.name}' ({task.task}) — task_id={async_result.id}"))
            return

        import importlib

        self.stdout.write(f"Running '{task.name}' ({task.task}) synchronously...")
        module_path, func_name = task.task.rsplit('.', 1)
        try:
            module = importlib.import_module(module_path)
            registered = getattr(module, func_name)
        except (ImportError, AttributeError) as exc:
            raise CommandError(f"Could not import task '{task.task}': {exc}")
        result = registered.apply().get()
        self.stdout.write(self.style.SUCCESS(f"Done. Result: {result}"))
