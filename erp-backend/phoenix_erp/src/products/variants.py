from django.db import models
from django.core.exceptions import ValidationError
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from products.models import Product

class ProductVariant(TimeStampedModel, SoftDeleteModel):
    """
    Variants of a product (e.g., different sizes, colors, terms)
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    attributes = models.JSONField(default=dict)
    price_adjustment = models.DecimalField(
        max_digits=18, 
        decimal_places=2,
        default=0,
        help_text="Amount to add/subtract from standard price"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ['product', 'code']

    def __str__(self):
        return f"{self.product.code} - {self.code}"

class PriceRule(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Dynamic pricing rules for products
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='price_rules')
    name = models.CharField(max_length=100)
    priority = models.IntegerField(default=0)
    conditions = models.JSONField(
        default=dict,
        help_text="Conditions that trigger this price rule"
    )
    adjustment_type = models.CharField(
        max_length=20,
        choices=[
            ('fixed', 'Fixed Amount'),
            ('percentage', 'Percentage'),
            ('formula', 'Custom Formula')
        ]
    )
    adjustment_value = models.DecimalField(max_digits=18, decimal_places=2)
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['priority']

    def __str__(self):
        return f"{self.product.code} - {self.name}"
