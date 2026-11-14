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
