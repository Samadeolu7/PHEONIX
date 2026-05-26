# cash_management/apps.py
from django.apps import AppConfig


class CashManagementConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cash_management'
    verbose_name = 'Cash Collection & Custody Management'
    
    def ready(self):
        # Import signals if you have any
        pass
