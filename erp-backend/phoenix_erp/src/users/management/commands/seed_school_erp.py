# management/commands/seed_school_erp.py
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from users.seed_school_erp_complete import seed_complete_school_erp
from branches.models import Branch

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed complete school ERP system with forms, workflows, and dashboards'

    def add_arguments(self, parser):
        parser.add_argument(
            '--owner-id',
            type=int,
            help='Owner user ID',
            required=False
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID',
            required=False
        )
        # Keep email optional for backward compatibility
        parser.add_argument(
            '--owner-email',
            type=str,
            help='(Deprecated) Email of the owner user',
            required=False
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run the seeder in dry run mode (no database changes will be committed)'
        )

    def handle(self, *args, **options):
        try:
            owner = None
            branch = None

            owner_id = options.get('owner_id')
            branch_id = options.get('branch_id')
            owner_email = options.get('owner_email')

            if not owner_id and not owner_email:
                self.stdout.write(self.style.ERROR('Either --owner-id or --owner-email is required'))
                return

            if not branch_id:
                self.stdout.write(self.style.ERROR('Please provide --branch-id as integer'))
                return

            # Resolve owner (prefer id)
            if owner_id:
                owner = User.objects.filter(pk=owner_id).first()
            else:
                owner = User.objects.filter(email=owner_email).first()

            if not owner:
                self.stdout.write(self.style.ERROR('Owner user not found'))
                return

            # Resolve branch
            branch = Branch.objects.filter(pk=branch_id).first()
            if not branch:
                self.stdout.write(self.style.ERROR('Branch not found'))
                return

            dry_run = options.get('dry_run')
            if dry_run:
                self.stdout.write(self.style.WARNING('Running in dry run mode — no changes will be persisted'))
            result = seed_complete_school_erp(owner, branch, dry_run=dry_run)

            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully seeded school ERP system!'
                )
            )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))