from django.utils import timezone

from .models import AutomationRun

def run_due_automations():
    """Execute all AutomationRun instances scheduled_at <= now and not yet executed."""
    now = timezone.now()
    due = AutomationRun.objects.filter(is_deleted=False, executed_at__isnull=True, scheduled_at__lte=now)
    for run in due:
        run.advance()