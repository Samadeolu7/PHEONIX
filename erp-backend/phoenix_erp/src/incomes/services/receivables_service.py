# incomes/services/receivables_service.py
"""
Service for managing school receivables and invoices
Flexible discount system with configurable eligibility criteria
"""
from typing import List, Dict, Tuple, Optional
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db.models import Q, Sum, Count
import logging

from incomes.models import Invoice, FeeStructure, FeeEntitlement, IncomeCategory
from incomes.models_discount import DiscountProgram, DiscountApplication, AppliedDiscount
from clients.models import Client, ClientRelationship
from products.models import Product
from accounts.models import Account

logger = logging.getLogger(__name__)


class ReceivablesService:
    """
    Service for managing school receivables and invoices
    Supports flexible, configurable discounts
    """
    
    def calculate_applicable_fees(
        self, 
        student: Client, 
        fee_structures: List[FeeStructure],
        academic_year: str,
        term: str
    ) -> List[Dict]:
        """
        Calculate all fees that apply to a student
        
        Returns list of fee items:
        [
            {
                'fee_structure': FeeStructure,
                'category': IncomeCategory,
                'description': str,
                'base_amount': Decimal,
                'is_mandatory': bool
            }
        ]
        """
        fee_items = []
        student_class = student.classification
        
        if not student_class:
            logger.warning(f"Student {student.id} has no classification. Skipping fee calculation.")
            return []
        
        for fee in fee_structures:
            # Check if fee applies to this student's class
            fee_config = fee.industry_config or {}
            
            # Check grade level match - flexible comparison
            fee_grade = fee_config.get('grade_level') or fee_config.get('class_code')
            if fee_grade and fee_grade != student_class.code:
                # Also check if it matches classification name
                if fee_grade not in [student_class.code, student_class.name]:
                    continue
            
            # Check if optional and student opted in
            if fee_config.get('is_optional', False):
                # Check if student selected this optional fee
                if not self._student_opted_for_fee(student, fee):
                    continue
            
            # Apply new student filters
            if fee_config.get('applies_to_new_students_only'):
                if not self._is_new_student(student, academic_year):
                    continue
            
            fee_items.append({
                'fee_structure': fee,
                'category': fee.category,
                'description': fee.name,
                'base_amount': fee.base_amount,
                'is_mandatory': not fee_config.get('is_optional', False)
            })
        
        return fee_items
    
    def calculate_applicable_discounts(
        self,
        student: Client,
        fee_items: List[Dict],
        invoice_date: str,
        due_date: str,
        academic_year: str,
        term: str
    ) -> List[Dict]:
        """
        Calculate all discounts that apply to a student based on configurable criteria
        
        Returns list of applicable discounts:
        [
            {
                'program': DiscountProgram,
                'discount_amount': Decimal,
                'reason': str,
                'auto_approved': bool,
                'criteria_met': dict
            }
        ]
        """
        # Get active discount programs
        programs = DiscountProgram.objects.filter(
            is_active=True,
            start_date__lte=invoice_date,
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=invoice_date)
        )
        
        applicable_discounts = []
        total_fee_amount = sum(item['base_amount'] for item in fee_items)
        
        # Store fee_items for workflow context
        self._current_fee_items = fee_items
        
        for program in programs:
            # Check if student meets eligibility criteria
            criteria_result = self._check_eligibility_criteria(
                student=student,
                program=program,
                invoice_date=invoice_date,
                due_date=due_date,
                academic_year=academic_year,
                term=term
            )
            
            if not criteria_result['eligible']:
                continue
            
            # Calculate discount amount
            discount_amount = self._calculate_discount_amount(
                program=program,
                total_amount=total_fee_amount,
                fee_items=fee_items
            )
            
            if discount_amount <= 0:
                continue
            
            # Check if program has budget remaining
            if program.budget_allocated > 0:
                if program.budget_remaining < discount_amount:
                    logger.warning(
                        f"Program {program.program_code} has insufficient budget. "
                        f"Remaining: {program.budget_remaining}, Required: {discount_amount}"
                    )
                    continue
            
            # Check recipient limit
            if program.max_recipients > 0:
                if program.current_recipients >= program.max_recipients:
                    logger.warning(f"Program {program.program_code} has reached max recipients")
                    continue
            
            applicable_discounts.append({
                'program': program,
                'discount_amount': discount_amount,
                'reason': criteria_result['reason'],
                'auto_approved': not program.requires_approval,
                'criteria_met': criteria_result['details']
            })
        
        return applicable_discounts
    
    def _check_eligibility_criteria(
        self,
        student: Client,
        program: DiscountProgram,
        invoice_date: str,
        due_date: str,
        academic_year: str,
        term: str
    ) -> Dict:
        """
        Check if student meets program eligibility criteria
        Flexible criteria checking based on JSON configuration
        
        Integrates with workflow execution if eligibility_workflow is configured
        
        Criteria Examples:
        {
            \"has_sibling\": true,  # Check if student has sibling in school
            \"is_new_student\": true,  # Check if first term
            \"min_gpa\": 3.5,  # Minimum GPA requirement
            \"max_family_income\": 1000000,  # Income threshold
            \"classification_codes\": [\"P1A\", \"P1B\"],  # Specific classes
            \"early_payment_days\": 30,  # Pay X days before due date
            \"scholarship_product_code\": \"SCHOLAR-001\",  # Link to scholarship product
            \"custom_field\": \"metadata.special_program\",  # Check custom field
            \"payment_history\": {\"min_terms_paid\": 2}  # Payment track record
        }
        """
        criteria = program.eligibility_criteria or {}
        details = {}
        
        # First check JSON-based criteria
        basic_eligibility = self._check_basic_criteria(
            student=student,
            criteria=criteria,
            invoice_date=invoice_date,
            due_date=due_date,
            academic_year=academic_year,
            term=term,
            details=details
        )
        
        if not basic_eligibility:
            return {'eligible': False, 'reason': 'Basic criteria not met', 'details': details}
        
        # If program has eligibility workflow, execute it
        if program.eligibility_workflow:
            from incomes.services.discount_workflow_service import DiscountWorkflowService
            
            # Use total fee amount passed from caller
            invoice_amount = sum(item['base_amount'] for item in self._current_fee_items) if hasattr(self, '_current_fee_items') else Decimal('0')
            
            is_eligible, error_msg, workflow_result = (
                                DiscountWorkflowService.validate_eligibility_with_workflow(
                                                       program=program,
                                                    client=student,
                                                    invoice_amount=invoice_amount,
                                                    context_data={
                                                                'basic_criteria_met': details,
                                                                'invoice_date': invoice_date,
                                                                'due_date': due_date,
                                                                'academic_year': academic_year,
                                                               'term': term
                                                             }
                                       )
                )
            
            if not is_eligible:
                reason = error_msg or 'Workflow validation failed'
                return {'eligible': False, 'reason': reason, 'details': details}
            
            # Merge workflow results into details
            if workflow_result:
                details['workflow_result'] = workflow_result
        
        return {'eligible': True, 'reason': 'All criteria met', 'details': details}
    
    def _check_basic_criteria(
        self,
        student: Client,
        criteria: Dict,
        invoice_date: str,
        due_date: str,
        academic_year: str,
        term: str,
        details: Dict
    ) -> bool:
        """Check basic JSON-based eligibility criteria"""
        
        # 1. Check sibling discount
        if criteria.get('has_sibling'):
            has_sibling = self._has_sibling_in_school(student)
            if not has_sibling:
                return False
            details['has_sibling'] = True
        
        # 2. Check new student status
        if criteria.get('is_new_student'):
            is_new = self._is_new_student(student, academic_year)
            if not is_new:
                return False
            details['is_new_student'] = True
        
        # 3. Check classification
        allowed_classes = criteria.get('classification_codes', [])
        if allowed_classes:
            if student.classification and student.classification.code not in allowed_classes:
                return False
            details['classification'] = student.classification.code if student.classification else None
        
        # 4. Check GPA (if stored in student metadata)
        min_gpa = criteria.get('min_gpa')
        if min_gpa:
            student_gpa = self._get_student_gpa(student)
            if student_gpa is None or student_gpa < min_gpa:
                return False
            details['gpa'] = student_gpa
        
        # 5. Check family income
        max_income = criteria.get('max_family_income')
        if max_income:
            family_income = self._get_family_income(student)
            if family_income and family_income > max_income:
                return False
            details['family_income'] = family_income
        
        # 6. Check scholarship product (for product-based scholarships)
        scholarship_product = criteria.get('scholarship_product_code')
        if scholarship_product:
            has_scholarship = self._has_scholarship_product(student, scholarship_product)
            if not has_scholarship:
                return False
            details['scholarship_product'] = scholarship_product
        
        # 7. Early payment discount - not checked here, applied at payment time
        # This is checked in payment processing
        
        # 8. Check custom metadata fields
        custom_field = criteria.get('custom_field')
        if custom_field:
            value = self._get_nested_field(student, custom_field)
            expected_value = criteria.get('custom_field_value')
            if expected_value and value != expected_value:
                return False
            details['custom_field'] = value
        
        # 9. Payment history check
        payment_history = criteria.get('payment_history')
        if payment_history:
            min_terms = payment_history.get('min_terms_paid')
            if min_terms:
                terms_paid = self._count_terms_paid(student)
                if terms_paid < min_terms:
                    return False
                details['terms_paid'] = terms_paid
        
        # All criteria met
        return True
    
    def _calculate_discount_amount(
        self,
        program: DiscountProgram,
        total_amount: Decimal,
        fee_items: List[Dict]
    ) -> Decimal:
        """Calculate discount amount based on program type"""
        if program.discount_type == 'percentage':
            discount_amount = (total_amount * program.discount_value) / 100
        elif program.discount_type == 'fixed_amount':
            discount_amount = min(program.discount_value, total_amount)
        else:  # full_waiver
            discount_amount = total_amount
        
        return Decimal(str(round(float(discount_amount), 2)))
    
    def _has_sibling_in_school(self, student: Client) -> bool:
        """Check if student has siblings currently in school"""
        siblings = ClientRelationship.objects.filter(
            Q(from_client=student, relationship_type='sibling') |
            Q(to_client=student, relationship_type='sibling'),
            to_client__status='active'  # Sibling is active student
        ).exclude(
            to_client=student  # Exclude self
        )
        return siblings.exists()
    
    def _is_new_student(self, student: Client, academic_year: str) -> bool:
        """Check if student is new (first academic year)"""
        # Check if student has any invoices from previous years
        previous_invoices = Invoice.objects.filter(
            client=student,
            status__in=['paid', 'partial']
        ).exclude(
            metadata__academic_year=academic_year
        ).exists()
        
        return not previous_invoices
    
    def _get_student_gpa(self, student: Client) -> Optional[float]:
        """Get student GPA from metadata"""
        metadata = student.metadata or {}
        gpa = metadata.get('gpa') or metadata.get('grade_point_average')
        if gpa:
            try:
                return float(gpa)
            except (ValueError, TypeError):
                return None
        return None
    
    def _get_family_income(self, student: Client) -> Optional[Decimal]:
        """Get family income from student metadata or parent info"""
        # Check student metadata first
        metadata = student.metadata or {}
        income = metadata.get('family_income') or metadata.get('annual_family_income')
        if income:
            try:
                return Decimal(str(income))
            except (ValueError, TypeError):
                pass
        
        # Check parent's annual_income
        parent_rel = ClientRelationship.objects.filter(
            to_client=student,
            relationship_type='parent'
        ).select_related('from_client').first()
        
        if parent_rel and parent_rel.from_client.annual_income:
            return parent_rel.from_client.annual_income
        
        return None
    
    def _has_scholarship_product(self, student: Client, product_code: str) -> bool:
        """Check if student has been assigned a scholarship product"""
        # Check if student has active scholarship in metadata
        metadata = student.metadata or {}
        scholarships = metadata.get('scholarships', [])
        
        if isinstance(scholarships, list):
            return product_code in scholarships
        
        # Could also check if there's a product allocation/entitlement
        # This would integrate with your products system
        return False
    
    def _get_nested_field(self, obj, field_path: str):
        """Get nested field value using dot notation (e.g., 'metadata.special_program')"""
        parts = field_path.split('.')
        value = obj
        
        for part in parts:
            if hasattr(value, part):
                value = getattr(value, part)
            elif isinstance(value, dict):
                value = value.get(part)
            else:
                return None
        
        return value
    
    def _count_terms_paid(self, student: Client) -> int:
        """Count number of terms student has fully paid"""
        paid_invoices = Invoice.objects.filter(
            client=student,
            status='paid'
        ).values('metadata__term').distinct().count()
        
        return paid_invoices
    
    def _student_opted_for_fee(self, student: Client, fee: FeeStructure) -> bool:
        """Check if student opted into optional fee"""
        metadata = student.metadata or {}
        optional_fees = metadata.get('optional_fees', [])
        return fee.code in optional_fees
    
    @transaction.atomic
    def create_draft_invoice(
        self,
        student: Client,
        fee_items: List[Dict],
        invoice_date: str,
        due_date: str,
        metadata: Dict,
        applicable_discounts: List[Dict] = None
    ) -> Invoice:
        """
        Create draft invoice for student with calculated discounts
        
        Args:
            student: Student client
            fee_items: List of fee items from calculate_applicable_fees()
            invoice_date: Invoice date
            due_date: Payment due date
            metadata: Invoice metadata (academic_year, term, class_code, etc.)
            applicable_discounts: List from calculate_applicable_discounts()
        
        Returns:
            Created Invoice instance
        """
        # Generate invoice number
        invoice_number = self._generate_invoice_number(
            academic_year=metadata['academic_year'],
            term=metadata['term'],
            class_code=metadata.get('class_code', 'UNCLASSIFIED')
        )
        
        # Calculate totals
        total_base_amount = sum(item['base_amount'] for item in fee_items)
        total_discount = Decimal('0')
        
        if applicable_discounts:
            total_discount = sum(
                discount['discount_amount'] 
                for discount in applicable_discounts
            )
        
        final_amount = total_base_amount - total_discount
        
        # Build description
        mandatory_fees = [item for item in fee_items if item['is_mandatory']]
        optional_fees = [item for item in fee_items if not item['is_mandatory']]
        
        description_parts = []
        if mandatory_fees:
            description_parts.append("Mandatory Fees:\n" + "\n".join(
                f"  - {item['description']}: ₦{item['base_amount']:,.2f}"
                for item in mandatory_fees
            ))
        if optional_fees:
            description_parts.append("\nOptional Fees:\n" + "\n".join(
                f"  - {item['description']}: ₦{item['base_amount']:,.2f}"
                for item in optional_fees
            ))
        if applicable_discounts:
            description_parts.append("\nDiscounts:\n" + "\n".join(
                f"  - {disc['program'].name}: -₦{disc['discount_amount']:,.2f} ({disc['reason']})"
                for disc in applicable_discounts
            ))
        
        description = "\n".join(description_parts)
        
        # Store detailed breakdown in metadata
        invoice_metadata = {
            **metadata,
            'fee_breakdown': [
                {
                    'fee_code': item['fee_structure'].code,
                    'description': item['description'],
                    'base_amount': float(item['base_amount']),
                    'category_code': item['category'].code,
                    'category_name': item['category'].name,
                    'is_mandatory': item['is_mandatory']
                }
                for item in fee_items
            ],
            'discount_breakdown': [
                {
                    'program_code': disc['program'].program_code,
                    'program_name': disc['program'].name,
                    'program_type': disc['program'].program_type,
                    'discount_amount': float(disc['discount_amount']),
                    'reason': disc['reason'],
                    'auto_approved': disc['auto_approved'],
                    'criteria_met': disc['criteria_met']
                }
                for disc in (applicable_discounts or [])
            ],
            'total_base_amount': float(total_base_amount),
            'total_discount': float(total_discount),
            'final_amount': float(final_amount)
        }
        
        # Create invoice
        invoice = Invoice.objects.create(
            client=student,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            due_date=due_date,
            description=description,
            amount=final_amount,  # Amount after discounts
            amount_paid=Decimal('0'),
            status='draft',  # Not active until approved
            metadata=invoice_metadata,
            # Link to primary fee structure (usually tuition)
            fee_structure=next(
                (item['fee_structure'] for item in fee_items if item['is_mandatory']),
                None
            )
        )
        
        return invoice
    
    def _generate_invoice_number(
        self, 
        academic_year: str, 
        term: str, 
        class_code: str
    ) -> str:
        """Generate unique invoice number: INV-2025T1-P1A-0001"""
        year_short = academic_year.split('-')[0] if '-' in academic_year else academic_year[:4]
        term_map = {
            'first': 'T1',
            'second': 'T2',
            'third': 'T3',
            '1': 'T1',
            '2': 'T2',
            '3': 'T3'
        }
        term_code = term_map.get(term.lower() if isinstance(term, str) else term, 'T1')
        
        # Get next sequence number
        from django.db.models import Max
        prefix = f"INV-{year_short}{term_code}-{class_code}"
        latest = Invoice.objects.filter(
            invoice_number__startswith=prefix
        ).aggregate(Max('invoice_number'))
        
        if latest['invoice_number__max']:
            try:
                last_seq = int(latest['invoice_number__max'].split('-')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1
        
        return f"{prefix}-{next_seq:04d}"
    
    def check_duplicate_invoice(
        self, 
        student_id: int, 
        term: str, 
        academic_year: str
    ) -> bool:
        """Check if invoice already exists for student in this term"""
        exists = Invoice.objects.filter(
            client_id=student_id,
            metadata__term=term,
            metadata__academic_year=academic_year,
            status__in=['draft', 'sent', 'partial', 'paid']  # Exclude cancelled
        ).exists()
        return exists
    
    def generate_class_invoice_summary(
        self, 
        class_code: str, 
        invoices: List[Invoice]
    ) -> Dict:
        """Generate summary statistics for class invoices"""
        if not invoices:
            return {
                'class_code': class_code,
                'class_name': '',
                'student_count': 0,
                'invoice_count': 0,
                'total_base_amount': 0,
                'total_discounts': 0,
                'total_mandatory_fees': 0,
                'total_optional_fees': 0,
                'grand_total': 0,
                'average_per_student': 0,
                'discount_summary': [],
                'invoices': []
            }
        
        mandatory_total = Decimal('0')
        optional_total = Decimal('0')
        base_total = Decimal('0')
        discount_total = Decimal('0')
        discount_programs = {}
        
        for invoice in invoices:
            metadata = invoice.metadata or {}
            
            # Sum base amounts
            base_total += Decimal(str(metadata.get('total_base_amount', 0)))
            discount_total += Decimal(str(metadata.get('total_discount', 0)))
            
            # Sum by fee type
            breakdown = metadata.get('fee_breakdown', [])
            for item in breakdown:
                amount = Decimal(str(item['base_amount']))
                if item['is_mandatory']:
                    mandatory_total += amount
                else:
                    optional_total += amount
            
            # Aggregate discount programs
            for disc in metadata.get('discount_breakdown', []):
                prog_code = disc['program_code']
                if prog_code not in discount_programs:
                    discount_programs[prog_code] = {
                        'program_code': prog_code,
                        'program_name': disc['program_name'],
                        'program_type': disc['program_type'],
                        'total_amount': Decimal('0'),
                        'recipient_count': 0
                    }
                discount_programs[prog_code]['total_amount'] += Decimal(str(disc['discount_amount']))
                discount_programs[prog_code]['recipient_count'] += 1
        
        grand_total = base_total - discount_total
        student_count = len(invoices)
        avg_per_student = grand_total / student_count if student_count > 0 else Decimal('0')
        
        return {
            'class_code': class_code,
            'class_name': invoices[0].metadata.get('class_name', '') if invoices else '',
            'student_count': student_count,
            'invoice_count': len(invoices),
            'total_base_amount': float(base_total),
            'total_discounts': float(discount_total),
            'total_mandatory_fees': float(mandatory_total),
            'total_optional_fees': float(optional_total),
            'grand_total': float(grand_total),
            'average_per_student': float(avg_per_student),
            'discount_summary': [
                {
                    **prog,
                    'total_amount': float(prog['total_amount'])
                }
                for prog in discount_programs.values()
            ],
            'invoices': [
                {
                    'invoice_number': inv.invoice_number,
                    'student_name': inv.client.full_name,
                    'base_amount': float(inv.metadata.get('total_base_amount', 0)),
                    'discount_amount': float(inv.metadata.get('total_discount', 0)),
                    'final_amount': float(inv.amount),
                    'has_discounts': bool(inv.metadata.get('discount_breakdown'))
                }
                for inv in invoices
            ]
        }
    
    @transaction.atomic
    def activate_invoices(self, invoice_ids: List[int], new_status: str = 'sent'):
        """Activate approved invoices"""
        updated = Invoice.objects.filter(
            id__in=invoice_ids,
            status='draft'
        ).update(
            status=new_status,
            modified_at=timezone.now()
        )
        logger.info(f"Activated {updated} invoices")
        return updated
    
    @transaction.atomic
    def create_fee_entitlements_bulk(
        self, 
        invoice_ids: List[int], 
        academic_period: Dict
    ):
        """Create entitlements for activated invoices"""
        invoices = Invoice.objects.filter(id__in=invoice_ids).select_related('client', 'fee_structure')
        
        entitlements = []
        for invoice in invoices:
            # Calculate minimum payment requirement (e.g., 30% of total)
            minimum_percent = Decimal('0.30')
            minimum_required = invoice.amount * minimum_percent
            
            # Define access rules based on school policy
            access_rules = {
                'requires_minimum': True,
                'full_access_at_percent': 50,  # Full access at 50% payment
                'grace_period_days': 14,  # 2 weeks grace after term starts
                'restrict_on_overdue': True,
                'allowed_services': ['classes', 'library', 'sports', 'cafeteria'],
                'restricted_services': ['exams', 'report_cards', 'certificates', 'graduation']
            }
            
            entitlement = FeeEntitlement(
                client=invoice.client,
                invoice=invoice,
                fee_structure=invoice.fee_structure,
                academic_period=academic_period,
                payment_term_type='minimum_deposit',
                total_amount=invoice.amount,
                amount_paid=Decimal('0'),
                minimum_required=minimum_required,
                current_access_level='none',
                access_rules=access_rules,
                status='pending',
                valid_from=invoice.invoice_date,
                valid_until=self._calculate_term_end_date(academic_period)
            )
            entitlements.append(entitlement)
        
        created = FeeEntitlement.objects.bulk_create(entitlements)
        logger.info(f"Created {len(created)} fee entitlements")
        return created
    
    def _calculate_term_end_date(self, academic_period: Dict):
        """Calculate term end date - integrate with academic calendar if available"""
        # Try to get from AcademicTerm model if it exists
        try:
            from incomes.models import AcademicTerm
            term = AcademicTerm.objects.filter(
                academic_year__name=academic_period.get('year'),
                term_number=academic_period.get('term')
            ).first()
            if term:
                return term.end_date
        except ImportError:
            pass
        
        # Fallback: 3 months from now
        from datetime import timedelta
        return timezone.now().date() + timedelta(days=90)
    
    def get_parent_for_student(self, student_id: int) -> Dict:
        """Get parent contact info for student"""
        relationships = ClientRelationship.objects.filter(
            to_client_id=student_id,
            relationship_type='parent'
        ).select_related('from_client').order_by('-created_at')
        
        if relationships.exists():
            parent = relationships.first().from_client
            return {
                'parent_id': parent.id,
                'parent_name': parent.full_name,
                'parent_email': parent.email or '',
                'parent_phone': parent.phone_primary or ''
            }
        
        # Fallback to student's own contact
        try:
            student = Client.objects.get(id=student_id)
            return {
                'parent_id': None,
                'parent_name': student.full_name,
                'parent_email': student.email or '',
                'parent_phone': student.phone_primary or ''
            }
        except Client.DoesNotExist:
            return {
                'parent_id': None,
                'parent_name': '',
                'parent_email': '',
                'parent_phone': ''
            }
