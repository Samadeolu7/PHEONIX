"""
Management command: merge_duplicate_clients
============================================
Merges duplicate student (Client) records that were created because the
school-fees-import ran twice:

  Run 1: Excel had a REF column → clients created with client_id = S247, S246 …
         Branch was NULL because the multipart middleware didn't fire in time.
  Run 2: Excel had no REF column → client_id auto-built from name (UKO-ANN …)
         with correct tenant + branch.

For every S###-style client that has a name-match to a UKO-style client:

  1. Identify the KEEPER (has branch)  and  ORPHAN (branch=None).
  2. For each posted invoice on the ORPHAN:
       - If the KEEPER already has a posted invoice with the same service items
         (same term/fees) → it's a duplicate: REVERSE the ORPHAN's journal entry
         then cancel the ORPHAN's invoice.
       - Otherwise → re-assign invoice.client = KEEPER (so the payment history
         is preserved under the correct client record).
  3. Reassign all other FK references (FeeEntitlements, Receivables,
     CashCollections, Income, Notifications, Documents, Notes, Relationships)
     from the ORPHAN to the KEEPER.
  4. Soft-delete the ORPHAN client (is_deleted=True).

Usage
-----
  # Preview what would change (safe, no DB writes)
  python manage.py merge_duplicate_clients --dry-run --user-id 1

  # Execute the merge
  python manage.py merge_duplicate_clients --execute --user-id 1

Options
-------
  --dry-run     (default) Print the merge plan without touching the database.
  --execute     Perform the actual merge inside a single transaction; rolls
                back automatically if anything raises an exception.
  --user-id N   ID of the admin user who "authors" any reversal journal entries.
                Required for --execute; ignored in --dry-run.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone


# ─── helpers ──────────────────────────────────────────────────────────────────

def _norm_name(first, last):
    """Return a normalised (first, last) tuple for comparison."""
    return (
        (first or '').strip().lower(),
        (last  or '').strip().lower(),
    )


def _invoice_service_key(invoice):
    """
    Return a (invoice_date, total_amount) tuple that uniquely identifies an
    invoice for deduplication purposes.

    Two invoices created by the school-fees-import running twice will always
    share the same payment date (read from the Excel row) and total_amount, so
    this key reliably detects them as duplicates without needing InvoiceItem
    records (which may not exist for invoices created by older import runs).

    Always returns a truthy value.
    """
    return (str(invoice.invoice_date), str(invoice.total_amount))


# ─── FK reassignment helpers ──────────────────────────────────────────────────

def _reassign_fk(orphan, keeper, log):
    """
    Bulk-update every model that has a ForeignKey to Client, pointing
    orphan → keeper.  Returns total rows moved.
    """
    from incomes.models import Invoice, Income, FeeEntitlement
    from clients.models import ClientDocument, ClientNote, ClientRelationship

    moved = 0

    # incomes.Invoice  (only UNHANDLED ones - duplicates already cancelled)
    n = Invoice.objects.all_tenants().filter(
        client=orphan, is_deleted=False
    ).update(client=keeper)
    if n:
        log(f"    Income Invoice  : {n} reassigned")
    moved += n

    # incomes.Income
    n = Income.objects.all_tenants().filter(
        client=orphan, is_deleted=False
    ).update(client=keeper)
    if n:
        log(f"    Income          : {n} reassigned")
    moved += n

    # incomes.FeeEntitlement
    n = FeeEntitlement.objects.all_tenants().filter(
        client=orphan
    ).update(client=keeper)
    if n:
        log(f"    FeeEntitlement  : {n} reassigned")
    moved += n

    # receivables.Receivable
    try:
        from receivables.models import Receivable
        n = Receivable.objects.all_tenants().filter(
            client=orphan
        ).update(client=keeper)
        if n:
            log(f"    Receivable      : {n} reassigned")
        moved += n
    except Exception:
        pass

    # receivables.ClientStatement
    try:
        from receivables.models import ClientStatement
        n = ClientStatement.objects.all_tenants().filter(
            client=orphan
        ).update(client=keeper)
        if n:
            log(f"    ClientStatement : {n} reassigned")
        moved += n
    except Exception:
        pass

    # cash_management.CashCollection
    try:
        from cash_management.models import CashCollection
        n = CashCollection.objects.all_tenants().filter(
            client=orphan
        ).update(client=keeper)
        if n:
            log(f"    CashCollection  : {n} reassigned")
        moved += n
    except Exception:
        pass

    # notifications.Notification
    try:
        from notifications.models import Notification
        n = Notification.objects.filter(
            recipient_client=orphan
        ).update(recipient_client=keeper)
        if n:
            log(f"    Notification    : {n} reassigned")
        moved += n
    except Exception:
        pass

    # loans.LoanAccount
    try:
        from loans.models import LoanAccount
        n = LoanAccount.objects.all_tenants().filter(
            client=orphan
        ).update(client=keeper)
        if n:
            log(f"    LoanAccount     : {n} reassigned")
        moved += n
    except Exception:
        pass

    # savings.SavingsAccount
    try:
        from savings.models import SavingsAccount
        n = SavingsAccount.objects.all_tenants().filter(
            client=orphan
        ).update(client=keeper)
        if n:
            log(f"    SavingsAccount  : {n} reassigned")
        moved += n
    except Exception:
        pass

    # clients.ClientDocument / ClientNote / ClientRelationship (CASCADE-delete
    # on client deletion, so we re-point them to the keeper first)
    n = ClientDocument.objects.filter(client=orphan).update(client=keeper)
    if n:
        log(f"    ClientDocument  : {n} reassigned")
    moved += n

    n = ClientNote.objects.filter(client=orphan).update(client=keeper)
    if n:
        log(f"    ClientNote      : {n} reassigned")
    moved += n

    n = ClientRelationship.objects.filter(from_client=orphan).update(from_client=keeper)
    n2 = ClientRelationship.objects.filter(to_client=orphan).update(to_client=keeper)
    if n + n2:
        log(f"    ClientRelationship: {n + n2} reassigned")
    moved += n + n2

    return moved


# ─── Command ──────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = (
        "Merge duplicate student records created by multiple school-fees-import runs."
    )

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument(
            '--dry-run',
            action='store_true',
            default=True,
            help='(default) Print the merge plan without writing to the database.',
        )
        mode.add_argument(
            '--execute',
            action='store_true',
            default=False,
            help='Perform the actual merge. Rolls back entirely on any error.',
        )
        parser.add_argument(
            '--user-id',
            type=int,
            default=None,
            help='ID of the admin user who authors reversal journal entries (required for --execute).',
        )

    def handle(self, *args, **options):
        execute = options['execute']
        dry_run = not execute
        user_id = options['user_id']

        if execute and not user_id:
            raise CommandError(
                '--user-id is required when using --execute. '
                'Pass the ID of an admin user (e.g. --user-id 1).'
            )

        from django.contrib.auth import get_user_model
        from clients.models import Client
        from incomes.models import Invoice

        User = get_user_model()

        acting_user = None
        if execute:
            try:
                acting_user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                raise CommandError(f"No user found with id={user_id}.")

        # ── 1. Load ALL non-deleted clients regardless of tenant/branch ────────
        all_clients = list(
            Client.objects.all_tenants()
            .filter(is_deleted=False)
            .select_related('branch', 'tenant')
        )

        self.stdout.write(f"Total active clients in DB: {len(all_clients)}")

        orphans  = [c for c in all_clients if c.branch_id is None]
        keepers_pool = [c for c in all_clients if c.branch_id is not None]

        self.stdout.write(f"  Without branch (orphans) : {len(orphans)}")
        self.stdout.write(f"  With branch (candidates) : {len(keepers_pool)}")

        if not orphans:
            self.stdout.write(self.style.SUCCESS(
                "\nNo orphaned clients found. Nothing to merge."
            ))
            return

        # ── 2. Build name → keeper lookup ──────────────────────────────────────
        # If two keepers share the same name (shouldn't happen), keep the later one
        keeper_by_name = {}
        for c in keepers_pool:
            key = _norm_name(c.first_name, c.last_name)
            # prefer most recently created
            if key not in keeper_by_name or c.created_at > keeper_by_name[key].created_at:
                keeper_by_name[key] = c

        # ── 3. Pair orphans with keepers ────────────────────────────────────────
        pairs         = []   # (orphan, keeper)
        unmatched     = []   # orphans with no name-match keeper

        for orphan in orphans:
            key = _norm_name(orphan.first_name, orphan.last_name)
            keeper = keeper_by_name.get(key)
            if keeper:
                pairs.append((orphan, keeper))
            else:
                unmatched.append(orphan)

        self.stdout.write(f"\nMatched pairs  : {len(pairs)}")
        self.stdout.write(f"No keeper found: {len(unmatched)}")

        if unmatched:
            self.stdout.write(self.style.WARNING(
                "\nOrphans with no matching keeper (will be fixed: assign branch only):"
            ))
            for c in unmatched:
                self.stdout.write(
                    f"  {c.client_id:15s} {c.first_name} {c.last_name}"
                )

        if not pairs and not unmatched:
            self.stdout.write(self.style.SUCCESS("\nNothing to do."))
            return

        # ── 4. Analyse each pair ────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write("MERGE PLAN")
        self.stdout.write("=" * 70)

        merge_plan = []  # (orphan, keeper, duplicate_inv, reassign_inv)

        for orphan, keeper in pairs:
            # Load posted invoices on both sides (oldest first so we keep the
            # earliest when deduplicating within-orphan invoices)
            orphan_invoices = list(
                Invoice.objects.all_tenants()
                .filter(client=orphan, is_deleted=False, is_posted=True)
                .order_by('created_at')
            )
            keeper_invoices = list(
                Invoice.objects.all_tenants()
                .filter(client=keeper, is_deleted=False, is_posted=True)
            )

            # ── Step A: deduplicate WITHIN the orphan's own invoices ────────────
            # The import may have run N times producing N copies of the same
            # invoice under the same S### client.  Keep the oldest occurrence of
            # each unique service-key; flag the rest as intra-orphan duplicates.
            seen_orphan_keys = {}   # key → first (oldest) invoice
            intra_dups  = []        # later copies — will be reversed
            unique_orphan = []

            for inv in orphan_invoices:
                key = _invoice_service_key(inv)
                if key in seen_orphan_keys:
                    intra_dups.append(inv)
                else:
                    seen_orphan_keys[key] = inv
                    unique_orphan.append(inv)

            # ── Step B: compare surviving orphan invoices against keeper's ──────
            keeper_keys = {_invoice_service_key(inv) for inv in keeper_invoices}

            duplicate_inv = list(intra_dups)   # intra-orphan dups always reversed
            reassign_inv  = []

            for inv in unique_orphan:
                key = _invoice_service_key(inv)
                if key in keeper_keys:
                    # Keeper already has this exact invoice — reverse the orphan's
                    duplicate_inv.append(inv)
                else:
                    reassign_inv.append(inv)

            # Un-posted orphan invoices — just reassign, no reversal needed
            unposted = list(
                Invoice.objects.all_tenants()
                .filter(client=orphan, is_deleted=False, is_posted=False)
            )
            reassign_inv.extend(unposted)

            merge_plan.append((orphan, keeper, duplicate_inv, reassign_inv))

            self.stdout.write(
                f"\n  ORPHAN  : [{orphan.client_id}] {orphan.first_name} {orphan.last_name}"
                f"  (tenant={orphan.tenant_id}, branch=None)"
            )
            self.stdout.write(
                f"  KEEPER  : [{keeper.client_id}] {keeper.first_name} {keeper.last_name}"
                f"  (tenant={keeper.tenant_id}, branch={keeper.branch_id})"
            )
            if intra_dups:
                self.stdout.write(
                    f"  REVERSE {len(intra_dups)} within-orphan duplicate invoice(s) "
                    f"(same fees imported {len(intra_dups) + 1}× under S### client):"
                )
                for inv in intra_dups:
                    self.stdout.write(
                        f"    ✕ {inv.invoice_number}  ₦{inv.total_amount}  "
                        f"[intra-dup]  JE={getattr(inv.journal_entry, 'reference_number', 'none')}"
                    )
            cross_dups = [i for i in duplicate_inv if i not in intra_dups]
            if cross_dups:
                self.stdout.write(
                    f"  REVERSE {len(cross_dups)} cross-duplicate invoice(s) "
                    f"(keeper already has matching invoice):"
                )
                for inv in cross_dups:
                    self.stdout.write(
                        f"    ✕ {inv.invoice_number}  ₦{inv.total_amount}  "
                        f"[{inv.status}]  JE={getattr(inv.journal_entry, 'reference_number', 'none')}"
                    )
            if reassign_inv:
                self.stdout.write(
                    f"  MOVE    {len(reassign_inv)} unique invoice(s) to keeper:"
                )
                for inv in reassign_inv:
                    self.stdout.write(
                        f"    → {inv.invoice_number}  ₦{inv.total_amount}  [{inv.status}]"
                    )

        if dry_run:
            total_reversed = sum(len(d) for _, _, d, _ in merge_plan)
            total_moved    = sum(len(r) for _, _, _, r in merge_plan)
            self.stdout.write(
                self.style.WARNING(
                    f"\n[DRY RUN] {len(pairs)} client(s) would be merged.\n"
                    f"  Invoices to REVERSE (duplicates) : {total_reversed}\n"
                    f"  Invoices to MOVE to keeper       : {total_moved}\n"
                    "Re-run with --execute --user-id <id> to apply."
                )
            )
            if unmatched:
                self.stdout.write(
                    self.style.WARNING(
                        f"[DRY RUN] {len(unmatched)} orphan(s) with no match "
                        "would be assigned the first available branch."
                    )
                )
            return

        # ── 5. Execute ─────────────────────────────────────────────────────────
        self.stdout.write(f"\nExecuting merge as user '{acting_user}' …")

        merged = 0
        reversed_invoices = 0
        reassigned_invoices = 0
        errors = []

        with db_transaction.atomic():
            # 5a. Merge matched pairs
            for orphan, keeper, duplicate_inv, reassign_inv in merge_plan:
                try:
                    def log(msg):
                        self.stdout.write(msg)

                    log(
                        f"\n  Merging [{orphan.client_id}] → [{keeper.client_id}] "
                        f"{keeper.first_name} {keeper.last_name}"
                    )

                    # Reverse duplicate invoices
                    for inv in duplicate_inv:
                        je = getattr(inv, 'journal_entry', None)
                        if je and je.approved and not je.is_reversed:
                            je.reverse(
                                acting_user,
                                reason=(
                                    f'Duplicate from school-fees-import: '
                                    f'keeper invoice already exists for '
                                    f'{keeper.client_id}'
                                ),
                            )
                            log(f"    Reversed JE: {je.reference_number}")
                        # Soft-cancel the invoice
                        inv.status = 'cancelled'
                        inv.is_deleted = True
                        inv.save(update_fields=['status', 'is_deleted'])
                        reversed_invoices += 1

                    # Reassign all remaining FKs
                    _reassign_fk(orphan, keeper, log)
                    reassigned_invoices += len(reassign_inv)

                    # Soft-delete the orphan
                    orphan.is_deleted = True
                    orphan.save(update_fields=['is_deleted'])
                    log(f"    ✓ Orphan [{orphan.client_id}] soft-deleted")
                    merged += 1

                except Exception as exc:
                    errors.append(
                        f"{orphan.client_id} → {keeper.client_id}: {exc}"
                    )
                    raise  # re-raise to trigger rollback

            # 5b. Fix unmatched orphans: just assign the first branch/tenant
            if unmatched:
                from users.models import Tenant
                from branches.models import Branch

                tenant = Tenant.objects.first()
                branch = Branch.objects.all_tenants().order_by('id').first()

                for orphan in unmatched:
                    if orphan.tenant_id is None:
                        orphan.tenant = tenant
                    if orphan.branch_id is None:
                        orphan.branch = branch
                    orphan.save(update_fields=['tenant', 'branch'])
                    self.stdout.write(
                        f"  Fixed unmatched orphan [{orphan.client_id}] "
                        f"→ branch={branch}"
                    )

        # ── 6. Summary ─────────────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS(
            f"Merge complete.\n"
            f"  Clients merged        : {merged}\n"
            f"  Invoices reversed     : {reversed_invoices}\n"
            f"  Invoices reassigned   : {reassigned_invoices}\n"
            f"  Unmatched orphans fixed: {len(unmatched)}\n"
        ))
        if errors:
            self.stdout.write(self.style.ERROR(f"Errors ({len(errors)}):"))
            for e in errors:
                self.stdout.write(self.style.ERROR(f"  {e}"))
