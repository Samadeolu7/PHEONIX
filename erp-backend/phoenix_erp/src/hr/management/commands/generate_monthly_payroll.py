# hr/management/commands/generate_monthly_payroll.py
"""
Management command to manually trigger monthly payroll generation
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from hr.tasks import auto_generate_monthly_payroll, test_payroll_generation
import json


class Command(BaseCommand):
    help = 'Manually generate monthly payroll for all branches (simulates 27th auto-run)'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--test',
            action='store_true',
            help='Run in test mode (limited staff, test reference numbers)',
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Test with specific branch ID only',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force generation even if not the 27th',
        )
    
    def handle(self, *args, **options):
        today = timezone.now().date()
        
        if options['test']:
            self.stdout.write(self.style.WARNING('Running in TEST mode...'))
            result = test_payroll_generation(branch_id=options.get('branch_id'))
        else:
            if today.day != 27 and not options['force']:
                self.stdout.write(
                    self.style.ERROR(
                        f"Today is day {today.day}, not 27th. Use --force to override."
                    )
                )
                return
            
            if options['force']:
                self.stdout.write(
                    self.style.WARNING('Force flag enabled - generating payroll regardless of date')
                )
            
            self.stdout.write(self.style.SUCCESS('Starting monthly payroll generation...'))
            result = auto_generate_monthly_payroll()
        
        # Display results
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('Payroll Generation Results'))
        self.stdout.write('='*60 + '\n')
        
        if result.get('status') == 'skipped':
            self.stdout.write(self.style.WARNING(f"Skipped: {result.get('reason')}"))
            return
        
        for branch_result in result.get('results', []):
            branch_name = branch_result['branch']
            status = branch_result['status']
            
            if status == 'success':
                self.stdout.write(
                    self.style.SUCCESS(f"✓ {branch_name}: {branch_result['reference']}")
                )
                self.stdout.write(
                    f"  Payslips: {branch_result.get('payslips_created', 'N/A')}, "
                    f"Total: ${branch_result.get('total_net_pay', 'N/A')}"
                )
            elif status == 'skipped':
                self.stdout.write(
                    self.style.WARNING(
                        f"○ {branch_name}: Skipped - {branch_result.get('reason')}"
                    )
                )
                if branch_result.get('reference'):
                    self.stdout.write(f"  Existing: {branch_result['reference']}")
            else:
                self.stdout.write(
                    self.style.ERROR(f"✗ {branch_name}: {branch_result.get('error', 'Unknown error')}")
                )
        
        self.stdout.write('\n' + '='*60)
        
        # Summary
        total = len(result.get('results', []))
        successful = len([r for r in result.get('results', []) if r['status'] == 'success'])
        skipped = len([r for r in result.get('results', []) if r['status'] == 'skipped'])
        failed = len([r for r in result.get('results', []) if r['status'] == 'error'])
        
        self.stdout.write(
            f"\nTotal: {total} | "
            f"Success: {self.style.SUCCESS(str(successful))} | "
            f"Skipped: {self.style.WARNING(str(skipped))} | "
            f"Failed: {self.style.ERROR(str(failed))}"
        )
