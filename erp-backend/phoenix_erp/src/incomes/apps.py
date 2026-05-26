from django.apps import AppConfig


class IncomesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'incomes'
    
    def ready(self):
        """Import signal handlers when app is ready"""
        import incomes.signals  # noqa
