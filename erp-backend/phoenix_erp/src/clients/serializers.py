from rest_framework import serializers
from common.serializers import TenantModelSerializer
from clients.models import Client, ClientClassification, ClientDocument, ClientRelationship, ClientNote, ClientGroup, CustomerAuditLog


class ClientClassificationSerializer(TenantModelSerializer):
    class Meta:
        model = ClientClassification
        fields = [
            'id', 'name', 'code', 'description', 'priority_level', 
            'credit_limit', 'special_rates', 'owner', 'branch', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'owner', 'branch', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': True, 'allow_blank': False},
            'description': {'required': False, 'allow_blank': True}
        }


class ClientDocumentSerializer(TenantModelSerializer):
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True)
    
    class Meta:
        model = ClientDocument
        fields = [
            'id', 'client', 'document_type', 'document_number', 
            'issue_date', 'expiry_date', 'issuing_authority', 'document_file',
            'verification_status', 'verification_notes', 'verified_by', 
            'verified_by_name', 'verified_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'verified_by', 'verified_by_name', 'verified_at', 'created_at', 'updated_at']


class ClientRelationshipSerializer(TenantModelSerializer):
    from_client_name = serializers.CharField(source='from_client.full_name', read_only=True)
    to_client_name = serializers.CharField(source='to_client.full_name', read_only=True)
    
    class Meta:
        model = ClientRelationship
        fields = [
            'id', 'from_client', 'from_client_name', 'to_client', 'to_client_name',
            'relationship_type', 'description', 'start_date', 'end_date', 
            'is_guarantor', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'from_client_name', 'to_client_name', 'created_at', 'updated_at']


class ClientNoteSerializer(TenantModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = ClientNote
        fields = [
            'id', 'client', 'note_type', 'title', 'content', 
            'is_private', 'reminder_date', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by_name', 'created_at', 'updated_at']


class ClientListSerializer(TenantModelSerializer):
    """Lightweight serializer for list views"""
    classification_name = serializers.CharField(source='classification.name', read_only=True)
    age = serializers.IntegerField(read_only=True)
    image = serializers.ImageField(read_only=True, use_url=True)
    group_name = serializers.CharField(source='group.name', read_only=True, default=None)
    client_type_display = serializers.CharField(source='get_client_type_display', read_only=True)
    assigned_officer_name = serializers.SerializerMethodField()
    account_manager_name = serializers.SerializerMethodField()

    def get_assigned_officer_name(self, obj):
        if obj.assigned_officer_id is None:
            return None
        o = obj.assigned_officer
        return f"{o.first_name} {o.last_name}".strip() or str(o.pk)

    def get_account_manager_name(self, obj):
        if obj.account_manager_id is None:
            return None
        o = obj.account_manager
        return f"{o.first_name} {o.last_name}".strip() or str(o.pk)

    class Meta:
        model = Client
        fields = [
            'id', 'client_id', 'first_name', 'middle_name', 'last_name', 
            'full_name', 'gender', 'date_of_birth', 'age', 'phone_primary', 
            'email', 'status', 'usage_context', 'client_type', 'client_type_display',
            'group', 'group_name', 'classification', 
            'classification_name', 'image',
            'nin',
            'assigned_officer', 'assigned_officer_name',
            'account_manager', 'account_manager_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'full_name', 'age', 'classification_name', 'group_name',
                            'client_type_display', 'image',
                            'assigned_officer_name', 'account_manager_name',
                            'created_at', 'updated_at']


class ClientDetailSerializer(TenantModelSerializer):
    """Complete serializer with all fields"""
    classification_name = serializers.CharField(source='classification.name', read_only=True)
    age = serializers.IntegerField(read_only=True)
    documents = ClientDocumentSerializer(many=True, read_only=True)
    notes = ClientNoteSerializer(many=True, read_only=True)
    relationships_from = ClientRelationshipSerializer(many=True, read_only=True)
    image = serializers.ImageField(read_only=True, use_url=True)
    signature = serializers.ImageField(read_only=True, use_url=True)
    assigned_officer_name = serializers.SerializerMethodField()
    account_manager_name = serializers.SerializerMethodField()

    def get_assigned_officer_name(self, obj):
        if obj.assigned_officer_id is None:
            return None
        o = obj.assigned_officer
        return f"{o.first_name} {o.last_name}".strip() or str(o.pk)

    def get_account_manager_name(self, obj):
        if obj.account_manager_id is None:
            return None
        o = obj.account_manager
        return f"{o.first_name} {o.last_name}".strip() or str(o.pk)
    
    class Meta:
        model = Client
        fields = [
            # Basic Information
            'id', 'client_id', 'title', 'first_name', 'middle_name', 'last_name', 
            'full_name', 'gender', 'date_of_birth', 'age', 'place_of_birth',
            
            # Classification and Status
            'classification', 'classification_name', 'status', 'risk_level',
            
            # Contact Information
            'email', 'phone_primary', 'phone_secondary', 'address_street', 
            'address_city', 'address_state', 'address_postal_code', 'address_country',
            
            # Identification
            'id_type', 'id_number', 'id_issue_date', 'id_expiry_date',
            'nin',
            
            # Employment and Income
            'occupation', 'employer_name', 'employer_address', 'employment_status',
            'annual_income', 'income_source',
            
            # Personal Details
            'marital_status', 'education_level',
            
            # Next of Kin
            'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
            'next_of_kin_email', 'next_of_kin_address',
            
            # Banking Information
            'bank_name', 'bank_account_name', 'bank_account_number', 
            'bank_verification_number',
            
            # Marketing and Communication
            'preferred_language', 'communication_preference', 'marketing_consent',
            
            # Student-Specific Fields
            'admission_number', 'admission_date', 'class_name', 'grade_level', 
            'section', 'roll_number', 'academic_year', 'student_status',
            'school_house', 'previous_school_class',
            'previous_school_name', 'state_of_origin', 'lga', 'proposed_entry_month', 'who_pays_fees',
            
            # Guardian/Parent Information
            'primary_guardian_name', 'primary_guardian_relationship', 'primary_guardian_phone',
            'primary_guardian_email', 'primary_guardian_occupation',
            'primary_guardian_home_address', 'primary_guardian_office_address',
            'secondary_guardian_name', 'secondary_guardian_relationship', 'secondary_guardian_phone',
            'secondary_guardian_email', 'secondary_guardian_occupation',
            'secondary_guardian_home_address', 'secondary_guardian_office_address',
            
            # Medical Information
            'blood_group', 'allergies', 'medical_conditions',
            'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
            
            # Document Management
            'image', 'signature',
            
            # System Fields
            'referral_source', 'kyc_status', 'kyc_last_update', 'last_kyc_check',
            'metadata', 'usage_context', 'external_id',

            # KTIL microfinance fields
            'client_type', 'group',
            'guarantor_name', 'guarantor_relationship', 'guarantor_phone',
            'guarantor_occupation', 'guarantor_home_address', 'guarantor_office_address',
            'assigned_officer', 'assigned_officer_name',
            'account_manager', 'account_manager_name',
            
            # Related Data
            'documents', 'notes', 'relationships_from',
            
            # Timestamps
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'full_name', 'age', 'classification_name', 
            'documents', 'notes', 'relationships_from',
            'assigned_officer_name', 'account_manager_name',
            'owner', 'branch', 'created_at', 'updated_at'
        ]


class ClientCreateUpdateSerializer(TenantModelSerializer):
    """Serializer for creating and updating clients with image upload support"""

    # Explicitly declared so empty strings from the browser are coerced to None
    # before Django's DateField validation runs (DateField rejects '' but accepts None).
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    id_issue_date = serializers.DateField(required=False, allow_null=True)
    id_expiry_date = serializers.DateField(required=False, allow_null=True)
    admission_date = serializers.DateField(required=False, allow_null=True)

    def to_internal_value(self, data):
        """Coerce empty-string date values to None before field-level validation."""
        DATE_FIELDS = ('date_of_birth', 'id_issue_date', 'id_expiry_date', 'admission_date')
        mutable = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in DATE_FIELDS:
            if mutable.get(field) == '':
                mutable[field] = None
        return super().to_internal_value(mutable)

    class Meta:
        model = Client
        fields = [
            # Basic Information
            'client_id', 'title', 'first_name', 'middle_name', 'last_name',
            'gender', 'date_of_birth', 'place_of_birth',

            # Classification and Status
            'classification', 'status', 'risk_level',

            # Contact Information
            'email', 'phone_primary', 'phone_secondary', 'address_street',
            'address_city', 'address_state', 'address_postal_code', 'address_country',

            # Identification
            'id_type', 'id_number', 'id_issue_date', 'id_expiry_date',
            'nin',

            # Employment and Income
            'occupation', 'employer_name', 'employer_address', 'employment_status',
            'annual_income', 'income_source',

            # Personal Details
            'marital_status', 'education_level',

            # Next of Kin
            'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
            'next_of_kin_email', 'next_of_kin_address',

            # Banking Information
            'bank_name', 'bank_account_name', 'bank_account_number',
            'bank_verification_number',

            # Marketing and Communication
            'preferred_language', 'communication_preference', 'marketing_consent',

            # Student-Specific Fields
            'admission_number', 'admission_date', 'class_name', 'grade_level',
            'section', 'roll_number', 'academic_year', 'student_status',
            'school_house', 'previous_school_class', 'previous_school_name',
            'state_of_origin', 'lga', 'proposed_entry_month', 'who_pays_fees',

            # Guardian/Parent Information
            'primary_guardian_name', 'primary_guardian_relationship', 'primary_guardian_phone',
            'primary_guardian_email', 'primary_guardian_occupation',
            'primary_guardian_home_address', 'primary_guardian_office_address',
            'secondary_guardian_name', 'secondary_guardian_relationship', 'secondary_guardian_phone',
            'secondary_guardian_email', 'secondary_guardian_occupation',
            'secondary_guardian_home_address', 'secondary_guardian_office_address',

            # Medical Information
            'blood_group', 'allergies', 'medical_conditions',
            'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',

            # Document Management
            'image', 'signature',

            # System Fields
            'referral_source', 'metadata', 'usage_context', 'external_id',

            # KTIL microfinance fields
            'client_type', 'group',
            'guarantor_name', 'guarantor_relationship', 'guarantor_phone',
            'guarantor_occupation', 'guarantor_home_address', 'guarantor_office_address',
            'assigned_officer', 'account_manager',
            'nin',
        ]
        extra_kwargs = {
            'client_id': {'required': False},  # Auto-generated if not provided
            'first_name': {'required': True},
            'last_name': {'required': True},
            'phone_primary': {'required': True},
            'gender': {'required': True},
            'image': {'required': False, 'allow_null': True},
            'signature': {'required': False, 'allow_null': True},
        }

    def validate_image(self, value):
        """Validate image file"""
        if value:
            # Check file size (max 5MB)
            if value.size > 5 * 1024 * 1024:
                raise serializers.ValidationError('Image size must be less than 5MB')
            # Check file type
            if not value.content_type.startswith('image/'):
                raise serializers.ValidationError('Only image files are allowed')
        return value
    
    def validate_signature(self, value):
        """Validate signature file"""
        if value:
            # Check file size (max 2MB)
            if value.size > 2 * 1024 * 1024:
                raise serializers.ValidationError('Signature size must be less than 2MB')
            # Check file type
            if not value.content_type.startswith('image/'):
                raise serializers.ValidationError('Only image files are allowed for signature')
        return value


class ClientGroupSerializer(TenantModelSerializer):
    """Serializer for Ajo / loan group management."""
    leader_name = serializers.CharField(source='leader.full_name', read_only=True, default=None)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = ClientGroup
        fields = [
            'id', 'name', 'code', 'meeting_day', 'leader', 'leader_name',
            'description', 'is_active', 'member_count',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'leader_name', 'member_count', 'owner', 'branch', 'created_at', 'updated_at']
        extra_kwargs = {
            'code': {'required': True, 'allow_blank': False},
        }

    def get_member_count(self, obj):
        return obj.members.filter(is_deleted=False).count()


class ClientGroupListSerializer(TenantModelSerializer):
    """Lightweight list serializer for ClientGroup dropdowns."""
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = ClientGroup
        fields = ['id', 'name', 'code', 'meeting_day', 'is_active', 'member_count']

    def get_member_count(self, obj):
        return obj.members.filter(is_deleted=False).count()


class CustomerAuditLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for customer audit trail entries."""
    user_name = serializers.SerializerMethodField()
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    def get_user_name(self, obj):
        if obj.user_id is None:
            return 'System'
        return obj.user.get_full_name() or obj.user.username

    class Meta:
        model = CustomerAuditLog
        fields = [
            'id', 'client', 'user', 'user_name', 'timestamp', 'ip_address',
            'action', 'action_display', 'changed_fields', 'old_values', 'new_values',
            'description',
        ]
        read_only_fields = [
            'id', 'client', 'user', 'user_name', 'timestamp', 'ip_address',
            'action', 'action_display', 'changed_fields', 'old_values', 'new_values',
            'description',
        ]

