# common/error_handlers.py
"""
Global error handlers to convert 500 errors into meaningful 400 validation errors
"""
from django.db import IntegrityError, DatabaseError
from django.core.exceptions import ValidationError as DjangoValidationError, FieldError, ObjectDoesNotExist
from rest_framework.views import exception_handler
from rest_framework.exceptions import ValidationError, APIException
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler that converts database errors to validation errors.
    
    This prevents 500 errors from reaching the frontend by converting:
    - IntegrityError → 400 ValidationError
    - DatabaseError → 400 ValidationError
    - AttributeError (missing fields) → 400 ValidationError
    - Other exceptions → Logged and converted to generic 400/500
    """
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)

    # If DRF handled it, return that response
    if response is not None:
        return response

    # Handle IntegrityError (unique constraints, foreign keys, etc.)
    if isinstance(exc, IntegrityError):
        error_message = str(exc)
        
        # Always log the raw error so it is visible in server logs
        logger.error(f"IntegrityError (unique constraint): {error_message}", exc_info=True)

        # Extract meaningful error messages
        if 'unique constraint' in error_message.lower() or 'duplicate key' in error_message.lower():
            if 'invoice_number' in error_message.lower():
                # Extract the conflicting value when postgres includes it in the detail
                import re
                match = re.search(r'Key \(invoice_number\)=\(([^)]+)\)', error_message)
                conflict_value = match.group(1) if match else 'unknown'
                return Response({
                    'error': 'Invoice number conflict.',
                    'non_field_errors': [
                        f'An invoice with number "{conflict_value}" already exists. '
                        'The system attempted to auto-generate a new number but failed. '
                        'Please retry the request.'
                    ],
                    'detail': error_message[:400],
                    'action': 'retry'
                }, status=status.HTTP_409_CONFLICT)
            elif 'voucher_number' in error_message.lower():
                import re
                match = re.search(r'Key \(voucher_number\)=\(([^)]+)\)', error_message)
                conflict_value = match.group(1) if match else 'unknown'
                return Response({
                    'error': 'Voucher number conflict.',
                    'non_field_errors': [
                        f'A voucher with number "{conflict_value}" already exists. '
                        'The system attempted to auto-generate a new number but failed. '
                        'Please retry the request.'
                    ],
                    'detail': error_message[:400],
                    'action': 'retry'
                }, status=status.HTTP_409_CONFLICT)
            elif 'reference_number' in error_message.lower():
                return Response({
                    'error': 'Reference number conflict.',
                    'non_field_errors': ['An invoice with this reference number already exists. Please check your invoice list.'],
                    'detail': error_message[:400],
                    'action': 'check_existing'
                }, status=status.HTTP_409_CONFLICT)
            elif 'code' in error_message:
                return Response({
                    'error': 'A record with this code already exists.',
                    'code': ['A record with this code already exists in your branch.'],
                    'detail': 'Please use a different code or leave it empty.'
                }, status=status.HTTP_400_BAD_REQUEST)
            elif 'sku' in error_message:
                return Response({
                    'error': 'A record with this SKU already exists.',
                    'sku': ['A record with this SKU already exists in your branch.'],
                    'detail': 'Please use a different SKU.'
                }, status=status.HTTP_400_BAD_REQUEST)
            elif 'email' in error_message:
                return Response({
                    'error': 'This email is already registered.',
                    'email': ['This email address is already in use.'],
                    'detail': 'Please use a different email address.'
                }, status=status.HTTP_400_BAD_REQUEST)
            elif 'phone' in error_message:
                return Response({
                    'error': 'This phone number is already registered.',
                    'phone': ['This phone number is already in use.'],
                    'detail': 'Please use a different phone number.'
                }, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response({
                    'error': 'Duplicate record detected.',
                    'non_field_errors': ['A record with these details already exists.'],
                    'detail': error_message[:400]
                }, status=status.HTTP_400_BAD_REQUEST)
        
        elif 'foreign key constraint' in error_message.lower() or 'violates foreign key' in error_message.lower():
            return Response({
                'error': 'Referenced record does not exist.',
                'non_field_errors': ['One or more referenced records do not exist.'],
                'detail': 'Please ensure all related records exist before saving.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        elif 'not-null constraint' in error_message.lower() or 'null value' in error_message.lower():
            # Extract field name if possible
            field_name = 'field'
            if 'column' in error_message:
                try:
                    field_name = error_message.split('column')[1].split()[0].strip('"')
                except:
                    pass
            
            return Response({
                'error': f'Required field missing: {field_name}',
                field_name: [f'This field is required and cannot be null.'],
                'detail': 'Please provide all required fields.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        else:
            logger.error(f"IntegrityError: {error_message}", exc_info=True)
            return Response({
                'error': 'Database constraint violation.',
                'non_field_errors': ['Unable to save due to database constraints.'],
                'detail': error_message[:200]  # Truncate long messages
            }, status=status.HTTP_400_BAD_REQUEST)

    # Handle DatabaseError
    if isinstance(exc, DatabaseError):
        logger.error(f"DatabaseError: {str(exc)}", exc_info=True)
        
        # During development/debugging, show actual error
        import traceback
        from django.db import connection
        error_detail = str(exc)
        stack_trace = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        
        # Get the last SQL query that failed
        last_query = None
        try:
            if connection.queries:
                last_query = connection.queries[-1]['sql']
        except:
            pass
        
        response_data = {
            'error': 'Database error occurred.',
            'non_field_errors': ['Unable to complete database operation.'],
            'detail': error_detail,
            'debug_info': stack_trace[-2000:]  # Last 2000 chars of traceback
        }
        
        if last_query:
            response_data['sql_query'] = last_query
        
        # Check for tenant context
        from common.managers import get_current_tenant
        current_tenant = get_current_tenant()
        if current_tenant:
            response_data['current_tenant'] = {
                'id': current_tenant.id,
                'name': current_tenant.name,
                'slug': current_tenant.slug
            }
        
        return Response(response_data, status=status.HTTP_400_BAD_REQUEST)

    # Handle Django ValidationError
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, 'message_dict'):
            return Response({
                'error': 'Validation failed.',
                **exc.message_dict
            }, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({
                'error': 'Validation failed.',
                'non_field_errors': exc.messages if hasattr(exc, 'messages') else [str(exc)]
            }, status=status.HTTP_400_BAD_REQUEST)

    # Handle FieldError (invalid field names in queries)
    if isinstance(exc, FieldError):
        logger.error(f"FieldError: {str(exc)}", exc_info=True)
        return Response({
            'error': 'Invalid field in query.',
            'detail': str(exc)
        }, status=status.HTTP_400_BAD_REQUEST)

    # Handle ObjectDoesNotExist
    if isinstance(exc, ObjectDoesNotExist):
        return Response({
            'error': 'Record not found.',
            'detail': str(exc)
        }, status=status.HTTP_404_NOT_FOUND)

    # Handle AttributeError (usually missing attributes on models/users)
    if isinstance(exc, AttributeError):
        error_message = str(exc)
        logger.error(f"AttributeError: {error_message}", exc_info=True)
        
        # Common attribute errors
        if 'has no attribute' in error_message.lower():
            if "'AnonymousUser' object has no attribute" in error_message:
                return Response({
                    'error': 'Authentication required.',
                    'detail': 'You must be logged in to perform this action.'
                }, status=status.HTTP_401_UNAUTHORIZED)
            
            # Check for common code issues that should be fixed
            if "'User' object has no attribute 'owner'" in error_message:
                return Response({
                    'error': 'Internal configuration error.',
                    'detail': 'A code error was detected. Please contact support with error code: USER_OWNER_ATTR'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Check for actual missing tenant/branch info
            if "'User' object has no attribute 'branch'" in error_message or "'User' object has no attribute 'tenant'" in error_message:
                return Response({
                    'error': 'User profile incomplete.',
                    'detail': 'Your user account is missing required tenant or branch information.'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'error': 'Attribute error occurred.',
            'detail': f'An internal error occurred: {error_message}. Please contact support.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Handle TypeError
    if isinstance(exc, TypeError):
        import traceback as _tb
        error_message = str(exc)
        stack_trace = ''.join(_tb.format_exception(type(exc), exc, exc.__traceback__))
        logger.error(f"TypeError: {error_message}\n{stack_trace}", exc_info=True)
        return Response({
            'error': 'Type error occurred.',
            'detail': f'Invalid data type: {error_message}',
            '_debug': stack_trace[-3000:]  # always expose so it can be reported
        }, status=status.HTTP_400_BAD_REQUEST)

    # Handle ValueError
    if isinstance(exc, ValueError):
        error_message = str(exc)
        logger.error(f"ValueError: {error_message}", exc_info=True)
        
        if 'dictionary update sequence' in error_message:
            return Response({
                'error': 'Invalid data format.',
                'detail': 'Expected dictionary data but received incompatible format.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'error': 'Value error occurred.',
            'detail': str(exc)
        }, status=status.HTTP_400_BAD_REQUEST)

    # Handle KeyError
    if isinstance(exc, KeyError):
        error_message = str(exc)
        logger.error(f"KeyError: {error_message}", exc_info=True)
        return Response({
            'error': 'Missing required key.',
            'detail': f'Required key {error_message} not found in data.'
        }, status=status.HTTP_400_BAD_REQUEST)

    # Catch-all for any other exception
    logger.error(f"Unhandled exception: {type(exc).__name__}: {str(exc)}", exc_info=True)
    # Include traceback/debug info when running in DEBUG or for staff users
    try:
        import traceback
        from django.conf import settings
        stack_trace = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    except Exception:
        stack_trace = None

    response_data = {
        'error': 'An unexpected error occurred.',
        'detail': 'Please try again or contact support if the issue persists.',
        'exception_type': type(exc).__name__
    }

    request = context.get('request') if isinstance(context, dict) else None
    show_debug = False
    try:
        from django.conf import settings
        if getattr(settings, 'DEBUG', False):
            show_debug = True
    except Exception:
        pass

    if not show_debug and request is not None and hasattr(request, 'user') and getattr(request.user, 'is_staff', False):
        show_debug = True

    if show_debug and stack_trace:
        # Keep last 2000 chars to avoid huge responses
        response_data['_debug'] = stack_trace[-2000:]

    return Response(response_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
