from django.contrib import admin
from django.utils.html import format_html
from .models import WidgetDefinition, WidgetInstance

@admin.register(WidgetDefinition)
class WidgetDefinitionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'tenant', 'instance_count', 'is_deleted']
    list_filter = ['tenant', 'is_deleted']
    search_fields = ['code', 'name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    def instance_count(self, obj):
        count = obj.widgetinstance_set.filter(is_deleted=False).count()
        url = f'/admin/widgets/widgetinstance/?definition__id__exact={obj.id}'
        return format_html('<a href="{}">{}</a>', url, count)
    instance_count.short_description = 'Instances'

@admin.register(WidgetInstance)
class WidgetInstanceAdmin(admin.ModelAdmin):
    list_display = ['title', 'definition', 'page', 'tenant', 'last_refresh', 'is_deleted']
    list_filter = ['definition', 'tenant', 'is_deleted']
    search_fields = ['title', 'page__title', 'definition__name']
    readonly_fields = ['last_refresh', 'created_at', 'updated_at']
    raw_id_fields = ['page', 'definition']

    actions = ['refresh_widgets']

    def refresh_widgets(self, request, queryset):
        from .tasks import refresh_widget
        for instance in queryset:
            refresh_widget.delay(instance.id)
        self.message_user(request, f"Refreshing {queryset.count()} widgets.")
    refresh_widgets.short_description = "Refresh selected widgets"
