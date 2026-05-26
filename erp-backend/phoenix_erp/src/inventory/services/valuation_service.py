"""
Inventory Valuation Service

Handles inventory costing using different valuation methods:
- FIFO (First In, First Out)
- LIFO (Last In, First Out)
- Weighted Average

Manages cost layers and COGS calculations
"""
from decimal import Decimal
from typing import Tuple, List, Dict, Optional
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum, F, Q

from inventory.models import (
    InventoryItem,
    InventoryStock,
    InventoryCostLayer,
    CostLayerConsumption,
    StockMovement,
    Location
)


class InventoryValuationService:
    """
    Service for inventory valuation and cost layer management
    """
    
    def __init__(self, item: InventoryItem, location: Location):
        self.item = item
        self.location = location
        self.valuation_method = item.valuation_method
    
    # ================================================================
    # COST LAYER MANAGEMENT
    # ================================================================
    
    @transaction.atomic
    def create_cost_layer(
        self,
        quantity: Decimal,
        unit_cost: Decimal,
        transaction_type: str,
        transaction_reference: str,
        transaction_date,
        notes: str = ""
    ) -> InventoryCostLayer:
        """
        Create a new cost layer for a stock receipt
        
        Args:
            quantity: Quantity received
            unit_cost: Cost per unit
            transaction_type: Type of transaction (purchase, adjustment, etc.)
            transaction_reference: Reference number
            transaction_date: Date of transaction
            notes: Optional notes
        
        Returns:
            Created cost layer
        """
        layer = InventoryCostLayer.objects.create(
            item=self.item,
            location=self.location,
            transaction_type=transaction_type,
            transaction_reference=transaction_reference,
            transaction_date=transaction_date,
            original_quantity=quantity,
            quantity_remaining=quantity,
            unit_cost=unit_cost,
            notes=notes,
            branch=self.item.branch,
            owner=self.item.owner
        )
        
        return layer
    
    def get_active_layers(self) -> List[InventoryCostLayer]:
        """Get all non-depleted cost layers for this item/location"""
        return InventoryCostLayer.objects.filter(
            item=self.item,
            location=self.location,
            is_depleted=False,
            quantity_remaining__gt=0
        ).order_by('transaction_date', 'created_at')
    
    def get_total_layer_value(self) -> Decimal:
        """Calculate total value of all active cost layers"""
        result = self.get_active_layers().aggregate(
            total=Sum('remaining_value')
        )
        return result['total'] or Decimal('0.00')
    
    # ================================================================
    # VALUATION METHODS
    # ================================================================
    
    @transaction.atomic
    def calculate_cogs_fifo(
        self,
        quantity: Decimal,
        movement: StockMovement
    ) -> Tuple[Decimal, List[CostLayerConsumption]]:
        """
        Calculate COGS using FIFO (First In, First Out)
        Consumes oldest layers first
        
        Args:
            quantity: Quantity being sold/issued
            movement: Stock movement record
        
        Returns:
            Tuple of (total_cogs, list of consumption records)
        """
        layers = self.get_active_layers().order_by('transaction_date', 'created_at')
        
        return self._consume_layers(quantity, movement, layers)
    
    @transaction.atomic
    def calculate_cogs_lifo(
        self,
        quantity: Decimal,
        movement: StockMovement
    ) -> Tuple[Decimal, List[CostLayerConsumption]]:
        """
        Calculate COGS using LIFO (Last In, First Out)
        Consumes newest layers first
        
        Args:
            quantity: Quantity being sold/issued
            movement: Stock movement record
        
        Returns:
            Tuple of (total_cogs, list of consumption records)
        """
        layers = self.get_active_layers().order_by('-transaction_date', '-created_at')
        
        return self._consume_layers(quantity, movement, layers)
    
    def calculate_weighted_average_cost(self) -> Decimal:
        """
        Calculate weighted average cost per unit
        
        Formula: Total Value of All Layers / Total Quantity in All Layers
        
        Returns:
            Average cost per unit
        """
        layers = self.get_active_layers()
        
        totals = layers.aggregate(
            total_value=Sum('remaining_value'),
            total_quantity=Sum('quantity_remaining')
        )
        
        total_value = totals['total_value'] or Decimal('0.00')
        total_quantity = totals['total_quantity'] or Decimal('0.00')
        
        if total_quantity == 0:
            # No stock, return item's cost_price as default
            return self.item.cost_price
        
        return total_value / total_quantity
    
    @transaction.atomic
    def calculate_cogs_average(
        self,
        quantity: Decimal,
        movement: StockMovement
    ) -> Tuple[Decimal, List[CostLayerConsumption]]:
        """
        Calculate COGS using weighted average method
        Uses current average cost for all units
        
        Args:
            quantity: Quantity being sold/issued
            movement: Stock movement record
        
        Returns:
            Tuple of (total_cogs, list of consumption records)
        """
        avg_cost = self.calculate_weighted_average_cost()
        total_cogs = quantity * avg_cost
        
        # For average costing, we consume from layers proportionally
        layers = self.get_active_layers()
        total_layer_qty = sum(layer.quantity_remaining for layer in layers)
        
        consumptions = []
        remaining_to_consume = quantity
        
        for layer in layers:
            if remaining_to_consume <= 0:
                break
            
            # Calculate proportional consumption
            layer_proportion = layer.quantity_remaining / total_layer_qty if total_layer_qty > 0 else Decimal('0')
            qty_from_layer = min(
                quantity * layer_proportion,
                layer.quantity_remaining,
                remaining_to_consume
            )
            
            if qty_from_layer > 0:
                # Consume from layer
                layer.consume(qty_from_layer)
                
                # Create consumption record
                consumption = CostLayerConsumption.objects.create(
                    movement=movement,
                    cost_layer=layer,
                    quantity_consumed=qty_from_layer,
                    unit_cost=avg_cost,  # Use average cost
                    branch=self.item.branch,
                    owner=self.item.owner
                )
                consumptions.append(consumption)
                remaining_to_consume -= qty_from_layer
        
        return total_cogs, consumptions
    
    # ================================================================
    # MAIN COSTING METHOD
    # ================================================================
    
    def calculate_cogs(
        self,
        quantity: Decimal,
        movement: StockMovement
    ) -> Tuple[Decimal, List[CostLayerConsumption]]:
        """
        Calculate COGS based on item's valuation method
        
        Args:
            quantity: Quantity being sold/issued
            movement: Stock movement record
        
        Returns:
            Tuple of (total_cogs, list of consumption records)
        """
        if self.valuation_method == 'fifo':
            return self.calculate_cogs_fifo(quantity, movement)
        elif self.valuation_method == 'lifo':
            return self.calculate_cogs_lifo(quantity, movement)
        elif self.valuation_method == 'average':
            return self.calculate_cogs_average(quantity, movement)
        else:
            raise ValueError(f"Unknown valuation method: {self.valuation_method}")
    
    # ================================================================
    # STOCK VALUATION
    # ================================================================
    
    @transaction.atomic
    def recalculate_stock_valuation(self) -> Dict[str, Decimal]:
        """
        Recalculate stock valuation for this item/location
        Updates InventoryStock record with current values
        
        Returns:
            Dict with quantity, average_cost, total_value
        """
        stock, created = InventoryStock.objects.get_or_create(
            item=self.item,
            location=self.location,
            defaults={
                'branch': self.item.branch,
                'owner': self.item.owner
            }
        )
        
        if self.valuation_method == 'average':
            # Use weighted average
            stock.average_cost = self.calculate_weighted_average_cost()
        else:
            # For FIFO/LIFO, calculate average from active layers
            layers = self.get_active_layers()
            totals = layers.aggregate(
                total_value=Sum('remaining_value'),
                total_quantity=Sum('quantity_remaining')
            )
            
            total_value = totals['total_value'] or Decimal('0.00')
            total_quantity = totals['total_quantity'] or Decimal('0.00')
            
            if total_quantity > 0:
                stock.average_cost = total_value / total_quantity
            else:
                stock.average_cost = self.item.cost_price
        
        # Update total value
        stock.update_valuation()
        
        return {
            'quantity_on_hand': stock.quantity_on_hand,
            'average_cost': stock.average_cost,
            'total_value': stock.total_value
        }
    
    # ================================================================
    # HELPER METHODS
    # ================================================================
    
    def _consume_layers(
        self,
        quantity: Decimal,
        movement: StockMovement,
        layers
    ) -> Tuple[Decimal, List[CostLayerConsumption]]:
        """
        Helper method to consume layers in order (FIFO or LIFO)
        
        Args:
            quantity: Quantity to consume
            movement: Stock movement record
            layers: Queryset of layers in desired order
        
        Returns:
            Tuple of (total_cogs, list of consumption records)
        """
        total_cogs = Decimal('0.00')
        consumptions = []
        remaining_to_consume = quantity
        
        for layer in layers:
            if remaining_to_consume <= 0:
                break
            
            # Consume from this layer
            qty_consumed = layer.consume(remaining_to_consume)
            
            if qty_consumed > 0:
                cost = qty_consumed * layer.unit_cost
                total_cogs += cost
                
                # Create consumption record
                consumption = CostLayerConsumption.objects.create(
                    movement=movement,
                    cost_layer=layer,
                    quantity_consumed=qty_consumed,
                    unit_cost=layer.unit_cost,
                    branch=self.item.branch,
                    owner=self.item.owner
                )
                consumptions.append(consumption)
                
                remaining_to_consume -= qty_consumed
        
        if remaining_to_consume > 0:
            # Not enough stock in cost layers
            # This shouldn't happen if stock tracking is accurate
            # Use item's cost_price for remaining quantity
            cost = remaining_to_consume * self.item.cost_price
            total_cogs += cost
        
        return total_cogs, consumptions


