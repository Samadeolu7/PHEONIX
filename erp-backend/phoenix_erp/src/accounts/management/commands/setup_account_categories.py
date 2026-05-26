from django.core.management.base import BaseCommand
from accounts.models import AccountCategory
from django.contrib.auth import get_user_model

class Command(BaseCommand):
    help = "Create initial account categories"

    def handle(self, *args, **options):
        User = get_user_model()
        try:
            owner = User.objects.get(id=1)
        except User.DoesNotExist:
            self.stderr.write(self.style.ERROR('User with ID 1 does not exist. Please specify a valid user ID.'))
            return

        branch = owner.branch
        if not branch:
            self.stderr.write(self.style.ERROR('User has no branch assigned.'))
            return

        for section in [1,2,3,4,5]:
            category_name = dict(AccountCategory.SECTION_CHOICES)[section]
            name = category_name.split(' (')[0]
            
            category, created = AccountCategory.objects.get_or_create(
                section=section,
                owner=owner,
                branch=branch,
                defaults={
                    'name': name,
                    'created_by': owner,
                }
            )

            if created:
                self.stdout.write(self.style.SUCCESS(f'Successfully created category {name}'))
            else:
                self.stdout.write(f'Category {name} already exists')
