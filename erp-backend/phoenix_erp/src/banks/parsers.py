# banks/parsers.py
"""
Bank statement parsers for the Bank-Recon integration.

Parses uploaded CSV files from First Bank Nigeria into a normalised list of
transaction dicts that Django forwards to the Java IngestAndMatchController.

First Bank CSV column layout (standard e-statement export):
  Transaction Date | Narration | Reference | Debit | Credit | Balance

Rules applied:
  - Amounts have comma-thousands separators: "50,000.00" → Decimal('50000.00')
  - Date format: DD/MM/YYYY
  - Empty Debit → credit transaction; empty Credit → debit transaction
  - A hash of (account_number, date, amount, direction, narration) is used as
    bank_ref when the Reference column is blank (idempotency key for Java).
  - Header row is detected automatically; rows with no amount are skipped.
"""

import csv
import hashlib
import io
import logging
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import IO, List

logger = logging.getLogger(__name__)


@dataclass
class ParsedTransaction:
    bank_ref: str          # unique reference (from CSV or hash-derived)
    value_date: str        # ISO-8601 string: YYYY-MM-DD
    narration: str
    direction: str         # 'CREDIT' | 'DEBIT'
    amount: str            # Decimal string, e.g. "50000.00"
    balance_after: str     # Decimal string or empty string


class FirstBankStatementParser:
    """
    Parses a First Bank of Nigeria e-statement CSV.

    Usage::

        with open('statement.csv', 'rb') as fh:
            transactions = FirstBankStatementParser.parse(fh, account_number='1234567890')
    """

    # First Bank column headers (case-insensitive after strip)
    _COL_DATE       = {'transaction date', 'date', 'trans date', 'value date'}
    _COL_NARRATION  = {'narration', 'description', 'transaction description'}
    _COL_REFERENCE  = {'reference', 'ref', 'cheque no', 'instrument no'}
    _COL_DEBIT      = {'debit', 'withdrawal', 'dr'}
    _COL_CREDIT     = {'credit', 'deposit', 'cr'}
    _COL_BALANCE    = {'balance', 'running balance', 'ledger balance'}

    @classmethod
    def parse(cls, file_obj: IO[bytes], account_number: str = '') -> List[ParsedTransaction]:
        """
        Parse a CSV file object (binary mode) and return a list of ParsedTransaction.

        Raises ValueError with a human-readable message if the file cannot be parsed.
        """
        try:
            text = file_obj.read()
            if isinstance(text, bytes):
                # Try UTF-8 first, fall back to latin-1 (common in bank exports)
                try:
                    text = text.decode('utf-8-sig')  # strip BOM if present
                except UnicodeDecodeError:
                    text = text.decode('latin-1')
        except Exception as exc:
            raise ValueError(f"Cannot read statement file: {exc}") from exc

        reader = csv.reader(io.StringIO(text))
        rows = list(reader)

        if not rows:
            raise ValueError("Statement file is empty.")

        # Find header row (first row that contains at least a date and amount column)
        header_idx, col_map = cls._find_header(rows)
        if header_idx is None:
            raise ValueError(
                "Could not locate header row. Expected columns: "
                "Transaction Date, Narration, Debit, Credit."
            )

        transactions: List[ParsedTransaction] = []
        for row_num, row in enumerate(rows[header_idx + 1:], start=header_idx + 2):
            if not any(cell.strip() for cell in row):
                continue  # blank row

            try:
                txn = cls._parse_row(row, col_map, account_number, row_num)
            except (ValueError, InvalidOperation) as exc:
                logger.warning("Row %d skipped — %s", row_num, exc)
                continue

            if txn:
                transactions.append(txn)

        if not transactions:
            raise ValueError(
                "No valid transactions found in the statement. "
                "Please verify the file format."
            )

        return transactions

    # ── internals ────────────────────────────────────────────────────────────

    @classmethod
    def _find_header(cls, rows):
        """Return (header_row_index, column_map) or (None, None)."""
        for idx, row in enumerate(rows):
            normalised = [c.strip().lower() for c in row]
            col_map = {}
            for col_idx, name in enumerate(normalised):
                if name in cls._COL_DATE:
                    col_map['date'] = col_idx
                elif name in cls._COL_NARRATION:
                    col_map['narration'] = col_idx
                elif name in cls._COL_REFERENCE:
                    col_map['reference'] = col_idx
                elif name in cls._COL_DEBIT:
                    col_map['debit'] = col_idx
                elif name in cls._COL_CREDIT:
                    col_map['credit'] = col_idx
                elif name in cls._COL_BALANCE:
                    col_map['balance'] = col_idx
            if 'date' in col_map and ('debit' in col_map or 'credit' in col_map):
                return idx, col_map
        return None, None

    @classmethod
    def _parse_row(cls, row, col_map, account_number, row_num):
        """Parse one data row; return ParsedTransaction or None if row should be skipped."""

        def get(key, default=''):
            idx = col_map.get(key)
            if idx is None or idx >= len(row):
                return default
            return row[idx].strip()

        raw_date     = get('date')
        raw_narration = get('narration')
        raw_reference = get('reference')
        raw_debit    = get('debit')
        raw_credit   = get('credit')
        raw_balance  = get('balance')

        # Parse date
        value_date = cls._parse_date(raw_date)
        if value_date is None:
            if not raw_date:
                return None  # likely a sub-total / footer row
            raise ValueError(f"Unrecognised date format: '{raw_date}'")

        # Parse amounts
        debit_amount  = cls._parse_amount(raw_debit)
        credit_amount = cls._parse_amount(raw_credit)
        balance       = cls._parse_amount(raw_balance)

        if debit_amount is None and credit_amount is None:
            return None  # no amount — skip

        if credit_amount is not None and credit_amount > Decimal('0'):
            direction = 'CREDIT'
            amount = credit_amount
        elif debit_amount is not None and debit_amount > Decimal('0'):
            direction = 'DEBIT'
            amount = debit_amount
        else:
            return None  # both zero — skip

        # Derive bank_ref
        if raw_reference:
            bank_ref = raw_reference[:200]
        else:
            # Deterministic hash so Java can deduplicate on re-upload
            h = hashlib.sha256(
                f"{account_number}|{value_date}|{amount}|{direction}|{raw_narration}"
                .encode('utf-8')
            ).hexdigest()[:32]
            bank_ref = f"HASH-{h}"

        return ParsedTransaction(
            bank_ref=bank_ref,
            value_date=value_date,
            narration=raw_narration[:500],
            direction=direction,
            amount=str(amount),
            balance_after=str(balance) if balance is not None else '',
        )

    @staticmethod
    def _parse_date(raw: str) -> str | None:
        """Return ISO date string or None."""
        if not raw:
            return None
        raw = raw.strip()
        # Try DD/MM/YYYY
        for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%y'):
            try:
                from datetime import datetime
                return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
            except ValueError:
                continue
        return None

    @staticmethod
    def _parse_amount(raw: str) -> Decimal | None:
        """Strip commas and return Decimal, or None for blank/dash."""
        if not raw or raw.strip() in ('', '-', 'N/A'):
            return None
        cleaned = raw.replace(',', '').replace(' ', '')
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None
