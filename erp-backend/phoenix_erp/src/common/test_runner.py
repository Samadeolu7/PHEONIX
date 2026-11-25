"""
Test runner that keeps tests isolated from each other's request-scoped state.

In production the tenant middleware sets the thread-local "current tenant"
afresh on every request. Tests have no request cycle: a test that calls
set_current_tenant() and doesn't clear it leaks that tenant into the next
test, whose records then default to a tenant that no longer exists (it was
rolled back), failing with foreign-key errors far from the real cause.
Resetting it before every test gives each test the clean state a fresh
request gets.
"""
import unittest

from django.test.runner import DiscoverRunner


class _ResetRequestStateResult(unittest.TextTestResult):
    def startTest(self, test):
        from common.managers import set_current_tenant
        set_current_tenant(None)
        super().startTest(test)


class IsolatedTestRunner(DiscoverRunner):
    def get_resultclass(self):
        base = super().get_resultclass()
        if base is None:
            return _ResetRequestStateResult
        # Debug/PDB result classes: mix the reset in.
        return type('IsolatedResult', (_ResetRequestStateResult, base), {})
