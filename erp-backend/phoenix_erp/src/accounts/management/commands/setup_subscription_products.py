"""
Management command to set up subscription products

Creates Product entries for subscription plans (Basic, Professional, Enterprise)
that will be used for tenant subscriptions.

Usage:
    python manage.py setup_subscription_products
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction
from products.models import Product, ProductCategory
from decimal import Decimal

User = get_user_model()


class Command(BaseCommand):
    help = 'Set up subscription plan products'

    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-email',
            type=str,
            help='Email of system admin (if not provided, will use first system admin found)'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Get system admin
        owner_email = options.get('owner_email')
        
        if owner_email:
            try:
                owner = User.objects.get(email=owner_email, is_system_admin=True)
            except User.DoesNotExist:
                raise CommandError(f'System admin with email {owner_email} not found')
        else:
            owner = User.objects.filter(is_system_admin=True).first()
            if not owner:
                raise CommandError('No system admin found. Run: python manage.py create_system_admin')

        self.stdout.write(f'Creating subscription products for: {owner.email}')

        # Get or create "SaaS Subscriptions" category
        category, created = ProductCategory.objects.get_or_create(
            owner=owner,
            branch=owner.branch,
            name='SaaS Subscriptions',
            defaults={
                'description': 'Software as a Service subscription plans',
                'is_active': True
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created category: {category.name}'))
        else:
            self.stdout.write(f'Using existing category: {category.name}')

        # Define subscription plans
        plans = [
            {
                'name': 'Basic Monthly',
                'code': 'BASIC-MONTHLY',
                'description': 'Basic plan - Billed monthly',
                'unit_price': Decimal('25000.00'),
                'metadata': {
                    'frequency_multipliers': {
                        'monthly': 1,
                        'quarterly': 2.85,  # ₦71,250 (5% discount)
                        'yearly': 10,       # ₦250,000 (2 months free)
                    },
                    'features': {
                        'max_users': 5,
                        'max_branches': 1,
                        'max_transactions_per_month': 1000,
                        'storage_limit_gb': 5,
                        'advanced_reports': False,
                        'api_access': False,
                        'priority_support': False,
                    }
                }
            },
            {
                'name': 'Professional Monthly',
                'code': 'PRO-MONTHLY',
                'description': 'Professional plan - Billed monthly',
                'unit_price': Decimal('50000.00'),
                'metadata': {
                    'frequency_multipliers': {
                        'monthly': 1,
                        'quarterly': 2.85,  # ₦142,500 (5% discount)
                        'yearly': 10,       # ₦500,000 (2 months free)
                    },
                    'features': {
                        'max_users': 20,
                        'max_branches': 3,
                        'max_transactions_per_month': 5000,
                        'storage_limit_gb': 20,
                        'advanced_reports': True,
                        'api_access': True,
                        'priority_support': False,
                    }
                }
            },
            {
                'name': 'Enterprise Monthly',
                'code': 'ENTERPRISE-MONTHLY',
                'description': 'Enterprise plan - Billed monthly',
                'unit_price': Decimal('100000.00'),
                'metadata': {
                    'frequency_multipliers': {
                        'monthly': 1,
                        'quarterly': 2.85,  # ₦285,000 (5% discount)
                        'yearly': 10,       # ₦1,000,000 (2 months free)
                    },
                    'features': {
                        'max_users': 100,
                        'max_branches': 10,
                        'max_transactions_per_month': None,  # Unlimited
                        'storage_limit_gb': 100,
                        'advanced_reports': True,
                        'api_access': True,
                        'priority_support': True,
                    }
                }
            },
        ]

        created_count = 0
        for plan_data in plans:
            product, created = Product.objects.get_or_create(
                owner=owner,
                branch=owner.branch,
                code=plan_data['code'],
                defaults={
                    'name': plan_data['name'],
                    'description': plan_data['description'],
                    'category': category,
                    'unit_price': plan_data['unit_price'],
                    'is_active': True,
                    'track_inventory': False,  # Services don't need inventory tracking
                    'metadata': plan_data['metadata']
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(
                    f'✓ Created product: {product.name} (₦{product.unit_price}/month)'
                ))
            else:
                self.stdout.write(f'Product already exists: {product.name}')

        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS(f'Subscription Products Setup Complete!'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(f'Created: {created_count} new products')
        self.stdout.write(f'Category: {category.name}')
        self.stdout.write(self.style.WARNING('\nNext steps:'))
        self.stdout.write('1. Set up chart of accounts for subscription tracking')
        self.stdout.write('2. Create income/receivable accounts for each tenant')
        self.stdout.write('3. Configure Celery for automated billing tasks')
