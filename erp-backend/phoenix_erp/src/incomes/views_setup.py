# incomes/views_setup.py
"""
Unified setup views for fee structures and accounting configuration
Single endpoint for frontend to create everything at once
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.db import transaction
from drf_spectacular.utils import extend_schema, OpenApiExample
from drf_spectacular.types import OpenApiTypes
import logging

from common.views import ScopedModelViewSet
from .services.fee_setup_service import FeeSetupService
from .serializers_setup import (
    FeeStructureSetupSerializer,
    FeeStructureSetupResponseSerializer,
    AccountingConfigSetupSerializer,
    AccountingConfigResponseSerializer
)

logger = logging.getLogger(__name__)


class FeeStructureSetupView(APIView):
    """
    Unified fee structure setup endpoint
    
    Creates complete fee configuration including:
    - Parent GL account (if missing)
    - Child GL account (income account)
    - Income category
    - Fee structure
    
    This is the ONE endpoint frontend needs to call.
    Similar to UnifiedAccountCreationPage but for fees.
    """
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Setup Complete Fee Structure",
        description="""
        **One-stop endpoint for creating fee structures with all dependencies**
        
        This endpoint automatically:
        1. Creates parent GL account if it doesn't exist (e.g., "Total Income")
        2. Creates child GL account for this specific fee (e.g., "Grade 1 Tuition Income")
        3. Creates income category linking to the GL account
        4. Creates fee structure with payment terms
        5. Returns everything the frontend needs
        
        **Key Features:**
        - Rugged: Handles missing parent accounts automatically
        - Accurate: Validates all data before creating anything
        - Atomic: All-or-nothing transaction (rollback on any error)
        - No Signal Triggers: Child accounts don't create extra workflows
        - Parent accounts DO trigger form/workflow generation
        
        **Use Cases:**
        - School: Create "Grade 1 Tuition Fees" with automatic GL setup
        - Hospital: Create "Consultation Fees" with income tracking
        - Gym: Create "Monthly Membership" with payment terms
        - SaaS: Create "Premium Subscription" with partial payment support
        
        **Example Request:**
        ```json
        {
            "name": "Grade 1 Tuition Fees",
            "code": "G1TUT",
            "base_amount": 10000.00,
            "description": "Annual tuition for Grade 1 students",
            "income_account": {
                "create_new": true,
                "name": "Grade 1 Tuition Income",
                "code": "401-001",
                "parent_code": "400",
                "parent_name": "Total Income"
            },
            "payment_terms": {
                "allows_partial": true,
                "minimum_percent": 50,
                "requires_invoice": true,
                "full_access_at_percent": 50
            },
            "fee_components": [
                {"name": "Tuition", "amount": 8000.00, "is_mandatory": true},
                {"name": "Books", "amount": 1500.00, "is_mandatory": true},
                {"name": "Uniform", "amount": 500.00, "is_mandatory": false}
            ]
        }
        ```
        
        **Workflow:**
        1. Frontend collects fee details in ONE form (like UnifiedAccountCreationPage)
        2. Frontend calls this endpoint with complete data
        3. Backend creates all accounts, categories, and structures
        4. Frontend receives complete setup result
        5. User can immediately start using the fee structure
        
        **Important Notes:**
        - Child accounts are created WITHOUT triggering signals (no extra workflows)
        - Parent accounts ARE created WITH signals (forms/workflows generated)
        - If accounting config doesn't exist, response includes `needs_config: true`
        - Frontend should then prompt user to configure default accounts
        """,
        request=FeeStructureSetupSerializer,
        responses={
            201: FeeStructureSetupResponseSerializer,
            400: OpenApiTypes.OBJECT,
            401: OpenApiTypes.OBJECT,
            500: OpenApiTypes.OBJECT,
        },
        examples=[
            OpenApiExample(
                name='Success Response',
                value={
                    "success": True,
                    "message": "Fee structure created successfully",
                    "fee_structure": {
                        "id": 1,
                        "name": "Grade 1 Tuition Fees",
                        "code": "G1TUT",
                        "base_amount": "10000.00"
                    },
                    "income_category": {
                        "id": 1,
                        "name": "Grade 1 Tuition Fees",
                        "code": "G1TUT"
                    },
                    "income_account": {
                        "id": 2,
                        "code": "401-001",
                        "name": "Grade 1 Tuition Income",
                        "account_type": "INCOME"
                    },
                    "parent_account": {
                        "id": 1,
                        "code": "400",
                        "name": "Total Income"
                    },
                    "created_accounts": ["400 - Total Income", "401-001 - Grade 1 Tuition Income"],
                    "needs_config": False
                },
                response_only=True,
                status_codes=['201']
            )
        ],
        tags=['Income Setup']
    )
    def post(self, request):
        """Create complete fee structure with GL accounts"""
        serializer = FeeStructureSetupSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {
                    'success': False,
                    'message': 'Validation failed',
                    'errors': serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Validate before processing
            from .services.fee_setup_service import FeeSetupService
            is_valid, errors = FeeSetupService.validate_fee_setup_data(serializer.validated_data)
            
            if not is_valid:
                return Response(
                    {
                        'success': False,
                        'message': 'Validation failed',
                        'errors': errors
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create everything in one transaction
            result = FeeSetupService.setup_fee_structure(
                owner=request.user,
                branch=request.user.branch,
                user=request.user,
                fee_data=serializer.validated_data,
                auto_create_accounts=True
            )
            
            # Format created accounts list
            created_account_names = [
                f"{acc.code} - {acc.name}"
                for acc in result['created_accounts']
            ]
            
            # Build response
            response_data = {
                'success': True,
                'message': 'Fee structure created successfully',
                'fee_structure': result.get('fee_structure'),
                'income_category': result.get('income_category'),
                'income_account': result.get('income_account'),
                'created_accounts': created_account_names,
                'needs_config': result.get('needs_config', False)
            }
            
            # Serialize response
            response_serializer = FeeStructureSetupResponseSerializer(response_data)
            
            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED
            )
            
        except Exception as e:
            logger.error(f"Error in fee structure setup: {str(e)}", exc_info=True)
            return Response(
                {
                    'success': False,
                    'message': str(e),
                    'errors': [str(e)]
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AccountingConfigSetupView(APIView):
    """
    Setup income accounting configuration
    
    Required once per branch/owner to enable payment processing.
    Links default GL accounts for cash, AR, and payment methods.
    """
    @extend_schema(
        summary="Setup Income Accounting Configuration",
        description="""
        **Configure default GL accounts for income/payment processing**
        
        This configuration is required ONCE per branch/owner before processing any payments.
        It tells the system which GL accounts to use for:
        - Cash receipts
        - Accounts Receivable
        - Bank transfers
        - Mobile money payments
        
        **When to call this:**
        - After fee structure setup if `needs_config: true`
        - During initial system setup
        - When changing default accounts
        
        **What it does:**
        - Validates all account IDs exist and are correct type
        - Creates/updates configuration
        - Enables automatic journal entry creation on payments
        
        **Example Request:**
        ```json
        {
            "cash_account_id": 101,
            "ar_account_id": 102,
            "bank_transfer_account_id": 103,
            "mobile_money_account_id": 104
        }
        ```
        
        **Account Requirements:**
        - cash_account_id: Must be ASSET type (e.g., "Cash on Hand")
        - ar_account_id: Must be ASSET type (e.g., "Accounts Receivable")
        - bank_transfer_account_id: Must be ASSET/BANK type
        - mobil=AccountingConfigSetupSerializer,
        responses={
            201: AccountingConfigResponseSerializer,
            400: OpenApiTypes.OBJECT,
            401: OpenApiTypes.OBJECT,
            400: "Invalid account IDs or validation error",
            401: "Authentication required"
        },
        tags=['Income Setup']
        """
    )
    def post(self, request):
        """Create or update accounting configuration"""
        serializer = AccountingConfigSetupSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {
                    'success': False,
                    'message': 'Validation failed',
                    'errors': serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from .services.fee_setup_service import FeeSetupService
            
            config = FeeSetupService.setup_accounting_config(
                owner=request.user,
                branch=request.user.branch,
                user=request.user,
                **serializer.validated_data
            )
            
            response_serializer = AccountingConfigResponseSerializer(config)
            
            return Response(
                {
                    'success': True,
                    'message': 'Accounting configuration saved successfully',
                    'config': response_serializer.data
                },
                status=status.HTTP_201_CREATED
            )
            
        except Exception as e:
            logger.error(f"Error setting up accounting config: {str(e)}", exc_info=True)
            return Response(
                {
                    'success': False,
                    'message': str(e),
                    'errors': [str(e)]
                },
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @extend_schema(
        summary="Get Current Accounting Configuration",
        description="Retrieve current income accounting configuration for the branch/owner",
        responses={
            200: AccountingConfigResponseSerializer,
            404: OpenApiTypes.OBJECT,
        },
        tags=['Income Setup']
    )
    def get(self, request):
        """Get current configuration"""
        try:
            from .models_config import IncomeAccountingConfig
            
            config = IncomeAccountingConfig.objects.get(
                owner=request.user,
                branch=request.user.branch
            )
            
            serializer = AccountingConfigResponseSerializer(config)
            
            return Response(
                {
                    'success': True,
                    'config': serializer.data
                },
                status=status.HTTP_200_OK
            )
            
        except Exception as e:
            return Response(
                {
                    'success': False,
                    'message': 'Configuration not found',
                    'needs_setup': True
                },
                status=status.HTTP_404_NOT_FOUND
            )
