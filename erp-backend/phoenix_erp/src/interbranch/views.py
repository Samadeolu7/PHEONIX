from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from common.views import ScopedModelViewSet, is_elevated_user
from interbranch.models import InterBranchTransfer
from interbranch.serializers import (
    CreateInterBranchTransferSerializer,
    InterBranchTransferSerializer,
    ReverseInterBranchTransferSerializer,
)
from interbranch.services import create_interbranch_transfer, reverse_interbranch_transfer


class InterBranchTransferViewSet(ScopedModelViewSet):
    """
    Endpoints:
    - GET  /api/interbranch/transfers/         - list transfers visible to the user
    - GET  /api/interbranch/transfers/{id}/    - transfer detail
    - POST /api/interbranch/transfers/         - create + post a transfer (elevated users only)
    - POST /api/interbranch/transfers/{id}/reverse/ - reverse both legs (elevated users only)

    InterBranchTransfer has no single `branch` field (it spans two), so this
    viewset does not rely on ScopedModelViewSet's default for_user()-based
    queryset (that path assumes a plain `branch` field and would raise a
    FieldError) — get_queryset() and create() are fully custom.
    """
    permission_module = 'interbranch'
    permission_page = 'transfers'
    queryset = InterBranchTransfer.objects.select_related(
        'from_branch', 'to_branch', 'from_account', 'to_account',
        'source_transaction', 'destination_transaction', 'initiated_by',
    ).all()
    serializer_class = InterBranchTransferSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # create/reverse move money between branches and are gated purely by
        # is_elevated_user() below — see BankTransferViewSet for the same
        # pattern (banks/views.py), which bypasses the auto-appended
        # HasActionPermission for its own elevated-only actions.
        if self.action in ('create', 'reverse'):
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateInterBranchTransferSerializer
        if self.action == 'reverse':
            return ReverseInterBranchTransferSerializer
        return InterBranchTransferSerializer

    def get_queryset(self):
        qs = super(ScopedModelViewSet, self).get_queryset()
        if getattr(self, 'swagger_fake_view', False):
            return qs.none()

        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        if tenant:
            qs = qs.filter(tenant=tenant)

        if is_elevated_user(user):
            return qs

        branch = getattr(user, 'branch', None)
        if branch:
            return qs.filter(Q(from_branch=branch) | Q(to_branch=branch))
        return qs.none()

    def create(self, request, *args, **kwargs):
        if not is_elevated_user(request.user):
            raise PermissionDenied(
                'Only users with all-branches access can initiate an inter-branch transfer.'
            )

        input_serializer = CreateInterBranchTransferSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        from django.utils import timezone
        try:
            transfer = create_interbranch_transfer(
                from_branch=data['from_branch'],
                to_branch=data['to_branch'],
                from_account=data['from_account'],
                to_account=data['to_account'],
                amount=data['amount'],
                description=data.get('description', ''),
                date=data.get('date') or timezone.localdate(),
                user=request.user,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)

        output = InterBranchTransferSerializer(transfer, context={'request': request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        if not is_elevated_user(request.user):
            raise PermissionDenied(
                'Only users with all-branches access can reverse an inter-branch transfer.'
            )

        transfer = self.get_object()
        input_serializer = ReverseInterBranchTransferSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        try:
            transfer = reverse_interbranch_transfer(
                transfer, request.user, input_serializer.validated_data['reason']
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)

        output = InterBranchTransferSerializer(transfer, context={'request': request})
        return Response(output.data, status=status.HTTP_200_OK)
