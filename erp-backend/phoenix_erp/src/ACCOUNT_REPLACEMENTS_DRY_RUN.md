# Account Replacement Dry-Run Report

This file lists detected `Account.objects.get` / `get_or_create` calls and suggested replacement templates using the centralized account creation utility.

Run `python tools/generate_account_replacements.py` to regenerate this report.

(Report produced as a dry-run; it does NOT change source files.)

---

Summary: run the script to generate full details. The script scans the repository and writes detailed suggestions including file, line, original call, and a suggested replacement snippet using:

- `get_or_create_child_account(parent_code, child_suffix, name, account_type, owner, branch, ...)` for child codes (e.g., `101-001`).
- `get_or_create_system_account(code, name, account_type, owner, branch)` for parent codes (e.g., `501`).

Guidelines to apply replacements safely:
- Only auto-replace calls that use literal `code='...'` values and whose `defaults` include `name` and `account_type`. The script highlights which entries are safe.
- Keep `Account.objects.get(pk=...)` and `Account.objects.get(id=...)` as-is (do not auto-create by PK).
- For ambiguous cases (computed `code`, missing `owner`/`branch`), review manually.

Next steps:
- Run the generator and review `ACCOUNT_REPLACEMENTS_DRY_RUN.md` for exact per-file suggestions.
- Approve and I can apply straightforward replacements automatically and run targeted tests.

---
