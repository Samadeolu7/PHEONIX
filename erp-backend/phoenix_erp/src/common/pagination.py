"""
Custom DRF pagination classes.

The default PageNumberPagination does NOT allow clients to override the page
size. This module provides a configurable subclass that:
  - Respects a `page_size` query parameter supplied by the client.
  - Caps the allowed page size at MAX_PAGE_SIZE (1000) to prevent abuse.

Register in settings.py:
    REST_FRAMEWORK = {
        'DEFAULT_PAGINATION_CLASS': 'common.pagination.StandardResultsPagination',
        'PAGE_SIZE': 20,
        ...
    }
"""
from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """
    Extends DRF's PageNumberPagination to honour a client-supplied `page_size`
    query parameter, bounded by MAX_PAGE_SIZE.
    """
    page_size = 20                       # default (matches existing PAGE_SIZE)
    page_size_query_param = 'page_size'  # e.g. ?page_size=1000
    max_page_size = 1000                 # hard cap – prevents abuse
