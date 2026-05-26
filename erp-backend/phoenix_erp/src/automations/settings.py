# automations/settings.py
"""
App-level settings for the automations app.

This file defines sane defaults and reads overrides from the project's
Django settings by looking for an `AUTOMATIONS` dict.

Example project settings override:

AUTOMATIONS = {
    "ALLOW_UNSAFE_INTERNAL_ACTIONS": False,
    "ALLOWED_INTERNAL_ACTIONS": {
        "send_email": "myapp.actions.send_email",
        "create_kyc_task": "myapp.actions.create_kyc_task",
    },
    "CELERY_TASK_RETRY_COUNT": 3,
    "EXTERNAL_API_TIMEOUT": 30,
}
"""
from django.conf import settings as project_settings

_PROJECT_CFG = getattr(project_settings, "AUTOMATIONS", {})

ALLOW_UNSAFE_INTERNAL_ACTIONS = _PROJECT_CFG.get("ALLOW_UNSAFE_INTERNAL_ACTIONS", False)
ALLOWED_INTERNAL_ACTIONS = _PROJECT_CFG.get("ALLOWED_INTERNAL_ACTIONS", {})  # name -> dotted path
CELERY_TASK_RETRY_COUNT = int(_PROJECT_CFG.get("CELERY_TASK_RETRY_COUNT", 3))
EXTERNAL_API_TIMEOUT = int(_PROJECT_CFG.get("EXTERNAL_API_TIMEOUT", 30))