# ================================================================
# BATCH OPERATIONS
# ================================================================

class BatchValuationService:
    """Service for batch valuation operations across multiple items"""
    
    @staticmethod
    def recalculate_all_items(branch=None, category=None) -> Dict[str, int]:
        """
        Recalculate valuation for all items
        
        Args:
            branch: Optional branch filter
            category: Optional category filter
        
        Returns:
            Dict with count of items processed
        """
        items = InventoryItem.objects.filter(is_active=True)
        
        if branch:
            items = items.filter(branch=branch)
        if category:
            items = items.filter(category=category)
        
        processed = 0
        errors = 0
        
        for item in items:
            try:
                locations = Location.objects.filter(
                    branch=item.branch,
                    is_deleted=False
                )
                
                for location in locations:
                    service = InventoryValuationService(item, location)
                    service.recalculate_stock_valuation()
                
                processed += 1
            except Exception as e:
                errors += 1
                print(f"Error processing item {item.sku}: {str(e)}")
        
        return {
            'total_items': items.count(),
            'processed': processed,
            'errors': errors
        }
    
    @staticmethod
    def get_valuation_report(branch=None, category=None, location=None) -> List[Dict]:
        """
        Generate inventory valuation report
        
        Args:
            branch: Optional branch filter
            category: Optional category filter
            location: Optional location filter — when supplied, each item row
                      reflects stock at that specific location only, and items
                      with zero stock there are excluded.
        
        Returns:
            List of dicts with item valuation details
        """
        items = InventoryItem.objects.filter(is_active=True)
        
        if branch:
            items = items.filter(branch=branch)
        if category:
            items = items.filter(category=category)
        
        report = []
        
        for item in items:
            stock_records = InventoryStock.objects.filter(item=item)
            if location:
                stock_records = stock_records.filter(location=location)
            
            total_quantity = sum(s.quantity_on_hand for s in stock_records)
            total_value = sum(s.total_value for s in stock_records)
            
            # Skip items with no stock at the requested location
            if location and total_quantity == 0:
                continue
            
            report.append({
                'item_id': item.id,
                'sku': item.sku,
                'name': item.name,
                'valuation_method': item.valuation_method,
                'quantity_on_hand': total_quantity,
                'average_cost': total_value / total_quantity if total_quantity > 0 else Decimal('0'),
                'total_value': total_value,
                'category': item.category.name if item.category else '',
                'location_name': location.name if location else None,
                'locations': stock_records.count()
            })
        
        return report
