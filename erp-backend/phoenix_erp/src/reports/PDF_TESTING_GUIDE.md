# PDF Generation System - Test Guide

## Overview
This PDF generation system creates professional Purchase Orders and Goods Received Notes for the Phoenix ERP system using **WeasyPrint**.

## Test Data - Greenwood Academy (School)

### Setup Test Data

**Option 1: Using Django Management Command**
```powershell
# Activate your virtual environment first
cd D:\Users\User\Desktop\PHEONIX-ERP\erp-backend\phoenix_erp\src
python manage.py create_school_test_data
```

**Option 2: Using Python Script**
```powershell
cd D:\Users\User\Desktop\PHEONIX-ERP\erp-backend\phoenix_erp\src
python create_test_data.py
```

### Test Data Created

**Tenant: Greenwood Academy**
- Domain Type: School
- Address: 123 Education Lane, Springfield, IL 62701
- Phone: (555) 123-4567
- Email: admin@greenwoodacademy.edu

**Supplier: Educational Supplies Inc.**
- Contact: Michael Brown
- Address: 456 Commerce Street, Chicago, IL 60601
- Payment Terms: Net 30 Days

**Purchase Order: PO-2024-0156**
- Items:
  - 150x Mathematics Textbook - Grade 11 @ $45.00
  - 150x Science Textbook - Grade 10 @ $42.00
  - 50x A4 Ruled Notebooks (boxes) @ $35.00
  - 25x Blue Ballpoint Pens (50 pack) @ $28.50
- Subtotal: $13,787.50
- Tax (8%): $1,103.00
- Shipping: $125.00
- **Total: $15,015.50**

**Goods Received Note: GRN-2024-0089**
- All items received and accepted
- Status: Completed

## Testing the PDFs

### Install WeasyPrint
```powershell
pip install weasyprint
```

### API Endpoints

**Purchase Order PDF:**
```
GET /api/reports/pdf/purchase-order/{po_id}/
GET /api/reports/pdf/purchase-order/{po_id}/?download=true
```

**Goods Received Note PDF:**
```
GET /api/reports/pdf/goods-received-note/{grn_id}/
GET /api/reports/pdf/goods-received-note/{grn_id}/?download=true
```

### Test in Browser
After starting the Django server and authenticating:

1. **View Purchase Order PDF (inline):**
   ```
   http://localhost:8000/api/reports/pdf/purchase-order/1/
   ```

2. **Download Purchase Order PDF:**
   ```
   http://localhost:8000/api/reports/pdf/purchase-order/1/?download=true
   ```

3. **View GRN PDF (inline):**
   ```
   http://localhost:8000/api/reports/pdf/goods-received-note/1/
   ```

4. **Download GRN PDF:**
   ```
   http://localhost:8000/api/reports/pdf/goods-received-note/1/?download=true
   ```

### Test with cURL
```bash
# Get authentication token first
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "schooladmin", "password": "testpass123"}'

# Then use the token to download PDF
curl -X GET http://localhost:8000/api/reports/pdf/purchase-order/1/?download=true \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --output PO-2024-0156.pdf
```

### Programmatic Usage

```python
from reports.pdf_generators import PurchaseOrderPDFGenerator
from procurement.models import PurchaseOrder

# Get PO
po = PurchaseOrder.objects.get(po_number='PO-2024-0156')

# Generate PDF
generator = PurchaseOrderPDFGenerator(po, request.user)

# Option 1: Return as HTTP response
return generator.as_response(download=True)

# Option 2: Save to file
pdf_bytes = generator.generate_pdf('/path/to/output.pdf')

# Option 3: Get as bytes for further processing
pdf_bytes = generator.generate_pdf()
```

## Features Implemented

### Purchase Order PDF
✅ Company header (from tenant)
✅ PO number, date, and status
✅ Vendor information block
✅ Ship-to information block
✅ Terms section (Requisitioner, Ship Via, F.O.B., Shipping Terms)
✅ Items table with:
  - Item number/SKU
  - Description
  - Quantity
  - Unit price
  - Total price
✅ Subtotal, Tax, Shipping, Other, Total
✅ Comments/Special Instructions
✅ Contact information footer
✅ Approval tracking

### Goods Received Note PDF
✅ Company header
✅ GRN number, date, and PO reference
✅ Received by and location information
✅ Vendor details
✅ Items table with:
  - Quantity ordered
  - Quantity received
  - Quantity accepted
  - Quantity rejected
✅ Inspection notes
✅ Signature blocks (Received By, Inspected By, Approved By)

## Customization

### Styling
Edit CSS: `reports/static/pdf/styles.css`

### Templates
- Base: `reports/templates/pdf/base.html`
- Purchase Order: `reports/templates/pdf/purchase_order.html`
- GRN: `reports/templates/pdf/goods_received_note.html`

### Add New PDF Types
1. Create generator in `reports/pdf_generators/`
2. Extend `BasePDFGenerator`
3. Create template in `reports/templates/pdf/`
4. Add endpoint in `reports/views.py`
5. Register route in `reports/urls.py`

## Troubleshooting

### WeasyPrint Installation Issues
If you encounter errors installing WeasyPrint on Windows:

1. Install GTK for Windows: https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases
2. Or use conda: `conda install -c conda-forge weasyprint`

### Static Files Not Found
```powershell
python manage.py collectstatic
```

### CSS Not Applied
Ensure `STATIC_ROOT` is set in settings and CSS file exists at:
```
reports/static/pdf/styles.css
```

## Production Deployment

1. **Collect static files:**
   ```bash
   python manage.py collectstatic
   ```

2. **Install system dependencies:**
   - On Ubuntu: `apt-get install python3-cffi python3-brotli libpango-1.0-0 libpangoft2-1.0-0`
   - On Alpine: `apk add cairo-dev pango-dev gdk-pixbuf-dev`

3. **Add to requirements.txt:**
   ```
   weasyprint==62.3
   ```

4. **Consider caching:**
   - Cache generated PDFs for frequently accessed documents
   - Use Celery for async generation of large batches

## Security Notes

- ✅ Proper owner/branch scoping enforced
- ✅ Permission checks before PDF generation
- ✅ User authentication required
- ✅ No SQL injection risks (using ORM)
- ✅ Safe HTML rendering (no user input in templates)

## Support

For issues or questions about PDF generation:
1. Check WeasyPrint docs: https://doc.courtbouillon.org/weasyprint/
2. Review Django template syntax
3. Check CSS compatibility (WeasyPrint uses different rendering engine than browsers)
