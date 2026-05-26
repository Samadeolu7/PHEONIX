# reports/management/commands/fix_report_allowed_fields.py
"""
Management command to fix allowed_fields and report_config filters for existing reports
"""
from django.core.management.base import BaseCommand
from reports.models import ReportTemplate
import copy


class Command(BaseCommand):
    help = 'Fix allowed_fields and report_config filters for existing reports to prevent validation errors'

    def handle(self, *args, **options):
        # Comprehensive field list covering all potential report needs
        required_fields = [
            # Basic TransactionEntry fields
            'id', 'date', 'created_at', 'updated_at',
            'amount', 'description', 'reference', 'side', 
            'balance', 'running_balance',
            
            # Account relationship fields (from TransactionEntry.account)
            'account', 'account_id', 
            'account__name', 'account__code', 'account__account_type',
            'account__parent', 'account__parent__name', 'account__parent__code',
            'account__account_level', 'account__is_active',
            
            # Transaction relationship fields (from TransactionEntry.transaction)
            'transaction', 'transaction_id',
            'transaction__id', 'transaction__date',
            'transaction__description', 'transaction__reference', 'transaction__reference_number',
            'transaction__transaction_type', 'transaction__status',
            'transaction__created_at', 'transaction__updated_at',
            'transaction__created_by', 'transaction__created_by__id',
            'transaction__created_by__username', 'transaction__created_by__email',
            'transaction__created_by__first_name', 'transaction__created_by__last_name',
            
            # Direct fields that might be used in filters/columns
            'transaction_date', 'reference_number', 'debit_amount', 'credit_amount',
            
            # User/Creator fields (from TransactionEntry.created_by)
            'created_by', 'created_by__id', 'created_by__username', 'created_by__email',
            'created_by__first_name', 'created_by__last_name',
            
            # Branch fields (from TransactionEntry.branch)
            'branch', 'branch_id', 'branch__id',
            'branch__name', 'branch__code', 'branch__is_active',
            
            # Owner fields
            'owner', 'owner__id', 'owner__username', 'owner__email',
            
            # Client relationship fields (if applicable)
            'client', 'client__id', 'client__full_name', 'client__email',
            'client__phone_number', 'client__client_code',
            
            # Common aggregation/calculation fields
            'month', 'year', 'quarter', 'deposits', 'withdrawals',
        ]
        
        # Field mappings for fixing report_config filters
        # Transaction model uses 'date' not 'transaction_date'
        # Order matters: longer/compound keys first to avoid partial double-replacements
        field_mappings = {
            'transaction__transaction_date': 'transaction__date',
            'transaction_date': 'transaction__date',
            'reference_number': 'transaction__reference_number',
            'transaction_type': 'transaction__transaction_type',
        }
        
        reports = ReportTemplate.objects.all()
        updated_fields_count = 0
        updated_filters_count = 0
        updated_primary_entity_count = 0
        updated_columns_count = 0
        
        for report in reports:
            # Track what changed for THIS report
            fields_changed = False
            filters_changed = False
            entity_changed = False
            
            # Fix allowed_fields
            current_allowed = report.allowed_fields or []
            updated_fields = list(set(current_allowed + required_fields))
            
            if len(updated_fields) > len(current_allowed):
                report.allowed_fields = updated_fields
                fields_changed = True
                updated_fields_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'✅ Updated allowed_fields for {report.code}: {len(current_allowed)} → {len(updated_fields)} fields'
                    )
                )
            
            # Fix report_config filters
            if report.report_config and 'filters' in report.report_config:
                report_config = copy.deepcopy(report.report_config)
                filters_fixed = False
                
                for filter_obj in report_config.get('filters', []):
                    if 'field' in filter_obj:
                        old_field = filter_obj['field']
                        new_field = old_field
                        # Replace any mapped substring inside the field (handles leading '-' and compound names)
                        for wrong_field, correct_field in field_mappings.items():
                            if wrong_field in new_field:
                                new_field = new_field.replace(wrong_field, correct_field)

                        if new_field != old_field:
                            filter_obj['field'] = new_field
                            filters_fixed = True
                            self.stdout.write(
                                self.style.WARNING(
                                    f'🔧 Fixed filter in {report.code}: {old_field} → {new_field}'
                                )
                            )
                
                if filters_fixed:
                    report.report_config = report_config
                    filters_changed = True
                    updated_filters_count += 1

            # Fix columns stored in ReportColumn objects and in report_config['columns']
            # Update any field_path that uses the wrong transaction__transaction_date
            cols = report.columns.filter(field_path__contains='transaction__transaction_date')
            if cols.exists():
                for col in cols:
                    old_fp = col.field_path
                    new_fp = old_fp.replace('transaction__transaction_date', 'transaction__date')
                    col.field_path = new_fp
                    col.save(update_fields=['field_path'])
                    updated_columns_count += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f'🔧 Updated ReportColumn.field_path for template {report.code}: {old_fp} → {new_fp}'
                        )
                    )

            # Also fix any field_path entries inside the report_config['columns'] list
            def _fix_config_values(obj):
                """Recursively replace string occurrences using field_mappings."""
                changed = False
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        if isinstance(v, (dict, list)):
                            if _fix_config_values(v):
                                changed = True
                        elif isinstance(v, str):
                            new_v = v
                            for wrong_field, correct_field in field_mappings.items():
                                if wrong_field in new_v:
                                    new_v = new_v.replace(wrong_field, correct_field)
                            if new_v != v:
                                obj[k] = new_v
                                changed = True
                                self.stdout.write(
                                    self.style.WARNING(
                                        f'🔧 Fixed config value in {report.code}: {v} → {new_v}'
                                    )
                                )
                elif isinstance(obj, list):
                    for idx, item in enumerate(obj):
                        if isinstance(item, (dict, list)):
                            if _fix_config_values(item):
                                changed = True
                        elif isinstance(item, str):
                            new_item = item
                            for wrong_field, correct_field in field_mappings.items():
                                if wrong_field in new_item:
                                    new_item = new_item.replace(wrong_field, correct_field)
                            if new_item != item:
                                obj[idx] = new_item
                                changed = True
                                self.stdout.write(
                                    self.style.WARNING(
                                        f'🔧 Fixed config list value in {report.code}: {item} → {new_item}'
                                    )
                                )
                return changed

            if report.report_config:
                cfg_copy = copy.deepcopy(report.report_config)
                if _fix_config_values(cfg_copy):
                    report.report_config = cfg_copy
                    if not filters_changed:
                        # count as a filters/configs change
                        updated_filters_count += 1
                        filters_changed = True
            
            # Fix primary_entity mismatch
            if report.report_config and 'data_sources' in report.report_config:
                data_sources = report.report_config.get('data_sources', [])
                if data_sources:
                    main_source = next((ds for ds in data_sources if ds.get('relation_type') == 'main'), None)
                    if main_source and main_source.get('entity') == 'TransactionEntry':
                        if report.primary_entity != 'TransactionEntry':
                            report.primary_entity = 'TransactionEntry'
                            entity_changed = True
                            updated_primary_entity_count += 1
                            self.stdout.write(
                                self.style.WARNING(
                                    f'🔧 Fixed primary_entity in {report.code}: Transaction → TransactionEntry'
                                )
                            )
            
            # Save if any changes were made
            if fields_changed or filters_changed or entity_changed:
                update_fields = []
                if fields_changed:
                    update_fields.append('allowed_fields')
                if filters_changed:
                    update_fields.append('report_config')
                if entity_changed:
                    update_fields.append('primary_entity')
                
                if update_fields:
                    report.save(update_fields=update_fields)
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Summary:\n'
                f'  - Updated allowed_fields: {updated_fields_count} reports\n'
                f'  - Fixed filter fields: {updated_filters_count} reports\n'
                f'  - Updated ReportColumn.field_path: {updated_columns_count} columns\n'
                f'  - Fixed primary_entity: {updated_primary_entity_count} reports\n'
                f'  - Total reports processed: {reports.count()}'
            )
        )
