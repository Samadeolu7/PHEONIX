# expenses/tests/test_resource_consumption_models.py
"""
Comprehensive tests for Resource and ResourceConsumption models
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from datetime import timedelta, date

from expenses.models import (
    Resource, ResourceConsumption, ExpenseCategory,
    PrepaidExpense, PrepaidVoucher
)
from assets.models import FixedAsset, AssetCategory
from branches.models import Branch
from users.models import User, Tenant
from accounts.models import Account
from transactions.models import Transaction as JournalEntry
from liabilities.models import AccountsPayable
from procurement.models import Supplier
from common.managers import set_current_tenant


class ResourceModelTest(TestCase):
    """Test Resource model functionality"""
    
    def setUp(self):
        """Create test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant", slug='testorg')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.user.branch = self.branch
        self.user.tenant = self.tenant
        self.user.save()
        
        # Create accounts
        self.expense_account = Account.objects.create(
            code="5100",
            name="Fuel Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.asset_account = Account.objects.create(
            code="1500",
            name="Prepaid Fuel",
            account_type="ASSET",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense category
        self.expense_category = ExpenseCategory.objects.create(
            name="Fuel Expenses",
            code="FUEL",
            expense_account=self.expense_account,
            branch=self.branch,
            owner=self.user
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name="Fuel Supplier Ltd",
            supplier_code="SUP001",
            branch=self.branch,
            owner=self.user
        )
    
    def test_create_fuel_resource(self):
        """Test creating a fuel resource"""
        resource = Resource.objects.create(
            resource_code="FUEL-DIESEL",
            resource_type="fuel",
            name="Diesel Fuel",
            unit_of_measure="liters",
            default_unit_cost=Decimal('100.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            variance_threshold_percentage=Decimal('20.00'),
            max_daily_usage=Decimal('200.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(resource.resource_code, "FUEL-DIESEL")
        self.assertEqual(resource.resource_type, "fuel")
        self.assertEqual(resource.default_unit_cost, Decimal('100.00'))
        self.assertEqual(resource.variance_threshold_percentage, Decimal('20.00'))
        self.assertFalse(resource.is_service)
    
    def test_create_utility_resource(self):
        """Test creating a utility resource"""
        resource = Resource.objects.create(
            resource_code="UTIL-ELEC",
            resource_type="utilities",
            name="Electricity",
            unit_of_measure="kWh",
            default_unit_cost=Decimal('15.00'),
            default_tracking_method="postpaid",
            expense_category=self.expense_category,
            default_supplier=self.supplier,
            variance_threshold_percentage=Decimal('25.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(resource.resource_code, "UTIL-ELEC")
        self.assertEqual(resource.resource_type, "utilities")
        self.assertEqual(resource.default_tracking_method, "postpaid")
        self.assertEqual(resource.default_supplier, self.supplier)
    
    def test_create_service_resource(self):
        """Test creating a contracted service resource"""
        resource = Resource.objects.create(
            resource_code="SVC-CLEAN",
            resource_type="services",
            name="Cleaning Services",
            unit_of_measure="months",
            default_unit_cost=Decimal('50000.00'),
            default_tracking_method="postpaid",
            expense_category=self.expense_category,
            default_supplier=self.supplier,
            is_service=True,
            service_contract_number="CONTRACT-2024-001",
            service_frequency="monthly",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(resource.is_service)
        self.assertEqual(resource.service_frequency, "monthly")
        self.assertEqual(resource.service_contract_number, "CONTRACT-2024-001")
    
    def test_resource_efficiency_thresholds(self):
        """Test resource with efficiency thresholds"""
        resource = Resource.objects.create(
            resource_code="FUEL-PETROL",
            resource_type="fuel",
            name="Petrol",
            unit_of_measure="liters",
            default_unit_cost=Decimal('110.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            min_efficiency=Decimal('2.5'),
            max_efficiency=Decimal('5.0'),
            variance_threshold_percentage=Decimal('20.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(resource.min_efficiency, Decimal('2.5'))
        self.assertEqual(resource.max_efficiency, Decimal('5.0'))
    
    def test_resource_string_representation(self):
        """Test Resource __str__ method"""
        resource = Resource.objects.create(
            resource_code="FUEL-DIESEL",
            resource_type="fuel",
            name="Diesel Fuel",
            unit_of_measure="liters",
            default_unit_cost=Decimal('100.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertIn("FUEL-DIESEL", str(resource))
        self.assertIn("Diesel Fuel", str(resource))


class ResourceConsumptionPrepaidTest(TestCase):
    """Test ResourceConsumption with prepaid flow"""
    
    def setUp(self):
        """Create test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant", slug='testorg2')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.user.branch = self.branch
        self.user.tenant = self.tenant
        self.user.save()
        
        # Create accounts
        self.expense_account = Account.objects.create(
            code="5100",
            name="Fuel Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.asset_account = Account.objects.create(
            code="1500",
            name="Prepaid Fuel",
            account_type="ASSET",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.accumulated_depreciation_account = Account.objects.create(
            code="1800",
            name="Accumulated Depreciation",
            account_type="ASSET",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.depreciation_account = Account.objects.create(
            code="5200",
            name="Depreciation Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense category
        self.expense_category = ExpenseCategory.objects.create(
            name="Fuel Expenses",
            code="FUEL",
            expense_account=self.expense_account,
            branch=self.branch,
            owner=self.user
        )
        
        # Create resource
        self.resource = Resource.objects.create(
            resource_code="FUEL-DIESEL",
            resource_type="fuel",
            name="Diesel Fuel",
            unit_of_measure="liters",
            default_unit_cost=Decimal('100.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            variance_threshold_percentage=Decimal('20.00'),
            max_daily_usage=Decimal('200.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create prepaid expense and voucher
        self.prepaid_expense = PrepaidExpense.objects.create(
            reference_number="PE-001",
            category=self.expense_category,
            description="Test prepaid fuel expense",
            purchase_date=timezone.now().date(),
            total_amount=Decimal('50000.00'),
            remaining_amount=Decimal('50000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.prepaid_voucher = PrepaidVoucher.objects.create(
            voucher_number="PV-001",
            prepaid_expense=self.prepaid_expense,
            beneficiary_type='asset',
            beneficiary_name='Test Vehicle Pool',
            beneficiary_reference='VEH-001',
            allocated_units=Decimal('500.00'),
            allocated_amount=Decimal('50000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create fixed asset
        asset_category = AssetCategory.objects.create(
            name="Vehicles",
            code="VEH",
            asset_account=self.asset_account,
            depreciation_account=self.depreciation_account,
            accumulated_depreciation_account=self.accumulated_depreciation_account,
            branch=self.branch,
            owner=self.user
        )
        
        self.asset = FixedAsset.objects.create(
            asset_number="VEH-001",
            name="Toyota Hilux",
            category=asset_category,
            purchase_date=date.today(),
            purchase_price=Decimal('500000.00'),
            depreciation_method='straight_line',
            useful_life_years=5,
            depreciation_start_date=date.today(),
            branch=self.branch,
            owner=self.user
        )
    
    def test_create_prepaid_consumption(self):
        """Test creating a prepaid consumption"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            unit_cost=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10150.00'),
            reading_type="odometer",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertIsNotNone(consumption.consumption_number)
        self.assertTrue(consumption.consumption_number.startswith('RC-'))
        self.assertEqual(consumption.total_cost, Decimal('5000.00'))
        self.assertEqual(consumption.usage_since_last, Decimal('150.00'))
        self.assertEqual(consumption.payment_flow, "prepaid")
        # Note: journal_entry no longer exists after Transaction model migration
    
    def test_consumption_number_auto_generation(self):
        """Test auto-generation of consumption_number"""
        consumption1 = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            branch=self.branch,
            owner=self.user
        )
        
        consumption2 = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('40.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertIsNotNone(consumption1.consumption_number)
        self.assertIsNotNone(consumption2.consumption_number)
        self.assertNotEqual(consumption1.consumption_number, consumption2.consumption_number)
    
    def test_consumption_inherits_resource_defaults(self):
        """Test that consumption inherits defaults from resource"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            # Don't set unit_cost - should inherit from resource
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(consumption.unit_cost, self.resource.default_unit_cost)
        self.assertEqual(consumption.reading_type, self.resource.default_tracking_method)
    
    def test_consumption_rate_calculation(self):
        """Test consumption rate (efficiency) calculation"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10150.00'),
            reading_type="odometer",
            branch=self.branch,
            owner=self.user
        )
        
        # 150 km / 50 liters = 3.0 km/liter
        self.assertEqual(consumption.usage_since_last, Decimal('150.00'))
        self.assertEqual(consumption.consumption_rate, Decimal('3.0000'))


class ResourceConsumptionPostpaidTest(TestCase):
    """Test ResourceConsumption with postpaid flow"""
    
    def setUp(self):
        """Create test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant", slug='testorg3')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.user.branch = self.branch
        self.user.tenant = self.tenant
        self.user.save()
        self.user.branch = self.branch
        self.user.save()
        
        # Create accounts
        self.expense_account = Account.objects.create(
            code="5200",
            name="Electricity Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.ap_account = Account.objects.create(
            code="2100",
            name="Accounts Payable",
            account_type="LIABILITY",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense category
        self.expense_category = ExpenseCategory.objects.create(
            name="Utility Expenses",
            code="UTIL",
            expense_account=self.expense_account,
            branch=self.branch,
            owner=self.user
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name="PowerCo",
            supplier_code="SUP002",
            branch=self.branch,
            owner=self.user
        )
        
        # Create resource
        self.resource = Resource.objects.create(
            resource_code="UTIL-ELEC",
            resource_type="utilities",
            name="Electricity",
            unit_of_measure="kWh",
            default_unit_cost=Decimal('15.00'),
            default_tracking_method="postpaid",
            expense_category=self.expense_category,
            default_supplier=self.supplier,
            variance_threshold_percentage=Decimal('25.00'),
            branch=self.branch,
            owner=self.user
        )
    
    def test_create_postpaid_consumption(self):
        """Test creating a postpaid consumption"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('2500.00'),
            unit_cost=Decimal('15.00'),
            payment_flow="postpaid",
            supplier=self.supplier,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(consumption.payment_flow, "postpaid")
        self.assertEqual(consumption.supplier, self.supplier)
        self.assertEqual(consumption.total_cost, Decimal('37500.00'))
        self.assertIsNone(consumption.prepaid_voucher)
    
    def test_postpaid_inherits_supplier_from_resource(self):
        """Test that postpaid consumption inherits supplier from resource"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('2500.00'),
            payment_flow="postpaid",
            # Don't set supplier - should inherit from resource
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(consumption.supplier, self.resource.default_supplier)


class ResourceConsumptionIrregularityTest(TestCase):
    """Test irregularity detection in ResourceConsumption"""
    
    def setUp(self):
        """Create test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant", slug='testorg4')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.user.branch = self.branch
        self.user.tenant = self.tenant
        self.user.save()
        self.user.branch = self.branch
        self.user.save()
        
        # Create accounts
        self.expense_account = Account.objects.create(
            code="5100",
            name="Fuel Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.asset_account = Account.objects.create(
            code="1500",
            name="Prepaid Fuel",
            account_type="ASSET",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.accumulated_depreciation_account = Account.objects.create(
            code="1800",
            name="Accumulated Depreciation",
            account_type="ASSET",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.depreciation_account = Account.objects.create(
            code="5200",
            name="Depreciation Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense category
        self.expense_category = ExpenseCategory.objects.create(
            name="Fuel Expenses",
            code="FUEL",
            expense_account=self.expense_account,
            branch=self.branch,
            owner=self.user
        )
        
        # Create resource with irregularity detection enabled
        self.resource = Resource.objects.create(
            resource_code="FUEL-DIESEL",
            resource_type="fuel",
            name="Diesel Fuel",
            unit_of_measure="liters",
            default_unit_cost=Decimal('100.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            enable_irregularity_detection=True,
            variance_threshold_percentage=Decimal('20.00'),
            max_daily_usage=Decimal('100.00'),
            min_efficiency=Decimal('2.5'),
            max_efficiency=Decimal('5.0'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create prepaid expense and voucher
        self.prepaid_expense = PrepaidExpense.objects.create(
            reference_number="PE-001",
            category=self.expense_category,
            description="Test prepaid fuel expense",
            purchase_date=timezone.now().date(),
            total_amount=Decimal('100000.00'),
            remaining_amount=Decimal('100000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.prepaid_voucher = PrepaidVoucher.objects.create(
            voucher_number="PV-001",
            prepaid_expense=self.prepaid_expense,
            beneficiary_type='asset',
            beneficiary_name='Test Vehicle Pool',
            beneficiary_reference='VEH-001',
            allocated_units=Decimal('1000.00'),
            allocated_amount=Decimal('100000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create fixed asset
        asset_category = AssetCategory.objects.create(
            name="Vehicles",
            code="VEH",
            asset_account=self.asset_account,
            depreciation_account=self.depreciation_account,
            accumulated_depreciation_account=self.accumulated_depreciation_account,
            branch=self.branch,
            owner=self.user
        )
        
        self.asset = FixedAsset.objects.create(
            asset_number="VEH-001",
            name="Toyota Hilux",
            category=asset_category,
            purchase_date=date.today(),
            purchase_price=Decimal('500000.00'),
            depreciation_method='straight_line',
            useful_life_years=5,
            depreciation_start_date=date.today(),
            branch=self.branch,
            owner=self.user
        )
    
    def test_meter_reading_rollback_irregularity(self):
        """Test detection of meter reading rollback (Rule 6)"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('9950.00'),  # Rollback!
            reading_type="odometer",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(consumption.is_irregular)
    
    def test_excessive_daily_usage_irregularity(self):
        """Test detection of excessive daily usage (Rule 4)"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('150.00'),  # Exceeds max_daily_usage of 100
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(consumption.is_irregular)
    
    def test_duplicate_consumption_same_date_irregularity(self):
        """Test detection of duplicate consumption on same date (Rule 5)"""
        # Create first consumption
        consumption1 = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            branch=self.branch,
            owner=self.user
        )
        
        # Create second consumption on same date
        consumption2 = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),  # Same date!
            quantity_consumed=Decimal('40.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(consumption2.is_irregular)
    
    def test_low_efficiency_irregularity(self):
        """Test detection of low efficiency (Rule 3)"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10200.00'),  # 200 km / 100 L = 2.0 km/L (below min 2.5)
            reading_type="odometer",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(consumption.is_irregular)
    
    def test_high_efficiency_irregularity(self):
        """Test detection of unusually high efficiency (Rule 3)"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10300.00'),  # 300 km / 50 L = 6.0 km/L (above max 5.0)
            reading_type="odometer",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(consumption.is_irregular)
    
    def test_normal_consumption_not_irregular(self):
        """Test that normal consumption is not flagged"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10175.00'),  # 175 km / 50 L = 3.5 km/L (within range)
            reading_type="odometer",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertFalse(consumption.is_irregular)


class ResourceConsumptionWorkflowTest(TestCase):
    """Test approval workflow methods"""
    
    def setUp(self):
        """Create test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant", slug='testorg5')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.user.branch = self.branch
        self.user.tenant = self.tenant
        self.user.save()
        
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="testpass123"
        )
        self.manager.branch = self.branch
        self.manager.save()
        
        # Create accounts
        self.expense_account = Account.objects.create(
            code="5100",
            name="Fuel Expense",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        self.asset_account = Account.objects.create(
            code="1500",
            name="Prepaid Fuel",
            account_type="ASSET",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense category
        self.expense_category = ExpenseCategory.objects.create(
            name="Fuel Expenses",
            code="FUEL",
            expense_account=self.expense_account,
            branch=self.branch,
            owner=self.user
        )
        
        # Create resource
        self.resource = Resource.objects.create(
            resource_code="FUEL-DIESEL",
            resource_type="fuel",
            name="Diesel Fuel",
            unit_of_measure="liters",
            default_unit_cost=Decimal('100.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            variance_threshold_percentage=Decimal('20.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create prepaid voucher
        prepaid_expense = PrepaidExpense.objects.create(
            reference_number="PE-001",
            category=self.expense_category,
            description="Test prepaid fuel expense",
            purchase_date=timezone.now().date(),
            total_amount=Decimal('50000.00'),
            remaining_amount=Decimal('50000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.prepaid_voucher = PrepaidVoucher.objects.create(
            voucher_number="PV-001",
            prepaid_expense=prepaid_expense,
            beneficiary_type='asset',
            beneficiary_name='Test Vehicle Pool',
            beneficiary_reference='VEH-001',
            allocated_units=Decimal('500.00'),
            allocated_amount=Decimal('50000.00'),
            branch=self.branch,
            owner=self.user
        )
    
    def test_submit_normal_consumption_auto_approves(self):
        """Test that normal consumption auto-approves without workflow"""
        # Disable irregularity detection to ensure auto-approval
        self.resource.enable_irregularity_detection = False
        self.resource.save()
        
        # Set high approval threshold to ensure auto-approval
        self.expense_category.approval_threshold = Decimal('10000.00')  # Higher than test cost
        self.expense_category.save()
        
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="draft",
            # Add proper readings to avoid irregularity flags
            reading_type='odometer',
            previous_reading=Decimal('1000.00'),
            current_reading=Decimal('1050.00'),
            usage_since_last=Decimal('50.00'),
            branch=self.branch,
            owner=self.user,
            created_by=self.user  # Set created_by for auto-approval
        )
        
        workflow_triggered = consumption.submit_for_approval()
        
        self.assertFalse(workflow_triggered)
        self.assertEqual(consumption.status, "approved")
        self.assertIsNotNone(consumption.approved_by)
        self.assertIsNotNone(consumption.approved_at)
    
    def test_submit_irregular_consumption_triggers_workflow(self):
        """Test that irregular consumption triggers workflow"""
        # Set high approval threshold so only irregularity triggers workflow
        self.expense_category.approval_threshold = Decimal('10000.00')
        self.expense_category.save()
        
        # Disable irregularity detection to prevent status override
        self.resource.enable_irregularity_detection = False
        self.resource.save()
        
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="draft",
            is_irregular=True,  # Manually flag as irregular
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        workflow_triggered = consumption.submit_for_approval()
        
        self.assertTrue(workflow_triggered)
        self.assertEqual(consumption.status, "submitted")
        self.assertIsNone(consumption.approved_by)
    
    def test_approve_consumption(self):
        """Test approving a submitted consumption"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="submitted",
            branch=self.branch,
            owner=self.user
        )
        
        result = consumption.approve(self.manager, "Approved - verified with driver")
        
        self.assertTrue(result)
        self.assertEqual(consumption.status, "approved")
        self.assertEqual(consumption.approved_by, self.manager)
        self.assertIsNotNone(consumption.approved_at)
        self.assertEqual(len(consumption.approval_chain), 1)
        self.assertEqual(consumption.approval_chain[0]['action'], 'approved')
        self.assertEqual(consumption.approval_chain[0]['approver_id'], self.manager.id)
    
    def test_reject_consumption(self):
        """Test rejecting a submitted consumption"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="submitted",
            branch=self.branch,
            owner=self.user
        )
        
        result = consumption.reject(self.manager, "Cost exceeds budget allocation")
        
        self.assertTrue(result)
        self.assertEqual(consumption.status, "cancelled")
        self.assertIn("rejected", consumption.notes.lower())
        self.assertEqual(len(consumption.approval_chain), 1)
        self.assertEqual(consumption.approval_chain[0]['action'], 'rejected')
    
    def test_cannot_approve_draft_consumption(self):
        """Test that draft consumption cannot be approved"""
        # Disable irregularity detection to keep status as 'draft'
        self.resource.enable_irregularity_detection = False
        self.resource.save()
        
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="draft",
            branch=self.branch,
            owner=self.user
        )
        
        with self.assertRaises(ValidationError):
            consumption.approve(self.manager, "Test")
    
    def test_cannot_submit_posted_consumption(self):
        """Test that posted consumption cannot be submitted for approval"""
        # Disable irregularity detection to keep status as intended
        self.resource.enable_irregularity_detection = False
        self.resource.save()
        
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            branch=self.branch,
            owner=self.user
        )
        
        with self.assertRaises(ValidationError):
            consumption.submit_for_approval()
    
    def test_approval_chain_tracking(self):
        """Test that approval chain tracks multiple approvals"""
        consumption = ResourceConsumption.objects.create(
            resource=self.resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="submitted",
            branch=self.branch,
            owner=self.user
        )
        
        # First approval
        consumption.approve(self.manager, "First review - looks good")
        
        # Simulate second review (re-submit and approve again)
        consumption.status = "submitted"
        consumption.save()
        
        supervisor = User.objects.create_user(
            username="supervisor",
            email="supervisor@example.com",
            password="testpass123"
        )
        supervisor.branch = self.branch
        supervisor.save()
        
        consumption.approve(supervisor, "Final approval")
        
        self.assertEqual(len(consumption.approval_chain), 2)
        self.assertEqual(consumption.approval_chain[0]['approver_id'], self.manager.id)
        self.assertEqual(consumption.approval_chain[1]['approver_id'], supervisor.id)
