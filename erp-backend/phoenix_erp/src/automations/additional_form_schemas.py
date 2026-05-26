# additional_form_schemas.py
"""
Additional Form Schemas for remaining workflows
Completes the form coverage for all 9 school operational processes
"""

from django.db import transaction
from automations.models import FormSchema
from pages.models import Module, ModulePage, QuickAction


@transaction.atomic
def create_additional_form_schemas(owner, branch):
    """
    Create form schemas for workflows that don't have forms yet
    """
    print("\n" + "="*80)
    print("📋 CREATING ADDITIONAL FORM SCHEMAS")
    print("="*80 + "\n")
    
    form_schemas = {}
    
    # ========================================================================
    # 1. INVOICE GENERATION FORM (for manual invoice creation)
    # ========================================================================
    invoice_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Manual Invoice Generation Form',
        defaults={
            'description': 'Manually generate invoice for a student',
            'trigger_event_name': 'finance.invoice_generated',
            'schema': {
                'fields': [
                    {
                        'id': 'student_id',
                        'type': 'select',
                        'label': 'Student',
                        'required': True,
                        'data_source': '/api/clients/?classification=STUDENT',
                        'display_field': 'full_name',
                        'value_field': 'id'
                    },
                    {
                        'id': 'term',
                        'type': 'select',
                        'label': 'Term',
                        'required': True,
                        'options': [
                            {'value': 'TERM_1_2025', 'label': 'Term 1, 2025'},
                            {'value': 'TERM_2_2025', 'label': 'Term 2, 2025'},
                            {'value': 'TERM_3_2025', 'label': 'Term 3, 2025'}
                        ]
                    },
                    {
                        'id': 'fee_items',
                        'type': 'multi_select',
                        'label': 'Fee Items',
                        'required': True,
                        'data_source': '/api/fee-configurations/active/',
                        'display_field': 'name',
                        'value_field': 'id'
                    },
                    {
                        'id': 'due_date',
                        'type': 'date',
                        'label': 'Due Date',
                        'required': True,
                        'validation': {'min': 'today'}
                    },
                    {
                        'id': 'notes',
                        'type': 'textarea',
                        'label': 'Notes',
                        'required': False
                    }
                ]
            }
        }
    )
    form_schemas['invoice'] = invoice_form
    print(f"  {'✓' if created else '→'} Manual Invoice Generation Form")
    
    # ========================================================================
    # 2. VENDOR INVOICE SUBMISSION (Accounts Payable)
    # ========================================================================
    vendor_invoice_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Vendor Invoice Submission Form',
        defaults={
            'description': 'Submit vendor invoice for 3-way match and payment',
            'trigger_event_name': 'expense.invoice_received',
            'schema': {
                'fields': [
                    {
                        'id': 'vendor_id',
                        'type': 'select',
                        'label': 'Vendor',
                        'required': True,
                        'data_source': '/api/vendors/',
                        'display_field': 'name',
                        'value_field': 'id'
                    },
                    {
                        'id': 'invoice_number',
                        'type': 'text',
                        'label': 'Invoice Number',
                        'required': True
                    },
                    {
                        'id': 'invoice_date',
                        'type': 'date',
                        'label': 'Invoice Date',
                        'required': True
                    },
                    {
                        'id': 'po_number',
                        'type': 'text',
                        'label': 'Purchase Order Number',
                        'required': True,
                        'placeholder': 'e.g., PO-20250101-0001',
                        'validation': {
                            'pattern': '^PO-\\d{8}-\\d{4}$'
                        }
                    },
                    {
                        'id': 'invoice_amount',
                        'type': 'money',
                        'label': 'Invoice Amount',
                        'required': True,
                        'validation': {'min': 0.01}
                    },
                    {
                        'id': 'line_items',
                        'type': 'repeatable',
                        'label': 'Line Items',
                        'required': True,
                        'min_items': 1,
                        'fields': [
                            {
                                'id': 'description',
                                'type': 'text',
                                'label': 'Description',
                                'required': True
                            },
                            {
                                'id': 'quantity',
                                'type': 'number',
                                'label': 'Quantity',
                                'required': True
                            },
                            {
                                'id': 'unit_price',
                                'type': 'money',
                                'label': 'Unit Price',
                                'required': True
                            },
                            {
                                'id': 'total',
                                'type': 'money',
                                'label': 'Total',
                                'computed': 'quantity * unit_price',
                                'readonly': True
                            }
                        ]
                    },
                    {
                        'id': 'invoice_attachment',
                        'type': 'file',
                        'label': 'Invoice Attachment',
                        'required': True,
                        'accept': '.pdf,.jpg,.png',
                        'max_size': 5242880  # 5MB
                    }
                ]
            }
        }
    )
    form_schemas['vendor_invoice'] = vendor_invoice_form
    print(f"  {'✓' if created else '→'} Vendor Invoice Submission Form")
    
    # ========================================================================
    # 3. PAYROLL INPUT FORM (HR Changes)
    # ========================================================================
    payroll_changes_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Payroll Changes Form',
        defaults={
            'description': 'Submit monthly payroll changes (new hires, terminations, salary changes)',
            'trigger_event_name': 'payroll.changes_submitted',
            'schema': {
                'fields': [
                    {
                        'id': 'pay_period',
                        'type': 'month',
                        'label': 'Pay Period',
                        'required': True
                    },
                    {
                        'id': 'new_hires',
                        'type': 'repeatable',
                        'label': 'New Hires',
                        'required': False,
                        'fields': [
                            {
                                'id': 'staff_id',
                                'type': 'text',
                                'label': 'Staff ID',
                                'required': True
                            },
                            {
                                'id': 'name',
                                'type': 'text',
                                'label': 'Full Name',
                                'required': True
                            },
                            {
                                'id': 'start_date',
                                'type': 'date',
                                'label': 'Start Date',
                                'required': True
                            },
                            {
                                'id': 'gross_salary',
                                'type': 'money',
                                'label': 'Gross Salary',
                                'required': True
                            },
                            {
                                'id': 'bank_account',
                                'type': 'text',
                                'label': 'Bank Account',
                                'required': True
                            }
                        ]
                    },
                    {
                        'id': 'terminations',
                        'type': 'repeatable',
                        'label': 'Terminations',
                        'required': False,
                        'fields': [
                            {
                                'id': 'staff_id',
                                'type': 'select',
                                'label': 'Staff',
                                'required': True,
                                'data_source': '/api/staff/?status=ACTIVE'
                            },
                            {
                                'id': 'last_day',
                                'type': 'date',
                                'label': 'Last Working Day',
                                'required': True
                            },
                            {
                                'id': 'final_payment_amount',
                                'type': 'money',
                                'label': 'Final Payment Amount',
                                'required': True
                            }
                        ]
                    },
                    {
                        'id': 'salary_changes',
                        'type': 'repeatable',
                        'label': 'Salary Changes',
                        'required': False,
                        'fields': [
                            {
                                'id': 'staff_id',
                                'type': 'select',
                                'label': 'Staff',
                                'required': True,
                                'data_source': '/api/staff/?status=ACTIVE'
                            },
                            {
                                'id': 'new_salary',
                                'type': 'money',
                                'label': 'New Gross Salary',
                                'required': True
                            },
                            {
                                'id': 'effective_date',
                                'type': 'date',
                                'label': 'Effective Date',
                                'required': True
                            }
                        ]
                    },
                    {
                        'id': 'overtime',
                        'type': 'repeatable',
                        'label': 'Overtime Hours',
                        'required': False,
                        'fields': [
                            {
                                'id': 'staff_id',
                                'type': 'select',
                                'label': 'Staff',
                                'required': True,
                                'data_source': '/api/staff/?status=ACTIVE'
                            },
                            {
                                'id': 'hours',
                                'type': 'number',
                                'label': 'Overtime Hours',
                                'required': True,
                                'validation': {'min': 0, 'max': 100}
                            },
                            {
                                'id': 'rate',
                                'type': 'money',
                                'label': 'Hourly Rate',
                                'required': True
                            }
                        ]
                    },
                    {
                        'id': 'notes',
                        'type': 'textarea',
                        'label': 'Additional Notes',
                        'required': False
                    }
                ]
            }
        }
    )
    form_schemas['payroll_changes'] = payroll_changes_form
    print(f"  {'✓' if created else '→'} Payroll Changes Form")
    
    # ========================================================================
    # 4. ASSET ACQUISITION FORM
    # ========================================================================
    asset_acquisition_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Asset Acquisition Form',
        defaults={
            'description': 'Register new fixed asset acquisition',
            'trigger_event_name': 'asset.purchase_complete',
            'schema': {
                'fields': [
                    {
                        'id': 'category',
                        'type': 'select',
                        'label': 'Asset Category',
                        'required': True,
                        'options': [
                            {'value': 'FURNITURE', 'label': 'Furniture'},
                            {'value': 'EQUIPMENT', 'label': 'Equipment'},
                            {'value': 'COMPUTERS', 'label': 'Computers & IT'},
                            {'value': 'VEHICLES', 'label': 'Vehicles'},
                            {'value': 'BUILDINGS', 'label': 'Buildings'},
                            {'value': 'LAND', 'label': 'Land'}
                        ]
                    },
                    {
                        'id': 'description',
                        'type': 'textarea',
                        'label': 'Asset Description',
                        'required': True,
                        'placeholder': 'Detailed description of the asset'
                    },
                    {
                        'id': 'cost',
                        'type': 'money',
                        'label': 'Purchase Cost',
                        'required': True,
                        'validation': {'min': 0.01}
                    },
                    {
                        'id': 'date',
                        'type': 'date',
                        'label': 'Acquisition Date',
                        'required': True
                    },
                    {
                        'id': 'location',
                        'type': 'select',
                        'label': 'Initial Location',
                        'required': True,
                        'options': [
                            {'value': 'ADMIN_BLOCK', 'label': 'Administration Block'},
                            {'value': 'LIBRARY', 'label': 'Library'},
                            {'value': 'LAB_1', 'label': 'Science Lab 1'},
                            {'value': 'LAB_2', 'label': 'Science Lab 2'},
                            {'value': 'IT_LAB', 'label': 'IT Lab'},
                            {'value': 'STORAGE', 'label': 'Storage Room'},
                            {'value': 'CLASSROOM_1', 'label': 'Classroom Block 1'},
                            {'value': 'CLASSROOM_2', 'label': 'Classroom Block 2'}
                        ]
                    },
                    {
                        'id': 'supplier',
                        'type': 'text',
                        'label': 'Supplier Name',
                        'required': True
                    },
                    {
                        'id': 'invoice_number',
                        'type': 'text',
                        'label': 'Invoice/Receipt Number',
                        'required': True
                    },
                    {
                        'id': 'depreciation_method',
                        'type': 'select',
                        'label': 'Depreciation Method',
                        'required': True,
                        'options': [
                            {'value': 'STRAIGHT_LINE', 'label': 'Straight Line'},
                            {'value': 'DECLINING_BALANCE', 'label': 'Declining Balance'},
                            {'value': 'NONE', 'label': 'No Depreciation (Land)'}
                        ]
                    },
                    {
                        'id': 'useful_life',
                        'type': 'number',
                        'label': 'Useful Life (Years)',
                        'required': True,
                        'validation': {'min': 1, 'max': 50}
                    },
                    {
                        'id': 'serial_number',
                        'type': 'text',
                        'label': 'Serial Number',
                        'required': False
                    },
                    {
                        'id': 'warranty_expiry',
                        'type': 'date',
                        'label': 'Warranty Expiry Date',
                        'required': False
                    }
                ]
            }
        }
    )
    form_schemas['asset_acquisition'] = asset_acquisition_form
    print(f"  {'✓' if created else '→'} Asset Acquisition Form")
    
    # ========================================================================
    # 5. STOCK ISSUANCE FORM
    # ========================================================================
    stock_issuance_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Stock Issuance Form',
        defaults={
            'description': 'Issue stock items (uniforms, textbooks) to students or departments',
            'trigger_event_name': 'inventory.stock_issued',
            'schema': {
                'fields': [
                    {
                        'id': 'issue_to_type',
                        'type': 'select',
                        'label': 'Issue To',
                        'required': True,
                        'options': [
                            {'value': 'STUDENT', 'label': 'Student'},
                            {'value': 'DEPARTMENT', 'label': 'Department'},
                            {'value': 'STAFF', 'label': 'Staff Member'}
                        ]
                    },
                    {
                        'id': 'recipient_id',
                        'type': 'select',
                        'label': 'Recipient',
                        'required': True,
                        'data_source_dynamic': True,
                        'depends_on': 'issue_to_type'
                    },
                    {
                        'id': 'items',
                        'type': 'repeatable',
                        'label': 'Items to Issue',
                        'required': True,
                        'min_items': 1,
                        'fields': [
                            {
                                'id': 'item_id',
                                'type': 'select',
                                'label': 'Item',
                                'required': True,
                                'data_source': '/api/inventory/items/?quantity_on_hand__gt=0',
                                'display_field': 'name',
                                'value_field': 'id'
                            },
                            {
                                'id': 'quantity',
                                'type': 'number',
                                'label': 'Quantity',
                                'required': True,
                                'validation': {'min': 1}
                            },
                            {
                                'id': 'unit_cost',
                                'type': 'money',
                                'label': 'Unit Cost',
                                'required': False,
                                'readonly': True
                            }
                        ]
                    },
                    {
                        'id': 'purpose',
                        'type': 'textarea',
                        'label': 'Purpose/Reason',
                        'required': True
                    },
                    {
                        'id': 'return_expected',
                        'type': 'checkbox',
                        'label': 'Items Expected to be Returned',
                        'required': False,
                        'default': False
                    },
                    {
                        'id': 'expected_return_date',
                        'type': 'date',
                        'label': 'Expected Return Date',
                        'required': False,
                        'show_if': 'return_expected == true'
                    }
                ]
            }
        }
    )
    form_schemas['stock_issuance'] = stock_issuance_form
    print(f"  {'✓' if created else '→'} Stock Issuance Form")
    
    # ========================================================================
    # 6. BANK RECONCILIATION FORM
    # ========================================================================
    bank_recon_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Bank Reconciliation Form',
        defaults={
            'description': 'Reconcile bank statement with book records',
            'trigger_event_name': 'finance.bank_reconciliation_submitted',
            'schema': {
                'fields': [
                    {
                        'id': 'bank_account',
                        'type': 'select',
                        'label': 'Bank Account',
                        'required': True,
                        'data_source': '/api/accounts/?account_type=BANK',
                        'display_field': 'name',
                        'value_field': 'id'
                    },
                    {
                        'id': 'statement_date',
                        'type': 'date',
                        'label': 'Statement Date',
                        'required': True
                    },
                    {
                        'id': 'statement_balance',
                        'type': 'money',
                        'label': 'Statement Closing Balance',
                        'required': True
                    },
                    {
                        'id': 'book_balance',
                        'type': 'money',
                        'label': 'Book Balance',
                        'required': True,
                        'readonly': True
                    },
                    {
                        'id': 'unpresented_checks',
                        'type': 'repeatable',
                        'label': 'Unpresented Checks',
                        'required': False,
                        'fields': [
                            {
                                'id': 'check_number',
                                'type': 'text',
                                'label': 'Check Number',
                                'required': True
                            },
                            {
                                'id': 'payee',
                                'type': 'text',
                                'label': 'Payee',
                                'required': True
                            },
                            {
                                'id': 'amount',
                                'type': 'money',
                                'label': 'Amount',
                                'required': True
                            },
                            {
                                'id': 'date',
                                'type': 'date',
                                'label': 'Check Date',
                                'required': True
                            }
                        ]
                    },
                    {
                        'id': 'deposits_in_transit',
                        'type': 'repeatable',
                        'label': 'Deposits in Transit',
                        'required': False,
                        'fields': [
                            {
                                'id': 'date',
                                'type': 'date',
                                'label': 'Deposit Date',
                                'required': True
                            },
                            {
                                'id': 'amount',
                                'type': 'money',
                                'label': 'Amount',
                                'required': True
                            },
                            {
                                'id': 'reference',
                                'type': 'text',
                                'label': 'Reference',
                                'required': False
                            }
                        ]
                    },
                    {
                        'id': 'bank_charges',
                        'type': 'money',
                        'label': 'Bank Charges (if any)',
                        'required': False,
                        'default': 0
                    },
                    {
                        'id': 'bank_interest',
                        'type': 'money',
                        'label': 'Bank Interest (if any)',
                        'required': False,
                        'default': 0
                    },
                    {
                        'id': 'statement_file',
                        'type': 'file',
                        'label': 'Bank Statement (PDF)',
                        'required': True,
                        'accept': '.pdf',
                        'max_size': 10485760  # 10MB
                    }
                ]
            }
        }
    )
    form_schemas['bank_recon'] = bank_recon_form
    print(f"  {'✓' if created else '→'} Bank Reconciliation Form")
    
    # ========================================================================
    # 7. STUDENT ENROLLMENT FORM
    # ========================================================================
    student_enrollment_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Student Enrollment Form',
        defaults={
            'description': 'Enroll new student and create client record',
            'trigger_event_name': 'student.enrollment_completed',
            'schema': {
                'fields': [
                    {
                        'id': 'student_first_name',
                        'type': 'text',
                        'label': 'First Name',
                        'required': True
                    },
                    {
                        'id': 'student_last_name',
                        'type': 'text',
                        'label': 'Last Name',
                        'required': True
                    },
                    {
                        'id': 'date_of_birth',
                        'type': 'date',
                        'label': 'Date of Birth',
                        'required': True,
                        'validation': {'max': 'today'}
                    },
                    {
                        'id': 'gender',
                        'type': 'select',
                        'label': 'Gender',
                        'required': True,
                        'options': [
                            {'value': 'M', 'label': 'Male'},
                            {'value': 'F', 'label': 'Female'}
                        ]
                    },
                    {
                        'id': 'grade',
                        'type': 'select',
                        'label': 'Grade/Class',
                        'required': True,
                        'options': [
                            {'value': 'GRADE_1', 'label': 'Grade 1'},
                            {'value': 'GRADE_2', 'label': 'Grade 2'},
                            {'value': 'GRADE_3', 'label': 'Grade 3'},
                            {'value': 'GRADE_4', 'label': 'Grade 4'},
                            {'value': 'GRADE_5', 'label': 'Grade 5'},
                            {'value': 'GRADE_6', 'label': 'Grade 6'},
                            {'value': 'GRADE_7', 'label': 'Grade 7'},
                            {'value': 'GRADE_8', 'label': 'Grade 8'}
                        ]
                    },
                    {
                        'id': 'stream',
                        'type': 'select',
                        'label': 'Stream',
                        'required': False,
                        'options': [
                            {'value': 'A', 'label': 'Stream A'},
                            {'value': 'B', 'label': 'Stream B'},
                            {'value': 'C', 'label': 'Stream C'}
                        ]
                    },
                    {
                        'id': 'parent_first_name',
                        'type': 'text',
                        'label': 'Parent/Guardian First Name',
                        'required': True
                    },
                    {
                        'id': 'parent_last_name',
                        'type': 'text',
                        'label': 'Parent/Guardian Last Name',
                        'required': True
                    },
                    {
                        'id': 'parent_email',
                        'type': 'email',
                        'label': 'Parent Email',
                        'required': True
                    },
                    {
                        'id': 'parent_phone',
                        'type': 'tel',
                        'label': 'Parent Phone',
                        'required': True
                    },
                    {
                        'id': 'address',
                        'type': 'textarea',
                        'label': 'Home Address',
                        'required': True
                    },
                    {
                        'id': 'emergency_contact_name',
                        'type': 'text',
                        'label': 'Emergency Contact Name',
                        'required': True
                    },
                    {
                        'id': 'emergency_contact_phone',
                        'type': 'tel',
                        'label': 'Emergency Contact Phone',
                        'required': True
                    },
                    {
                        'id': 'medical_conditions',
                        'type': 'textarea',
                        'label': 'Medical Conditions/Allergies',
                        'required': False,
                        'placeholder': 'List any medical conditions, allergies, or special needs'
                    },
                    {
                        'id': 'enrollment_date',
                        'type': 'date',
                        'label': 'Enrollment Date',
                        'required': True,
                        'default': 'today'
                    }
                ]
            }
        }
    )
    form_schemas['student_enrollment'] = student_enrollment_form
    print(f"  {'✓' if created else '→'} Student Enrollment Form")
    
    # ========================================================================
    # 8. DEBTOR FOLLOW-UP FORM (Manual)
    # ========================================================================
    debtor_followup_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Debtor Follow-up Form',
        defaults={
            'description': 'Log manual follow-up action for overdue accounts',
            'trigger_event_name': 'finance.debtor_followup_logged',
            'schema': {
                'fields': [
                    {
                        'id': 'student_id',
                        'type': 'select',
                        'label': 'Student',
                        'required': True,
                        'data_source': '/api/clients/?classification=STUDENT&balance__gt=0',
                        'display_field': 'full_name',
                        'value_field': 'id'
                    },
                    {
                        'id': 'follow_up_type',
                        'type': 'select',
                        'label': 'Follow-up Method',
                        'required': True,
                        'options': [
                            {'value': 'PHONE_CALL', 'label': 'Phone Call'},
                            {'value': 'EMAIL', 'label': 'Email'},
                            {'value': 'SMS', 'label': 'SMS'},
                            {'value': 'IN_PERSON', 'label': 'In-Person Meeting'},
                            {'value': 'LETTER', 'label': 'Written Letter'}
                        ]
                    },
                    {
                        'id': 'contact_person',
                        'type': 'text',
                        'label': 'Person Contacted',
                        'required': True
                    },
                    {
                        'id': 'contact_date',
                        'type': 'datetime',
                        'label': 'Contact Date & Time',
                        'required': True,
                        'default': 'now'
                    },
                    {
                        'id': 'outcome',
                        'type': 'select',
                        'label': 'Outcome',
                        'required': True,
                        'options': [
                            {'value': 'PROMISED_PAYMENT', 'label': 'Promised Payment'},
                            {'value': 'PAYMENT_PLAN_AGREED', 'label': 'Payment Plan Agreed'},
                            {'value': 'DISPUTE_RAISED', 'label': 'Dispute Raised'},
                            {'value': 'NO_RESPONSE', 'label': 'No Response'},
                            {'value': 'PARTIAL_PAYMENT', 'label': 'Partial Payment Made'},
                            {'value': 'FULL_PAYMENT', 'label': 'Full Payment Made'}
                        ]
                    },
                    {
                        'id': 'promise_date',
                        'type': 'date',
                        'label': 'Promised Payment Date',
                        'required': False,
                        'show_if': 'outcome == PROMISED_PAYMENT'
                    },
                    {
                        'id': 'amount_promised',
                        'type': 'money',
                        'label': 'Amount Promised',
                        'required': False,
                        'show_if': 'outcome == PROMISED_PAYMENT || outcome == PAYMENT_PLAN_AGREED'
                    },
                    {
                        'id': 'notes',
                        'type': 'textarea',
                        'label': 'Detailed Notes',
                        'required': True,
                        'placeholder': 'Record conversation details, commitments, and next steps'
                    },
                    {
                        'id': 'next_action',
                        'type': 'select',
                        'label': 'Next Action',
                        'required': True,
                        'options': [
                            {'value': 'WAIT_FOR_PAYMENT', 'label': 'Wait for Payment'},
                            {'value': 'FOLLOW_UP_AGAIN', 'label': 'Follow Up Again'},
                            {'value': 'ESCALATE_TO_PRINCIPAL', 'label': 'Escalate to Principal'},
                            {'value': 'LEGAL_ACTION', 'label': 'Consider Legal Action'},
                            {'value': 'CLOSED', 'label': 'Close Case (Resolved)'}
                        ]
                    },
                    {
                        'id': 'next_follow_up_date',
                        'type': 'date',
                        'label': 'Next Follow-up Date',
                        'required': False,
                        'show_if': 'next_action == FOLLOW_UP_AGAIN'
                    }
                ]
            }
        }
    )
    form_schemas['debtor_followup'] = debtor_followup_form
    print(f"  {'✓' if created else '→'} Debtor Follow-up Form")
    
    # ========================================================================
    # 9. BUDGET ALLOCATION FORM
    # ========================================================================
    budget_allocation_form, created = FormSchema.objects.get_or_create(
        owner=owner,
        branch=branch,
        name='Budget Allocation Form',
        defaults={
            'description': 'Create or update budget allocations',
            'trigger_event_name': 'finance.budget_allocated',
            'schema': {
                'fields': [
                    {
                        'id': 'fiscal_year',
                        'type': 'select',
                        'label': 'Fiscal Year',
                        'required': True,
                        'options': [
                            {'value': '2024', 'label': '2024'},
                            {'value': '2025', 'label': '2025'},
                            {'value': '2026', 'label': '2026'}
                        ]
                    },
                    {
                        'id': 'department',
                        'type': 'select',
                        'label': 'Department',
                        'required': True,
                        'options': [
                            {'value': 'ADMIN', 'label': 'Administration'},
                            {'value': 'TEACHING', 'label': 'Teaching'},
                            {'value': 'MAINTENANCE', 'label': 'Maintenance'},
                            {'value': 'IT', 'label': 'IT Department'},
                            {'value': 'SPORTS', 'label': 'Sports & Extra-curricular'}
                        ]
                    },
                    {
                        'id': 'budget_lines',
                        'type': 'repeatable',
                        'label': 'Budget Lines',
                        'required': True,
                        'min_items': 1,
                        'fields': [
                            {
                                'id': 'code',
                                'type': 'text',
                                'label': 'Budget Code',
                                'required': True,
                                'placeholder': 'e.g., ADMIN-2025-001'
                            },
                            {
                                'id': 'description',
                                'type': 'text',
                                'label': 'Description',
                                'required': True
                            },
                            {
                                'id': 'allocated_amount',
                                'type': 'money',
                                'label': 'Allocated Amount',
                                'required': True,
                                'validation': {'min': 0.01}
                            },
                            {
                                'id': 'category',
                                'type': 'select',
                                'label': 'Category',
                                'required': True,
                                'options': [
                                    {'value': 'SALARIES', 'label': 'Salaries'},
                                    {'value': 'SUPPLIES', 'label': 'Supplies'},
                                    {'value': 'EQUIPMENT', 'label': 'Equipment'},
                                    {'value': 'MAINTENANCE', 'label': 'Maintenance'},
                                    {'value': 'UTILITIES', 'label': 'Utilities'},
                                    {'value': 'OTHER', 'label': 'Other'}
                                ]
                            }
                        ]
                    },
                    {
                        'id': 'total_budget',
                        'type': 'money',
                        'label': 'Total Budget',
                        'required': False,
                        'readonly': True,
                        'computed': 'SUM(budget_lines.allocated_amount)'
                    },
                    {
                        'id': 'justification',
                        'type': 'textarea',
                        'label': 'Budget Justification',
                        'required': True
                    }
                ]
            }
        }
    )
    form_schemas['budget_allocation'] = budget_allocation_form
    print(f"  {'✓' if created else '→'} Budget Allocation Form")
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "="*80)
    print("✅ ADDITIONAL FORM SCHEMAS CREATED")
    print("="*80)
    print(f"\nTotal: {len(form_schemas)} new form schemas")
    print("\n📋 Forms Created:")
    for key, form in form_schemas.items():
        print(f"   • {form.name}")
        print(f"     Event: {form.trigger_event_name}")
    
    return form_schemas


