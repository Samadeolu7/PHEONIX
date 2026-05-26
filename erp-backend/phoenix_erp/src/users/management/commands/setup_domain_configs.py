# Migration helper to set up domain configurations for existing tenants

from django.core.management.base import BaseCommand
from users.models import Tenant


class Command(BaseCommand):
    help = 'Initialize domain configurations for tenants'

    def handle(self, *args, **options):
        self.stdout.write('Setting up domain configurations...')
        
        # School domain default config
        school_config = {
            'academic_years': ['2024/2025', '2025/2026'],
            'terms': ['Term 1', 'Term 2', 'Term 3'],
            'grade_levels': list(range(1, 13)),  # Grades 1-12
            'fee_types': [
                {'code': 'tuition', 'name': 'Tuition Fee', 'recurring': True},
                {'code': 'books', 'name': 'Book Fee', 'recurring': False},
                {'code': 'uniform', 'name': 'Uniform Fee', 'recurring': False},
                {'code': 'transport', 'name': 'Transportation Fee', 'recurring': True},
                {'code': 'lunch', 'name': 'Lunch Fee', 'recurring': True},
                {'code': 'exam', 'name': 'Examination Fee', 'recurring': False},
                {'code': 'sports', 'name': 'Sports Fee', 'recurring': True},
            ],
            'late_payment_fee': {
                'enabled': True,
                'type': 'percentage',  # or 'fixed'
                'value': 5,  # 5% or fixed amount
                'grace_days': 7,
            },
            'payment_installments': {
                'enabled': True,
                'max_installments': 3,
                'interest_free': True,
            },
        }
        
        # Hospital domain default config
        hospital_config = {
            'departments': [
                'Emergency',
                'Cardiology',
                'Pediatrics',
                'Orthopedics',
                'Neurology',
                'General Surgery',
                'Obstetrics & Gynecology',
                'Ophthalmology',
                'ENT',
                'Dentistry',
            ],
            'consultation_fee': 5000,
            'insurance_accepted': True,
            'insurance_providers': ['NHIS', 'Private Insurance'],
            'appointment_duration': 30,  # minutes
            'working_hours': {
                'start': '08:00',
                'end': '18:00',
            },
            'emergency_24_7': True,
            'payment_plans': {
                'enabled': True,
                'max_duration_months': 12,
                'interest_rate': 0,  # Interest-free for hospitals
                'minimum_deposit_percentage': 30,
            },
        }
        
        # Microfinance domain default config
        microfinance_config = {
            'loan_products': [
                {
                    'code': 'personal',
                    'name': 'Personal Loan',
                    'min_amount': 10000,
                    'max_amount': 500000,
                    'max_duration_months': 12,
                    'interest_rate': 5.0,  # percentage per month
                },
                {
                    'code': 'business',
                    'name': 'Business Loan',
                    'min_amount': 50000,
                    'max_amount': 2000000,
                    'max_duration_months': 24,
                    'interest_rate': 4.5,
                },
                {
                    'code': 'group',
                    'name': 'Group Loan',
                    'min_amount': 20000,
                    'max_amount': 1000000,
                    'max_duration_months': 12,
                    'interest_rate': 4.0,
                },
            ],
            'savings_products': [
                {
                    'code': 'regular',
                    'name': 'Regular Savings',
                    'min_balance': 1000,
                    'interest_rate': 3.0,  # per annum
                },
                {
                    'code': 'fixed',
                    'name': 'Fixed Deposit',
                    'min_balance': 50000,
                    'interest_rate': 8.0,
                    'lock_period_months': 6,
                },
            ],
            'penalties': {
                'late_payment_percentage': 2,
                'missed_payment_grace_days': 3,
            },
            'kyc_required': True,
            'guarantor_required': True,
            'min_guarantors': 2,
        }
        
        # Retail domain default config
        retail_config = {
            'payment_methods': ['cash', 'card', 'mobile_money', 'credit'],
            'credit_terms': {
                'enabled': True,
                'default_limit': 100000,
                'default_period_days': 30,
                'interest_rate': 2.0,  # per month
            },
            'loyalty_program': {
                'enabled': True,
                'points_per_currency': 1,  # 1 point per 1 currency unit
                'redemption_rate': 0.01,  # 1 point = 0.01 currency
            },
            'discount_tiers': [
                {'min_amount': 10000, 'discount': 5},
                {'min_amount': 50000, 'discount': 10},
                {'min_amount': 100000, 'discount': 15},
                {'min_amount': 500000, 'discount': 20},
            ],
            'inventory_tracking': True,
            'auto_reorder': {
                'enabled': True,
                'threshold_percentage': 20,
            },
        }
        
        # Update tenants
        config_map = {
            'school': school_config,
            'hospital': hospital_config,
            'microfinance': microfinance_config,
            'retail': retail_config,
        }
        
        for tenant in Tenant.objects.all():
            if not tenant.domain_config:
                config = config_map.get(tenant.domain_type, {})
                tenant.domain_config = config
                tenant.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Updated config for {tenant.name} ({tenant.domain_type})'
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f'Skipped {tenant.name} (already has config)'
                    )
                )
        
        self.stdout.write(self.style.SUCCESS('Domain configuration setup complete!'))
