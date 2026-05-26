# expenses/tests/test_asset_consumption_tracking.py
"""
Tests for FixedAsset consumption tracking methods
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta, date

from expenses.models import (
    Resource, ResourceConsumption, ExpenseCategory,
    PrepaidExpense, PrepaidVoucher
)
from assets.models import FixedAsset, AssetCategory
from branches.models import Branch
from users.models import User
from accounts.models import Account
from transactions.models import Transaction as JournalEntry


class FixedAssetConsumptionTrackingTest(TestCase):
    """Test FixedAsset consumption tracking methods"""
    
    def setUp(self):
        """Create test data"""
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
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
        
        # Create resource
        self.resource = Resource.objects.create(
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
        
        # Create prepaid expense and voucher
        prepaid_expense = PrepaidExpense.objects.create(
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
            prepaid_expense=prepaid_expense,
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
    
    def test_current_meter_reading_property(self):
        """Test current_meter_reading property returns latest reading"""
        # Create consumptions with different readings
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=2),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10150.00'),
            is_posted=True,  # Must be posted for current_meter_reading property to consider it
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=1),
            quantity_consumed=Decimal('45.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10150.00'),
            current_reading=Decimal('10300.00'),
            is_posted=True,  # Must be posted for current_meter_reading property to consider it
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('40.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10300.00'),
            current_reading=Decimal('10450.00'),  # Latest
            is_posted=True,  # Must be posted for current_meter_reading property to consider it
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(self.asset.current_meter_reading, Decimal('10450.00'))
    
    def test_current_meter_reading_none_when_no_consumptions(self):
        """Test current_meter_reading returns None when no consumptions"""
        self.assertIsNone(self.asset.current_meter_reading)
    
    def test_get_total_consumption(self):
        """Test get_total_consumption method"""
        # Create consumptions
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            unit_cost=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10150.00'),
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=1),
            quantity_consumed=Decimal('45.00'),
            unit_cost=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('9850.00'),
            current_reading=Decimal('10000.00'),
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        totals = self.asset.get_total_consumption(self.resource.id)
        
        self.assertEqual(totals['total_quantity'], Decimal('95.00'))  # 50 + 45
        self.assertEqual(totals['total_cost'], Decimal('9500.00'))    # 5000 + 4500
        self.assertEqual(totals['total_usage'], Decimal('300.00'))    # 150 + 150
    
    def test_get_total_consumption_with_days_filter(self):
        """Test get_total_consumption with days parameter"""
        # Create consumption 5 days ago
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=5),
            quantity_consumed=Decimal('30.00'),
            unit_cost=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        # Create consumption today
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            unit_cost=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        # Get total for last 3 days (should only include today's)
        totals = self.asset.get_total_consumption(self.resource.id, days=3)
        
        self.assertEqual(totals['total_quantity'], Decimal('50.00'))
        self.assertEqual(totals['total_cost'], Decimal('5000.00'))
    
    def test_get_consumption_efficiency(self):
        """Test get_consumption_efficiency method"""
        # Create consumptions with varying efficiencies
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=3),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10000.00'),
            current_reading=Decimal('10150.00'),  # 3.0 km/L
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=2),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10150.00'),
            current_reading=Decimal('10350.00'),  # 4.0 km/L (best)
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=1),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10350.00'),
            current_reading=Decimal('10500.00'),  # 3.0 km/L
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            previous_reading=Decimal('10500.00'),
            current_reading=Decimal('10600.00'),  # 2.0 km/L (worst, current)
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        efficiency = self.asset.get_consumption_efficiency(self.resource.id)
        
        self.assertEqual(efficiency['current'], Decimal('2.0000'))    # Latest
        self.assertEqual(efficiency['average'], Decimal('3.0000'))    # (3+4+3+2)/4
        self.assertEqual(efficiency['best'], Decimal('4.0000'))
        self.assertEqual(efficiency['worst'], Decimal('2.0000'))
    
    def test_get_consumption_efficiency_no_data(self):
        """Test get_consumption_efficiency with no data"""
        efficiency = self.asset.get_consumption_efficiency(self.resource.id)
        
        self.assertIsNone(efficiency['current'])
        self.assertIsNone(efficiency['average'])
        self.assertIsNone(efficiency['best'])
        self.assertIsNone(efficiency['worst'])
    
    def test_has_irregular_consumptions_true(self):
        """Test has_irregular_consumptions returns True when irregularities exist"""
        # Create irregular consumption
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('150.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            is_irregular=True,
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(self.asset.has_irregular_consumptions(self.resource.id))
    
    def test_has_irregular_consumptions_false(self):
        """Test has_irregular_consumptions returns False when no irregularities"""
        # Disable irregularity detection to ensure no flags
        self.resource.enable_irregularity_detection = False
        self.resource.save()
        
        # Create normal consumption
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            is_irregular=False,
            # Add proper readings to avoid irregularity flags
            reading_type='odometer',
            previous_reading=Decimal('1000.00'),
            current_reading=Decimal('1050.00'),
            usage_since_last=Decimal('50.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.assertFalse(self.asset.has_irregular_consumptions(self.resource.id))
    
    def test_has_irregular_consumptions_with_days_filter(self):
        """Test has_irregular_consumptions with days filter"""
        # Create old irregular consumption (10 days ago)
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=10),
            quantity_consumed=Decimal('150.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            is_irregular=True,
            branch=self.branch,
            owner=self.user
        )
        
        # Should not find it within last 5 days
        self.assertFalse(self.asset.has_irregular_consumptions(self.resource.id, days=5))
        
        # Should find it within last 15 days
        self.assertTrue(self.asset.has_irregular_consumptions(self.resource.id, days=15))
    
    def test_consumption_count_method(self):
        """Test consumption count method"""
        # Create multiple consumptions
        for i in range(5):
            ResourceConsumption.objects.create(
                resource=self.resource,
                asset=self.asset,
                consumption_date=timezone.now().date() - timedelta(days=i),
                quantity_consumed=Decimal('50.00'),
                payment_flow="prepaid",
                prepaid_voucher=self.prepaid_voucher,
                status="posted",
                is_posted=True,
                branch=self.branch,
                owner=self.user
            )
        
        count = self.asset.consumption_count(days=30)
        self.assertEqual(count, 5)
    
    def test_consumption_count_with_days_filter(self):
        """Test consumption count with days filter"""
        # Create consumptions at different dates
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date() - timedelta(days=10),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        ResourceConsumption.objects.create(
            resource=self.resource,
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        # Count for last 5 days (should be 1)
        count = self.asset.consumption_count(days=5)
        self.assertEqual(count, 1)
        
        # Count for last 15 days (should be 2)
        count = self.asset.consumption_count(days=15)
        self.assertEqual(count, 2)
    
    def test_multiple_resources_for_same_asset(self):
        """Test that asset can track multiple resource types"""
        # Create another resource (petrol)
        petrol_resource = Resource.objects.create(
            resource_code="FUEL-PETROL",
            resource_type="fuel",
            name="Petrol",
            unit_of_measure="liters",
            default_unit_cost=Decimal('110.00'),
            default_tracking_method="prepaid",
            expense_category=self.expense_category,
            branch=self.branch,
            owner=self.user
        )
        
        # Create diesel consumption
        ResourceConsumption.objects.create(
            resource=self.resource,  # Diesel
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            unit_cost=Decimal('100.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        # Create petrol consumption
        ResourceConsumption.objects.create(
            resource=petrol_resource,  # Petrol
            asset=self.asset,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('30.00'),
            unit_cost=Decimal('110.00'),
            payment_flow="prepaid",
            prepaid_voucher=self.prepaid_voucher,
            status="posted",
            is_posted=True,
            branch=self.branch,
            owner=self.user
        )
        
        # Get totals for diesel only
        diesel_totals = self.asset.get_total_consumption(self.resource.id)
        self.assertEqual(diesel_totals['total_quantity'], Decimal('50.00'))
        self.assertEqual(diesel_totals['total_cost'], Decimal('5000.00'))
        
        # Get totals for petrol only
        petrol_totals = self.asset.get_total_consumption(petrol_resource.id)
        self.assertEqual(petrol_totals['total_quantity'], Decimal('30.00'))
        self.assertEqual(petrol_totals['total_cost'], Decimal('3300.00'))
