# pages/management/commands/validate_pages.py
"""
Validate all module pages to ensure they have correct configurations
"""
from django.core.management.base import BaseCommand
from django.core.exceptions import ValidationError
from pages.models import ModulePage
from automations.models import FormSchema
from reports.models import ReportTemplate


class Command(BaseCommand):
    help = 'Validate all module pages for correct configuration'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Attempt to auto-fix issues where possible'
        )
    
    def handle(self, *args, **options):
        fix_mode = options.get('fix', False)
        
        self.stdout.write(self.style.SUCCESS('\n🔍 Validating Module Pages...\n'))
        
        pages = ModulePage.objects.all()
        total = pages.count()
        valid = 0
        invalid = 0
        fixed = 0
        issues = []
        
        for page in pages:
            try:
                # Check page configuration
                config = page.page_config or {}
                page_issues = []
                
                # Validate based on page type
                if page.page_type == 'form':
                    # Check form_schema_id
                    form_schema_id = config.get('form_schema_id')
                    if not form_schema_id:
                        page_issues.append("Missing 'form_schema_id'")
                    else:
                        # Verify form schema exists
                        try:
                            FormSchema.objects.get(id=form_schema_id)
                        except FormSchema.DoesNotExist:
                            page_issues.append(f"FormSchema #{form_schema_id} does not exist")
                            if fix_mode:
                                # Try to find a replacement or mark page as inactive
                                page.is_active = False
                                page.save()
                                fixed += 1
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"  ⚠️  Disabled page '{page.title}' (missing form schema)"
                                    )
                                )
                    
                    # Check submitEndpoint
                    if not config.get('submitEndpoint'):
                        page_issues.append("Missing 'submitEndpoint'")
                        if fix_mode:
                            config['submitEndpoint'] = '/api/form-submissions/'
                            page.page_config = config
                            page.save(update_fields=['page_config'])
                            fixed += 1
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  ✓ Fixed submitEndpoint for '{page.title}'"
                                )
                            )
                
                elif page.page_type == 'report':
                    # Check report_id or report_code
                    report_id = config.get('report_id')
                    report_code = config.get('report_code')
                    
                    if not report_id and not report_code:
                        page_issues.append("Missing both 'report_id' and 'report_code'")
                    elif report_id:
                        # Verify report exists
                        try:
                            ReportTemplate.objects.get(id=report_id)
                        except ReportTemplate.DoesNotExist:
                            page_issues.append(f"ReportTemplate #{report_id} does not exist")
                            if fix_mode:
                                page.is_active = False
                                page.save()
                                fixed += 1
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"  ⚠️  Disabled page '{page.title}' (missing report)"
                                    )
                                )
                    
                    # Ensure default_parameters exist
                    if not config.get('default_parameters'):
                        if fix_mode:
                            config['default_parameters'] = {
                                'start_date': 'current_month_start',
                                'end_date': 'today'
                            }
                            page.page_config = config
                            page.save(update_fields=['page_config'])
                            fixed += 1
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  ✓ Added default_parameters for '{page.title}'"
                                )
                            )
                
                # Report issues
                if page_issues:
                    invalid += 1
                    issues.append({
                        'page': page,
                        'issues': page_issues
                    })
                    self.stdout.write(
                        self.style.ERROR(
                            f"\n❌ {page.title} ({page.page_type})"
                        )
                    )
                    for issue in page_issues:
                        self.stdout.write(f"   - {issue}")
                else:
                    valid += 1
                    
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"\n💥 Error validating '{page.title}': {str(e)}"
                    )
                )
                invalid += 1
        
        # Summary
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS(f'\n📊 Validation Summary:'))
        self.stdout.write(f'   Total Pages: {total}')
        self.stdout.write(self.style.SUCCESS(f'   ✓ Valid: {valid}'))
        if invalid > 0:
            self.stdout.write(self.style.ERROR(f'   ✗ Invalid: {invalid}'))
        if fixed > 0:
            self.stdout.write(self.style.WARNING(f'   🔧 Fixed: {fixed}'))
        
        if invalid > 0 and not fix_mode:
            self.stdout.write(
                self.style.WARNING(
                    '\n💡 Run with --fix to attempt automatic repairs'
                )
            )
        
        self.stdout.write('\n')
        
        # Detailed issues report
        if issues:
            self.stdout.write('\n' + '='*60)
            self.stdout.write(self.style.WARNING('\n📋 Detailed Issues:\n'))
            for item in issues:
                page = item['page']
                self.stdout.write(
                    f"\nPage: {page.title} (ID: {page.id})"
                )
                self.stdout.write(f"  Type: {page.page_type}")
                self.stdout.write(f"  URL: {page.url_path}")
                self.stdout.write(f"  Config: {page.page_config}")
                self.stdout.write("  Issues:")
                for issue in item['issues']:
                    self.stdout.write(f"    - {issue}")
        
        self.stdout.write('\n✅ Validation Complete!\n')
