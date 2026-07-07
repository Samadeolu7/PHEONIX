"""
Unit tests for banks/parsers.py.

These parsers have no Django/DB dependency, so plain unittest.TestCase
(via SimpleTestCase) is enough — no database is created for this module.
"""
import io
import re
import zipfile

from django.test import SimpleTestCase

from .parsers import (
    ExcelStatementParser,
    FirstBankStatementParser,
    QifStatementParser,
    parse_statement_file,
)


class FirstBankStatementParserTests(SimpleTestCase):

    def test_parses_credit_and_debit_rows(self):
        csv_text = (
            "Transaction Date,Narration,Reference,Debit,Credit,Balance\n"
            "01/07/2026,Test credit,REF1,,5000.00,5000.00\n"
            "02/07/2026,Test debit,REF2,1200.50,,3799.50\n"
        )
        txns = FirstBankStatementParser.parse(io.BytesIO(csv_text.encode()), account_number='123')

        self.assertEqual(len(txns), 2)
        self.assertEqual(txns[0].direction, 'CREDIT')
        self.assertEqual(txns[0].amount, '5000.00')
        self.assertEqual(txns[0].bank_ref, 'REF1')
        self.assertEqual(txns[1].direction, 'DEBIT')
        self.assertEqual(txns[1].amount, '1200.50')

    def test_missing_reference_derives_deterministic_hash(self):
        csv_text = (
            "Transaction Date,Narration,Reference,Debit,Credit,Balance\n"
            "01/07/2026,No ref row,,,5000.00,5000.00\n"
        )
        txns_a = FirstBankStatementParser.parse(io.BytesIO(csv_text.encode()), account_number='123')
        txns_b = FirstBankStatementParser.parse(io.BytesIO(csv_text.encode()), account_number='123')

        self.assertTrue(txns_a[0].bank_ref.startswith('HASH-'))
        self.assertEqual(txns_a[0].bank_ref, txns_b[0].bank_ref)  # deterministic

    def test_raises_when_no_header_found(self):
        with self.assertRaises(ValueError):
            FirstBankStatementParser.parse(io.BytesIO(b"not,a,statement\n1,2,3\n"), account_number='123')


class QifStatementParserTests(SimpleTestCase):

    SAMPLE = (
        "!Type:Bank\n"
        "D01/07/2026\n"
        "T-100\n"
        "NS55713319\n"
        "PStamp Duty Charge\n"
        "MStamp Duty Charge on 2 TXNS\n"
        "^\n"
        "D02/07/2026\n"
        "T2000\n"
        "NS57331290\n"
        "PInward transfer\n"
        "MCPWInward:100004260701.../MUTIYAT A Ref100211607868\n"
        "^\n"
    )

    def test_parses_debit_and_credit_by_sign(self):
        txns = QifStatementParser.parse(io.BytesIO(self.SAMPLE.encode()), account_number='6683612430')

        self.assertEqual(len(txns), 2)
        self.assertEqual(txns[0].direction, 'DEBIT')
        self.assertEqual(txns[0].amount, '100')
        self.assertEqual(txns[0].value_date, '2026-07-01')
        self.assertEqual(txns[0].bank_ref, 'S55713319')

        self.assertEqual(txns[1].direction, 'CREDIT')
        self.assertEqual(txns[1].amount, '2000')
        self.assertEqual(txns[1].value_date, '2026-07-02')

    def test_missing_reference_derives_hash(self):
        text = "!Type:Bank\nD01/07/2026\nT500\nPNo ref payee\n^\n"
        txns = QifStatementParser.parse(io.BytesIO(text.encode()), account_number='x')
        self.assertTrue(txns[0].bank_ref.startswith('HASH-'))

    def test_record_without_trailing_caret_is_still_parsed(self):
        text = "!Type:Bank\nD01/07/2026\nT500\nNREF1\nPPayee"  # no trailing '^'
        txns = QifStatementParser.parse(io.BytesIO(text.encode()), account_number='x')
        self.assertEqual(len(txns), 1)

    def test_raises_when_no_records_found(self):
        with self.assertRaises(ValueError):
            QifStatementParser.parse(io.BytesIO(b"!Type:Bank\n"), account_number='x')


class ExcelStatementParserTests(SimpleTestCase):

    def _build_workbook_bytes(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['Date', 'Narration', 'Reference', 'Debit', 'Credit', 'Balance'])
        ws.append(['01/07/2026', 'Test credit', 'REF1', None, 5000.0, 5000.0])
        ws.append(['02/07/2026', 'Test debit', 'REF2', 1200.5, None, 3799.5])
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def test_parses_wellformed_workbook(self):
        txns = ExcelStatementParser.parse(io.BytesIO(self._build_workbook_bytes()), account_number='123')

        self.assertEqual(len(txns), 2)
        self.assertEqual(txns[0].direction, 'CREDIT')
        self.assertEqual(txns[0].amount, '5000')
        self.assertEqual(txns[1].direction, 'DEBIT')
        self.assertEqual(txns[1].amount, '1200.5')

    def test_tolerates_invalid_alignment_casing_in_styles_xml(self):
        """
        Some exporters (observed on Moniepoint downloads) write
        vertical="Top" instead of "top" in styles.xml, which a strict
        openpyxl load rejects. The parser should patch and retry rather
        than blow up the whole upload.
        """
        raw = self._build_workbook_bytes()
        zin = zipfile.ZipFile(io.BytesIO(raw))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == 'xl/styles.xml':
                    text = data.decode('utf-8')
                    # Inject an invalid-cased alignment value if one exists,
                    # otherwise add one to a <alignment/> tag.
                    if 'vertical=' in text:
                        text = re.sub(r'vertical="[a-z]+"', 'vertical="Top"', text)
                    else:
                        text = text.replace(
                            '<alignment', '<alignment vertical="Top" ', 1
                        ) if '<alignment' in text else text
                    data = text.encode('utf-8')
                zout.writestr(item, data)
        buf.seek(0)
        malformed_raw = buf.getvalue()

        txns = ExcelStatementParser.parse(io.BytesIO(malformed_raw), account_number='123')
        self.assertEqual(len(txns), 2)

    def test_raises_when_no_header_found(self):
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['not', 'a', 'statement'])
        buf = io.BytesIO()
        wb.save(buf)
        with self.assertRaises(ValueError):
            ExcelStatementParser.parse(io.BytesIO(buf.getvalue()), account_number='123')


class ParseStatementFileDispatchTests(SimpleTestCase):

    def test_dispatches_by_extension(self):
        qif = b"!Type:Bank\nD01/07/2026\nT500\nNREF1\nPPayee\n^\n"
        txns = parse_statement_file(io.BytesIO(qif), filename='statement.qif', account_number='x')
        self.assertEqual(len(txns), 1)

        csv_text = (
            "Transaction Date,Narration,Reference,Debit,Credit,Balance\n"
            "01/07/2026,Test,REF1,,5000.00,5000.00\n"
        ).encode()
        txns = parse_statement_file(io.BytesIO(csv_text), filename='statement.csv', account_number='x')
        self.assertEqual(len(txns), 1)

    def test_unknown_extension_falls_back_to_csv_parser(self):
        csv_text = (
            "Transaction Date,Narration,Reference,Debit,Credit,Balance\n"
            "01/07/2026,Test,REF1,,5000.00,5000.00\n"
        ).encode()
        txns = parse_statement_file(io.BytesIO(csv_text), filename='statement.txt', account_number='x')
        self.assertEqual(len(txns), 1)
