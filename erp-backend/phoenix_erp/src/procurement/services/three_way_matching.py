# procurement/services/three_way_matching.py
"""
Three-Way Matching Service

Matches Purchase Order → Goods Received Note → Supplier Invoice
to detect discrepancies before payment approval.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Tuple, Optional
from django.db import transaction
from django.utils import timezone

from procurement.models import PurchaseOrder, GoodsReceivedNote, PurchaseOrderItem, GoodsReceivedNoteItem
from procurement.config_models import ProcurementConfig


class MatchingResult:
    """Result of a matching check"""
    
    def __init__(self, rule_name: str, match_type: str):
        self.rule_name = rule_name
        self.match_type = match_type
        self.is_match = True
        self.expected_value = None
        self.actual_value = None
        self.variance_amount = None
        self.variance_percentage = None
        self.action_required = None
        self.approver_role = None
        self.message = ""
    
    def to_dict(self):
        # Try to convert to Decimal, but keep as-is if it's a string (e.g., supplier name)
        def safe_decimal(value):
            if value is None:
                return None
            try:
                return Decimal(str(value))
            except (ValueError, TypeError, Exception):
                return value
        
        # Map is_match to status for backward compatibility
        status = 'match' if self.is_match else 'mismatch'
        if not self.is_match and self.match_type == 'items' and 'partial' in self.message.lower():
            status = 'partial_match'
        
        # Map action_required to severity for backward compatibility
        severity_map = {
            'block': 'critical',
            'require_approval': 'major',
            'warn': 'minor',
            None: None
        }
        severity = severity_map.get(self.action_required)
        
        return {
            'rule_name': self.rule_name,
            'match_type': self.match_type,
            'type': self.match_type,  # For backward compatibility
            'is_match': self.is_match,
            'status': status,  # For backward compatibility
            'severity': severity,  # For backward compatibility
            'expected_value': safe_decimal(self.expected_value),
            'actual_value': safe_decimal(self.actual_value),
            'variance_amount': self.variance_amount if self.variance_amount else None,
            'variance_percentage': self.variance_percentage if self.variance_percentage else None,
            'action_required': self.action_required,
            'approver_role': self.approver_role,
            'message': self.message,
            'description': self.message  # For backward compatibility
        }


class ThreeWayMatchingService:
    """
    Service for performing 3-way matching between PO, GRN, and Invoice.
    """
    
    def __init__(self, workflow_config: Optional[ProcurementConfig] = None):
        """
        Initialize matching service.
        
        Args:
            workflow_config: The procurement configuration to use for matching rules.
                            If None, will use default configuration.
        """
        self.workflow_config = workflow_config
        self.matching_results: List[MatchingResult] = []
    
    def match_po_grn(self, po: PurchaseOrder, grn: GoodsReceivedNote) -> Dict:
        """
        Match Purchase Order against Goods Received Note.
        
        Returns:
            Dict containing matching results and recommendations
        """
        self.matching_results = []
        
        # Get matching config
        if not self.workflow_config:
            self.workflow_config = ProcurementConfig.get_for_branch(po.branch)
        
        if not self.workflow_config or not self.workflow_config.enable_three_way_matching:
            return {
                'enabled': False,
                'message': '3-way matching is not enabled for this purchase'
            }
        
        # Perform matching checks
        self._match_supplier(po, grn)
        self._match_items(po, grn)
        self._match_quantities(po, grn)
        self._match_prices(po, grn)  # Check unit price variances
        self._match_totals(po, grn)
        
        # Calculate overall result
        critical_failures = [r for r in self.matching_results if not r.is_match and r.action_required == 'block']
        warnings = [r for r in self.matching_results if r.action_required == 'warn']  # Changed: warnings can have is_match=True
        approval_required = [r for r in self.matching_results if r.action_required == 'require_approval']  # Now includes is_match=True cases
        
        # Critical failures with approver roles can be approved, so include them in requires_approval
        critical_with_approver = [r for r in critical_failures if r.approver_role]
        all_requiring_approval = approval_required + critical_with_approver
        
        # Build matching_results as a dict by match type
        matching_results_dict = {}
        quantity_results = []
        price_results = []
        
        for r in self.matching_results:
            if r.match_type == 'supplier':
                matching_results_dict['supplier_match'] = r.to_dict()
            elif r.match_type == 'items':
                matching_results_dict['items_match'] = r.to_dict()
            elif r.match_type == 'quantity':
                quantity_results.append(r)
            elif r.match_type == 'price':
                price_results.append(r)
            elif r.match_type == 'total':
                matching_results_dict['totals_match'] = r.to_dict()
        
        # Create aggregate quantity result for backward compatibility
        if quantity_results:
            all_match = all(r.is_match for r in quantity_results)
            any_major = any(r.action_required == 'require_approval' for r in quantity_results)
            any_critical = any(r.action_required == 'block' for r in quantity_results)
            
            agg_result = MatchingResult('Quantity Match - Aggregate', 'quantity')
            agg_result.is_match = all_match
            
            if any_critical:
                agg_result.action_required = 'block'
            elif any_major:
                agg_result.action_required = 'require_approval'
            elif not all_match:
                agg_result.action_required = 'warn'
            
            if all_match:
                agg_result.message = "All quantities match"
            else:
                agg_result.message = f"{len([r for r in quantity_results if not r.is_match])} quantity discrepancy(ies) found"
            
            matching_results_dict['quantities_match'] = agg_result.to_dict()
            matching_results_dict['quantity_details'] = [r.to_dict() for r in quantity_results]
        
        # Build discrepancies list - include items that don't match OR require attention (warnings)
        discrepancies = [r.to_dict() for r in self.matching_results if not r.is_match or r.action_required in ['warn', 'require_approval', 'block']]
        
        # Determine overall status
        # Critical failures → failed status
        # Approval required but within tolerance (is_match=True) → warning status with approval required
        # Approval required and not matched (is_match=False) → failed status
        # Only warnings → warning status
        overall_status = 'passed'
        if critical_failures:
            overall_status = 'failed'
        elif all_requiring_approval:
            # Check if any approval_required items are actual mismatches (is_match=False)
            has_actual_mismatches = any(not r.is_match for r in all_requiring_approval)
            if has_actual_mismatches:
                overall_status = 'failed'
            else:
                # Within tolerance but requires approval (auto_approve disabled)
                overall_status = 'warning'
        elif warnings:
            overall_status = 'warning'
        
        return {
            'enabled': True,
            'overall_status': overall_status,
            'can_proceed': len(critical_failures) == 0 and len(all_requiring_approval) == 0,
            'requires_approval': len(all_requiring_approval) > 0,
            'approver_roles': list(set([r.approver_role for r in all_requiring_approval if r.approver_role])),
            'critical_failures': len(critical_failures),
            'warnings': len(warnings),
            'matching_results': matching_results_dict,
            'discrepancies': discrepancies,
            'summary': self._generate_summary()
        }
    
    def match_po_grn_invoice(
        self, 
        po: PurchaseOrder, 
        grn: GoodsReceivedNote,
        invoice_amount: Decimal,
        invoice_items: List[Dict] = None
    ) -> Dict:
        """
        Full 3-way match: PO → GRN → Invoice
        
        Args:
            po: Purchase Order
            grn: Goods Received Note
            invoice_amount: Total invoice amount from supplier
            invoice_items: List of invoice line items (optional for detailed matching)
        
        Returns:
            Dict containing complete matching results
        """
        # First match PO and GRN
        po_grn_result = self.match_po_grn(po, grn)
        
        if not po_grn_result['enabled']:
            return po_grn_result
        
        # Then match invoice amount
        self._match_invoice_amount(po, grn, invoice_amount)
        
        # If invoice items provided, do detailed matching
        if invoice_items:
            self._match_invoice_items(po, grn, invoice_items)
        
        # Recalculate overall result
        critical_failures = [r for r in self.matching_results if not r.is_match and r.action_required == 'block']
        warnings = [r for r in self.matching_results if r.action_required == 'warn']  # Changed: warnings can have is_match=True
        approval_required = [r for r in self.matching_results if r.action_required == 'require_approval']  # Now includes is_match=True cases
        
        # Critical failures with approver roles can be approved, so include them in requires_approval
        critical_with_approver = [r for r in critical_failures if r.approver_role]
        all_requiring_approval = approval_required + critical_with_approver
        
        # Build matching_results as a dict by match type (including invoice)
        matching_results_dict = {}
        quantity_results = []
        price_results = []
        
        for r in self.matching_results:
            if r.match_type == 'supplier':
                matching_results_dict['supplier_match'] = r.to_dict()
            elif r.match_type == 'items':
                matching_results_dict['items_match'] = r.to_dict()
            elif r.match_type == 'quantity':
                quantity_results.append(r)
            elif r.match_type == 'price':
                price_results.append(r)
            elif r.match_type == 'total':
                matching_results_dict['totals_match'] = r.to_dict()
            elif r.match_type == 'invoice_total':
                matching_results_dict['invoice_match'] = r.to_dict()
        
        # Create aggregate quantity result for backward compatibility
        if quantity_results:
            all_match = all(r.is_match for r in quantity_results)
            any_major = any(r.action_required == 'require_approval' for r in quantity_results)
            any_critical = any(r.action_required == 'block' for r in quantity_results)
            any_warn = any(r.action_required == 'warn' for r in quantity_results)
            
            agg_result = MatchingResult('Quantity Match - Aggregate', 'quantity')
            agg_result.is_match = all_match
            
            if any_critical:
                agg_result.action_required = 'block'
            elif any_major:
                agg_result.action_required = 'require_approval'
            elif any_warn:
                agg_result.action_required = 'warn'
            elif not all_match:
                agg_result.action_required = 'warn'
            
            if all_match:
                if any_warn:
                    agg_result.message = "All quantities match (with minor variances)"
                else:
                    agg_result.message = "All quantities match"
            else:
                agg_result.message = f"{len([r for r in quantity_results if not r.is_match])} quantity discrepancy(ies) found"
            
            matching_results_dict['quantities_match'] = agg_result.to_dict()
            matching_results_dict['quantity_details'] = [r.to_dict() for r in quantity_results]
        
        # Create aggregate price result
        if price_results:
            all_match = all(r.is_match for r in price_results)
            any_major = any(r.action_required == 'require_approval' for r in price_results)
            any_critical = any(r.action_required == 'block' for r in price_results)
            any_warn = any(r.action_required == 'warn' for r in price_results)
            
            agg_result = MatchingResult('Price Match - Aggregate', 'price')
            agg_result.is_match = all_match
            
            if any_critical:
                agg_result.action_required = 'block'
            elif any_major:
                agg_result.action_required = 'require_approval'
            elif any_warn:
                agg_result.action_required = 'warn'
            elif not all_match:
                agg_result.action_required = 'warn'
            
            if all_match:
                if any_warn:
                    agg_result.message = "All prices match (with minor variances)"
                else:
                    agg_result.message = "All prices match"
            else:
                agg_result.message = f"{len([r for r in price_results if not r.is_match])} price discrepancy(ies) found"
            
            matching_results_dict['prices_match'] = agg_result.to_dict()
            matching_results_dict['price_details'] = [r.to_dict() for r in price_results]
        
        # Build discrepancies list - include items that don't match OR require attention (warnings)
        discrepancies = [r.to_dict() for r in self.matching_results if not r.is_match or r.action_required in ['warn', 'require_approval', 'block']]
        
        # Determine overall status - same logic as match_po_grn
        overall_status = 'passed'
        if critical_failures:
            overall_status = 'failed'
        elif all_requiring_approval:
            # Check if any approval_required items are actual mismatches (is_match=False)
            has_actual_mismatches = any(not r.is_match for r in all_requiring_approval)
            if has_actual_mismatches:
                overall_status = 'failed'
            else:
                # Within tolerance but requires approval (auto_approve disabled)
                overall_status = 'warning'
        elif warnings:
            overall_status = 'warning'
        
        return {
            'enabled': True,
            'overall_status': overall_status,
            'can_proceed': len(critical_failures) == 0 and len(all_requiring_approval) == 0,
            'requires_approval': len(all_requiring_approval) > 0,
            'approver_roles': list(set([r.approver_role for r in all_requiring_approval if r.approver_role])),
            'critical_failures': len(critical_failures),
            'warnings': len(warnings),
            'matching_results': matching_results_dict,
            'discrepancies': discrepancies,
            'summary': self._generate_summary(),
            'po_number': po.po_number,
            'grn_number': grn.grn_number,
            'invoice_amount': invoice_amount
        }
    
    def _match_supplier(self, po: PurchaseOrder, grn: GoodsReceivedNote):
        """Verify supplier is the same"""
        result = MatchingResult('Supplier Match', 'supplier')
        
        if po.supplier_id != grn.supplier_id:
            result.is_match = False
            result.expected_value = po.supplier.name
            result.actual_value = grn.supplier.name
            result.message = f"Supplier mismatch: PO is for {po.supplier.name} but GRN is from {grn.supplier.name}"
            result.action_required = 'block'  # Critical severity
            result.approver_role = 'Purchasing Manager'  # But can be approved by manager
        else:
            result.message = f"Supplier verified: {po.supplier.name}"
        
        self.matching_results.append(result)
    
    def _match_items(self, po: PurchaseOrder, grn: GoodsReceivedNote):
        """Verify all items in GRN exist in PO"""
        result = MatchingResult('Item Match', 'items')
        
        po_items = set(po.items.values_list('item_id', flat=True))
        grn_items = set(grn.items.values_list('item_id', flat=True))
        
        extra_items = grn_items - po_items
        missing_items = po_items - grn_items
        
        if extra_items:
            result.is_match = False
            result.message = f"GRN contains {len(extra_items)} extra item(s) not in PO"
            result.action_required = 'warn'  # Warning: extra items received
            result.approver_role = 'Purchasing Manager'
        elif missing_items:
            result.is_match = False
            result.message = f"GRN is missing {len(missing_items)} item(s) from PO (partial delivery)"
            result.action_required = 'require_approval'  # Requires approval for partial delivery
            result.approver_role = 'Purchasing Manager'
        else:
            result.message = "All items match"
        
        self.matching_results.append(result)
    
    def _match_quantities(self, po: PurchaseOrder, grn: GoodsReceivedNote):
        """Match quantities for each item"""
        rules = self._get_matching_rules('quantity')
        
        for po_item in po.items.all():
            grn_items = grn.items.filter(item_id=po_item.item_id)
            
            if not grn_items.exists():
                continue
            
            grn_item = grn_items.first()
            result = MatchingResult(f'Quantity Match - {po_item.item.name}', 'quantity')
            
            expected_qty = po_item.quantity
            actual_qty = grn_item.quantity_received
            
            result.expected_value = expected_qty
            result.actual_value = actual_qty
            
            # Check against matching rules
            is_match = True
            if rules:
                rule = rules[0]  # Use first rule (simplified)
                tolerance_pct = rule.get('tolerance_percentage', Decimal('5.0'))
                
                # Calculate variance
                var_amt = actual_qty - expected_qty
                if expected_qty != 0:
                    var_pct = abs((var_amt / expected_qty) * Decimal('100'))
                else:
                    var_pct = Decimal('0')
                
                # Check if within tolerance
                if var_pct > tolerance_pct:
                    # Exceeds tolerance - always failed, require approval
                    is_match = False
                    result.variance_amount = var_amt
                    result.variance_percentage = var_pct
                    result.action_required = 'require_approval'
                    result.approver_role = 'Purchasing Manager'
                elif var_pct > 0:
                    # Within tolerance but not perfect
                    result.variance_amount = var_amt
                    result.variance_percentage = var_pct
                    if rule.get('auto_approve_within_tolerance', False):
                        # Auto-approve enabled - just warn (still a match, no approval needed)
                        result.action_required = 'warn'
                    else:
                        # Auto-approve disabled - requires approval (still a match, but needs approval)
                        result.action_required = 'require_approval'
                        result.approver_role = 'Purchasing Manager'
            
            result.is_match = is_match
            
            if not is_match:
                result.message = f"Quantity mismatch: Ordered {expected_qty}, Received {actual_qty} (±{result.variance_percentage:.2f}%)"
            elif result.action_required == 'warn':
                result.message = f"Quantity within tolerance: Ordered {expected_qty}, Received {actual_qty} (±{result.variance_percentage:.2f}%)"
            elif result.action_required == 'require_approval':
                result.message = f"Quantity requires approval: Ordered {expected_qty}, Received {actual_qty} (±{result.variance_percentage:.2f}%)"
            else:
                result.message = f"Quantity OK: {actual_qty}"
            
            self.matching_results.append(result)
    
    def _match_prices(self, po: PurchaseOrder, grn: GoodsReceivedNote):
        """Match unit prices for each item"""
        rules = self._get_matching_rules('price')
        
        for po_item in po.items.all():
            grn_items = grn.items.filter(item_id=po_item.item_id)
            
            if not grn_items.exists():
                continue
            
            grn_item = grn_items.first()
            result = MatchingResult(f'Price Match - {po_item.item.name}', 'price')
            
            expected_price = po_item.unit_price
            actual_price = grn_item.unit_cost
            
            result.expected_value = expected_price
            result.actual_value = actual_price
            
            # Check against matching rules
            is_match = True
            if rules:
                rule = rules[0]  # Use first rule (simplified)
                tolerance_pct = rule.get('tolerance_percentage', Decimal('5.0'))
                
                # Calculate variance
                var_amt = actual_price - expected_price
                if expected_price != 0:
                    var_pct = abs((var_amt / expected_price) * Decimal('100'))
                else:
                    var_pct = Decimal('0')
                
                # Check if within tolerance
                if var_pct > tolerance_pct:
                    # Exceeds tolerance - always failed, require approval
                    is_match = False
                    result.variance_amount = var_amt
                    result.variance_percentage = var_pct
                    result.action_required = 'require_approval'
                    result.approver_role = 'Purchasing Manager'
                elif var_pct > 0:
                    # Within tolerance but not perfect
                    result.variance_amount = var_amt
                    result.variance_percentage = var_pct
                    if rule.get('auto_approve_within_tolerance', False):
                        # Auto-approve enabled - just warn (still a match, no approval needed)
                        result.action_required = 'warn'
                    else:
                        # Auto-approve disabled - requires approval (still a match, but needs approval)
                        result.action_required = 'require_approval'
                        result.approver_role = 'Purchasing Manager'
            
            result.is_match = is_match
            
            if not is_match:
                result.message = f"Price mismatch: Expected ₦{expected_price:,.2f}, Actual ₦{actual_price:,.2f} (±{result.variance_percentage:.2f}%)"
            elif result.action_required == 'warn':
                result.message = f"Price within tolerance: Expected ₦{expected_price:,.2f}, Actual ₦{actual_price:,.2f} (±{result.variance_percentage:.2f}%)"
            elif result.action_required == 'require_approval':
                result.message = f"Price requires approval: Expected ₦{expected_price:,.2f}, Actual ₦{actual_price:,.2f} (±{result.variance_percentage:.2f}%)"
            else:
                result.message = f"Price OK: ₦{actual_price:,.2f}"
            
            self.matching_results.append(result)
    
    def _match_totals(self, po: PurchaseOrder, grn: GoodsReceivedNote):
        """Match total amounts"""
        rules = self._get_matching_rules('total')
        
        result = MatchingResult('Total Amount Match', 'total')
        
        expected_total = po.total_amount
        actual_total = grn.total_amount
        
        result.expected_value = expected_total
        result.actual_value = actual_total
        
        # Check against matching rules
        is_match = True
        if rules:
            rule = rules[0]  # Use first rule (simplified)
            tolerance_pct = rule.get('tolerance_percentage', Decimal('5.0'))
            
            # Calculate variance
            var_amt = actual_total - expected_total
            if expected_total != 0:
                var_pct = abs((var_amt / expected_total) * Decimal('100'))
            else:
                var_pct = Decimal('0')
            
            # Check if within tolerance
            if var_pct > tolerance_pct:
                # Exceeds tolerance
                is_match = False
                result.variance_amount = var_amt
                result.variance_percentage = var_pct
                result.action_required = 'require_approval'
                result.approver_role = 'Finance Manager'
            elif var_pct > 0:
                # Within tolerance but not perfect
                result.variance_amount = var_amt
                result.variance_percentage = var_pct
                if rule.get('auto_approve_within_tolerance', False):
                    # Auto-approve enabled - just warn (still a match, no approval needed)
                    result.action_required = 'warn'
                else:
                    # Auto-approve disabled - requires approval (still a match, but needs approval)
                    result.action_required = 'require_approval'
                    result.approver_role = 'Finance Manager'
        else:
            # If no specific rules, use config tolerance
            tolerance = self.workflow_config.matching_tolerance_percentage if self.workflow_config else Decimal('5.0')
            variance_pct = abs((actual_total - expected_total) / expected_total * 100) if expected_total else 0
            
            if variance_pct > tolerance:
                # Exceeds tolerance
                is_match = False
                result.variance_percentage = variance_pct
                result.variance_amount = abs(actual_total - expected_total)
                result.action_required = 'require_approval'
                result.approver_role = 'Finance Manager'
            elif variance_pct > 0:
                # Within tolerance but not perfect
                result.variance_percentage = variance_pct
                result.variance_amount = abs(actual_total - expected_total)
                if self.workflow_config and self.workflow_config.auto_approve_within_tolerance:
                    # Auto-approve enabled - just warn
                    result.action_required = 'warn'
                else:
                    # Auto-approve disabled - require approval
                    is_match = False
                    result.action_required = 'require_approval'
                    result.approver_role = 'Finance Manager'
        
        result.is_match = is_match
        
        if not is_match:
            result.message = f"Amount mismatch: PO ₦{expected_total:,.2f}, GRN ₦{actual_total:,.2f} (±{result.variance_percentage:.2f}%)"
        elif result.action_required == 'warn':
            result.message = f"Amount within tolerance: PO ₦{expected_total:,.2f}, GRN ₦{actual_total:,.2f} (±{result.variance_percentage:.2f}%)"
        else:
            result.message = f"Amount OK: ₦{actual_total:,.2f}"
        
        self.matching_results.append(result)
    
    def _match_invoice_amount(self, po: PurchaseOrder, grn: GoodsReceivedNote, invoice_amount: Decimal):
        """Match invoice amount against GRN"""
        rules = self._get_matching_rules('total')
        
        result = MatchingResult('Invoice Amount Match', 'invoice_total')
        
        expected_total = grn.total_amount
        actual_total = invoice_amount
        
        result.expected_value = expected_total
        result.actual_value = actual_total
        
        # Check against matching rules
        is_match = True
        if rules:
            rule = rules[0]  # Use first rule (simplified)
            tolerance_pct = rule.get('tolerance_percentage', Decimal('5.0'))
            
            # Calculate variance
            var_amt = actual_total - expected_total
            if expected_total != 0:
                var_pct = abs((var_amt / expected_total) * Decimal('100'))
            else:
                var_pct = Decimal('0')
            
            # Check if within tolerance
            if var_pct > tolerance_pct:
                # Exceeds tolerance - always require approval (failed)
                is_match = False
                result.variance_amount = var_amt
                result.variance_percentage = var_pct
                result.action_required = 'require_approval'
                result.approver_role = 'Finance Manager'
            elif var_pct > 0:
                # Within tolerance but not perfect
                result.variance_amount = var_amt
                result.variance_percentage = var_pct
                if rule.get('auto_approve_within_tolerance', False):
                    # Auto-approve enabled - just warn (still a match, no approval needed)
                    result.action_required = 'warn'
                else:
                    # Auto-approve disabled - requires approval (still a match, but needs approval)
                    result.action_required = 'require_approval'
                    result.approver_role = 'Finance Manager'
        else:
            # If no specific rules, use config tolerance
            tolerance = self.workflow_config.matching_tolerance_percentage if self.workflow_config else Decimal('5.0')
            variance_pct = abs((actual_total - expected_total) / expected_total * 100) if expected_total else 0
            
            if variance_pct > tolerance:
                # Exceeds tolerance - always require approval (failed)
                is_match = False
                result.variance_percentage = variance_pct
                result.variance_amount = abs(actual_total - expected_total)
                result.action_required = 'require_approval'
                result.approver_role = 'Finance Manager'
            elif variance_pct > 0:
                # Within tolerance but not perfect
                result.variance_percentage = variance_pct
                result.variance_amount = abs(actual_total - expected_total)
                if self.workflow_config and self.workflow_config.auto_approve_within_tolerance:
                    # Auto-approve enabled - just warn
                    result.action_required = 'warn'
                else:
                    # Auto-approve disabled - require approval even within tolerance
                    is_match = False
                    result.action_required = 'require_approval'
                    result.approver_role = 'Finance Manager'
        
        result.is_match = is_match
        
        if not is_match:
            result.message = f"Invoice mismatch: GRN ₦{expected_total:,.2f}, Invoice ₦{actual_total:,.2f} (±{result.variance_percentage:.2f}%)"
        else:
            result.message = f"Invoice amount OK: ₦{actual_total:,.2f}"
        
        self.matching_results.append(result)
    
    def _match_invoice_items(self, po: PurchaseOrder, grn: GoodsReceivedNote, invoice_items: List[Dict]):
        """Match invoice line items"""
        # This would do detailed line-by-line matching
        # Implementation depends on invoice item structure
        pass
    
    def _get_matching_rules(self, match_type: str) -> list:
        """Get tolerance from config (simplified from complex rules)"""
        if not self.workflow_config:
            return []
        
        # Use simple tolerance-based matching
        tolerance = self.workflow_config.matching_tolerance_percentage
        auto_approve = self.workflow_config.auto_approve_within_tolerance
        
        return [{
            'tolerance_percentage': tolerance,
            'auto_approve_within_tolerance': auto_approve
        }]
    
    def _generate_summary(self) -> str:
        """Generate human-readable summary"""
        total_checks = len(self.matching_results)
        passed = len([r for r in self.matching_results if r.is_match])
        failed = total_checks - passed
        
        if failed == 0:
            return f"✓ All {total_checks} matching checks passed"
        else:
            return f"⚠ {failed} of {total_checks} checks failed or require attention"


class MatchingReportGenerator:
    """Generate detailed matching reports"""
    
    @staticmethod
    def generate_report(matching_result: Dict) -> str:
        """Generate formatted text report"""
        report = []
        report.append("=" * 60)
        report.append("3-Way Matching Report")
        report.append("=" * 60)
        report.append("")
        
        report.append(f"PO Number: {matching_result.get('po_number', 'N/A')}")
        report.append(f"GRN Number: {matching_result.get('grn_number', 'N/A')}")
        report.append(f"Overall Status: {matching_result.get('overall_status', 'unknown').upper()}")
        report.append(f"Can Proceed: {'YES' if matching_result.get('can_proceed', False) else 'NO'}")
        report.append("")
        
        # Handle summary - check if it exists
        if 'summary' in matching_result:
            report.append(f"Summary: {matching_result['summary']}")
            report.append("")
        
        if matching_result.get('requires_approval'):
            report.append("APPROVAL REQUIRED FROM:")
            for role in matching_result.get('approver_roles', []):
                report.append(f"  - {role}")
            report.append("")
        
        report.append("DETAILED RESULTS:")
        report.append("-" * 60)
        
        # Flatten the matching_results dict into a list for iteration
        results_list = []
        matching_results = matching_result['matching_results']
        
        # Add single results
        if matching_results.get('supplier_match'):
            results_list.append(matching_results['supplier_match'])
        if matching_results.get('items_match'):
            results_list.append(matching_results['items_match'])
        if matching_results.get('totals_match'):
            results_list.append(matching_results['totals_match'])
        if matching_results.get('invoice_match'):
            results_list.append(matching_results['invoice_match'])
        
        # Add quantity match - now a single dict for aggregate, not a list
        if matching_results.get('quantities_match'):
            if isinstance(matching_results['quantities_match'], list):
                # Old format - list of individual quantity checks
                results_list.extend(matching_results['quantities_match'])
            else:
                # New format - single aggregate result
                results_list.append(matching_results['quantities_match'])
        
        # Add detailed quantity results if available
        if matching_results.get('quantity_details'):
            results_list.extend(matching_results['quantity_details'])
        
        for result in results_list:
            # Skip if result doesn't have the expected structure
            if not isinstance(result, dict):
                continue
            
            # Handle both old and new format
            is_match = result.get('is_match')
            if is_match is None:
                # Old format - check status field
                status_field = result.get('status', '')
                is_match = status_field in ['match', 'partial_match']
            
            if is_match is None:
                continue
                
            status = "[PASS]" if is_match else "[FAIL]"
            rule_name = result.get('rule_name', 'Unknown')
            report.append(f"{status} | {rule_name}")
            
            # Add human-readable confirmation for matches
            # Check if this is a supplier match by looking at rule_name or match_type
            match_type = result.get('match_type', '')
            if is_match and (match_type == 'supplier' or 'Supplier' in rule_name):
                report.append(f"      Suppliers match")
            
            # Always show the message
            message = result.get('message', '')
            if message:
                report.append(f"      {message}")
            
            if not is_match and result.get('variance_percentage'):
                report.append(f"      Variance: {result['variance_percentage']:.2f}%")
                if result.get('action_required'):
                    report.append(f"      Action: {result['action_required']}")
            
            report.append("")
        
        # Add discrepancies section if there are any
        if matching_result.get('discrepancies'):
            report.append("")
            report.append("DISCREPANCIES:")
            report.append("-" * 60)
            for disc in matching_result['discrepancies']:
                disc_type = disc.get('type', 'unknown')
                severity = disc.get('severity', 'unknown')
                description = disc.get('description', '')
                report.append(f"[{severity.upper()}] {disc_type.upper()}: {description}")
                
                # Add specific values if available
                if 'po_value' in disc:
                    report.append(f"      PO Value: {disc['po_value']}")
                if 'grn_value' in disc:
                    report.append(f"      GRN Value: {disc['grn_value']}")
                if 'variance' in disc:
                    report.append(f"      Variance: {disc['variance']}")
                if 'variance_percentage' in disc:
                    report.append(f"      Variance %: {disc['variance_percentage']}%")
                report.append("")
        
        report.append("=" * 60)
        
        return "\n".join(report)
