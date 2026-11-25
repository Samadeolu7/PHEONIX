# Project rules

## Client-facing ledgers and statements must be clean

Anything a client sees about their own account (loan ledger, loan statement,
client ledger, client statement, portal views, PDFs or exports sent to
clients) must show the **cleaned-up history only**: what was genuinely
charged and genuinely paid, with a running balance that matches.

Never show a client:
- reversed entries or their reversals (`Transaction.is_reversed` /
  `is_reversal`, "REVERSAL: …" descriptions);
- correction, repair, catch-up or restore entries posted by management
  commands, e.g. "Loan penalty accrual (compounding bug corrected) — …",
  "(cutover-corrected)", "(payoff-capped, corrected)", "(understated
  catch-up)", "Penalty accrual over-collection reversal — …";
- internal references to bugs, fixes, audits or reposting.

Instead, net corrections into the item they correct, so the client sees one
line for what was actually charged (e.g. one penalty charge per installment
and period, at its correct amount) and the closing balance still equals the
true outstanding balance.

Staff screens may keep the full audit trail (including a "show reversed
entries" toggle). When adding any new correction command, choose descriptions
that client-facing views can recognise and net away, and update the
client-facing filtering to cover them.

## Branches: customer records, acting branch, cash custody, inter-branch

Staff are moved between branches temporarily while their assigned (home)
branch stays the same. So:

- **Never use `request.user.branch` to decide where something is booked or
  handled.** Use the *acting branch*: the branch picked in the branch
  switcher (`X-Branch-ID`) when the user may act there (directors: any
  branch; other staff: home or a temporarily granted branch), else their
  home branch — `common.views.resolve_effective_branch(request)`, or
  `ScopedModelViewSet._get_director_branch_override()` inside a viewset.
- **Customer records live in the customer's branch** (loans, savings,
  income, invoices, receivables, requests, corrections ...). In a
  `ScopedModelViewSet` this is automatic: `customer_branch_fields` picks the
  branch from the linked client / loan / savings account on create. Opt out
  (`customer_branch_fields = ()`) only for genuinely staff-side records
  (e.g. stock issued from the staff's own store).
- **Per-branch setup records are cloned per branch** (products, loan/savings
  products, fee structures, service items, inventory items, income
  categories ...), each pointing at that branch's GL accounts. When a record
  is booked in a branch, use *that branch's* copy: list the fields in
  `branch_copy_fields`, or call `common.views.branch_copy_of()`. Never let a
  journal entry fall back to another branch's account.
- **Cash custody rule** (`cash_management/services/cash_custody.py`): staff
  may only receive cash from, or pay cash to, a customer of the branch they
  are acting in, through their own till in that branch. Get tills only via
  `PaymentRoutingService.resolve_cashier_gl_account(...)` or
  `IncomeAccountingService.get_cash_account(...)`; both require
  `acting_branch=cash_custody.acting_branch(request)` and enforce the rule.
  Anything else touching a `CashierAccount` for a customer must call
  `require_cash_custody()` first.
- **Every journal entry stays inside one branch and balances.** Where money
  genuinely moves between branches (e.g. a branch-A bank account paying for
  a branch-B customer), add the other branch's account with
  `interbranch.services.add_entry()`: it posts that side as a linked leg in
  its own branch through Due From / Due To, so each branch's balance sheet
  balances and the pair eliminates on consolidation. Post and reverse only
  the main transaction (`post()` / `reverse()` / `void()` carry the legs).
  Do not use it to paper over a misconfigured GL account — those must keep
  failing the same-branch check.
