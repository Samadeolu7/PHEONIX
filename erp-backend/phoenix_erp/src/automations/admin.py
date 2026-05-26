# automations/admin.py - Register models for admin interface

from django.contrib import admin
from .models import (
    WorkflowTemplate, 
    WorkflowRun, 
    FormSchema, 
    FormSubmission,
    WorkflowApproval,
    ApprovalDelegation
)


@admin.register(WorkflowTemplate)
class WorkflowTemplateAdmin(admin.ModelAdmin):
    # WorkflowTemplate does not have a `code` field; use `name` and other real fields
    list_display = ['name', 'trigger_type', 'workflow_type', 'is_active']
    list_filter = ['trigger_type', 'workflow_type', 'access_level', 'is_active']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(WorkflowRun)
class WorkflowRunAdmin(admin.ModelAdmin):
    list_display = ['run_reference', 'template', 'status', 'started_at', 'completed_at']
    list_filter = ['status', 'started_at']
    search_fields = ['run_reference']
    readonly_fields = ['run_reference', 'created_at']


@admin.register(FormSchema)
class FormSchemaAdmin(admin.ModelAdmin):
    # FormSchema model does not include `is_active`; show relevant fields
    list_display = ['name', 'trigger_event_name', 'created_at']
    list_filter = ['trigger_event_name', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(FormSubmission)
class FormSubmissionAdmin(admin.ModelAdmin):
    # FormSubmission fields: show reference, schema, submitted time and status
    list_display = ['submission_reference', 'form_schema', 'submitted_at', 'status']
    list_filter = ['submitted_at', 'form_schema', 'status']
    search_fields = ['submission_reference', 'form_schema__name']
    readonly_fields = ['submitted_at']


# ============================================
# PHASE 2B: ADVANCED WORKFLOW FEATURES
# ============================================

@admin.register(WorkflowApproval)
class WorkflowApprovalAdmin(admin.ModelAdmin):
    list_display = ['id', 'workflow_run', 'approver', 'status', 'escalation_level', 'created_at', 'approved_at']
    list_filter = ['status', 'escalation_level', 'created_at']
    search_fields = ['workflow_run__run_reference', 'approver__username', 'approver__email']
    readonly_fields = ['created_at', 'updated_at', 'approved_at', 'escalated_at']
    raw_id_fields = ['workflow_run', 'approver', 'approved_by', 'escalated_from']


@admin.register(ApprovalDelegation)
class ApprovalDelegationAdmin(admin.ModelAdmin):
    list_display = ['delegator', 'delegate', 'start_date', 'end_date', 'is_active', 'is_currently_active_display']
    list_filter = ['is_active', 'start_date', 'end_date']
    search_fields = ['delegator__username', 'delegate__username', 'reason']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['delegator', 'delegate']
    
    def is_currently_active_display(self, obj):
        return obj.is_currently_active()
    is_currently_active_display.boolean = True
    is_currently_active_display.short_description = 'Active Now'
