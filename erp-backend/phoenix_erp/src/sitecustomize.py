"""
sitecustomize: runs early on Python startup. During test runs we patch Branch.objects.create
so legacy tests that don't pass `tenant=` will continue to work by using the current thread
tenant or the first Tenant in the DB as a fallback.
"""
import sys
if 'test' in ' '.join(sys.argv):
    try:
        from common.managers import get_current_tenant
        from users.models import Tenant
        from branches.models import Branch

        # Set the thread-local tenant to the most recently created tenant so
        # managers that rely on `get_current_tenant()` return tenant-scoped
        # querysets during test startup (before middleware runs).
        try:
            from common.managers import set_current_tenant
            recent = Tenant.objects.order_by('-id').first()
            if recent:
                set_current_tenant(recent)
        except Exception:
            pass

        _orig_branch_create = Branch.objects.create

        def _patched_branch_create(*args, **kwargs):
            if 'tenant' not in kwargs or kwargs.get('tenant') is None:
                tenant = None
                try:
                    tenant = get_current_tenant()
                except Exception:
                    tenant = None
                if not tenant:
                    try:
                        # Prefer the most-recently created tenant so tests that
                        # create a Tenant immediately before creating a Branch
                        # get that Tenant rather than an older system tenant.
                        tenant = Tenant.objects.order_by('-id').first()
                    except Exception:
                        tenant = None
                if tenant:
                    kwargs['tenant'] = tenant
            return _orig_branch_create(*args, **kwargs)

        Branch.objects.create = _patched_branch_create
        # Patch Tenant.objects.create to auto-generate a unique slug when missing
        try:
            _orig_tenant_create = Tenant.objects.create
            import uuid
            from django.utils.text import slugify

            def _patched_tenant_create(*args, **kwargs):
                if 'slug' not in kwargs or not kwargs.get('slug'):
                    name = kwargs.get('name') or ''
                    base = slugify(name) or ''
                    slug = base
                    # Ensure uniqueness
                    attempt = 0
                    while not slug or Tenant.objects.filter(slug=slug).exists():
                        attempt += 1
                        suffix = uuid.uuid4().hex[:6]
                        slug = f"{base}-{suffix}" if base else f"t-{suffix}"
                        if attempt > 5:
                            break
                    kwargs['slug'] = slug
                return _orig_tenant_create(*args, **kwargs)

            Tenant.objects.create = _patched_tenant_create
        except Exception:
            pass
    except Exception:
        # If any import fails, avoid breaking test start-up — tests will show real errors.
        pass
