"""
Read-only: measure how much penalty income the daily update_loan_status job
has silently reversed.

Until 2026-11-13, update_loan_status recomputed each overdue installment's
penalty_due from scratch every day as

    rate x (principal + interest + fees still unpaid) x ALL periods late

so whenever a repayment shrank the unpaid balance, the next run came out
lower than what was already charged and posted the negative delta as an
ordinary-looking "Loan penalty accrual" entry:

    Dr Penalty Income / Cr Loan Receivable

That cut both the client's debt and the institution's penalty income for
periods that had already been charged (found on LN-659's statement). This
command finds every such entry, across every loan and tenant.

Selection (see loans/penalty_reductions.py): LNPEN journal entries that CREDIT a loan's own Loan Receivable
account and whose description is the daily job's own wording
("Loan penalty accrual — <loan> (installment due …)"). The deliberate
correction commands use different wording ("Loan penalty accrual
(compounding bug corrected) — …", "Penalty accrual over-collection
reversal — …", "REVERSAL: …") and are excluded, as are entries that were
themselves reversed later.

Each reduction is VERIFIED against the repayment that should have caused
it (see loans/penalty_reductions.py): CONFIRMED only when a repayment on that
same installment explains the exact amount under the old formula. Everything
else is NOT CONFIRMED, with the reason, and is left alone: it may be the job
correcting a penalty that really was overcharged.

Usage:
    python manage.py audit_penalty_reduced_by_repayment
    python manage.py audit_penalty_reduced_by_repayment --loan LN-659 --detail
    python manage.py audit_penalty_reduced_by_repayment --csv /tmp/penalty_reductions.csv
"""
import csv
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'Read-only: total the penalty income the daily update_loan_status job '
        'reversed after repayments (Dr Penalty Income / Cr Loan Receivable).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                            help='Only check this loan number.')
        parser.add_argument('--detail', action='store_true',
                            help='List every individual reduction entry.')
        parser.add_argument('--csv', dest='csv_path', default=None,
                            help='Also write every reduction entry to this CSV file.')

    def handle(self, *args, **options):
        from loans.penalty_reductions import find_penalty_reductions

        reductions = find_penalty_reductions(loan_number=options['loan_number'])
        not_confirmed_by_reason = defaultdict(lambda: [0, Decimal('0.00')])

        per_loan = defaultdict(lambda: {
            'repay_count': 0, 'repay_total': Decimal('0.00'),
            'other_count': 0, 'other_total': Decimal('0.00'),
            'first': None, 'last': None,
        })
        per_month = defaultdict(lambda: [Decimal('0.00'), Decimal('0.00')])
        rows = []

        for r in reductions:
            loan, entry, txn, repayment_driven = r.loan, r.entry, r.txn, r.repayment_driven
            bucket = per_loan[loan.loan_number]
            if repayment_driven:
                bucket['repay_count'] += 1
                bucket['repay_total'] += entry.amount
            else:
                bucket['other_count'] += 1
                bucket['other_total'] += entry.amount
                not_confirmed_by_reason[r.verdict][0] += 1
                not_confirmed_by_reason[r.verdict][1] += entry.amount
            bucket['first'] = bucket['first'] or txn.date
            bucket['last'] = txn.date
            bucket['loan'] = loan

            month = txn.date.strftime('%Y-%m')
            per_month[month][0 if repayment_driven else 1] += entry.amount

            rows.append({
                'loan_number': loan.loan_number,
                'loan_status': loan.status,
                'client': f'{loan.client.first_name} {loan.client.last_name}'.strip(),
                'date': txn.date.isoformat(),
                'reference': getattr(txn, 'reference_number', '') or '',
                'amount': f'{entry.amount:.2f}',
                'classification': 'CONFIRMED' if repayment_driven else 'NOT CONFIRMED',
                'reason': r.verdict,
                'paid_on_installment': f'{r.paid:.2f}',
                'expected_reduction': '' if r.expected is None else f'{r.expected:.2f}',
                'description': txn.description,
                'transaction_id': str(txn.pk),
            })

        if not per_loan:
            self.stdout.write(self.style.SUCCESS(
                'No daily-job penalty reductions found — no penalty income was reversed.'
            ))
            self.stdout.write(self.style.WARNING('Read-only — no changes made.'))
            return

        if options['detail']:
            self.stdout.write('\n--- Every reduction entry ---')
            for r in rows:
                self.stdout.write(
                    f"  {r['date']}  {r['loan_number']:16s} {r['reference']:24s} "
                    f"₦{Decimal(r['amount']):>12,.2f}  {r['classification']:13s} "
                    f"paid ₦{Decimal(r['paid_on_installment']):>11,.2f}  "
                    + (f"expected ₦{Decimal(r['expected_reduction']):>11,.2f}  "
                       if r['expected_reduction'] else ' ' * 23)
                    + r['reason']
                )

        self.stdout.write('\n--- Per loan (largest first) ---')
        self.stdout.write(
            f"  {'loan':16s} {'status':10s} {'confirmed':>16s} {'#':>4s} "
            f"{'not confirmed':>14s} {'#':>4s}  first → last"
        )
        ordered = sorted(
            per_loan.items(),
            key=lambda kv: kv[1]['repay_total'] + kv[1]['other_total'],
            reverse=True,
        )
        for loan_number, b in ordered:
            self.stdout.write(
                f"  {loan_number:16s} {b['loan'].status:10s} "
                f"₦{b['repay_total']:>15,.2f} {b['repay_count']:>4d} "
                f"₦{b['other_total']:>13,.2f} {b['other_count']:>4d}  "
                f"{b['first']} → {b['last']}"
            )

        self.stdout.write('\n--- Per month ---')
        for month in sorted(per_month):
            repay, other = per_month[month]
            self.stdout.write(
                f'  {month}  confirmed ₦{repay:>14,.2f}   not confirmed ₦{other:>14,.2f}'
            )

        repay_total = sum(b['repay_total'] for b in per_loan.values())
        other_total = sum(b['other_total'] for b in per_loan.values())
        repay_loans = sum(1 for b in per_loan.values() if b['repay_count'])
        self.stdout.write(
            '\nTo re-charge the repayment-driven amounts on open loans: '
            'python manage.py restore_penalty_reduced_by_repayment (dry-run first).'
        )
        open_loans = [
            b for b in per_loan.values()
            if b['loan'].status in ('active', 'disbursed', 'defaulted') and b['repay_count']
        ]
        self.stdout.write(self.style.ERROR(
            f'\nConfirmed — penalty wrongly reduced by repayments (the bug): ₦{repay_total:,.2f} '
            f'across {repay_loans} loan(s)'
        ))
        self.stdout.write(
            f'  of which on loans still open (recoverable by reversing them): '
            f'₦{sum(b["repay_total"] for b in open_loans):,.2f} across {len(open_loans)} loan(s)'
        )
        self.stdout.write(self.style.WARNING(
            f'Not confirmed — left alone: ₦{other_total:,.2f}'
        ))
        for reason, (count, total) in sorted(
            not_confirmed_by_reason.items(), key=lambda kv: -kv[1][1],
        ):
            self.stdout.write(f'    {reason}: ₦{total:,.2f} ({count})')

        if options['csv_path']:
            with open(options['csv_path'], 'w', newline='') as fh:
                writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            self.stdout.write(f'\nWrote {len(rows)} row(s) to {options["csv_path"]}')

        self.stdout.write(self.style.WARNING('\nRead-only — no changes made.'))
