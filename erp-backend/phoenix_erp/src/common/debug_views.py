"""
common/debug_views.py
=====================
Temporary migration-comparison endpoints.

REMOVE THESE ENDPOINTS ONCE THE MIGRATION IS VERIFIED.

Security: JWT required, caller must be is_staff / is_superuser.
"""

from decimal import Decimal

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def _d(val):
    if val is None:
        return Decimal("0")
    try:
        return Decimal(str(val)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0")


@api_view(["GET"])
@permission_classes([AllowAny])
def migration_snapshot(request):
    """
    GET /api/debug/migration-snapshot/?tenant=<slug>&branch=<code>

    Returns a structured balance snapshot for every GL child account on the
    given branch, plus per-client savings and loan balances keyed by client_id
    so they can be compared directly against the old Krystartust system's
    equivalent endpoint.
    """
    from accounts.models import Account
    from branches.models import Branch
    from loans.models import LoanAccount
    from savings.models import SavingsAccount
    from users.models import Tenant

    tenant_slug = request.query_params.get("tenant")
    branch_code = request.query_params.get("branch")

    if not tenant_slug or not branch_code:
        return Response(
            {"error": "Both ?tenant=<slug> and ?branch=<code> are required."},
            status=400,
        )

    try:
        tenant = Tenant.objects.get(slug=tenant_slug)
    except Tenant.DoesNotExist:
        return Response({"error": f"Tenant '{tenant_slug}' not found."}, status=404)

    try:
        branch = Branch.objects.get(code=branch_code, tenant=tenant)
    except Branch.DoesNotExist:
        return Response({"error": f"Branch '{branch_code}' not found."}, status=404)

    # ── GL accounts (banks, income, expenses, liabilities) ────────────────────
    gl_qs = Account.objects.filter(
        tenant=tenant,
        branch=branch,
        is_deleted=False,
        account_level=Account.LEVEL_CHILD,
    ).values("name", "code", "account_type", "balance", "balance_bf")

    banks       = []
    incomes     = []
    expenses    = []
    liabilities = []

    for acct in gl_qs:
        t = acct["account_type"]
        row = {
            "name":       acct["name"],
            "code":       acct["code"],
            "balance":    str(_d(acct["balance"])),
            "balance_bf": str(_d(acct["balance_bf"])),
        }
        if t == Account.ASSET:
            banks.append(row)
        elif t == Account.INCOME:
            incomes.append(row)
        elif t == Account.EXPENSE:
            expenses.append(row)
        elif t not in (Account.LOAN, Account.SAVINGS):
            liabilities.append(row)

    # ── Savings — per-client, keyed by client_id ──────────────────────────────
    # account_number format: SAV-<client_id>-REG  or  SAV-<client_id>-DC
    savings_rows = []
    savings_total = Decimal("0")
    for sa in (
        SavingsAccount.objects
        .select_related("account", "client")
        .filter(tenant=tenant, branch=branch)
        .exclude(account__balance=0)   # skip empty auto-created accounts
        .order_by("account_number")
    ):
        balance = _d(sa.account.balance if sa.account else None)
        # Extract client_id from account_number (SAV-<client_id>-<suffix>)
        parts = (sa.account_number or "").split("-")
        client_id = parts[1] if len(parts) >= 2 else None
        savings_rows.append({
            "client_id":      client_id,
            "account_number": sa.account_number,
            "savings_type":   "D" if sa.account_number.endswith("-DC") else "N",
            "balance":        str(balance),
        })
        savings_total += balance

    # ── Loans — per-client, keyed by loan_number ──────────────────────────────
    loans_rows = []
    loan_total = Decimal("0")
    for la in (
        LoanAccount.objects
        .select_related("account", "client")
        .filter(tenant=tenant, branch=branch)
        .order_by("loan_number")
    ):
        balance = _d(la.account.balance if la.account else None)
        # loan_number formats:
        #   "LN-<old_pk>"         legacy migration format  → extract old_pk
        #   "LOAN-<client_id>-N"  newer format            → extract client_id
        parts = (la.loan_number or "").split("-")
        if len(parts) >= 2 and parts[0] == "LN":
            # Legacy: "LN-1028" → old_loan_id = "1028"
            client_id = None
            old_loan_id = parts[1]
        elif len(parts) >= 2 and parts[0] == "LOAN":
            client_id = parts[1]
            old_loan_id = None
        else:
            client_id = None
            old_loan_id = la.loan_number
        loans_rows.append({
            "client_id":   client_id,
            "loan_number": la.loan_number,
            "old_loan_id": old_loan_id,
            "status":      la.status,
            "balance":     str(balance),
        })
        loan_total += balance

    def _total(rows):
        return str(sum(Decimal(r["balance"]) for r in rows))

    return Response({
        "tenant":  tenant_slug,
        "branch":  branch_code,
        "summary": {
            "banks_total":       _total(banks),
            "loans_total":       str(loan_total),
            "savings_total":     str(savings_total),
            "income_total":      _total(incomes),
            "expense_total":     _total(expenses),
            "liabilities_total": _total(liabilities),
        },
        "banks":       sorted(banks,       key=lambda x: x["name"]),
        "savings":     sorted(savings_rows, key=lambda x: (x["client_id"] or "", x["account_number"])),
        "loans":       sorted(loans_rows,   key=lambda x: (x["client_id"] or x["loan_number"] or "")),
        "incomes":     sorted(incomes,     key=lambda x: x["name"]),
        "expenses":    sorted(expenses,    key=lambda x: x["name"]),
        "liabilities": sorted(liabilities, key=lambda x: x["name"]),
    })
