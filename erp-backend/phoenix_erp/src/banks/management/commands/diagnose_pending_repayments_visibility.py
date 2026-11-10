"""
Read-only: explain what one user sees on Pending Bank Repayments (and the
dashboard card), and why — for "my branch can't see it" complaints.

Usage:
    python manage.py diagnose_pending_repayments_visibility <username>
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Explain a user's Pending Bank Repayments visibility (read-only)."

    def add_arguments(self, parser):
        parser.add_argument('username')

    def handle(self, *args, **opts):
        from banks.models import DailyReconciliation, ReconciliationException
        from banks.resolution_service import is_recon_director, is_recon_manager
        from banks.views import _dedupe_pending, _pending_repayments_qs, _owning_branch

        User = get_user_model()
        try:
            user = User.objects.get(username=opts['username'])
        except User.DoesNotExist as exc:
            raise CommandError(f'No user {opts["username"]!r}') from exc

        w = self.stdout.write
        w(f'User: {user.username} ({user.get_full_name()})')
        w(f'  tenant: {getattr(user, "tenant", None)}   home branch: {getattr(user, "branch", None)}')
        roles = list(user.roles.filter(is_active=True).values_list('name', 'default_scope'))
        w(f'  roles: {roles or "none"}')
        w(f'  sees all branches (owner/global role): '
          f'{(callable(getattr(user, "is_owner", None)) and user.is_owner()) or any(s == "global" for _, s in roles)}')
        manager = is_recon_manager(user)
        w(f'  branch manager or above for reconciliation (edit/approve on bank-reconciliation-exceptions): {manager}')
        w(f'  director (approve): {is_recon_director(user)}')
        if not manager:
            w('  -> below branch manager: "Recorded, not in bank" shows ONLY payments this user posted.')
        if getattr(user, 'tenant', None) is None:
            w(self.style.ERROR('  !! user has no tenant — every API call is rejected, the card can never load.'))

        recons = DailyReconciliation.objects.for_user(user)
        w(f'\nReconciliation runs visible: {recons.count()}')
        for row in recons.values('branch__name').order_by('branch__name').distinct():
            w(f'  - {row["branch__name"] or "(no branch)"}')

        rows = _dedupe_pending(_pending_repayments_qs(user))
        bank = [e for e in rows if e.exception_type == 'bank_only']
        erp = [e for e in rows if e.exception_type == 'erp_only']
        w(f'\nWhat the page/card shows: {len(bank)} in bank not recorded, {len(erp)} recorded not in bank')
        if not rows:
            w(self.style.WARNING('  -> nothing visible, so the dashboard card is hidden.'))
        for e in erp[:10]:
            w(f'  erp #{e.pk} {e.erp_amount} branch={_owning_branch(e)[1]} officer={e.officer}')

        branch = getattr(user, 'branch', None)
        if branch is not None:
            open_branch_erp = ReconciliationException.objects.filter(
                exception_type='erp_only', direction='CREDIT', resolved=False,
                erp_branch=branch,
            ).exclude(pk__in=[e.pk for e in erp])
            if open_branch_erp.exists():
                w(f'\nOpen "Recorded, not in bank" lines by {branch} officers that this user does NOT see: '
                  f'{open_branch_erp.count()}')
                for e in open_branch_erp.select_related('reconciliation__branch', 'officer')[:10]:
                    reason = 'posted by another officer (needs branch manager)' if not manager else \
                        f'on {e.reconciliation.branch} bank account'
                    w(f'  erp #{e.pk} {e.erp_amount} officer={e.officer} — {reason}')
