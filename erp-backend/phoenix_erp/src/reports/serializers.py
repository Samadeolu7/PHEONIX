# reports/serializers.py
from rest_framework import serializers
from .models import (
    ReportCategory, ReportTemplate, ReportParameter,
    ReportColumn, ReportChart, ReportExecution, ReportSchedule
)


class ReportCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportCategory
        fields = [
            'id', 'name', 'code', 'description', 'icon', 'color',
            'parent', 'order', 'created_at', 'updated_at'
        ]


class ReportParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportParameter
        fields = [
            'id', 'name', 'code', 'parameter_type', 'label', 'description',
            'is_required', 'default_value', 'options', 'validation_rules', 'order'
        ]


class ReportColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportColumn
        fields = [
            'id', 'name', 'code', 'column_type', 'label', 'description',
            'field_path', 'aggregation_function', 'formula',
            'format_type', 'format_options', 'width',
            'is_visible', 'is_sortable', 'is_filterable', 'order',
            'conditional_formatting'
        ]


class ReportChartSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportChart
        fields = [
            'id', 'name', 'chart_type', 'title', 'description',
            'data_config', 'display_config', 'position', 'order', 'is_visible'
        ]


class ReportTemplateSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    parameters = ReportParameterSerializer(many=True, read_only=True)
    columns = ReportColumnSerializer(many=True, read_only=True)
    charts = ReportChartSerializer(many=True, read_only=True)
    linked_account_code = serializers.CharField(source='linked_account.code', read_only=True)
    linked_product_code = serializers.CharField(source='linked_product.code', read_only=True)
    linked_product_name = serializers.CharField(source='linked_product.name', read_only=True)
    
    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'code', 'description', 'category', 'category_name',
            'report_type', 'access_level', 'is_auto_generated', 'linked_account',
            'linked_account_code', 'linked_product', 'linked_product_code', 
            'linked_product_name', 'report_config', 'primary_entity',
            'allowed_entities', 'allowed_fields', 'allowed_calculations',
            'max_rows', 'default_date_range', 'refresh_interval',
            'required_permission', 'restricted_to_roles',
            'is_active', 'is_system', 'is_editable',
            'usage_count', 'last_run_at', 'version',
            'parameters', 'columns', 'charts',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['usage_count', 'last_run_at']


class ReportTemplateCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating reports with nested objects"""
    parameters = ReportParameterSerializer(many=True, required=False)
    columns = ReportColumnSerializer(many=True, required=False)
    charts = ReportChartSerializer(many=True, required=False)
    
    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'code', 'description', 'category',
            'report_type', 'access_level', 'report_config', 'primary_entity',
            'allowed_entities', 'allowed_fields', 'allowed_calculations',
            'max_rows', 'default_date_range', 'refresh_interval',
            'required_permission', 'restricted_to_roles',
            'is_active', 'is_editable',
            'parameters', 'columns', 'charts'
        ]
    
    def create(self, validated_data):
        parameters_data = validated_data.pop('parameters', [])
        columns_data = validated_data.pop('columns', [])
        charts_data = validated_data.pop('charts', [])
        
        report = ReportTemplate.objects.create(**validated_data)
        
        # Create nested objects
        for param_data in parameters_data:
            ReportParameter.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=report.created_by,
                tenant=report.tenant,
                **param_data
            )
        
        for column_data in columns_data:
            ReportColumn.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=report.created_by,
                tenant=report.tenant,
                **column_data
            )
        
        for chart_data in charts_data:
            ReportChart.objects.create(
                template=report,
                owner=report.owner,
                branch=report.branch,
                created_by=report.created_by,
                tenant=report.tenant,
                **chart_data
            )
        
        return report
    
    def update(self, instance, validated_data):
        parameters_data = validated_data.pop('parameters', None)
        columns_data = validated_data.pop('columns', None)
        charts_data = validated_data.pop('charts', None)
        
        # Update main fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update nested objects if provided
        if parameters_data is not None:
            instance.parameters.all().delete()
            for param_data in parameters_data:
                ReportParameter.objects.create(
                    template=instance,
                    owner=instance.owner,
                    branch=instance.branch,
                    created_by=instance.created_by,
                    tenant=instance.tenant,
                    **param_data
                )
        
        if columns_data is not None:
            instance.columns.all().delete()
            for column_data in columns_data:
                ReportColumn.objects.create(
                    template=instance,
                    owner=instance.owner,
                    branch=instance.branch,
                    created_by=instance.created_by,
                    tenant=instance.tenant,
                    **column_data
                )
        
        if charts_data is not None:
            instance.charts.all().delete()
            for chart_data in charts_data:
                ReportChart.objects.create(
                    template=instance,
                    owner=instance.owner,
                    branch=instance.branch,
                    created_by=instance.created_by,
                    tenant=instance.tenant,
                    **chart_data
                )
        
        return instance


class ReportExecutionSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    executed_by_name = serializers.CharField(source='executed_by.full_name', read_only=True)
    
    class Meta:
        model = ReportExecution
        fields = [
            'id', 'template', 'template_name', 'executed_at',
            'executed_by', 'executed_by_name', 'parameters',
            'row_count', 'execution_time_ms', 'status', 'error_message',
            'is_cache_valid'
        ]
        read_only_fields = ['executed_at', 'row_count', 'execution_time_ms', 'status']


class ReportScheduleSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    
    class Meta:
        model = ReportSchedule
        fields = [
            'id', 'template', 'template_name', 'name', 'frequency',
            'run_time', 'day_of_week', 'day_of_month',
            'default_parameters', 'recipients', 'export_format',
            'is_active', 'last_run_at', 'next_run_at'
        ]