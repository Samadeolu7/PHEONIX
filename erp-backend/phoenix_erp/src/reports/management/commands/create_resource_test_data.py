"""
Management command to create test resource consumption data
Includes fuel voucher for driver/vehicle as a real-world example
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import date

from users.models import User
from branches.models import Branch
from expenses.models import Resource, ResourceCategory, ResourceConsumption, PrepaidVoucher
from assets.models import FixedAsset, AssetCategory
from hr.models import Staff, Department
from accounts.models import Account


class Command(BaseCommand):
    help = 'Creates test resource consumption data for PDF testing'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Creating resource consumption test data...'))

        # Get existing test user and branch
        try:
            user = User.objects.get(username='schooladmin')
            branch = user.branch
            self.stdout.write(self.style.SUCCESS(f'✓ Using user: {user.username}'))
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR('User "schooladmin" not found. Run create_school_test_data first.'))
            return

        # Create GL Accounts for resources
        self.stdout.write('Creating GL accounts for resources...')
        
        try:
            fuel_expense_account = Account.objects.get(code='5200')
            self.stdout.write(self.style.WARNING('  Using existing Fuel Expense account (5200)'))
        except Account.DoesNotExist:
            fuel_expense_account = Account.objects.create(
                code='5200',
                name='Fuel & Gasoline Expense',
                account_type=Account.EXPENSE,
                account_level=Account.LEVEL_PARENT,
                owner=user,
                branch=branch
            )
            self.stdout.write(self.style.SUCCESS('✓ Created account: Fuel Expense (5200)'))
        
        try:
            prepaid_asset_account = Account.objects.get(code='1300')
            self.stdout.write(self.style.WARNING('  Using existing Prepaid Asset account (1300)'))
        except Account.DoesNotExist:
            prepaid_asset_account = Account.objects.create(
                code='1300',
                name='Prepaid Expenses',
                account_type=Account.ASSET,
                account_level=Account.LEVEL_PARENT,
                owner=user,
                branch=branch
            )
            self.stdout.write(self.style.SUCCESS('✓ Created account: Prepaid Expenses (1300)'))

        # Create Asset Category for Vehicles
        asset_category, created = AssetCategory.objects.get_or_create(
            code='VEH',
            defaults={
                'name': 'Vehicles',
                'description': 'Cars, trucks, vans, and other motor vehicles',
                'depreciation_method': 'straight_line',
                'useful_life_years': 5,
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created asset category: Vehicles'))

        # Create Department
        department, created = Department.objects.get_or_create(
            code='ADM',
            defaults={
                'name': 'Administration',
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created department: Administration'))

        # Create Staff/Driver
        staff, created = Staff.objects.get_or_create(
            employee_code='EMP-001',
            defaults={
                'first_name': 'John',
                'last_name': 'Driver',
                'email': 'john.driver@greenwoodacademy.edu',
                'phone': '(555) 987-6543',
                'department': department,
                'job_title': 'School Bus Driver',
                'employment_type': 'full_time',
                'employment_status': 'active',
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created staff: John Driver'))

        # Create Vehicle Asset
        vehicle, created = FixedAsset.objects.get_or_create(
            asset_code='VEH-BUS-001',
            defaults={
                'name': 'School Bus (Toyota Coaster)',
                'description': 'Main school bus for student transportation',
                'category': asset_category,
                'acquisition_date': date(2022, 1, 15),
                'acquisition_cost': Decimal('45000.00'),
                'current_value': Decimal('36000.00'),
                'asset_details': {
                    'plate_number': 'EDU-2024-ABC',
                    'make': 'Toyota',
                    'model': 'Coaster',
                    'year': '2022',
                    'vin': 'JT3RK49C2M0001234',
                    'engine_capacity': '4.0L',
                    'fuel_type': 'Diesel',
                    'seating_capacity': '29',
                },
                'status': 'active',
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created vehicle: School Bus (EDU-2024-ABC)'))

        # Create Resource Category
        resource_category, created = ResourceCategory.objects.get_or_create(
            code='FUEL',
            defaults={
                'name': 'Fuel & Petroleum',
                'description': 'Gasoline, Diesel, and other fuel types',
                'expense_account': fuel_expense_account,
                'prepaid_asset_account': prepaid_asset_account,
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created resource category: Fuel & Petroleum'))

        # Create Diesel Resource
        diesel_resource, created = Resource.objects.get_or_create(
            resource_code='DSL-001',
            defaults={
                'name': 'Diesel Fuel',
                'description': 'Automotive diesel fuel for vehicles',
                'resource_type': 'consumable',
                'category': resource_category,
                'unit_of_measure': 'liters',
                'default_unit_cost': Decimal('1.45'),
                'default_tracking_method': 'odometer',
                'expense_account': fuel_expense_account,
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created resource: Diesel Fuel'))

        # Create Prepaid Voucher
        voucher, created = PrepaidVoucher.objects.get_or_create(
            voucher_number='FUEL-V-2024-001',
            defaults={
                'resource': diesel_resource,
                'voucher_value': Decimal('500.00'),
                'voucher_type': 'single_use',
                'issue_date': date.today(),
                'expiry_date': date(2026, 12, 31),
                'status': 'active',
                'issued_to_name': f'{staff.full_name}',
                'issued_for': 'January 2026 fuel allocation for school bus',
                'owner': user,
                'branch': branch
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created prepaid voucher: FUEL-V-2024-001'))

        # Create Resource Consumption (Fuel for Vehicle)
        consumption, created = ResourceConsumption.objects.get_or_create(
            consumption_number='RC-20260118-001',
            defaults={
                'payment_flow': 'prepaid',
                'prepaid_voucher': voucher,
                'resource': diesel_resource,
                
                # Beneficiary: Vehicle
                'beneficiary_type': 'asset',
                'beneficiary_name': vehicle.name,
                'asset': vehicle,
                'beneficiary_reference': vehicle.asset_code,
                
                # Consumption details
                'consumption_date': date.today(),
                'quantity_consumed': Decimal('85.50'),
                'unit_of_measure': 'liters',
                'unit_cost': Decimal('1.45'),
                'total_cost': Decimal('123.98'),
                
                # Usage metrics (odometer)
                'reading_type': 'odometer',
                'previous_reading': Decimal('45230.5'),
                'current_reading': Decimal('45598.2'),
                'usage_since_last': Decimal('367.7'),
                'consumption_rate': Decimal('4.30'),  # km per liter
                
                # Transaction details
                'operator_name': staff.full_name,
                'employee': staff,
                'consumption_location': 'Shell Filling Station, Main Street',
                'receipt_number': 'SHL-2024-789456',
                
                # Status
                'status': 'approved',
                'approved_by': user,
                'approved_at': timezone.now(),
                
                'notes': 'Weekly fuel refill for school bus. Route: Main campus to sports complex and back.',
                
                'owner': user,
                'branch': branch
            }
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS('✓ Created resource consumption: RC-20260118-001'))
            
            # Update voucher balance
            voucher.balance_amount = voucher.voucher_value - consumption.total_cost
            voucher.save()
            self.stdout.write(self.style.SUCCESS(f'  Updated voucher balance: ${voucher.balance_amount}'))

        # Summary
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('✓ Resource consumption test data created successfully!'))
        self.stdout.write('='*60)
        self.stdout.write(f'\nVehicle: {vehicle.name}')
        self.stdout.write(f'  - Plate: {vehicle.asset_details.get("plate_number")}')
        self.stdout.write(f'  - Asset Code: {vehicle.asset_code}')
        self.stdout.write(f'\nDriver: {staff.full_name} ({staff.employee_code})')
        self.stdout.write(f'\nResource: {diesel_resource.name}')
        self.stdout.write(f'  - Unit Cost: ${diesel_resource.default_unit_cost}/liter')
        self.stdout.write(f'\nPrepaid Voucher: {voucher.voucher_number}')
        self.stdout.write(f'  - Value: ${voucher.voucher_value}')
        self.stdout.write(f'  - Balance: ${voucher.balance_amount}')
        self.stdout.write(f'\nConsumption: {consumption.consumption_number} (ID: {consumption.id})')
        self.stdout.write(f'  - Quantity: {consumption.quantity_consumed} liters')
        self.stdout.write(f'  - Cost: ${consumption.total_cost}')
        self.stdout.write(f'  - Odometer: {consumption.previous_reading} → {consumption.current_reading} km')
        self.stdout.write(f'  - Distance: {consumption.usage_since_last} km')
        self.stdout.write(f'  - Efficiency: {consumption.consumption_rate} km/liter')
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('\nTest the PDF with:'))
        self.stdout.write(f'GET /api/reports/pdf/resource-consumption/{consumption.id}/')
        self.stdout.write('='*60 + '\n')
