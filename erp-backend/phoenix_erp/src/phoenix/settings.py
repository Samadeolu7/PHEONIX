"""
Django settings for phoenix project - PRODUCTION READY

This file uses environment variables for all sensitive data.
Add a .env file or set environment variables before deploying.
"""

import os
import sys
from pathlib import Path
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from a .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / '.env')
except Exception:
    # If python-dotenv is not installed or .env is missing, continue silently
    pass

# ==================================================
# SECURITY SETTINGS
# ==================================================

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-7s-bq6x2p^i8cz4+ljgv9%71fco*)__d=9yqt&5!x!@qfra9&%'  # Only for development
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DEBUG', 'True') == 'True'  # Default to True for development

SECURE_SSL_REDIRECT = False  # Disable HTTP->HTTPS redirect
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

SESSION_COOKIE_SECURE = False  # Allow cookies over HTTP internally
CSRF_COOKIE_SECURE = False
# Allowed hosts from environment variable (comma-separated)
# Support for multi-tenancy with subdomains and custom domains
ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "testserver",
    "172.20.0.4",
    ".localhost",                    # Allow any subdomain of localhost (tenant1.localhost)
    ".krystartrust.ng",              # Allow any subdomain (tenant1.yourdomain.com)
    ".mastermouldersacademy.org",    # Custom-domain tenant (erp.mastermouldersacademy.org)
]

# Add additional hosts from environment variable
if os.environ.get('ALLOWED_HOSTS'):
    ALLOWED_HOSTS.extend(os.environ.get('ALLOWED_HOSTS', '').split(','))

# In production, you should:
# 1. Set ALLOWED_HOSTS env var to your actual domain(s)
# 2. Configure DNS wildcard: *.yourdomain.com → your server IP
# 3. Configure SSL wildcard certificate for *.yourdomain.com

# Disable SSL redirect for tests
# Check if running tests via environment variable or test command
TESTING = (
    os.environ.get('TESTING', '').lower() == 'true' or
    'test' in sys.argv or
    'pytest' in sys.argv[0] if sys.argv else False
)

# Check if running dev server
RUNNING_DEVSERVER = ('runserver' in sys.argv)

# ==================================================
# TRAEFIK/PROXY CONFIGURATION
# ==================================================
# Trust the X-Forwarded-Proto header from Traefik/reverse proxy
# This allows Django to detect HTTPS connections correctly
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Trust forwarded host and port headers from Traefik
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# ==================================================
# SSL/HTTPS SETTINGS
# ==================================================
# Only enforce HTTPS redirect in production (not dev server, not tests, not internal docker)
# Traefik handles SSL termination, internal Docker network uses HTTP
if not DEBUG and not RUNNING_DEVSERVER and not TESTING:
    # SSL redirect is handled by Traefik, not Django
    SECURE_SSL_REDIRECT = False  # Traefik does this
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    # HSTS headers - let Traefik handle these
    # SECURE_HSTS_SECONDS = 31536000
    # SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    # SECURE_HSTS_PRELOAD = True
    X_FRAME_OPTIONS = 'DENY'
else:
    # Development/Test settings - disable SSL requirements
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

# Custom user model
AUTH_USER_MODEL = 'users.User'

# ==================================================
# TENANT CONFIGURATION
# ==================================================

# Allow requests without tenant in development mode
# Set to False in production to enforce tenant requirement
REQUIRE_TENANT = os.environ.get('REQUIRE_TENANT', 'True' if not DEBUG else 'False') == 'True'

# Default tenant slug to use when none is detected (for development)
DEFAULT_TENANT_SLUG = os.environ.get('DEFAULT_TENANT_SLUG', 'mt')

# ==================================================
# APPLICATION DEFINITION
# ==================================================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_celery_beat',
    'drf_spectacular',
    'corsheaders',
    'django_extensions',
    'django_filters',
    
    # Phoenix ERP apps
    'core',
    'common',
    'users',
    'accounts',
    'transactions',
    'automations',
    'branches',
    'phoenix',
    'hr',
    'clients',
    'dashboards',
    'products',
    'reports',
    'loans',
    'savings',
    'liabilities',
    'incomes',
    'expenses',
    'tickets',
    'inventory',
    'assets',
    'analytics',
    'procurement',
    'widgets',
    'pages',
    'queries',  # Temporarily disabled - needs migrations
    'jobs',
    'notifications',
    'receivables',  # Unified AR module
    'cash_management',
    'budgets',  # Budget management and variance reporting
    'banks',  # Bank management system
    'internal_api',  # Internal endpoints consumed by Java microservices
    'permissions',  # Granular scope-aware permission system
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.gzip.GZipMiddleware',           # compress API responses
    'django.middleware.http.ConditionalGetMiddleware', # ETag / Last-Modified support
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Tenant middleware - must be after authentication
    'common.middleware.TenantMiddleware',  # Identifies tenant from subdomain/domain
    # 'common.middleware.TenantFeatureMiddleware',  # Checks feature access
    'common.middleware.AuditContextMiddleware',   # Threads user+IP into audit signals
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Add subscription middleware only if not testing
if not TESTING:
    MIDDLEWARE.append('accounts.middleware.SubscriptionAccessMiddleware')

