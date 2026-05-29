import django
from django.conf import settings

def pytest_configure(config):
    import os
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
