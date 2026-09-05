"""
Management command: correct_ln907_schedule_attribution

READ-ONLY unless --apply. One-off, hand-verified correction for LN-907
(Oladunjoye Benjamin O, Sky Bright Schools) — diagnosed 2026-09-05 against
the legacy system's own per-installment repayment record (Client ID ML0005),
not guessed from a formula.

THE PROBLEM
-----------
Phoenix's schedule had the loan's paid/unpaid installments inverted against
the legacy system's ground truth:
  - Legacy repayment schedule (authoritative): installments 1-3 (due 30 Apr,
    30 May, 30 Jun 2026) — Is Paid: Yes, Yes, Yes. Installments 4-6 (due 30
    Jul, 30 Aug, 30 Sep) — Is Paid: No, No, No.
  - Phoenix showed row 1 paid (correct), rows 2 and 3 'overdue'/unpaid
    (wrong — legacy confirms both paid), row 4 zeroed under status='paid'
    (wrong — legacy confirms still owed), rows 5 and 6 zeroed under
    status='restructured' (wrong — legacy confirms both still owed).
  - The two real Phoenix-recorded payments (10 Aug ₦38,500.00, 13 Aug
    ₦2,380.00 — made months after the 30 Jun migration cutover) were
    misattributed to row 1 (already settled pre-migration per legacy)
    instead of row 4 (the first installment still open at cutover).

Row 3's total_due (₦37,617.83) was also below the flat-formula amount
(₦38,933.33) — this is what originally routed the loan to manual review via
the self-service repair tool. Legacy confirms row 3's true amount is the
clean ₦38,933.33; the lower figure was a schedule-side artifact, unrelated
to any real term change.

outstanding_principal (₦76,551.16 before this correction) was itself
understated by ₦2,146.94-2,146.96. Traced (read-only, replaying the GL
journal entries already on the loan's account — no GL entries touched by
that investigation or by this command) to sync_outstanding_to_gl's 2026-08-19
run: it compared the FULL business-field total against loan.account.balance
(₦82,488.50 at the time) and dumped the entire gap onto outstanding_principal
alone. But account 1150-00698 commingles principal repayments AND penalty
accruals/reversals (both post to the same account) — and this loan's penalty
side had been through five reversal/repost cycles in the three days just
before that sync ran. The gap was almost certainly penalty-tracking lag, not
a real principal error. Two independent reconstructions — (a) the legacy
OBMIG opening balance (₦116,800.01) minus real principal repaid since, and
(b) legacy per-installment Is-Paid record + the real payments' principal
component applied to the correct row — both land on the same corrected
figure: ₦78,698.10.

outstanding_penalties is NOT touched by this command — the same commingled-
account confusion may have left it wrong too, but untangling that is a
separate, harder problem (ties into the ongoing legacy-penalty cleanup) and
guessing at it here would risk compounding the error. Deliberately deferred.

WHAT THIS WRITES
----------------
Business fields only — no GL Transaction/JournalEntry is posted:
  - Rows 2, 3: total_due/principal_due -> 38,933.33, fully paid, status='paid'
  - Row 4: total_due/principal_due -> 38,933.33, total_paid/principal_paid ->
    38,101.89 (the real principal-component of the two Aug payments),
    status='overdue' (₦831.44 genuinely still owed)
  - Row 5: total_due/principal_due -> 38,933.33, unpaid, status='overdue'
  - Row 6: total_due/principal_due -> 38,933.33, unpaid, status='pending'
    (not yet due)
  - loan.outstanding_principal: 76,551.16 -> 78,698.10
  - arrears_amount/days_in_arrears/risk_classification/provision_* recomputed
    from the corrected schedule via the loan's own methods
  - One FinancialAuditLog(LOAN_BALANCE_CORRECTION) entry

SAFETY
------
Refuses to run unless the loan is found in EXACTLY the diagnosed
pre-correction state (see the guard in handle()) — if anything about this
loan has changed since 2026-09-05, this command aborts rather than guessing.
Dry-run by default; nothing is written until --apply.

Usage:
    python manage.py correct_ln907_schedule_attribution            # dry-run
    python manage.py correct_ln907_schedule_attribution --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

LOAN_NUMBER = 'LN-907'
FLAT_INSTALLMENT = Decimal('38933.33')
ROW4_REAL_PRINCIPAL_PAID = Decimal('38101.89')
CORRECTED_OUTSTANDING_PRINCIPAL = Decimal('78698.10')
TOLERANCE = Decimal('0.01')

_EXPECTED_PRE_STATE = {
    2: {'status': 'overdue'},
    3: {'status': 'overdue'},
    4: {'status': 'paid'},
    5: {'status': 'restructured'},
    6: {'status': 'restructured'},
}


class Command(BaseCommand):
    help = (
        'One-off correction for LN-907: restores the schedule\'s paid/unpaid '
        'attribution to match the legacy system\'s per-installment record, and '
        'corrects outstanding_principal for a penalty/principal commingling bug '
        'in an earlier sync_outstanding_to_gl run. Business-field correction '
        'only — no GL entries posted. See this file\'s module docstring for the '
        'full diagnosis.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                             help='Write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            try:
                loan = LoanAccount.all_objects.select_for_update().get(loan_number=LOAN_NUMBER)
            except LoanAccount.DoesNotExist:
                raise CommandError(f'{LOAN_NUMBER} not found.')

            rows = {
                r.installment_number: r
                for r in loan.repayment_schedule.select_for_update().order_by('installment_number')
            }
            if set(rows.keys()) != {1, 2, 3, 4, 5, 6}:
                db_transaction.savepoint_rollback(sid)
                raise CommandError(
                    f'{LOAN_NUMBER} does not have exactly installments 1-6 (found '
                    f'{sorted(rows.keys())}) — schedule has changed since this correction '
                    'was diagnosed. Refusing to guess; re-verify manually.'
                )

            mismatches = []
            for num, expected in _EXPECTED_PRE_STATE.items():
                actual_status = rows[num].status
                if actual_status != expected['status']:
                    mismatches.append(
                        f'row{num}.status: expected {expected["status"]!r}, found {actual_status!r}'
                    )
            if abs(loan.outstanding_principal - Decimal('76551.16')) > TOLERANCE:
                mismatches.append(
                    f'loan.outstanding_principal: expected 76551.16, found {loan.outstanding_principal}'
                )

            if mismatches:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'{LOAN_NUMBER} does not match the diagnosed pre-correction state — refusing:'
                ))
                for m in mismatches:
                    self.stdout.write(f'  {m}')
                return

            row2, row3, row4, row5, row6 = rows[2], rows[3], rows[4], rows[5], rows[6]
            today = timezone.localdate()

            if row6.due_date <= today:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'row6 due_date ({row6.due_date}) is no longer in the future relative to '
                    f'today ({today}) — the "pending" status this correction assigns it no '
                    'longer fits. Refusing; re-verify manually.'
                ))
                return

            plan = [
                (row2, FLAT_INSTALLMENT, 'paid'),
                (row3, FLAT_INSTALLMENT, 'paid'),
                (row4, ROW4_REAL_PRINCIPAL_PAID, 'overdue'),
                (row5, Decimal('0.00'), 'overdue'),
                (row6, Decimal('0.00'), 'pending'),
            ]

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'{LOAN_NUMBER} — restoring schedule attribution to match the legacy '
                'per-installment record (rows 1-3 paid, 4-6 owing) and correcting '
                f'outstanding_principal to {CORRECTED_OUTSTANDING_PRINCIPAL:,.2f} '
                '(sync_outstanding_to_gl penalty/principal commingling, 2026-08-19).'
            ))
            for row, new_paid, new_status in plan:
                remaining = FLAT_INSTALLMENT - new_paid
                self.stdout.write(
                    f'    #{row.installment_number} due={row.due_date}  '
                    f'total_due {row.total_due:,.2f} -> {FLAT_INSTALLMENT:,.2f}  '
                    f'total_paid {row.total_paid:,.2f} -> {new_paid:,.2f}  '
                    f'remaining -> {remaining:,.2f}  status {row.status} -> {new_status}'
                )

            total_remaining = sum(FLAT_INSTALLMENT - new_paid for _, new_paid, _ in plan)
            if abs(total_remaining - CORRECTED_OUTSTANDING_PRINCIPAL) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'SAFETY CHECK FAILED — redistributed total ({total_remaining:,.2f}) does '
                    f'not match the corrected outstanding_principal ({CORRECTED_OUTSTANDING_PRINCIPAL:,.2f}). '
                    'Refusing.'
                ))
                return

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('  DRY-RUN — nothing written.\n'))
                return

            for row, new_paid, new_status in plan:
                row.principal_due = FLAT_INSTALLMENT
                row.total_due = FLAT_INSTALLMENT
                row.principal_paid = new_paid
                row.total_paid = new_paid
                row.status = new_status
                row.payment_date = None
                row.save(update_fields=[
                    'principal_due', 'total_due', 'principal_paid', 'total_paid',
                    'status', 'payment_date', 'updated_at',
                ])

            before_outstanding = loan.outstanding_principal
            loan.outstanding_principal = CORRECTED_OUTSTANDING_PRINCIPAL
            loan.save(update_fields=['outstanding_principal', 'updated_at'])

            loan._calculate_arrears()
            loan.refresh_from_db()
            loan.update_risk_classification()
            loan.save(update_fields=[
                'risk_classification', 'provision_pct', 'provision_amount', 'updated_at',
            ])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=CORRECTED_OUTSTANDING_PRINCIPAL - before_outstanding,
                description=(
                    f'{LOAN_NUMBER}: restored schedule paid/unpaid attribution to match the '
                    'legacy system\'s per-installment record (Client ID ML0005) — rows 2-3 '
                    'were wrongly overdue/unpaid (legacy confirms paid), row 3 was also below '
                    'the formula amount; rows 4-6 were wrongly zeroed under paid/restructured '
                    '(legacy confirms all three still owed). The two real Aug 2026 payments '
                    'were reattributed from row 1 to row 4, the installment they actually '
                    'applied against at migration cutover. outstanding_principal corrected '
                    f'from {before_outstanding:,.2f} to {CORRECTED_OUTSTANDING_PRINCIPAL:,.2f} '
                    '— the 2026-08-19 sync_outstanding_to_gl run understated it by netting '
                    'penalty-side GL drift (account 1150-00698 commingles principal and '
                    'penalty postings) against principal alone. outstanding_penalties '
                    'deliberately left untouched — a separate, unresolved question. No GL '
                    'entry posted; business-field correction only.'
                ),
                extra={
                    'loan_number': LOAN_NUMBER,
                    'source_command': 'correct_ln907_schedule_attribution',
                    'outstanding_principal_before': str(before_outstanding),
                    'outstanding_principal_after': str(CORRECTED_OUTSTANDING_PRINCIPAL),
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(
                f'  [{LOAN_NUMBER}] Applied. outstanding_principal {before_outstanding:,.2f} -> '
                f'{loan.outstanding_principal:,.2f}  arrears_amount={loan.arrears_amount:,.2f}  '
                f'days_in_arrears={loan.days_in_arrears}  risk_classification={loan.risk_classification}  '
                f'provision_amount={loan.provision_amount:,.2f}\n'
            ))
