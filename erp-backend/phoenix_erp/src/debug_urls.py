#!/usr/bin/env python
"""Quick URL debugging script"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from django.urls import get_resolver
from accounts.urls import router

print("\n=== Accounts Router Registered Patterns ===")
for pattern in router.urls:
    print(f"  {pattern.pattern}")

print("\n=== Full URL Resolution ===")
resolver = get_resolver()
print("\nAccounts app URLs (under /api/accounts/):")
# The router is included under /api/accounts/, so endpoints are:
# /api/accounts/ + router patterns

for reg in router.registry:
    prefix = reg[0]  # The prefix registered
    print(f"\n  Router prefix: '{prefix}'")
    print(f"  List URL: /api/accounts/{prefix}/")
    print(f"  Detail URL: /api/accounts/{prefix}/{{id}}/")
