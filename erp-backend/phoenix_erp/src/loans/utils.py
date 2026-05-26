# loans/utils.py
"""
LoanVerifier — cross-branch credit assessment utility.

Uses NIN for cross-branch lookups so a client who has borrowed from
branch A does not get a clean slate at branch B.
"""
from decimal import Decimal
from django.db.models import Sum, Q


class LoanVerifier:
    """
    Performs a credit assessment for a client against all branches.
    All lookups are NIN-based (when available) to catch cross-branch history.
    """

    LOAN_HOPPING_THRESHOLD = 2  # Active loans elsewhere constitutes hopping

    def __init__(self, client):
        self.client = client
        self._loans_qs = self._build_loans_queryset()

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _build_loans_queryset(self):
        """Return all LoanAccount objects for this client across all branches."""
        from .models import LoanAccount
        qs = LoanAccount.all_objects.filter(client=self.client)
        # Extend with NIN-matched clients if client has a NIN
        if self.client.nin:
            from clients.models import Client
            nin_client_ids = Client.all_objects.filter(
                nin=self.client.nin
            ).values_list('id', flat=True)
            qs = LoanAccount.all_objects.filter(client_id__in=nin_client_ids)
        return qs

    # ── Public API ────────────────────────────────────────────────────────────

    def active_loans_at_other_branches(self, current_branch=None):
        """Return queryset of active/disbursed loans at branches other than current_branch."""
        qs = self._loans_qs.filter(
            status__in=['active', 'disbursed', 'approved'],
        )
        if current_branch:
            qs = qs.exclude(branch=current_branch)
        return qs

    def calculate_default_rate(self) -> Decimal:
        """
        Percentage of closed loans that ended in default or write-off.
        Returns a Decimal between 0.00 and 100.00.
        """
        closed_qs = self._loans_qs.filter(
            status__in=['paid_off', 'defaulted', 'written_off']
        )
        total = closed_qs.count()
        if total == 0:
            return Decimal('0.00')
        bad = closed_qs.filter(status__in=['defaulted', 'written_off']).count()
        return Decimal(bad * 100 / total).quantize(Decimal('0.01'))

    def total_active_exposure(self) -> Decimal:
        """Sum of outstanding_principal across all active/approved loans."""
        result = self._loans_qs.filter(
            status__in=['active', 'disbursed', 'approved']
        ).aggregate(total=Sum('outstanding_principal'))['total']
        return result or Decimal('0.00')

    def flag_loan_hopping(self, current_branch=None) -> bool:
        """True if the client has >= threshold active loans at other branches."""
        count = self.active_loans_at_other_branches(current_branch).count()
        return count >= self.LOAN_HOPPING_THRESHOLD

    def detect_flags(self, current_branch=None) -> list:
        """Return a list of string flags describing credit concerns."""
        flags = []
        if self.flag_loan_hopping(current_branch):
            flags.append('loan_hopping')
        if self.calculate_default_rate() > Decimal('10.00'):
            flags.append('prior_default')
        if self.total_active_exposure() > Decimal('500000'):
            flags.append('high_exposure')
        return flags

    def recommend_amount(self, requested_amount: Decimal, current_branch=None) -> Decimal:
        """
        Conservative recommendation.
        Reduces requested amount if there is existing exposure or flags.
        Returns recommended amount (never negative, never above requested).
        """
        exposure = self.total_active_exposure()
        flags = self.detect_flags(current_branch)

        recommended = requested_amount

        if 'prior_default' in flags:
            recommended = recommended * Decimal('0.50')
        elif 'loan_hopping' in flags:
            recommended = recommended * Decimal('0.70')
        elif exposure > Decimal('200000'):
            recommended = recommended * Decimal('0.80')

        return max(Decimal('0.00'), min(recommended, requested_amount)).quantize(Decimal('0.01'))

    def run_full_check(self, current_branch=None) -> dict:
        """
        Run all checks and return a summary dict suitable for storing in
        LoanVerificationRequest fields.
        """
        flags = self.detect_flags(current_branch)
        exposure = self.total_active_exposure()
        default_rate = self.calculate_default_rate()
        active_elsewhere = self.active_loans_at_other_branches(current_branch).count()
        requested = getattr(self.client, '_check_requested_amount', None)

        if 'prior_default' in flags or default_rate > Decimal('25.00'):
            verdict = 'decline'
        elif flags:
            verdict = 'refer'
        else:
            verdict = 'pass'

        return {
            'active_loans_elsewhere': active_elsewhere,
            'total_active_exposure': exposure,
            'default_rate_pct': default_rate,
            'flags': flags,
            'verdict': verdict,
            'nin_used': self.client.nin or '',
        }