ROOT_URLCONF = 'phoenix.urls'

# ==================================================
# CORS CONFIGURATION
# ==================================================
# The frontend at https://erp.krystartrust.ng makes direct CORS requests to
# https://api.erp.krystartrust.ng/api/... — no reverse-proxy rewrite needed.
# django-cors-headers handles the Access-Control-Allow-Origin header.

if DEBUG:
    # Allow everything locally (dev server, tests, Postman, etc.)
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.environ.get(
            'CORS_ALLOWED_ORIGINS',
            'https://erp.krystartrust.ng,'
            'https://api.erp.krystartrust.ng,'
            'https://erp.mastermouldersacademy.org,'
            'https://erp-cgun.vercel.app,'
            'http://localhost:3000,'
            'http://localhost:5173,'
            'http://localhost:4173,'
            'http://127.0.0.1:4173,'
            'http://127.0.0.1:3000,'
            'http://127.0.0.1:5173',
        ).split(',')
        if origin.strip()
    ]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# Cache preflight responses for 10 minutes to reduce OPTIONS round-trips
CORS_PREFLIGHT_MAX_AGE = 600

# ==================================================
# REST FRAMEWORK CONFIGURATION
# ==================================================

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'common.pagination.StandardResultsPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ] if not DEBUG else [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'EXCEPTION_HANDLER': 'common.error_handlers.custom_exception_handler',
}

# ==================================================
# JWT CONFIGURATION
# ==================================================

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    'JTI_CLAIM': 'jti',
}

# ==================================================
# TEMPLATES CONFIGURATION
# ==================================================

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'phoenix.wsgi.application'

# ==================================================
# DATABASE CONFIGURATION
# ==================================================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'phoenix_db'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'samore7'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'ATOMIC_REQUESTS': True,
        'CONN_MAX_AGE': 600,  # Keep connections alive for 10 minutes
        'OPTIONS': {
            'client_encoding': 'UTF8',
            'connect_timeout': 10,
        },
    }
}

# ==================================================
# PASSWORD VALIDATION
# ==================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ==================================================
# INTERNATIONALIZATION
# ==================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.environ.get('TIME_ZONE', 'UTC')
USE_I18N = False  # App is English-only; disabling saves per-request locale overhead
USE_TZ = True

# ==================================================
# STATIC FILES CONFIGURATION
# ==================================================

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Ensure the media directory exists (required for file uploads in production)
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Additional locations of static files
STATICFILES_DIRS = [
    # BASE_DIR / 'static',  # Uncomment if you have a static folder
]

# WhiteNoise configuration for efficient static file serving
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
# Cache hashed static assets for 1 year (immutable)
WHITENOISE_MAX_AGE = 31536000
# Enable Brotli compression when available (falls back to gzip)
WHITENOISE_USE_FINDERS = False

# ==================================================
# DEFAULT PRIMARY KEY FIELD TYPE
# ==================================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ==================================================
# JAVA MICROSERVICE URLS
# ==================================================
# URL of the Bank-Recon Spring Boot service (App 3)
# Override via BANK_RECON_SERVICE_URL env var in production.
BANK_RECON_SERVICE_URL = os.environ.get(
    'BANK_RECON_SERVICE_URL', 'http://localhost:8081'
)

# ==================================================
# DRF SPECTACULAR (API DOCUMENTATION)
# ==================================================

