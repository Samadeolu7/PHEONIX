from django.core.management.base import BaseCommand
from django.db import transaction
from products.models import ProductCategory, Product, Fee
from decimal import Decimal

class Command(BaseCommand):
    help = 'Set up default product categories and products'

    def handle(self, *args, **options):
        with transaction.atomic():
            # Create default product categories
            savings_cat = ProductCategory.objects.create(
                name='Savings Products',
                code='SAV',
                description='Regular savings and deposit products'
            )
            loan_cat = ProductCategory.objects.create(
                name='Loan Products',
                code='LOAN',
                description='Various loan products'
            )

            # Create default fees
            reg_fee = Fee.objects.create(
                name='Registration Fee',
                fee_type='fixed',
                fixed_amount=Decimal('500.00'),
                description='One-time registration fee'
            )
            admin_fee = Fee.objects.create(
                name='Administrative Fee',
                fee_type='percentage',
                percentage=Decimal('1.00'),
                description='Administrative fee on loans'
            )
            withdrawal_fee = Fee.objects.create(
                name='Withdrawal Fee',
                fee_type='hybrid',
                fixed_amount=Decimal('100.00'),
                percentage=Decimal('0.50'),
                minimum_charge=Decimal('100.00'),
                maximum_charge=Decimal('1000.00'),
                description='Fee for withdrawals'
            )

            # Create default savings products
            regular_savings = Product.objects.create(
                name='Regular Savings',
                code='REG-SAV',
                category=savings_cat,
                product_type=Product.SAVINGS,
                description='Regular savings account with daily interest',
                minimum_amount=Decimal('1000.00'),
                interest_rate=Decimal('3.50'),
                interest_calculation='simple',
                fee_structure={
                    'registration': str(reg_fee.id),
                    'withdrawal': str(withdrawal_fee.id)
                }
            )

            fixed_deposit = Product.objects.create(
                name='Fixed Deposit',
                code='FIX-DEP',
                category=savings_cat,
                product_type=Product.SAVINGS,
                description='Fixed term deposit with higher interest',
                minimum_amount=Decimal('100000.00'),
                interest_rate=Decimal('8.00'),
                interest_calculation='compound',
                minimum_term=30,  # 30 days
                fee_structure={
                    'early_withdrawal_penalty': '5.00'
                }
            )

            # Create default loan products
            personal_loan = Product.objects.create(
                name='Personal Loan',
                code='PERS-LOAN',
                category=loan_cat,
                product_type=Product.LOAN,
                description='Unsecured personal loan',
                minimum_amount=Decimal('50000.00'),
                maximum_amount=Decimal('500000.00'),
                interest_rate=Decimal('24.00'),  # 24% per annum
                minimum_term=30,  # 1 month
                maximum_term=365,  # 1 year
                fee_structure={
                    'registration': str(reg_fee.id),
                    'administrative': str(admin_fee.id)
                }
            )

            business_loan = Product.objects.create(
                name='Business Loan',
                code='BUS-LOAN',
                category=loan_cat,
                product_type=Product.LOAN,
                description='Business expansion loan',
                minimum_amount=Decimal('200000.00'),
                maximum_amount=Decimal('2000000.00'),
                interest_rate=Decimal('18.00'),  # 18% per annum
                minimum_term=90,  # 3 months
                maximum_term=730,  # 2 years
                fee_structure={
                    'registration': str(reg_fee.id),
                    'administrative': str(admin_fee.id),
                    'insurance': '2.00'  # 2% insurance fee
                }
            )

            self.stdout.write(self.style.SUCCESS('Successfully created default products and fees'))
