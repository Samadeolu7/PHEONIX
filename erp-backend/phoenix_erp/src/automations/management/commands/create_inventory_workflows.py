from django.core.management.base import BaseCommand, CommandError
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Create or update inventory-related workflow templates from "
        "`automations.workflow_definitions.inventory_workflows`"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--branch-id",
            type=int,
            required=True,
            help="Primary key of the Branch to attach the workflows to",
        )
        parser.add_argument(
            "--owner-id",
            type=int,
            required=True,
            help="Primary key of the owner User for the workflows",
        )
        parser.add_argument(
            "--created-by-id",
            type=int,
            required=True,
            help="Primary key of the user who will be set as created_by",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Recreate/update templates even if they already exist",
        )

    def handle(self, *args, **options):
        branch_id = options.get("branch_id")
        owner_id = options.get("owner_id")
        created_by_id = options.get("created_by_id")
        force = options.get("force")

        User = get_user_model()
        try:
            Branch = apps.get_model("branches", "Branch")
        except LookupError:
            raise CommandError("Could not find Branch model in 'branches' app")

        try:
            branch = Branch.objects.get(pk=branch_id)
        except Branch.DoesNotExist:
            raise CommandError(f"Branch with id={branch_id} does not exist")

        try:
            owner = User.objects.get(pk=owner_id)
        except User.DoesNotExist:
            raise CommandError(f"Owner user with id={owner_id} does not exist")

        try:
            created_by = User.objects.get(pk=created_by_id)
        except User.DoesNotExist:
            raise CommandError(f"Created-by user with id={created_by_id} does not exist")

        # Import the workflow definitions module
        try:
            from automations.workflow_definitions import inventory_workflows as iw
        except Exception as exc:
            raise CommandError(f"Failed to import workflow definitions: {exc}")

        WorkflowTemplate = apps.get_model("automations", "WorkflowTemplate")

        workflows = [
            iw.BUY_INVENTORY_WORKFLOW,
            iw.SELL_INVENTORY_WORKFLOW,
            iw.PREPAID_FUEL_PURCHASE_WORKFLOW,
            iw.ISSUE_FUEL_VOUCHER_WORKFLOW,
            iw.REDEEM_FUEL_VOUCHER_WORKFLOW,
        ]

        created_objs = []
        updated_objs = []

        with transaction.atomic():
            for wf in workflows:
                code = wf.get("code")
                name = wf.get("name")
                defaults = {
                    "name": wf.get("name"),
                    "description": wf.get("description", ""),
                    "trigger_type": wf.get("trigger_type"),
                    "trigger_config": wf.get("trigger_config"),
                    "workflow_definition": wf.get("workflow_definition"),
                    "workflow_type": "template",
                    "access_level": "internal",
                    "is_active": True,
                    "owner": owner,
                    "branch": branch,
                    "created_by": created_by,
                }

                # The WorkflowTemplate model does not include a `code` field
                # in this codebase. Use `name` as the lookup key instead so
                # we don't need to change the model and run migrations.
                obj_qs = WorkflowTemplate.objects.filter(name=name)
                if obj_qs.exists():
                    if force:
                        obj = obj_qs.first()
                        for k, v in defaults.items():
                            setattr(obj, k, v)
                        obj.save()
                        updated_objs.append(obj)
                        self.stdout.write(self.style.SUCCESS(f"Updated workflow '{name}'"))
                    else:
                        self.stdout.write(self.style.NOTICE(f"Skipping existing workflow '{name}'. Use --force to update."))
                else:
                    obj = WorkflowTemplate.objects.create(**defaults)
                    created_objs.append(obj)
                    self.stdout.write(self.style.SUCCESS(f"Created workflow '{name}'"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Created: {len(created_objs)}   Updated: {len(updated_objs)}"))

        if created_objs:
            self.stdout.write("Created workflow IDs: " + ", ".join(str(o.pk) for o in created_objs))
        if updated_objs:
            self.stdout.write("Updated workflow IDs: " + ", ".join(str(o.pk) for o in updated_objs))