SPECTACULAR_SETTINGS = {
    'TITLE': 'Phoenix ERP API',
    'DESCRIPTION': 'Complete ERP system API documentation',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SWAGGER_UI_SETTINGS': {
        'persistAuthorization': True,
        'deepLinking': True,
        'displayOperationId': True,
        'filter': True,
        'supportedSubmitMethods': ['get', 'post', 'put', 'patch', 'delete'],
    },
    'COMPONENT_SPLIT_REQUEST': True,
    'SCHEMA_PATH_PREFIX': r'/api/',
    'SERVERS': [
        {'url': 'http://localhost:8000', 'description': 'Development server'},
    ] if DEBUG else [
        {'url': 'https://api.erp.krystartrust.ng', 'description': 'Production server'},
        {'url': 'http://localhost:8000', 'description': 'Development server'},
    ],
    # Commented out - causing TypeError with DeferredAttribute
    # 'ENUM_NAME_OVERRIDES': {
    #     # Status field enum overrides
    #     'TicketStatusEnum': 'tickets.models.Ticket.status',
    #     ...
    # },
}

# ==================================================
# AUTOMATIONS CONFIGURATION
# ==================================================

AUTOMATIONS = {
    "ALLOW_UNSAFE_INTERNAL_ACTIONS": False,
    "ALLOWED_INTERNAL_ACTIONS": {
        "send_email": "phoenix.actions.send_email",
        # Add more allowed actions here
    },
    "CELERY_TASK_RETRY_COUNT": 3,
    "EXTERNAL_API_TIMEOUT": 30,
}

# ==================================================
# CELERY CONFIGURATION
# ==================================================

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60  # 25 minutes (soft limit before hard limit)
CELERY_WORKER_MAX_TASKS_PER_CHILD = 1000  # Restart worker after 1000 tasks
CELERY_WORKER_PREFETCH_MULTIPLIER = 4
CELERY_TASK_ACKS_LATE = True  # Tasks acknowledged after execution
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# Celery Beat Schedule (Phase 2B: Auto-escalation)
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'check-approval-timeouts': {
        'task': 'automations.tasks.check_approval_timeouts',
        'schedule': crontab(minute=0),  # Every hour at :00
        'options': {
            'expires': 3600,  # Task expires after 1 hour
        }
    },
    'process-expired-permission-overrides': {
        'task': 'permissions.tasks.process_expired_permission_overrides',
        'schedule': crontab(minute=0),  # Every hour at :00
        'options': {
            'expires': 3600,
        }
    },
    'send-permission-expiry-warnings': {
        'task': 'permissions.tasks.send_expiry_warning_notifications',
        'schedule': crontab(minute=0),  # Every hour at :00
        'options': {
            'expires': 3600,
        }
    },
}

# ==================================================
# EMAIL CONFIGURATION
# ==================================================

EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend'
)
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'False') == 'True'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@phoenixerp.com')
SERVER_EMAIL = os.environ.get('SERVER_EMAIL', DEFAULT_FROM_EMAIL)
EMAIL_TIMEOUT = 10  # Seconds

# ==================================================
# LOGGING CONFIGURATION
# ==================================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/tmp/phoenix_django.log',  # Changed from BASE_DIR / 'logs' / 'django.log'
            'maxBytes': 1024 * 1024 * 10,
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Remove the mkdir line completely
# (BASE_DIR / 'logs').mkdir(exist_ok=True)  # DELETE THIS LINE

# Create logs directory if it doesn't exist
# (BASE_DIR / 'logs').mkdir(exist_ok=True)

# ==================================================
# CACHE CONFIGURATION
# ==================================================

# Use dummy cache for tests to avoid Redis dependency
if 'test' in sys.argv:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'test-cache',
        }
    }
    SESSION_ENGINE = 'django.contrib.sessions.backends.db'
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': os.environ.get('REDIS_URL', 'redis://localhost:6379/1'),
            'KEY_PREFIX': 'phoenix',
            'TIMEOUT': 300,  # 5 minutes default
        }
    }
    # Use database sessions instead of cache to avoid Redis connection issues
    SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# ==================================================
# ADMINS & MANAGERS
# ==================================================

ADMINS = [
    ('Admin', os.environ.get('ADMIN_EMAIL', 'admin@phoenixerp.com')),
]
MANAGERS = ADMINS

# ==================================================
# FILE UPLOAD SETTINGS
# ==================================================

FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10 MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000

# ==================================================
# ENVIRONMENT INDICATOR
# ==================================================

print(f"""
================================================
  Phoenix ERP Configuration                     
================================================
  DEBUG: {DEBUG}                                    
  Database: {DATABASES['default']['NAME']}
  Host: {DATABASES['default']['HOST']}
  Allowed Hosts: {', '.join(ALLOWED_HOSTS[:2])}...
  Celery Broker: {CELERY_BROKER_URL[:30]}...
================================================
""")