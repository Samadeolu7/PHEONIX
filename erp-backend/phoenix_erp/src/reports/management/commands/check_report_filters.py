# reports/management/commands/check_report_filters.py
"""
Diagnostic command to check actual filter values in database
"""
from django.core.management.base import BaseCommand
from reports.models import ReportTemplate
import json


class Command(BaseCommand):
    help = 'Check actual filter field values in database'

    def handle(self, *args, **options):
        reports = ReportTemplate.objects.all()
        
        for report in reports:
            self.stdout.write(f"\n{'='*60}")
            self.stdout.write(f"Report: {report.code} (ID: {report.id})")
            self.stdout.write(f"Primary Entity: {report.primary_entity}")
            
            if report.report_config and 'filters' in report.report_config:
                self.stdout.write("\nFilters:")
                for i, filter_obj in enumerate(report.report_config['filters'], 1):
                    field = filter_obj.get('field', 'N/A')
                    operator = filter_obj.get('operator', 'N/A')
                    value = filter_obj.get('value', 'N/A')
                    
                    # Check if this is a problematic field
                    if 'transaction_date' in field and 'transaction__transaction_date' not in field:
                        self.stdout.write(
                            self.style.ERROR(
                                f"  {i}. ❌ PROBLEM: {field}__{operator} = {value}"
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  {i}. ✅ OK: {field}__{operator} = {value}"
                            )
                        )
            else:
                self.stdout.write("  No filters configured")
        
        self.stdout.write(f"\n{'='*60}\n")
