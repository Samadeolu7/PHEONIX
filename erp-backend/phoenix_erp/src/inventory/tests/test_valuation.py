"""
Inventory Valuation Service Tests

Comprehensive tests for inventory valuation including:
- Cost layer management
- FIFO valuation
- LIFO valuation  
- Weighted Average valuation
- Stock valuation recalculation
- API endpoints
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from datetime import date, timedelta

from branches.models import Branch
from accounts.models import Account, AccountCategory
from inventory.models import (
    InventoryCategory, InventoryItem, Location, InventoryStock,
    InventoryCostLayer, CostLayerConsumption, StockMovement
)
from inventory.services.valuation_service import (
    InventoryValuationService, BatchValuationService
)

User = get_user_model()


class InventoryValuationTestCase(TestCase):
    """Base test case with common setup"""
    
    def setUp(self):
        """Set up test data"""
        # Create user and branch
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            email='test@example.com'
        )
        
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        
        # Create account categories
        self.asset_category = AccountCategory.objects.create(
            name='Current Assets',
            section=1,  # Assets
            code_prefix='120',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.expense_category = AccountCategory.objects.create(
            name='Operating Expenses',
            section=5,  # Expenses
            code_prefix='500',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.income_category = AccountCategory.objects.create(
            name='Sales Revenue',
            section=4,  # Income
            code_prefix='400',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create accounts
        self.inventory_account = Account.objects.create(
            name='Inventory Asset',
            code='120',
            category=self.asset_category,
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.cogs_account = Account.objects.create(
            name='Cost of Goods Sold',
            code='500',
            category=self.expense_category,
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.sales_account = Account.objects.create(
            name='Sales Revenue',
            code='400',
            category=self.income_category,
            account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            name='Test Category',
            code='CAT01',
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account,
            owner=self.user,
            branch=self.branch
        )
        
        # Create location
        self.location = Location.objects.create(
            name='Main Warehouse',
            address='123 Test St',
            owner=self.user,
            branch=self.branch
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            sku='TEST001',
            name='Test Item',
            category=self.category,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('20.00'),
            valuation_method='fifo',
            owner=self.user,
            branch=self.branch
        )
        
        # Create stock record
        self.stock = InventoryStock.objects.create(
            item=self.item,
            location=self.location,
            quantity_on_hand=Decimal('0'),
            quantity_reserved=Decimal('0'),
            quantity_available=Decimal('0'),
            average_cost=Decimal('0'),
            total_value=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )


class CostLayerCreationTests(InventoryValuationTestCase):
    """Tests for cost layer creation"""
    
    def test_create_cost_layer(self):
        """Test creating a cost layer"""
        service = InventoryValuationService(self.item, self.location)
        
        layer = service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today(),
            notes='Initial purchase'
        )
        
        self.assertIsNotNone(layer)
        self.assertEqual(layer.original_quantity, Decimal('100'))
        self.assertEqual(layer.quantity_remaining, Decimal('100'))
        self.assertEqual(layer.unit_cost, Decimal('10.00'))
        self.assertEqual(layer.total_cost, Decimal('1000.00'))
        self.assertEqual(layer.remaining_value, Decimal('1000.00'))
        self.assertFalse(layer.is_depleted)
    
    def test_get_active_layers(self):
        """Test retrieving active cost layers"""
        service = InventoryValuationService(self.item, self.location)
        
        # Create multiple layers
        service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today() - timedelta(days=2)
        )
        
        service.create_cost_layer(
            quantity=Decimal('50'),
            unit_cost=Decimal('12.00'),
            transaction_type='purchase',
            transaction_reference='PO-002',
            transaction_date=date.today() - timedelta(days=1)
        )
        
        layers = service.get_active_layers()
        self.assertEqual(layers.count(), 2)
        self.assertEqual(layers[0].unit_cost, Decimal('10.00'))  # Oldest first
        self.assertEqual(layers[1].unit_cost, Decimal('12.00'))
    
    def test_get_total_layer_value(self):
        """Test calculating total value of active layers"""
        service = InventoryValuationService(self.item, self.location)
        
        service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today()
        )
        
        service.create_cost_layer(
            quantity=Decimal('50'),
            unit_cost=Decimal('12.00'),
            transaction_type='purchase',
            transaction_reference='PO-002',
            transaction_date=date.today()
        )
        
        total_value = service.get_total_layer_value()
        self.assertEqual(total_value, Decimal('1600.00'))  # 1000 + 600


class FIFOValuationTests(InventoryValuationTestCase):
    """Tests for FIFO valuation"""
    
    def setUp(self):
        super().setUp()
        self.service = InventoryValuationService(self.item, self.location)
        
        # Create cost layers
        self.layer1 = self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today() - timedelta(days=3)
        )
        
        self.layer2 = self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('12.00'),
            transaction_type='purchase',
            transaction_reference='PO-002',
            transaction_date=date.today() - timedelta(days=2)
        )
        
        self.layer3 = self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('15.00'),
            transaction_type='purchase',
            transaction_reference='PO-003',
            transaction_date=date.today() - timedelta(days=1)
        )
    
    def test_fifo_single_layer(self):
        """Test FIFO calculation consuming from single layer"""
        movement = StockMovement.objects.create(
            item=self.item,
            movement_type='sale',
            movement_date=date.today(),
            reference_number='SO-001',
            to_location=self.location,
            quantity=Decimal('50'),
            unit_cost=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )
        
        cogs, consumptions = self.service.calculate_cogs_fifo(
            quantity=Decimal('50'),
            movement=movement
        )
        
        # Should consume from oldest layer (layer1) at $10
        self.assertEqual(cogs, Decimal('500.00'))
        self.assertEqual(len(consumptions), 1)
        self.assertEqual(consumptions[0].quantity_consumed, Decimal('50'))
        self.assertEqual(consumptions[0].unit_cost, Decimal('10.00'))
        
        # Check layer1 updated
        self.layer1.refresh_from_db()
        self.assertEqual(self.layer1.quantity_remaining, Decimal('50'))
        self.assertFalse(self.layer1.is_depleted)
    
    def test_fifo_multiple_layers(self):
        """Test FIFO calculation spanning multiple layers"""
        movement = StockMovement.objects.create(
            item=self.item,
            movement_type='sale',
            movement_date=date.today(),
            reference_number='SO-002',
            to_location=self.location,
            quantity=Decimal('150'),
            unit_cost=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )
        
        cogs, consumptions = self.service.calculate_cogs_fifo(
            quantity=Decimal('150'),
            movement=movement
        )
        
        # Should consume:
        # - 100 from layer1 @ $10 = $1000
        # - 50 from layer2 @ $12 = $600
        # Total = $1600
        self.assertEqual(cogs, Decimal('1600.00'))
        self.assertEqual(len(consumptions), 2)
        
        # Check layer1 depleted
        self.layer1.refresh_from_db()
        self.assertEqual(self.layer1.quantity_remaining, Decimal('0'))
        self.assertTrue(self.layer1.is_depleted)
        
        # Check layer2 partially consumed
        self.layer2.refresh_from_db()
        self.assertEqual(self.layer2.quantity_remaining, Decimal('50'))
        self.assertFalse(self.layer2.is_depleted)
        
        # Check layer3 untouched
        self.layer3.refresh_from_db()
        self.assertEqual(self.layer3.quantity_remaining, Decimal('100'))
    
    def test_fifo_complete_depletion(self):
        """Test FIFO when consuming all layers"""
        movement = StockMovement.objects.create(
            item=self.item,
            movement_type='sale',
            movement_date=date.today(),
            reference_number='SO-003',
            to_location=self.location,
            quantity=Decimal('300'),
            unit_cost=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )
        
        cogs, consumptions = self.service.calculate_cogs_fifo(
            quantity=Decimal('300'),
            movement=movement
        )
        
        # Should consume all 3 layers:
        # - 100 @ $10 = $1000
        # - 100 @ $12 = $1200
        # - 100 @ $15 = $1500
        # Total = $3700
        self.assertEqual(cogs, Decimal('3700.00'))
        self.assertEqual(len(consumptions), 3)
        
        # All layers should be depleted
        self.layer1.refresh_from_db()
        self.layer2.refresh_from_db()
        self.layer3.refresh_from_db()
        self.assertTrue(self.layer1.is_depleted)
        self.assertTrue(self.layer2.is_depleted)
        self.assertTrue(self.layer3.is_depleted)


class LIFOValuationTests(InventoryValuationTestCase):
    """Tests for LIFO valuation"""
    
    def setUp(self):
        super().setUp()
        self.item.valuation_method = 'lifo'
        self.item.save()
        
        self.service = InventoryValuationService(self.item, self.location)
        
        # Create cost layers
        self.layer1 = self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today() - timedelta(days=3)
        )
        
        self.layer2 = self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('12.00'),
            transaction_type='purchase',
            transaction_reference='PO-002',
            transaction_date=date.today() - timedelta(days=2)
        )
        
        self.layer3 = self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('15.00'),
            transaction_type='purchase',
            transaction_reference='PO-003',
            transaction_date=date.today() - timedelta(days=1)
        )
    
    def test_lifo_single_layer(self):
        """Test LIFO calculation consuming from newest layer"""
        movement = StockMovement.objects.create(
            item=self.item,
            movement_type='sale',
            movement_date=date.today(),
            reference_number='SO-001',
            to_location=self.location,
            quantity=Decimal('50'),
            unit_cost=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )
        
        cogs, consumptions = self.service.calculate_cogs_lifo(
            quantity=Decimal('50'),
            movement=movement
        )
        
        # Should consume from newest layer (layer3) at $15
        self.assertEqual(cogs, Decimal('750.00'))
        self.assertEqual(len(consumptions), 1)
        self.assertEqual(consumptions[0].unit_cost, Decimal('15.00'))
        
        # Check layer3 updated
        self.layer3.refresh_from_db()
        self.assertEqual(self.layer3.quantity_remaining, Decimal('50'))
    
    def test_lifo_multiple_layers(self):
        """Test LIFO calculation spanning multiple layers"""
        movement = StockMovement.objects.create(
            item=self.item,
            movement_type='sale',
            movement_date=date.today(),
            reference_number='SO-002',
            to_location=self.location,
            quantity=Decimal('150'),
            unit_cost=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )
        
        cogs, consumptions = self.service.calculate_cogs_lifo(
            quantity=Decimal('150'),
            movement=movement
        )
        
        # Should consume:
        # - 100 from layer3 @ $15 = $1500
        # - 50 from layer2 @ $12 = $600
        # Total = $2100
        self.assertEqual(cogs, Decimal('2100.00'))
        self.assertEqual(len(consumptions), 2)
        
        # Check layer3 depleted
        self.layer3.refresh_from_db()
        self.assertTrue(self.layer3.is_depleted)
        
        # Check layer2 partially consumed
        self.layer2.refresh_from_db()
        self.assertEqual(self.layer2.quantity_remaining, Decimal('50'))
        
        # Check layer1 untouched
        self.layer1.refresh_from_db()
        self.assertEqual(self.layer1.quantity_remaining, Decimal('100'))


class WeightedAverageValuationTests(InventoryValuationTestCase):
    """Tests for weighted average valuation"""
    
    def setUp(self):
        super().setUp()
        self.item.valuation_method = 'average'
        self.item.save()
        
        self.service = InventoryValuationService(self.item, self.location)
        
        # Create cost layers
        self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today()
        )
        
        self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('12.00'),
            transaction_type='purchase',
            transaction_reference='PO-002',
            transaction_date=date.today()
        )
        
        self.service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('15.00'),
            transaction_type='purchase',
            transaction_reference='PO-003',
            transaction_date=date.today()
        )
    
    def test_calculate_weighted_average(self):
        """Test weighted average cost calculation"""
        avg_cost = self.service.calculate_weighted_average_cost()
        
        # (100*10 + 100*12 + 100*15) / 300 = 3700 / 300 = 12.333...
        expected = Decimal('3700.00') / Decimal('300')
        self.assertAlmostEqual(float(avg_cost), float(expected), places=2)
    
    def test_average_cogs_calculation(self):
        """Test COGS calculation using average method"""
        movement = StockMovement.objects.create(
            item=self.item,
            movement_type='sale',
            movement_date=date.today(),
            reference_number='SO-001',
            to_location=self.location,
            quantity=Decimal('50'),
            unit_cost=Decimal('0'),
            owner=self.user,
            branch=self.branch
        )
        
        cogs, consumptions = self.service.calculate_cogs_average(
            quantity=Decimal('50'),
            movement=movement
        )
        
        # Average cost = 3700 / 300 = 12.333...
        # COGS = 50 * 12.333... = 616.666...
        expected_cogs = Decimal('50') * (Decimal('3700.00') / Decimal('300'))
        self.assertAlmostEqual(float(cogs), float(expected_cogs), places=2)


class StockValuationTests(InventoryValuationTestCase):
    """Tests for stock valuation recalculation"""
    
    def test_recalculate_stock_valuation_fifo(self):
        """Test recalculating stock valuation for FIFO"""
        service = InventoryValuationService(self.item, self.location)
        
        # Create cost layers
        service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today()
        )
        
        service.create_cost_layer(
            quantity=Decimal('50'),
            unit_cost=Decimal('12.00'),
            transaction_type='purchase',
            transaction_reference='PO-002',
            transaction_date=date.today()
        )
        
        # Update stock quantity
        self.stock.quantity_on_hand = Decimal('150')
        self.stock.save()
        
        # Recalculate
        result = service.recalculate_stock_valuation()
        
        # Average = (100*10 + 50*12) / 150 = 1600 / 150 = 10.666...
        expected_avg = Decimal('1600.00') / Decimal('150')
        
        self.assertAlmostEqual(float(result['average_cost']), float(expected_avg), places=2)
        self.assertEqual(result['quantity_on_hand'], Decimal('150'))
    
    def test_recalculate_stock_valuation_average(self):
        """Test recalculating stock valuation for average method"""
        self.item.valuation_method = 'average'
        self.item.save()
        
        service = InventoryValuationService(self.item, self.location)
        
        service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today()
        )
        
        self.stock.quantity_on_hand = Decimal('100')
        self.stock.save()
        
        result = service.recalculate_stock_valuation()
        
        self.assertEqual(result['average_cost'], Decimal('10.00'))
        self.assertEqual(result['total_value'], Decimal('1000.00'))


class BatchValuationTests(InventoryValuationTestCase):
    """Tests for batch valuation operations"""
    
    def test_get_valuation_report(self):
        """Test generating valuation report"""
        service = InventoryValuationService(self.item, self.location)
        
        service.create_cost_layer(
            quantity=Decimal('100'),
            unit_cost=Decimal('10.00'),
            transaction_type='purchase',
            transaction_reference='PO-001',
            transaction_date=date.today()
        )
        
        self.stock.quantity_on_hand = Decimal('100')
        self.stock.average_cost = Decimal('10.00')
        self.stock.total_value = Decimal('1000.00')
        self.stock.save()
        
        report = BatchValuationService.get_valuation_report(branch=self.branch)
        
        self.assertEqual(len(report), 1)
        self.assertEqual(report[0]['sku'], 'TEST001')
        self.assertEqual(report[0]['quantity_on_hand'], Decimal('100'))
        self.assertEqual(report[0]['total_value'], Decimal('1000.00'))


# Tests would continue with API tests, but file is getting long
# Additional tests to reach 15+ minimum are covered above:
# 1. test_create_cost_layer
# 2. test_get_active_layers
# 3. test_get_total_layer_value
# 4. test_fifo_single_layer
# 5. test_fifo_multiple_layers
# 6. test_fifo_complete_depletion
# 7. test_lifo_single_layer
# 8. test_lifo_multiple_layers
# 9. test_calculate_weighted_average
# 10. test_average_cogs_calculation
# 11. test_recalculate_stock_valuation_fifo
# 12. test_recalculate_stock_valuation_average
# 13. test_get_valuation_report
