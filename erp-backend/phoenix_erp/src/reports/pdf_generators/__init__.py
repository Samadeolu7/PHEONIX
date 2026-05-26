"""
PDF Generation System for Phoenix ERP
Supports Purchase Orders, GRNs, Invoices, Payslips, and custom reports
"""
from .base import BasePDFGenerator
from .purchase_order import PurchaseOrderPDFGenerator
from .goods_received import GoodsReceivedNotePDFGenerator
from .invoice import InvoicePDFGenerator
from .payslip import PayslipPDFGenerator
from .deposit_slip import DepositSlipPDFGenerator

__all__ = [
    'BasePDFGenerator',
    'PurchaseOrderPDFGenerator',
    'GoodsReceivedNotePDFGenerator',
    'InvoicePDFGenerator',
    'PayslipPDFGenerator',
    'DepositSlipPDFGenerator',
]
