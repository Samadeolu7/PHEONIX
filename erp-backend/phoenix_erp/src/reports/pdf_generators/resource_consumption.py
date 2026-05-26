"""
Resource Consumption Invoice/Voucher PDF Generator
Flexible system for any resource type: fuel, utilities, materials, etc.
"""
from .base import BasePDFGenerator
from datetime import datetime


class ResourceConsumptionPDFGenerator(BasePDFGenerator):
    """
    Generate invoices/vouchers for resource consumption
    
    Use Cases:
    - Fuel vouchers for drivers (gasoline, diesel)
    - Utility consumption invoices (electricity, water)
    - Material consumption records
    - Equipment usage billing
    - Service hour tracking
    """
    
    template_name = 'pdf/resource_consumption_invoice.html'
    
    def get_context_data(self):
        """Build resource consumption invoice context"""
        context = super().get_context_data()
        
        consumption = self.instance
        
        # Determine document type based on payment flow
        if consumption.payment_flow == 'prepaid':
            document_type = 'RESOURCE VOUCHER'
            document_title = 'Resource Consumption Voucher'
        else:
            document_type = 'CONSUMPTION INVOICE'
            document_title = 'Resource Consumption Invoice'
        
        # Basic document info
        context.update({
            'document_type': document_type,
            'document_title': document_title,
            'consumption': consumption,
            'consumption_number': consumption.consumption_number,
            'consumption_date': consumption.consumption_date,
            'status': consumption.get_status_display(),
            
            # Resource details
            'resource_name': consumption.resource.name,
            'resource_type': consumption.resource.get_resource_type_display(),
            'resource_category': consumption.resource.expense_category.name if consumption.resource.expense_category else '',
            
            # Quantity and cost
            'quantity': consumption.quantity_consumed,
            'unit': consumption.unit_of_measure,
            'unit_cost': consumption.unit_cost or consumption.resource.default_unit_cost,
            'total_cost': consumption.total_cost,
            
            # Beneficiary info
            'beneficiary_type': consumption.get_beneficiary_type_display(),
            'beneficiary_name': consumption.beneficiary_name,
            'beneficiary_reference': consumption.beneficiary_reference,
            
            # Additional details
            'operator_name': consumption.operator_name,
            'consumption_location': consumption.consumption_location,
            'receipt_number': consumption.receipt_number,
            'invoice_number': consumption.invoice_number,
            
            # Payment flow specific
            'payment_flow': consumption.get_payment_flow_display(),
            'is_prepaid': consumption.payment_flow == 'prepaid',
            'is_postpaid': consumption.payment_flow == 'postpaid',
        })
        
        # Prepaid voucher details
        if consumption.prepaid_voucher:
            voucher = consumption.prepaid_voucher
            context.update({
                'voucher_number': voucher.voucher_number,
                'voucher_value': voucher.allocated_amount,
                'voucher_balance': voucher.remaining_amount,  # Use property
                'voucher_consumed': voucher.consumed_amount,
                'voucher_units': voucher.allocated_units,
                'voucher_units_consumed': voucher.consumed_units,
            })
        
        # Postpaid supplier details
        if consumption.supplier:
            supplier = consumption.supplier
            context.update({
                'supplier_name': supplier.name,
                'supplier_contact': supplier.contact_person,
                'supplier_phone': supplier.phone,
                'supplier_email': supplier.email,
                'supplier_address': supplier.address,
            })
        
        # Asset-specific details (e.g., vehicle)
        if consumption.asset:
            asset = consumption.asset
            context.update({
                'asset_name': asset.name,
                'asset_code': asset.asset_number,
                'asset_description': asset.description,
            })
            
            # Vehicle-specific - check metadata JSONField
            if hasattr(asset, 'metadata') and asset.metadata:
                # Ensure metadata is a dict (JSONField should be, but check anyway)
                metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
                
                # Check if this is a vehicle
                if metadata.get('vehicle_type') or asset.registration_number:
                    context.update({
                        'is_vehicle': True,
                        'plate_number': asset.registration_number or metadata.get('plate_number', ''),
                        'vehicle_make': asset.make or metadata.get('make', ''),
                        'vehicle_model': asset.model or metadata.get('model', ''),
                        'vehicle_year': asset.year or metadata.get('year', ''),
                    })
        
        # Employee/Staff details
        if consumption.employee:
            employee = consumption.employee
            context.update({
                'employee_name': f"{employee.first_name} {employee.last_name}",
                'employee_position': employee.position or '',
                'employee_department': employee.department or '',
            })
        
        # Usage metrics
        if consumption.reading_type and consumption.reading_type != 'none':
            context.update({
                'has_readings': True,
                'reading_type': consumption.get_reading_type_display(),
                'previous_reading': consumption.previous_reading,
                'current_reading': consumption.current_reading,
                'usage_since_last': consumption.usage_since_last,
                'consumption_rate': consumption.consumption_rate,
            })
        
        # Irregularity flags
        if consumption.is_irregular:
            context.update({
                'is_irregular': True,
                'irregularity_type': consumption.get_irregularity_type_display() if consumption.irregularity_type else '',
                'variance_percentage': consumption.variance_percentage,
                'irregularity_notes': consumption.irregularity_notes,
                'explanation_provided': consumption.explanation_provided,
            })
        
        # Approval details
        if consumption.approved_by:
            context.update({
                'is_approved': True,
                'approved_by_name': consumption.approved_by.get_full_name(),
                'approved_at': consumption.approved_at,
            })
        
        # Posted status
        if consumption.is_posted:
            context.update({
                'is_posted': True,
                'posted_by_name': consumption.posted_by.get_full_name() if consumption.posted_by else '',
                'posted_at': consumption.posted_at,
            })
        
        # Notes
        context['notes'] = consumption.notes
        
        return context
    
    def _get_vehicle_info(self, asset):
        """Extract vehicle-specific information"""
        if not asset:
            return {}
        
        vehicle_info = {
            'asset_name': asset.name,
            'asset_code': asset.asset_number,
        }
        
        # Try to get vehicle details from metadata JSON field
        if hasattr(asset, 'metadata') and asset.metadata:
            # Ensure metadata is a dict
            metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
            
            vehicle_info.update({
                'plate_number': asset.registration_number or metadata.get('plate_number', ''),
                'make': asset.make or metadata.get('make', ''),
                'model': asset.model or metadata.get('model', ''),
                'year': asset.year or metadata.get('year', ''),
                'vin': asset.serial_number or metadata.get('vin', ''),
            })
        else:
            # Use direct fields if metadata not available
            vehicle_info.update({
                'plate_number': asset.registration_number or '',
                'make': asset.make or '',
                'model': asset.model or '',
                'year': asset.year or '',
                'vin': asset.serial_number or '',
            })
        
        return vehicle_info
