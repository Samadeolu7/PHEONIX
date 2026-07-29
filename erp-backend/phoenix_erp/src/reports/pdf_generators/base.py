"""
Base PDF Generator for Phoenix ERP
Provides common functionality for all PDF document types
"""
from django.template.loader import render_to_string
from django.conf import settings
import os
from typing import Dict, Any, Optional, List
from io import BytesIO


class BasePDFGenerator:
    """
    Base class for all PDF generators.
    Handles common rendering logic and builds a rich company-identity context
    from the Tenant and Branch models so every document has consistent,
    accurate header/footer information.
    """

    # Override in subclasses
    template_name = None
    css_file = 'pdf/styles.css'

    def __init__(self, instance, user):
        """
        Args:
            instance: The model instance to generate a PDF for.
            user:     The user requesting the PDF (provides tenant / branch context).
        """
        self.instance = instance
        self.user = user
        self.tenant = user.tenant if hasattr(user, 'tenant') else None
        self.owner = user.owner if hasattr(user, 'owner') else self.tenant
        self.branch = user.branch if hasattr(user, 'branch') else None

    # ──────────────────────────────────────────────────────────────────────────
    # Context builders
    # ──────────────────────────────────────────────────────────────────────────

    def get_context_data(self) -> Dict[str, Any]:
        """
        Build the base context shared by all PDF templates.
        Subclasses should call super().get_context_data() then .update() it.
        """
        return {
            'instance': self.instance,
            'user': self.user,
            'tenant': self.tenant,
            'owner': self.owner,
            'branch': self.branch,

            # ── Company identity ──────────────────────────────────────────────
            'company_name': self._get_company_name(),
            'company_address': self._get_company_address(),
            'company_phone': self._get_company_phone(),
            'company_email': self._get_company_email(),
            'company_website': self._get_company_website(),
            'company_logo_url': self._get_company_logo(),
            'company_registration_number': self._get_registration_number(),
            'company_tax_number': self._get_tax_number(),
            'company_primary_color': self._get_primary_color(),

            # ── Branch (issuing office) ───────────────────────────────────────
            'branch_name': self._get_branch_name(),
            'branch_address': self._get_branch_address(),
            'branch_phone': self._get_branch_phone(),
            'branch_email': self._get_branch_email(),

            # ── Bank / payment details (for invoice-type documents) ───────────
            'bank_accounts': self._get_bank_details(),
        }

    # ── Company-level helpers ─────────────────────────────────────────────────

    def _get_company_name(self) -> str:
        if self.tenant:
            return self.tenant.name
        return 'Phoenix ERP'

    def _get_company_address(self) -> str:
        """
        Prefer the branch address when issuing documents from a branch;
        fall back to the tenant-level address.
        """
        if self.branch:
            addr = getattr(self.branch, 'get_formatted_address', None)
            if callable(addr):
                result = addr()
                if result:
                    return result
            # Plain address field
            if getattr(self.branch, 'address', ''):
                return self.branch.address
        if self.tenant:
            # New structured fields
            if callable(getattr(self.tenant, 'get_formatted_address', None)):
                result = self.tenant.get_formatted_address()
                if result:
                    return result
            # Legacy JSON settings fallback
            if isinstance(getattr(self.tenant, 'settings', None), dict):
                return self.tenant.settings.get('address', '')
        return ''

    def _get_company_phone(self) -> str:
        if self.tenant and callable(getattr(self.tenant, 'get_contact_phone', None)):
            return self.tenant.get_contact_phone()
        if self.tenant and isinstance(getattr(self.tenant, 'settings', None), dict):
            return self.tenant.settings.get('phone', '')
        return ''

    def _get_company_email(self) -> str:
        if self.tenant and callable(getattr(self.tenant, 'get_contact_email', None)):
            return self.tenant.get_contact_email()
        if self.tenant and isinstance(getattr(self.tenant, 'settings', None), dict):
            return self.tenant.settings.get('email', '')
        return ''

    def _get_company_website(self) -> str:
        if self.tenant and callable(getattr(self.tenant, 'get_website', None)):
            return self.tenant.get_website()
        if self.tenant and isinstance(getattr(self.tenant, 'settings', None), dict):
            return self.tenant.settings.get('website', '')
        return ''

    def _get_company_logo(self) -> str:
        """
        Return a logo src suitable for HTML/PDF rendering.

        Priority:
          1. Uploaded logo (ImageField) → encoded as a base64 data-URI so
             WeasyPrint can embed it without needing HTTP access to media files.
          2. External ``logo_url`` (URLField).
          3. Empty string (template will fall back to the company name).
        """
        if not self.tenant:
            return ''

        # ── 1. Uploaded file (ImageField) ────────────────────────────────────
        logo_field = getattr(self.tenant, 'logo', None)
        if logo_field and getattr(logo_field, 'name', None):
            try:
                import base64
                import mimetypes
                # Re-open the file each time to avoid closed-file issues
                with logo_field.open('rb') as fh:
                    logo_data = fh.read()
                mime_type = (
                    mimetypes.guess_type(logo_field.name)[0] or 'image/png'
                )
                if mime_type == 'image/svg+xml':
                    logo_data = self._normalize_svg_intrinsic_size(logo_data)
                b64 = base64.b64encode(logo_data).decode('utf-8')
                return f'data:{mime_type};base64,{b64}'
            except Exception:
                # File unreadable – try logo_url below
                pass

        # ── 2. External URL ───────────────────────────────────────────────────
        return getattr(self.tenant, 'logo_url', '') or ''

    @staticmethod
    def _normalize_svg_intrinsic_size(svg_bytes: bytes) -> bytes:
        """
        Strip width/height attributes from the root <svg> tag so aspect
        ratio is derived purely from viewBox, with no conflicting intrinsic
        size for a renderer to reconcile.

        Uploaded SVGs (e.g. exported from Illustrator) frequently declare a
        width/height that doesn't match their own viewBox (seen in practice:
        width="768" height="768" against viewBox="0 0 576 576"). WeasyPrint
        has been observed to resolve that mismatch inconsistently — skewed
        or oversized renders when the logo is placed in a small fixed-size
        box. Removing width/height entirely (viewBox alone still fully
        defines the aspect ratio per the SVG spec) removes the ambiguity.
        """
        import re

        try:
            svg_text = svg_bytes.decode('utf-8')
        except UnicodeDecodeError:
            return svg_bytes

        match = re.search(r'<svg\b[^>]*>', svg_text, re.IGNORECASE)
        if not match:
            return svg_bytes

        tag = match.group(0)
        cleaned_tag = re.sub(r'''\s(width|height)=["'][^"']*["']''', '', tag)
        if cleaned_tag == tag:
            return svg_bytes

        return (svg_text[:match.start()] + cleaned_tag + svg_text[match.end():]).encode('utf-8')

    def _get_registration_number(self) -> str:
        return getattr(self.tenant, 'registration_number', '') or ''

    def _get_tax_number(self) -> str:
        return getattr(self.tenant, 'tax_identification_number', '') or ''

    def _get_primary_color(self) -> str:
        return getattr(self.tenant, 'primary_color', '#0066cc') or '#0066cc'

    # ── Branch-level helpers ──────────────────────────────────────────────────

    def _get_branch_name(self) -> str:
        return getattr(self.branch, 'name', '') or ''

    def _get_branch_address(self) -> str:
        if self.branch:
            if callable(getattr(self.branch, 'get_formatted_address', None)):
                return self.branch.get_formatted_address()
            return getattr(self.branch, 'address', '') or ''
        return ''

    def _get_branch_phone(self) -> str:
        return getattr(self.branch, 'phone', '') or ''

    def _get_branch_email(self) -> str:
        return getattr(self.branch, 'email', '') or ''

    # ── Bank / payment details ────────────────────────────────────────────────

    def _get_bank_details(self) -> List[Dict[str, str]]:
        """
        Return a list of dicts, one per BankAccount flagged
        ``is_primary_for_invoices=True``, with keys:

            bank_name, branch_name, account_name, account_number,
            account_type, currency, sort_code, swift_code, iban

        Falls back to all active, non-deleted bank accounts for the
        tenant when none are flagged as primary-for-invoices.
        """
        if not self.tenant:
            return []

        try:
            from banks.models import BankAccount

            # ── Primary: accounts explicitly flagged for invoice display ─────
            accounts = list(
                BankAccount.objects.filter(
                    branch__tenant=self.tenant,
                    is_primary_for_invoices=True,
                    is_active=True,
                    is_deleted=False,
                ).select_related('bank').order_by('account_name')
            )

            # ── Fallback: any active account when none are flagged ────────────
            if not accounts:
                accounts = list(
                    BankAccount.objects.filter(
                        branch__tenant=self.tenant,
                        is_active=True,
                        is_deleted=False,
                    ).select_related('bank').order_by('-is_cashier_collection_account', 'account_name')[:3]
                )

            result = []
            for acct in accounts:
                result.append({
                    'bank_name':      acct.bank.bank_name   if acct.bank else '',
                    'bank_branch':    acct.bank.branch_name if acct.bank else '',
                    'account_name':   acct.account_name,
                    'account_number': acct.account_number,
                    'account_type':   acct.get_account_type_display(),
                    'currency':       acct.currency,
                    'sort_code':      getattr(acct.bank, 'bank_code', '') if acct.bank else '',
                    'swift_code':     acct.swift_code or '',
                    'iban':           acct.iban or '',
                })
            return result

        except Exception:
            # Banks app not installed or query failed – return empty list
            pass

        # ── Legacy: tenant.get_invoice_bank_accounts() helper ────────────────
        if callable(getattr(self.tenant, 'get_invoice_bank_accounts', None)):
            try:
                accounts = self.tenant.get_invoice_bank_accounts()
                result = []
                for acct in accounts:
                    result.append({
                        'bank_name':      acct.bank.bank_name   if acct.bank else '',
                        'bank_branch':    acct.bank.branch_name if acct.bank else '',
                        'account_name':   acct.account_name,
                        'account_number': acct.account_number,
                        'account_type':   acct.get_account_type_display(),
                        'currency':       acct.currency,
                        'sort_code':      getattr(acct.bank, 'bank_code', '') if acct.bank else '',
                        'swift_code':     acct.swift_code or '',
                        'iban':           acct.iban or '',
                    })
                return result
            except Exception:
                pass

        return []

    # ──────────────────────────────────────────────────────────────────────────
    # Rendering & generation
    # ──────────────────────────────────────────────────────────────────────────

    def get_css_path(self) -> str:
        """Get absolute path to CSS file"""
        static_root = settings.STATIC_ROOT or settings.BASE_DIR / 'static'
        return os.path.join(static_root, self.css_file)

    def render_html(self) -> str:
        """Render HTML from template with context"""
        if not self.template_name:
            raise NotImplementedError("template_name must be defined in subclass")

        context = self.get_context_data()
        return render_to_string(self.template_name, context)

    def generate_pdf(self, output_path: Optional[str] = None) -> BytesIO:
        """
        Generate PDF from HTML template.

        Args:
            output_path: Optional file path to save PDF to disk.

        Returns:
            BytesIO: PDF content as bytes.
        """
        try:
            from weasyprint import HTML, CSS

            html_string = self.render_html()

            # Use the project BASE_DIR as the base URL so that WeasyPrint can
            # resolve both static and media file paths expressed as absolute
            # filesystem paths (e.g. file:///srv/app/media/...).
            base_url = getattr(settings, 'BASE_DIR', None)
            if base_url:
                import pathlib
                base_url = pathlib.Path(base_url).as_uri() + '/'
            else:
                base_url = settings.STATIC_URL

            html = HTML(string=html_string, base_url=base_url)

            css = None
            css_path = self.get_css_path()
            if os.path.exists(css_path):
                with open(css_path, 'r') as f:
                    css = CSS(string=f.read())

            if output_path:
                html.write_pdf(output_path, stylesheets=[css] if css else None)
                with open(output_path, 'rb') as f:
                    pdf_bytes = BytesIO(f.read())
            else:
                pdf_bytes = BytesIO()
                html.write_pdf(pdf_bytes, stylesheets=[css] if css else None)
                pdf_bytes.seek(0)

            return pdf_bytes

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            raise Exception(
                f"PDF generation failed: {str(e)}\n\nDetails:\n{error_details}"
            ) from e

    def get_filename(self) -> str:
        """Generate filename for PDF. Override in subclasses."""
        return f"document_{self.instance.pk}.pdf"

    def generate_text(self) -> str:
        """
        Plain-text representation of the document for testing/debugging.
        Exercises all context data access without PDF rendering dependencies.
        """
        context = self.get_context_data()

        lines = []
        lines.append("=" * 80)
        lines.append(f"DOCUMENT: {context.get('document_type', 'DOCUMENT')}")
        lines.append("=" * 80)
        lines.append("")

        lines.append("COMPANY INFORMATION:")
        lines.append(f"  Name:                {context.get('company_name', 'N/A')}")
        lines.append(f"  Address:             {context.get('company_address', 'N/A')}")
        lines.append(f"  Phone:               {context.get('company_phone', 'N/A')}")
        lines.append(f"  Email:               {context.get('company_email', 'N/A')}")
        lines.append(f"  Website:             {context.get('company_website', 'N/A')}")
        lines.append(f"  Registration No.:    {context.get('company_registration_number', 'N/A')}")
        lines.append(f"  Tax / TIN:           {context.get('company_tax_number', 'N/A')}")
        lines.append("")

        lines.append("ISSUING BRANCH:")
        lines.append(f"  Branch:              {context.get('branch_name', 'N/A')}")
        lines.append(f"  Address:             {context.get('branch_address', 'N/A')}")
        lines.append(f"  Phone:               {context.get('branch_phone', 'N/A')}")
        lines.append(f"  Email:               {context.get('branch_email', 'N/A')}")
        lines.append("")

        bank_accounts = context.get('bank_accounts', [])
        if bank_accounts:
            lines.append("PAYMENT / BANK DETAILS:")
            for acct in bank_accounts:
                lines.append(f"  Bank:                {acct.get('bank_name', '')} {acct.get('bank_branch', '')}")
                lines.append(f"  Account Name:        {acct.get('account_name', '')}")
                lines.append(f"  Account Number:      {acct.get('account_number', '')}")
                lines.append(f"  Account Type:        {acct.get('account_type', '')}")
                lines.append(f"  Currency:            {acct.get('currency', '')}")
                if acct.get('sort_code'):
                    lines.append(f"  Sort Code:           {acct.get('sort_code', '')}")
                if acct.get('swift_code'):
                    lines.append(f"  SWIFT/BIC:           {acct.get('swift_code', '')}")
                if acct.get('iban'):
                    lines.append(f"  IBAN:                {acct.get('iban', '')}")
                lines.append("")
        lines.append("")

        if self.user:
            lines.append("CREATED BY:")
            lines.append(f"  User: {self.user.username}")
            if hasattr(self.user, 'get_full_name'):
                lines.append(f"  Full Name: {self.user.get_full_name()}")
        lines.append("")

        lines.append("DOCUMENT DETAILS:")
        lines.append(f"  Instance Type: {type(self.instance).__name__}")
        lines.append(f"  Instance ID:   {self.instance.pk}")
        lines.append("")

        lines.append("FULL CONTEXT DATA:")
        lines.append("-" * 80)
        skip = {'instance', 'user', 'tenant', 'owner', 'branch', 'bank_accounts'}
        for key, value in sorted(context.items()):
            if key in skip:
                continue
            if hasattr(value, '__iter__') and not isinstance(value, (str, dict)):
                try:
                    items = list(value)
                    lines.append(f"  {key}: [{len(items)} items]")
                    for idx, item in enumerate(items[:5], 1):
                        lines.append(f"    {idx}. {item}")
                    if len(items) > 5:
                        lines.append(f"    ... and {len(items) - 5} more")
                except Exception:
                    lines.append(f"  {key}: {value}")
            elif isinstance(value, dict):
                lines.append(f"  {key}:")
                for sub_key, sub_value in value.items():
                    lines.append(f"    {sub_key}: {sub_value}")
            else:
                lines.append(f"  {key}: {value}")

        lines.append("")
        lines.append("=" * 80)
        lines.append("TEXT GENERATION SUCCESSFUL - All data accessed without errors")
        lines.append("=" * 80)

        return "\n".join(lines)

    def as_response(self, download: bool = False):
        """
        Return a Django HttpResponse containing the rendered PDF.

        Args:
            download: If True, sets Content-Disposition to attachment.
        """
        from django.http import HttpResponse

        pdf_bytes = self.generate_pdf()
        filename = self.get_filename()

        response = HttpResponse(pdf_bytes.getvalue(), content_type='application/pdf')

        if download:
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
        else:
            response['Content-Disposition'] = f'inline; filename="{filename}"'

        return response
