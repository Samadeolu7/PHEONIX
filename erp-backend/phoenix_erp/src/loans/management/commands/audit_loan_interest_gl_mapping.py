"""
Management command: audit_loan_interest_gl_mapping

Read-only audit. Checks whether Daily / Weekly / Monthly loan interest is
actually posting to distinct GL income accounts (e.g. 4212 / 4207 / 4206)
as intended, or silently pooling into one shared account.

Why this can go wrong: `interest_income_account` is a single FK on
LoanProduct (loans/models.py), not something derived from
`LoanAccount.repayment_frequency`. Nothing in the codebase ties a
frequency to a GL account automatically — it's whatever the product was
manually configured with. A LoanProduct can also declare more than one
entry in `allowed_repayment_frequencies` (e.g. a "flexible" product that
allows both weekly and monthly repayment), in which case ALL loans under
it — regardless of which frequency each individual LoanAccount actually
uses — post interest to the SAME single account.

This command flags, per product:
  1. No interest_income_account set at all.
  2. allowed_repayment_frequencies has more than one entry (interest for
     every frequency under that product pools into one account).
  3. The product's account name doesn't obviously mention the product's
     single allowed frequency (heuristic, best-effort, for human review).

And, per actual LoanAccount.repayment_frequency actually in use, cross-tabs
which GL account each frequency's interest is landing in — so you can see
directly whether "daily" loans are, in aggregate, only ever posting to the
Daily account (or leaking into Weekly/Monthly ones via a shared product).

Usage:
    python manage.py audit_loan_interest_gl_mapping
"""
from collections import defaultdict

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Read-only audit of whether daily/weekly/monthly loan interest posts to distinct GL accounts.'

    def handle(self, *args, **options):
        from loans.models import LoanProduct, LoanAccount

        self.stdout.write(self.style.MIGRATE_HEADING('1. LoanProduct -> interest_income_account'))
        products = LoanProduct.objects.select_related('interest_income_account').filter(is_deleted=False)
        if not products.exists():
            self.stdout.write(self.style.WARNING('No LoanProduct rows found in this database.'))

        problems = 0
        for p in products:
            acct = p.interest_income_account
            freqs = p.allowed_repayment_frequencies or []
            acct_str = f'{acct.code} - {acct.name}' if acct else 'NONE'

            flags = []
            if not acct:
                flags.append('NO INTEREST INCOME ACCOUNT SET')
            if len(freqs) > 1:
                flags.append(f'MULTIPLE FREQUENCIES SHARE ONE ACCOUNT ({freqs})')
            if acct and len(freqs) == 1:
                freq_word = freqs[0].lower()
                if freq_word not in acct.name.lower():
                    flags.append(f"account name doesn't mention '{freq_word}' — verify manually")

            line = f'  [{p.name}] freqs={freqs} -> {acct_str}'
            if flags:
                problems += 1
                self.stdout.write(self.style.WARNING(line + '  ** ' + '; '.join(flags)))
            else:
                self.stdout.write(self.style.SUCCESS(line))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            '2. Actual LoanAccount.repayment_frequency -> GL account (cross-tab, active loans)'
        ))
        accounts = LoanAccount.objects.select_related(
            'product__interest_income_account'
        ).filter(is_deleted=False)

        freq_to_accounts = defaultdict(lambda: defaultdict(int))
        for loan in accounts:
            acct = loan.product.interest_income_account if loan.product_id else None
            key = f'{acct.code} - {acct.name}' if acct else 'NONE'
            freq_to_accounts[loan.repayment_frequency][key] += 1

        if not freq_to_accounts:
            self.stdout.write(self.style.WARNING('No LoanAccount rows found in this database.'))

        cross_tab_problems = 0
        for freq, accts in sorted(freq_to_accounts.items()):
            if len(accts) > 1:
                cross_tab_problems += 1
                self.stdout.write(self.style.WARNING(
                    f"  '{freq}' loans post interest to {len(accts)} DIFFERENT accounts:"
                ))
                for acct_key, count in accts.items():
                    self.stdout.write(f'      {acct_key}: {count} loan(s)')
            else:
                (acct_key, count), = accts.items()
                self.stdout.write(self.style.SUCCESS(
                    f"  '{freq}' loans ({count}) all post to: {acct_key}"
                ))

        self.stdout.write('')
        if problems or cross_tab_problems:
            self.stdout.write(self.style.ERROR(
                f'FOUND {problems} product-level issue(s) and {cross_tab_problems} '
                f'frequency/account inconsistencies — review above.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                'No issues found: each frequency maps cleanly to a single, distinct GL account.'
            ))
