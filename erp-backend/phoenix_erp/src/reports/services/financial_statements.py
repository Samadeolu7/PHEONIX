# reports/services/financial_statements.py
"""
Financial Statement Generation Service

Generates standard financial reports:
- Trial Balance
- Profit & Loss Statement (Income Statement)
- Balance Sheet (Statement of Financial Position)

Features:
- Hierarchical drill-down (parent/child account grouping)
- Date range filtering
- Comparative period support
- Collapse/expand support via detail_level parameter
"""

from decimal import Decimal
from datetime import date, timedelta
from typing import Dict, List, Optional
from django.db.models import Sum, Q, F, Case, When, Value, DecimalField
from django.utils import timezone

from accounts.models import Account
from transactions.models import TransactionEntry, Transaction


class FinancialStatementService:
    """Service for generating financial statements"""
    
    def __init__(self, owner, branch=None):
        """
        Initialize service
        
        Args:
            owner: User/Tenant owner
            branch: Optional branch filter
        """
        self.owner = owner
        self.branch = branch
    
    def generate_trial_balance(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        detail_level: str = 'summary',  # 'summary', 'detailed', 'all'
        include_zero_balances: bool = False
    ) -> Dict:
        """
        Generate Trial Balance
        
        Trial Balance shows all accounts with their debit and credit balances.
        Debits must equal credits (fundamental accounting equation check).
        
        Args:
            start_date: Start date for transactions (None = beginning of time)
            end_date: End date for transactions (None = today)
            detail_level: 'summary' (parent only), 'detailed' (with children), 'all' (all accounts)
            include_zero_balances: Include accounts with zero balance
        
        Returns:
            {
                'report_date': date,
                'date_range': {'start': date, 'end': date},
                'accounts': [
                    {
                        'code': '100',
                        'name': 'Cash and Bank',
                        'account_type': 'ASSET',
                        'level': 'PARENT',
                        'debit': Decimal,
                        'credit': Decimal,
                        'balance': Decimal,
                        'children': [...]  # if detail_level != 'summary'
                    }
                ],
                'totals': {
                    'total_debits': Decimal,
                    'total_credits': Decimal,
                    'difference': Decimal  # Should be 0
                },
                'is_balanced': bool
            }
        """
        end_date = end_date or timezone.now().date()
        
        # Get base queryset - scope by branch/tenant, NOT owner
        # (owner is audit only; all users in the same branch see the same data)
        accounts = Account.objects.filter(is_deleted=False)
        if self.branch:
            accounts = accounts.filter(branch=self.branch)
        elif hasattr(self.owner, 'tenant') and self.owner.tenant:
            accounts = accounts.filter(tenant=self.owner.tenant)
        
        # Filter by detail level
        if detail_level == 'summary':
            accounts = accounts.filter(account_level=Account.LEVEL_PARENT)
        elif detail_level == 'detailed':
            # Return parent accounts only; children are nested via include_children=True
            accounts = accounts.filter(account_level=Account.LEVEL_PARENT)
        # 'all' includes every account as a flat list (no nesting)
        
        # Calculate balances for each account
        account_balances = []
        total_debits = Decimal('0.00')
        total_credits = Decimal('0.00')
        
        for account in accounts.order_by('code'):
            balance_data = self._calculate_account_balance(
                account,
                start_date,
                end_date,
                include_children=(detail_level in ['detailed', 'all'])
            )
            
            if not include_zero_balances and Decimal(balance_data['balance']) == Decimal('0.00'):
                continue
            
            account_balances.append(balance_data)
            total_debits += Decimal(balance_data['debit'])
            total_credits += Decimal(balance_data['credit'])
        
        difference = total_debits - total_credits
        
        return {
            'report_date': end_date,
            'date_range': {
                'start': start_date,
                'end': end_date
            },
            'accounts': account_balances,
            'totals': {
                'total_debits': str(total_debits),
                'total_credits': str(total_credits),
                'difference': str(difference)
            },
            'is_balanced': difference == Decimal('0.00')
        }
    
    def generate_profit_loss(
        self,
        start_date: date,
        end_date: Optional[date] = None,
        detail_level: str = 'summary',
        comparative_period: bool = False
    ) -> Dict:
        """
        Generate Profit & Loss Statement (Income Statement)
        
        Shows:
        - Revenue (Income accounts)
        - Less: Expenses
        - = Net Profit/Loss
        
        Args:
            start_date: Period start date
            end_date: Period end date (None = today)
            detail_level: 'summary', 'detailed', 'all'
            comparative_period: Include prior period comparison
        
        Returns:
            {
                'period': {'start': date, 'end': date},
                'revenue': {
                    'total': Decimal,
                    'accounts': [...]
                },
                'expenses': {
                    'total': Decimal,
                    'accounts': [...]
                },
                'net_profit': Decimal,
                'net_margin_percent': Decimal,
                'comparative': {...}  # if comparative_period=True
            }
        """
        end_date = end_date or timezone.now().date()
        
        # Get income accounts (400-499)
        income_accounts = self._get_accounts_by_type(
            Account.INCOME,
            detail_level,
            start_date,
            end_date
        )
        
        # Get expense accounts (500-599)
        expense_accounts = self._get_accounts_by_type(
            Account.EXPENSE,
            detail_level,
            start_date,
            end_date
        )
        
        # Calculate totals
        total_revenue = sum(
            Decimal(acc['balance']) for acc in income_accounts
        )
        total_expenses = sum(
            Decimal(acc['balance']) for acc in expense_accounts
        )
        net_profit = total_revenue - total_expenses
        net_margin = (net_profit / total_revenue * 100) if total_revenue else Decimal('0.00')
        
        result = {
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            },
            'revenue': {
                'total': str(total_revenue),
                'accounts': income_accounts
            },
            'expenses': {
                'total': str(total_expenses),
                'accounts': expense_accounts
            },
            'net_profit': str(net_profit),
            'net_margin_percent': str(net_margin.quantize(Decimal('0.01')))
        }
        
        # Add comparative period if requested
        if comparative_period:
            days_diff = (end_date - start_date).days
            prior_start = start_date - timedelta(days=days_diff + 1)
            prior_end = start_date - timedelta(days=1)
            
            prior_pl = self.generate_profit_loss(
                prior_start,
                prior_end,
                detail_level,
                comparative_period=False
            )
            
            result['comparative'] = {
                'period': prior_pl['period'],
                'revenue': prior_pl['revenue']['total'],
                'expenses': prior_pl['expenses']['total'],
                'net_profit': prior_pl['net_profit'],
                'variance': {
                    'revenue': str(total_revenue - Decimal(prior_pl['revenue']['total'])),
                    'expenses': str(total_expenses - Decimal(prior_pl['expenses']['total'])),
                    'net_profit': str(net_profit - Decimal(prior_pl['net_profit']))
                }
            }
        
        return result
    
    def generate_balance_sheet(
        self,
        as_of_date: Optional[date] = None,
        detail_level: str = 'summary',
        comparative_date: Optional[date] = None
    ) -> Dict:
        """
        Generate Balance Sheet (Statement of Financial Position)
        
        Shows:
        - Assets = Liabilities + Equity
        
        Args:
            as_of_date: Balance sheet date (None = today)
            detail_level: 'summary', 'detailed', 'all'
            comparative_date: Optional prior date for comparison
        
        Returns:
            {
                'as_of_date': date,
                'assets': {
                    'current': {'total': Decimal, 'accounts': [...]},
                    'non_current': {'total': Decimal, 'accounts': [...]},
                    'total': Decimal
                },
                'liabilities': {
                    'current': {'total': Decimal, 'accounts': [...]},
                    'non_current': {'total': Decimal, 'accounts': [...]},
                    'total': Decimal
                },
                'equity': {
                    'total': Decimal,
                    'accounts': [...]
                },
                'total_liabilities_equity': Decimal,
                'is_balanced': bool,
                'comparative': {...}  # if comparative_date provided
            }
        """
        as_of_date = as_of_date or timezone.now().date()
        
        # Get assets
        asset_accounts = self._get_accounts_by_type(
            Account.ASSET, detail_level, None, as_of_date
        )
        # LOAN accounts = Loans Receivable (money owed TO the org) → asset
        loan_accounts = self._get_accounts_by_type(
            Account.LOAN, detail_level, None, as_of_date
        )
        asset_accounts = asset_accounts + loan_accounts

        # Get liabilities
        liability_accounts = self._get_accounts_by_type(
            Account.LIABILITY, detail_level, None, as_of_date
        )
        # SAVINGS accounts = member deposits (money owed BY the org) → liability
        savings_accounts = self._get_accounts_by_type(
            Account.SAVINGS, detail_level, None, as_of_date
        )
        liability_accounts = liability_accounts + savings_accounts

        # Get equity
        equity_accounts = self._get_accounts_by_type(
            Account.EQUITY, detail_level, None, as_of_date
        )

        # Calculate net profit for the period.
        # Income and expense accounts are temporary accounts not yet closed to equity.
        # Their net effect MUST be included for the accounting equation to hold:
        #   Assets = Liabilities + Equity + Net Profit
        income_accounts_data = self._get_accounts_by_type(
            Account.INCOME, 'summary', None, as_of_date
        )
        expense_accounts_data = self._get_accounts_by_type(
            Account.EXPENSE, 'summary', None, as_of_date
        )
        total_income = sum(Decimal(acc['balance']) for acc in income_accounts_data)
        total_expenses = sum(Decimal(acc['balance']) for acc in expense_accounts_data)
        net_profit_for_period = total_income - total_expenses

        # Calculate totals
        total_assets = sum(Decimal(acc['balance']) for acc in asset_accounts)
        total_liabilities = sum(Decimal(acc['balance']) for acc in liability_accounts)
        total_equity = sum(Decimal(acc['balance']) for acc in equity_accounts)
        # Equity section includes the current period net profit (before closing entries)
        adjusted_total_equity = total_equity + net_profit_for_period
        total_liabilities_equity = total_liabilities + adjusted_total_equity
        
        # Classify current vs non-current (simplified - you can enhance this)
        current_assets = [acc for acc in asset_accounts if self._is_current_account(acc)]
        non_current_assets = [acc for acc in asset_accounts if not self._is_current_account(acc)]
        current_liabilities = [acc for acc in liability_accounts if self._is_current_account(acc)]
        non_current_liabilities = [acc for acc in liability_accounts if not self._is_current_account(acc)]
        
        result = {
            'as_of_date': as_of_date.isoformat(),
            'assets': {
                'current': {
                    'total': str(sum(Decimal(a['balance']) for a in current_assets)),
                    'accounts': current_assets
                },
                'non_current': {
                    'total': str(sum(Decimal(a['balance']) for a in non_current_assets)),
                    'accounts': non_current_assets
                },
                'total': str(total_assets)
            },
            'liabilities': {
                'current': {
                    'total': str(sum(Decimal(a['balance']) for a in current_liabilities)),
                    'accounts': current_liabilities
                },
                'non_current': {
                    'total': str(sum(Decimal(a['balance']) for a in non_current_liabilities)),
                    'accounts': non_current_liabilities
                },
                'total': str(total_liabilities)
            },
            'equity': {
                'total': str(adjusted_total_equity),
                'equity_accounts_total': str(total_equity),
                'net_profit_for_period': str(net_profit_for_period),
                'accounts': equity_accounts
            },
            'total_liabilities_equity': str(total_liabilities_equity),
            'is_balanced': abs(total_assets - total_liabilities_equity) < Decimal('0.01')
        }
        
        # Add comparative period
        if comparative_date:
            comparative = self.generate_balance_sheet(
                comparative_date,
                detail_level,
                comparative_date=None
            )
            result['comparative'] = {
                'as_of_date': comparative['as_of_date'],
                'assets': {'total': comparative['assets']['total']},
                'liabilities': {'total': comparative['liabilities']['total']},
                'equity': {'total': comparative['equity']['total']},
                'variance': {
                    'assets': str(total_assets - Decimal(comparative['assets']['total'])),
                    'liabilities': str(total_liabilities - Decimal(comparative['liabilities']['total'])),
                    'equity': str(total_equity - Decimal(comparative['equity']['total']))
                }
            }
        
        return result
    
    def _get_accounts_by_type(
        self,
        account_type: str,
        detail_level: str,
        start_date: Optional[date],
        end_date: date
    ) -> List[Dict]:
        """Get accounts of specific type with balances"""
        # Scope by branch/tenant, NOT owner
        accounts = Account.objects.filter(
            account_type=account_type,
            is_deleted=False
        )
        
        if self.branch:
            accounts = accounts.filter(branch=self.branch)
        elif hasattr(self.owner, 'tenant') and self.owner.tenant:
            accounts = accounts.filter(tenant=self.owner.tenant)
        
        if detail_level in ('summary', 'detailed'):
            # Both modes show only parent accounts at top level.
            # In 'detailed' mode the parent rows include their children nested
            # via the include_children flag passed to _calculate_account_balance.
            accounts = accounts.filter(account_level=Account.LEVEL_PARENT)

        result = []
        for account in accounts.order_by('code'):
            balance_data = self._calculate_account_balance(
                account,
                start_date,
                end_date,
                include_children=(detail_level in ['detailed', 'all'])
            )
            result.append(balance_data)
        
        return result
    
    def _calculate_account_balance(
        self,
        account: Account,
        start_date: Optional[date],
        end_date: date,
        include_children: bool = False
    ) -> Dict:
        """
        Calculate account balance.

        For PARENT accounts: aggregates from child accounts.
        For CHILD accounts:
          - No start_date: uses Account.balance (stored field) directly. This
            surfaces balances even when TransactionEntry records are not yet
            marked posted, and lets the caller spot discrepancies between the
            stored balance and what entries alone would compute.
          - With start_date: uses Account.balance_bf (balance brought forward)
            as the opening figure, then adds posted period entries on top.
            Closing balance = balance_bf ± net period movement.

        Returns dict with keys: code, name, account_type, level, balance_bf,
        debit, credit, balance, [children].
        """
        # PARENT: aggregate children recursively
        if account.account_level == Account.LEVEL_PARENT:
            children = account.children.filter(is_deleted=False)

            total_debit = Decimal('0.00')
            total_credit = Decimal('0.00')
            total_balance = Decimal('0.00')
            total_balance_bf = Decimal('0.00')
            children_data = []

            for child in children.order_by('code'):
                child_data = self._calculate_account_balance(
                    child, start_date, end_date, include_children=False
                )
                total_debit += Decimal(child_data['debit'])
                total_credit += Decimal(child_data['credit'])
                total_balance += Decimal(child_data['balance'])
                total_balance_bf += Decimal(child_data['balance_bf'])

                if include_children:
                    children_data.append(child_data)

            # A parent account can itself receive DIRECT postings when
            # allow_manual_entries=True. Those entries never touch any child,
            # so the children-only rollup above silently drops them. Account.
            # balance can't be reused here to pick them up because it already
            # includes the same children's contribution via the parent-rollup
            # update in TransactionEntry.post() — adding it in would double
            # count. Sum the parent's own entries directly instead.
            own_debit, own_credit, own_balance = self._own_posted_entries(
                account, start_date, end_date
            )
            total_debit += own_debit
            total_credit += own_credit
            total_balance += own_balance

            result = {
                'code': account.code,
                'name': account.name,
                'account_type': account.account_type,
                'level': account.account_level,
                'balance_bf': str(total_balance_bf),
                'debit': str(total_debit),
                'credit': str(total_credit),
                'balance': str(total_balance),
            }
            if include_children and children_data:
                result['children'] = children_data
            return result

        # CHILD: use stored balance fields as the authoritative source
        is_debit_normal = account.account_type in [Account.ASSET, Account.EXPENSE, Account.LOAN]

        if start_date:
            # Date-range view: dynamically computed opening balance + posted period entries.
            # Instead of relying on the static balance_bf (which is only updated during
            # year-end close or import), we compute the actual opening balance at start_date
            # by summing all posted entries before that date.
            entries_before = TransactionEntry.objects.filter(
                account=account,
                transaction__is_deleted=False,
                posted=True,
                transaction__date__lt=start_date,
            )
            if self.branch:
                entries_before = entries_before.filter(transaction__branch=self.branch)
            elif hasattr(self.owner, 'tenant') and self.owner.tenant:
                entries_before = entries_before.filter(transaction__tenant=self.owner.tenant)

            before_debit = entries_before.filter(side=TransactionEntry.DEBIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            before_credit = entries_before.filter(side=TransactionEntry.CREDIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')

            # Net opening balance at start_date
            if is_debit_normal:
                bbf = Decimal(str(before_debit)) - Decimal(str(before_credit))
            else:
                bbf = Decimal(str(before_credit)) - Decimal(str(before_debit))

            # Split opening balance into its debit/credit component based on account type
            if is_debit_normal:
                bbf_debit = max(bbf, Decimal('0.00'))
                bbf_credit = max(-bbf, Decimal('0.00'))
            else:
                bbf_credit = max(bbf, Decimal('0.00'))
                bbf_debit = max(-bbf, Decimal('0.00'))

            # Posted entries in the requested period
            entries = TransactionEntry.objects.filter(
                account=account,
                transaction__is_deleted=False,
                posted=True,
                transaction__date__gte=start_date,
                transaction__date__lte=end_date,
            )
            if self.branch:
                entries = entries.filter(transaction__branch=self.branch)
            elif hasattr(self.owner, 'tenant') and self.owner.tenant:
                entries = entries.filter(transaction__tenant=self.owner.tenant)

            period_debit = entries.filter(side=TransactionEntry.DEBIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            period_credit = entries.filter(side=TransactionEntry.CREDIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')

            total_debit = bbf_debit + Decimal(str(period_debit))
            total_credit = bbf_credit + Decimal(str(period_credit))

            if is_debit_normal:
                balance = total_debit - total_credit
            else:
                balance = total_credit - total_debit

        else:
            # No date range: use Account.balance (the stored running total).
            # This works regardless of whether entries carry posted=True, and
            # any mismatch between this value and what entries would compute
            # is itself a signal of a data-integrity issue.
            stored_balance = account.balance
            bbf = Decimal('0.00')

            if is_debit_normal:
                total_debit = max(stored_balance, Decimal('0.00'))
                total_credit = max(-stored_balance, Decimal('0.00'))
            else:
                total_credit = max(stored_balance, Decimal('0.00'))
                total_debit = max(-stored_balance, Decimal('0.00'))

            balance = stored_balance

        return {
            'code': account.code,
            'name': account.name,
            'account_type': account.account_type,
            'level': account.account_level,
            'balance_bf': str(bbf),
            'debit': str(total_debit),
            'credit': str(total_credit),
            'balance': str(balance),
        }

    def _own_posted_entries(
        self,
        account: Account,
        start_date: Optional[date],
        end_date: date,
    ) -> tuple:
        """
        Sum TransactionEntry rows posted directly against `account` itself
        (not its children). Only meaningful for PARENT accounts with
        allow_manual_entries=True; for a normal leaf this returns zero since
        entries are never blocked from posting to children.

        Deliberately does NOT use Account.balance the way the leaf branch
        does — for a parent, that field already carries the children's
        rollup (see TransactionEntry.post()), so reusing it here would
        double count. Always computed from entries directly.

        Returns (debit, credit, balance) as Decimals.
        """
        is_debit_normal = account.account_type in [Account.ASSET, Account.EXPENSE, Account.LOAN]

        entries = TransactionEntry.objects.filter(
            account=account, transaction__is_deleted=False, posted=True,
        )
        if start_date:
            entries = entries.filter(
                transaction__date__gte=start_date, transaction__date__lte=end_date
            )
        else:
            entries = entries.filter(transaction__date__lte=end_date)
        if self.branch:
            entries = entries.filter(transaction__branch=self.branch)
        elif hasattr(self.owner, 'tenant') and self.owner.tenant:
            entries = entries.filter(transaction__tenant=self.owner.tenant)

        debit = entries.filter(side=TransactionEntry.DEBIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        credit = entries.filter(side=TransactionEntry.CREDIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        debit = Decimal(str(debit))
        credit = Decimal(str(credit))

        balance = (debit - credit) if is_debit_normal else (credit - debit)
        return debit, credit, balance

    def _is_current_account(self, account_data: Dict) -> bool:
        """
        Determine if account is current asset/liability.

        Account codes are 4-digit (1000–5999):
          - Current assets:      1000–1499  (cash, receivables, inventory, prepayments)
          - Non-current assets:  1500–1999  (fixed assets, intangibles, long-term investments)
          - Current liabilities: 2000–2499  (payables, accruals, short-term loans)
          - Non-current liab.:   2500–2999  (long-term loans, bonds, deferred tax)
        """
        code = account_data.get('code', '')
        try:
            numeric_code = int(str(code).split('-')[0])
        except (ValueError, TypeError):
            return False

        # Current assets: 1000–1499
        if 1000 <= numeric_code <= 1499:
            return True

        # Current liabilities: 2000–2499
        if 2000 <= numeric_code <= 2499:
            return True

        return False    
    def generate_cash_flow_statement(
        self,
        start_date: date,
        end_date: Optional[date] = None,
        method: str = 'direct'  # 'direct' or 'indirect'
    ) -> Dict:
        """
        Generate Cash Flow Statement
        
        Shows cash movements categorized by activity type:
        - Operating Activities: Day-to-day business operations
        - Investing Activities: Asset purchases/sales
        - Financing Activities: Loans, equity, dividends
        
        Args:
            start_date: Period start date (required)
            end_date: Period end date (default: today)
            method: 'direct' (cash receipts/payments) or 'indirect' (adjust net income)
        
        Returns:
            {
                'period': {
                    'start_date': date,
                    'end_date': date,
                    'method': str
                },
                'operating_activities': {
                    'items': [
                        {'description': str, 'amount': Decimal, 'date': date},
                        ...
                    ],
                    'net': Decimal
                },
                'investing_activities': {...},
                'financing_activities': {...},
                'net_change_in_cash': Decimal,
                'beginning_cash': Decimal,
                'ending_cash': Decimal,
                'verification': {
                    'calculated_ending': Decimal,
                    'actual_ending': Decimal,
                    'is_balanced': bool
                }
            }
        """
        end_date = end_date or timezone.now().date()
        
        # Get cash accounts (typically code starting with 1010 or type=ASSET and name contains 'cash')
        cash_accounts = Account.objects.filter(
            owner=self.owner,
            is_deleted=False,
            code__startswith='1010'  # Cash and bank accounts
        )
        
        if self.branch:
            cash_accounts = cash_accounts.filter(branch=self.branch)
        
        # Calculate beginning cash balance
        beginning_cash = self._get_cash_balance(cash_accounts, start_date - timedelta(days=1))
        
        # Get all cash transactions in period
        cash_entries = TransactionEntry.objects.filter(
            account__in=cash_accounts,
            transaction__date__gte=start_date,
            transaction__date__lte=end_date,
            posted=True,
            transaction__is_deleted=False
        ).select_related('transaction', 'account').order_by('transaction__date')
        
        # Categorize transactions by activity type
        operating = []
        investing = []
        financing = []
        
        for entry in cash_entries:
            # Calculate cash impact (debit increases cash, credit decreases cash)
            amount = entry.amount if entry.side == TransactionEntry.DEBIT else -entry.amount
            
            # Get transaction category
            category = self._categorize_transaction(entry.transaction)
            
            item = {
                'description': entry.transaction.description or entry.account.name,
                'amount': str(amount),
                'date': str(entry.transaction.date),
                'reference': entry.transaction.reference_number or '',
                'transaction_id': entry.transaction.id
            }
            
            if category == 'operating':
                operating.append(item)
            elif category == 'investing':
                investing.append(item)
            elif category == 'financing':
                financing.append(item)
        
        # Calculate totals
        operating_net = sum(Decimal(item['amount']) for item in operating)
        investing_net = sum(Decimal(item['amount']) for item in investing)
        financing_net = sum(Decimal(item['amount']) for item in financing)
        
        net_change = operating_net + investing_net + financing_net
        calculated_ending = beginning_cash + net_change
        
        # Verify against actual ending balance
        actual_ending = self._get_cash_balance(cash_accounts, end_date)
        
        return {
            'period': {
                'start_date': str(start_date),
                'end_date': str(end_date),
                'method': method
            },
            'operating_activities': {
                'items': operating,
                'net': str(operating_net)
            },
            'investing_activities': {
                'items': investing,
                'net': str(investing_net)
            },
            'financing_activities': {
                'items': financing,
                'net': str(financing_net)
            },
            'net_change_in_cash': str(net_change),
            'beginning_cash': str(beginning_cash),
            'ending_cash': str(calculated_ending),
            'verification': {
                'calculated_ending': str(calculated_ending),
                'actual_ending': str(actual_ending),
                'is_balanced': abs(calculated_ending - actual_ending) < Decimal('0.01')
            }
        }
    
    def _get_cash_balance(self, cash_accounts, as_of_date: date) -> Decimal:
        """
        Calculate total cash balance as of a specific date
        
        Args:
            cash_accounts: QuerySet of cash accounts
            as_of_date: Date to calculate balance
        
        Returns:
            Total cash balance
        """
        total_balance = Decimal('0.00')
        
        for account in cash_accounts:
            balance_data = self._calculate_account_balance(
                account,
                start_date=None,
                end_date=as_of_date,
                include_children=True
            )
            total_balance += Decimal(balance_data['balance'])
        
        return total_balance
    
    def _categorize_transaction(self, transaction: Transaction) -> str:
        """
        Categorize transaction into Operating, Investing, or Financing activity
        
        Logic based on transaction type and account codes:
        - Operating: Revenue, expenses, receivables, payables, inventory
        - Investing: Asset purchases/sales, equipment, investments
        - Financing: Loans, equity, dividends, capital contributions
        
        Args:
            transaction: Transaction to categorize
        
        Returns:
            'operating', 'investing', or 'financing'
        """
        # Check transaction type if available
        if hasattr(transaction, 'type') and transaction.type:
            trans_type = transaction.type.lower()
            
            # Investing activities
            if any(keyword in trans_type for keyword in [
                'asset_purchase', 'asset_sale', 'equipment', 'investment',
                'fixed_asset', 'capital_expenditure', 'capex'
            ]):
                return 'investing'
            
            # Financing activities
            if any(keyword in trans_type for keyword in [
                'loan', 'borrowing', 'repayment', 'equity', 'dividend',
                'capital', 'shares', 'stock'
            ]):
                return 'financing'
        
        # Analyze account codes involved in the transaction
        entries = transaction.entries.exclude(account__code__startswith='1010')  # Exclude cash accounts
        
        for entry in entries:
            code = entry.account.code
            
            # Investing: Fixed assets (150-199), Investments (120-129)
            if code.startswith('15') or code.startswith('16') or code.startswith('12'):
                return 'investing'
            
            # Financing: Long-term liabilities (250-299), Equity (300-399)
            if code.startswith('25') or code.startswith('26') or code.startswith('27') or code.startswith('3'):
                return 'financing'
        
        # Default to operating activities
        return 'operating'