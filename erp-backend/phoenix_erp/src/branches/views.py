# branches/views.py
import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from common.views import ScopedModelViewSet
from .models import Branch

logger = logging.getLogger(__name__)


class BranchSerializer(serializers.ModelSerializer):
    """Serializer for Branch model"""
    class Meta:
        model = Branch
        fields =[
            'id', 'name', 'code', 'city', 'state', 'country', 'postal_code',
            'latitude', 'longitude', 'main_bank_account',
        ]
        read_only_fields = ['id', 'tenant', 'is_deleted', 'created_at', 'updated_at']


class BranchViewSet(ScopedModelViewSet):
    """
    ViewSet for managing branches
    """
    permission_module = 'branches'
    permission_page = 'branches'
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated]
    # Branch listing is structural data needed by every role (e.g. branch-switcher
    # dropdown for directors). Fine-grained action checks are unnecessary here.
    skip_action_permission = True
    
    def get_queryset(self):
        """
        Override to filter by tenant only (Branch model doesn't have a branch field).
        System admins see all branches across all tenants.
        """
        qs = Branch.objects.all()

        # During OpenAPI/schema generation
        if getattr(self, 'swagger_fake_view', False):
            return qs.none()

        user = getattr(self.request, 'user', None)
        if not user or not user.is_authenticated:
            return qs.none()

        # System admin bypass - sees all branches across all tenants
        if getattr(user, 'is_system_admin', False):
            return qs

        # Filter by tenant only (don't filter by branch since Branch is the branch)
        if hasattr(user, 'tenant') and user.tenant:
            return qs.filter(tenant=user.tenant, is_deleted=False)

        # Fallback: return empty queryset if user has no tenant
        return qs.none()

    @action(detail=False, methods=['post'], url_path='clone-config')
    def clone_config(self, request):
        """
        Clone configuration data (chart of accounts, products, loan/savings products,
        fee structures, expense/income categories, inventory items, HR components, etc.)
        from one branch to another within the same organisation.

        Transactions, client data, staff records, and bank accounts are never copied.

        Request body:
            source_branch_id (int): branch to copy FROM
            target_branch_id (int): branch to copy INTO
            dry_run (bool, optional): if true, computes the exact same
                created/skipped/error summary without persisting anything —
                use this to preview the clone before committing to it.

        Only directors, admins, operations managers, and owners may perform this.
        """
        from .services import BranchCloneService

        user = request.user
        if not self._is_elevated_user(user):
            return Response(
                {'detail': 'Only directors and administrators can clone branch configuration.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        source_id = request.data.get('source_branch_id')
        target_id = request.data.get('target_branch_id')

        if not source_id or not target_id:
            return Response(
                {'detail': 'Both source_branch_id and target_branch_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            source_id = int(source_id)
            target_id = int(target_id)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'source_branch_id and target_branch_id must be integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source_id == target_id:
            return Response(
                {'detail': 'Source and target branches must be different.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_run = bool(request.data.get('dry_run', False))

        tenant = getattr(user, 'tenant', None)
        try:
            source = Branch.objects.get(pk=source_id, tenant=tenant, is_deleted=False)
            target = Branch.objects.get(pk=target_id, tenant=tenant, is_deleted=False)
        except Branch.DoesNotExist:
            return Response(
                {'detail': 'One or both branches were not found in your organisation.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            result = BranchCloneService(source, target, user).clone(dry_run=dry_run)
            total_created = sum(result['created'].values())
            total_skipped = sum(result['skipped'].values())
            if dry_run:
                verb, exist_phrase = 'Would clone', 'already exist and would be skipped'
            else:
                verb, exist_phrase = 'Cloned', 'already existed and were skipped'
            return Response(
                {
                    'success': True,
                    'message': (
                        f'{verb} {total_created} records from "{source}" to "{target}". '
                        f'{total_skipped} {exist_phrase}. '
                        f'{len(result["errors"])} warning(s).'
                    ),
                    **result,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:
            logger.exception(
                'Branch config clone failed: source=%s target=%s', source_id, target_id
            )
            return Response(
                {'detail': f'Clone failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

