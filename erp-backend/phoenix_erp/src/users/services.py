
# from typing import Dict, Any, List
# from decimal import Decimal
# from datetime import date, timedelta

# from django.utils import timezone
# from clients.models import Client, ClientClassification, ClientRelationship, ClientDocument
# from incomes.models import Income, IncomeCategory
# from loans.models import LoanAccount as Loan
# from accounts.models import Account

# from .models import Tenant

# class DomainService:
#     """
#     Backend service that handles domain-specific logic
#     while maintaining standard data models.
#     """
    
#     def __init__(self, tenant: Tenant):
#         self.tenant = tenant
#         self.domain_type = tenant.domain_type
#         self.config = tenant.domain_config
    
#     def create_student(self, student_data: Dict[str, Any]) -> Client:
#         """
#         Create a student using the Client model.
#         Automatically sets correct context and metadata.
#         """
#         # Extract school-specific data
#         grade_level = student_data.pop('grade_level', None)
#         previous_school = student_data.pop('previous_school', None)
#         admission_date = student_data.pop('admission_date', date.today())
#         guardian_info = student_data.pop('guardian_info', {})
        
#         # Create client
#         client = Client.objects.create(
#             tenant=self.tenant,
#             usage_context='student',
#             classification=self._get_or_create_grade_classification(grade_level),
#             **student_data
#         )
        
#         # Set school-specific metadata
#         client.set_metadata('grade_level', grade_level)
#         client.set_metadata('admission_date', admission_date.isoformat())
#         client.set_metadata('previous_school', previous_school)
#         client.set_metadata('academic_year', self._get_current_academic_year())
#         client.save()
        
#         # Create guardian relationship if provided
#         if guardian_info:
#             self._create_guardian_relationship(client, guardian_info)
        
#         return client
    
#     def create_fee_plan(
#         self,
#         student: Client,
#         fee_structure: Dict[str, Any],
#         term_info: Dict[str, Any]
#     ) -> Loan:
#         """
#         Create a payment plan for school fees using Loan model.
#         Always 0% interest.
#         """
#         total_fees = sum(
#             Decimal(str(fee['amount'])) 
#             for fee in fee_structure['fees']
#         )
        
#         # Calculate installments
#         installments = fee_structure.get('installments', 3)
        
#         # Create "loan" (payment plan)
#         loan = Loan.objects.create(
#             tenant=self.tenant,
#             client=student,
#             account=self._get_or_create_student_account(student),
#             principal=total_fees,
#             disbursed_amount=total_fees,
#             outstanding_principal=total_fees,
#             interest_rate=Decimal('0.00'),  # Always 0 for school fees
#             term_months=installments,
#             payment_frequency='monthly',
#             disbursed_on=term_info['start_date'],
#             first_payment_date=term_info['start_date'] + timedelta(days=14),
#             final_payment_date=term_info['end_date'],
#         )
        
#         # Set metadata
#         loan.metadata = {
#             'term': term_info['term_name'],
#             'academic_year': term_info['academic_year'],
#             'fee_breakdown': fee_structure['fees'],
#             'is_school_fees': True,
#         }
#         loan.save()
        
#         # Generate payment schedule
#         self._generate_payment_schedule(loan, installments)
        
#         # Create income records for each fee type
#         for fee in fee_structure['fees']:
#             self._create_fee_income_record(student, fee, term_info)
        
#         return loan
    
#     def process_fee_payment(
#         self,
#         income: Income,
#         amount: Decimal,
#         payment_method: str,
#         payment_date: date = None
#     ):
#         """
#         Process a fee payment and create accounting transaction.
#         """
#         payment_date = payment_date or date.today()
        
#         # Update income record
#         income.amount_paid += amount
#         if income.amount_paid >= income.amount:
#             income.status = 'paid'
#         elif income.amount_paid > 0:
#             income.status = 'partial'
#         income.save()
        
#         # Create accounting transaction
#         from transactions.models import Transaction, TransactionEntry, TransactionSeries
        
#         fee_series = TransactionSeries.objects.get(code='FEE')
#         cash_account = Account.objects.get(code='101-001')
        
#         txn = Transaction.objects.create(
#             tenant=self.tenant,
#             series=fee_series,
#             date=payment_date,
#             description=f"Fee payment: {income.name} - {income.client.full_name}",
#         )
        
#         # Dr. Cash
#         TransactionEntry.objects.create(
#             transaction=txn,
#             account=cash_account,
#             side='DR',
#             amount=amount
#         )
        
