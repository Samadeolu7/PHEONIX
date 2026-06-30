import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

import django
from django.conf import settings

settings.DATABASES['default'] = {
    'ENGINE': 'django.db.backends.sqlite3',
    'NAME': ':memory:',
}

if __name__ == '__main__':
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