# ============================================================================
# CREATE MODULE PAGES FOR NEW FORMS
# ============================================================================

@transaction.atomic
def create_pages_for_additional_forms(owner, branch, form_schemas, modules):
    """
    Create ModulePage entries for all the new form schemas
    """
    print("\n" + "="*80)
    print("📄 CREATING MODULE PAGES FOR NEW FORMS")
    print("="*80 + "\n")
    
    pages = {}
    
    # Invoice Generation Page
    invoice_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='generate-invoice',
        defaults={
            'title': 'Generate Invoice',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['invoice'].id),
                'success_url': '/students/list'
            },
            'show_in_menu': True,
            'order': 5
        }
    )
    pages['invoice'] = invoice_page
    print(f"  {'✓' if created else '→'} Finance → Generate Invoice")
    
    # Vendor Invoice Page
    vendor_invoice_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['procurement'],
        code='vendor-invoice',
        defaults={
            'title': 'Submit Vendor Invoice',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['vendor_invoice'].id),
                'success_url': '/procurement/dashboard'
            },
            'show_in_menu': True,
            'order': 4
        }
    )
    pages['vendor_invoice'] = vendor_invoice_page
    print(f"  {'✓' if created else '→'} Procurement → Vendor Invoice")
    
    # Payroll Changes Page
    payroll_changes_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['payroll'],
        code='payroll-changes',
        defaults={
            'title': 'Submit Payroll Changes',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['payroll_changes'].id),
                'success_url': '/payroll/dashboard'
            },
            'show_in_menu': True,
            'order': 2
        }
    )
    pages['payroll_changes'] = payroll_changes_page
    print(f"  {'✓' if created else '→'} Payroll → Payroll Changes")
    
    # Asset Acquisition Page
    asset_acquisition_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['assets'],
        code='asset-acquisition',
        defaults={
            'title': 'Register New Asset',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['asset_acquisition'].id),
                'success_url': '/assets/register'
            },
            'show_in_menu': True,
            'order': 4
        }
    )
    pages['asset_acquisition'] = asset_acquisition_page
    print(f"  {'✓' if created else '→'} Assets → Register New Asset")
    
    # Stock Issuance Page
    stock_issuance_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['inventory'],
        code='issue-stock',
        defaults={
            'title': 'Issue Stock',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['stock_issuance'].id),
                'success_url': '/inventory/dashboard'
            },
            'show_in_menu': True,
            'order': 4
        }
    )
    pages['stock_issuance'] = stock_issuance_page
    print(f"  {'✓' if created else '→'} Inventory → Issue Stock")
    
    # Bank Reconciliation Page
    bank_recon_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='bank-reconciliation',
        defaults={
            'title': 'Bank Reconciliation',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['bank_recon'].id),
                'success_url': '/finance/dashboard'
            },
            'show_in_menu': True,
            'order': 6
        }
    )
    pages['bank_recon'] = bank_recon_page
    print(f"  {'✓' if created else '→'} Finance → Bank Reconciliation")
    
    # Student Enrollment Page
    enrollment_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['students'],
        code='enroll-student',
        defaults={
            'title': 'Enroll New Student',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['student_enrollment'].id),
                'success_url': '/students/list'
            },
            'show_in_menu': True,
            'order': 3
        }
    )
    pages['enrollment'] = enrollment_page
    print(f"  {'✓' if created else '→'} Students → Enroll New Student")
    
    # Debtor Follow-up Page
    debtor_followup_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='debtor-followup',
        defaults={
            'title': 'Log Debtor Follow-up',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['debtor_followup'].id),
                'success_url': '/finance/debtor-aging'
            },
            'show_in_menu': True,
            'order': 7
        }
    )
    pages['debtor_followup'] = debtor_followup_page
    print(f"  {'✓' if created else '→'} Finance → Debtor Follow-up")
    
    # Budget Allocation Page
    budget_page, created = ModulePage.objects.get_or_create(
        owner=owner,
        branch=branch,
        module=modules['finance'],
        code='budget-allocation',
        defaults={
            'title': 'Budget Allocation',
            'page_type': 'form',
            'page_config': {
                'form_schema_id': str(form_schemas['budget_allocation'].id),
                'success_url': '/finance/dashboard'
            },
            'show_in_menu': True,
            'order': 8
        }
    )
    pages['budget'] = budget_page
    print(f"  {'✓' if created else '→'} Finance → Budget Allocation")
    
    print("\n✅ All module pages created!\n")
    
    return pages