#         # Cr. Income (from category)
#         TransactionEntry.objects.create(
#             transaction=txn,
#             account=income.category.gl_account,
#             side='CR',
#             amount=amount
#         )
        
#         txn.post()
        
#         # Link transaction to income
#         income.transaction = txn
#         income.save()
        
#         # Update loan schedule if exists
#         if hasattr(income, 'payment_plan'):
#             self._update_loan_schedule(income.payment_plan, amount)
        
#         return txn
    
#     def generate_report_card(
#         self,
#         student: Client,
#         term: str,
#         grades: List[Dict[str, Any]]
#     ) -> ClientDocument:
#         """
#         Generate report card and store as client document.
#         """
#         # Generate PDF
#         pdf_content = self._generate_report_card_pdf(student, term, grades)
        
#         # Store as document
#         document = ClientDocument.objects.create(
#             tenant=self.tenant,
#             client=student,
#             document_type='other',  # Could add 'report_card' as choice
#             document_number=f"{term}-{student.client_id}",
#             document_file=pdf_content,
#             verification_status='verified',
#         )
        
#         # Store grades in metadata
#         document.metadata = {
#             'type': 'report_card',
#             'term': term,
#             'grades': grades,
#             'generated_at': timezone.now().isoformat(),
#         }
#         document.save()
        
#         return document
    
#     def _get_or_create_grade_classification(self, grade_name: str):
#         """Get or create classification for grade level"""
#         classification, _ = ClientClassification.objects.get_or_create(
#             tenant=self.tenant,
#             code=f"GRADE_{grade_name.upper().replace(' ', '_')}",
#             defaults={
#                 'name': grade_name,
#                 'description': f'Students in {grade_name}',
#             }
#         )
#         return classification
    
#     def _get_or_create_student_account(self, student: Client):
#         """Get or create account for student"""
#         parent_code = '120'  # Student Receivables
        
#         return Account.create_with_parent(
#             parent_code=parent_code,
#             child_data={
#                 'tenant': self.tenant,
#                 'name': f"{student.full_name} - Fees",
#             }
#         )
    
#     def _create_guardian_relationship(self, student: Client, guardian_info: Dict):
#         """Create or link guardian"""
#         # Check if guardian exists
#         guardian = Client.objects.filter(
#             tenant=self.tenant,
#             phone_primary=guardian_info.get('phone'),
#             usage_context='financial'
#         ).first()
        
#         if not guardian:
#             guardian = Client.objects.create(
#                 tenant=self.tenant,
#                 usage_context='financial',
#                 first_name=guardian_info['first_name'],
#                 last_name=guardian_info['last_name'],
#                 phone_primary=guardian_info['phone'],
#                 email=guardian_info.get('email'),
#                 address_street=guardian_info.get('address'),
#             )
        
#         # Create relationship
#         ClientRelationship.objects.create(
#             tenant=self.tenant,
#             from_client=student,
#             to_client=guardian,
#             relationship_type='parent',
#             is_guarantor=True,
#         )
    
#     def _create_fee_income_record(
#         self,
#         student: Client,
#         fee: Dict[str, Any],
#         term_info: Dict[str, Any]
#     ):
#         """Create income record for fee"""
#         category = IncomeCategory.objects.get(
#             tenant=self.tenant,
#             code=fee['category_code']
#         )
        
#         return Income.objects.create(
#             tenant=self.tenant,
#             client=student,
#             category=category,
#             name=fee['name'],
#             description=f"{fee['name']} - {term_info['term_name']}",
#             reference_number=self._generate_invoice_number(),
#             amount=Decimal(str(fee['amount'])),
#             invoice_date=term_info['start_date'],
#             due_date=term_info['start_date'] + timedelta(days=14),
#             metadata={
#                 'term': term_info['term_name'],
#                 'academic_year': term_info['academic_year'],
#             }
#         )
    
#     def _get_current_academic_year(self):
#         """Get current academic year string"""
#         today = date.today()
#         if today.month >= 9:
#             return f"{today.year}/{today.year + 1}"
#         return f"{today.year - 1}/{today.year}"
    
#     def _generate_invoice_number(self):
#         """Generate unique invoice number"""
#         from django.db.models import Max
#         last_income = Income.objects.filter(
#             tenant=self.tenant
#         ).aggregate(Max('reference_number'))['reference_number__max']
        
#         if last_income and last_income.startswith('INV'):
#             try:
#                 num = int(last_income[3:])
#                 return f"INV{num + 1:06d}"
#             except:
#                 pass
        
#         return f"INV{date.today().year}{1:06d}"

