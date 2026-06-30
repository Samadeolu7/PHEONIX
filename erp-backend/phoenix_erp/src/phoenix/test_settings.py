import os

import django
from django.conf import settings

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.admin',
    'rest_framework',
    'branches',
    'accounts',
    'transactions',
    'reports',
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

SECRET_KEY = 'test-secret-key-not-for-production'

USE_TZ = True

ROOT_URLCONF = 'phoenix.urls'

MIDDLEWARE = []

MIGRATION_MODULES = {}

TENANT_MODE = False
