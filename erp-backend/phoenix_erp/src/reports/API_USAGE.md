# Reports API - Production Usage Guide

## Overview
The Reports API provides endpoints for retrieving and executing reports dynamically based on page configurations.

---

## Available Endpoints

### 1. List All Reports
```http
GET /api/reports/templates/
```

**Response:**
```json
{
  "count": 4,
  "results": [
    {
      "id": 1,
      "code": "savings_report_100_299",
      "name": "Christmas Chicken Report",
      "report_type": "financial",
      "description": "Comprehensive savings report",
      "is_active": true
    }
  ]
}
```

---

### 2. Get Report by ID
```http
GET /api/reports/templates/{id}/
```

**Example:**
```http
GET /api/reports/templates/2/
```

**Response:**
```json
{
  "id": 2,
  "code": "savings_report_101_001",
  "name": "Child 2 Savings Report",
  "description": "View comprehensive report for Child 2",
  "report_config": {
    "data_sources": [...],
    "columns": [...],
    "calculations": [...]
  }
}
```

---

### 3. Get Report by Code ⭐ NEW
```http
GET /api/reports/templates/by-code/{code}/
```

**Example:**
```http
GET /api/reports/templates/by-code/savings_report_101_001/
```

**Use Case:** When page config only has `report_code` without `report_id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "code": "savings_report_101_001",
    "name": "Child 2 Savings Report",
    "report_config": {...}
  }
}
```

---

### 4. Execute Report (POST) - Original Method
```http
POST /api/reports/templates/{id}/execute/
```

**Body:**
```json
{
  "parameters": {
    "start_date": "2025-01-01",
    "end_date": "2025-12-28"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_deposits": 50000.00,
      "total_withdrawals": 10000.00,
      "net_balance": 40000.00
    },
    "transactions": [...],
    "charts": [...]
  },
  "metadata": {
    "executed_at": "2025-12-28T10:30:00Z",
    "execution_time": 0.245,
    "row_count": 125
  },
  "execution_id": 42
}
```

---

### 5. Run Report (GET) ⭐ NEW - Simpler Alternative
```http
GET /api/reports/templates/{id}/run/?start_date=2025-01-01&end_date=2025-12-28
```

**Use Case:** Simpler execution without POST body, ideal for direct browser/frontend calls

**Query Parameters:**
- `start_date` - Report start date (YYYY-MM-DD)
- `end_date` - Report end date (YYYY-MM-DD)
- Any other parameters defined in the report template

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {...},
    "transactions": [...],
    "charts": [...]
  },
  "metadata": {
    "executed_at": "2025-12-28T10:30:00Z",
    "execution_time": 0.245
  }
}
```

---

### 6. Get Reports by Account
```http
GET /api/reports/templates/by-account/?account_id=123
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "savings_report_100_299",
      "name": "Christmas Chicken Report",
      "linked_account": 123
    }
  ]
}
```

---

## Frontend Integration Examples

### Example 1: Load Report from Page Config

**Page Config:**
```json
{
  "page_type": "report",
  "page_config": {
    "report_id": 2,
    "report_code": "savings_report_101_001",
    "show_export": true,
    "show_refresh": true,
    "default_parameters": {
      "start_date": "current_month_start",
      "end_date": "today"
    }
  }
}
```

**React/TypeScript Example:**
```typescript
import { useState, useEffect } from 'react';

interface ReportPageConfig {
  report_id?: number;
  report_code?: string;
  show_export?: boolean;
  show_refresh?: boolean;
  default_parameters?: Record<string, string>;
}

const ReportPage = ({ pageConfig }: { pageConfig: ReportPageConfig }) => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      
      // Resolve default parameters
      const params = resolveParameters(pageConfig.default_parameters);
      
      // Build URL - prefer ID over code
      const url = pageConfig.report_id
        ? `/api/reports/templates/${pageConfig.report_id}/run/`
        : `/api/reports/templates/by-code/${pageConfig.report_code}/`;
      
      // Add query params
      const queryString = new URLSearchParams(params).toString();
      const fullUrl = `${url}?${queryString}`;
      
      const response = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setReportData(result.data);
      } else {
        console.error('Report error:', result.error);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveParameters = (defaultParams: Record<string, string>) => {
    const resolved: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(defaultParams || {})) {
      if (value === 'today') {
        resolved[key] = new Date().toISOString().split('T')[0];
      } else if (value === 'current_month_start') {
        const now = new Date();
        resolved[key] = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0];
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  };

  const handleRefresh = () => {
    loadReport();
  };

  const handleExport = async () => {
    // Export functionality
    const blob = await fetch(`/api/reports/templates/${pageConfig.report_id}/export/`)
      .then(r => r.blob());
    // Download blob...
  };

  if (loading) return <div>Loading report...</div>;

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>{reportData?.title}</h2>
        <div className="actions">
          {pageConfig.show_refresh && (
            <button onClick={handleRefresh}>Refresh</button>
          )}
          {pageConfig.show_export && (
            <button onClick={handleExport}>Export</button>
          )}
        </div>
      </div>
      
      <div className="report-content">
        {/* Render report data */}
        <pre>{JSON.stringify(reportData, null, 2)}</pre>
      </div>
    </div>
  );
};

export default ReportPage;
```

---

### Example 2: Form Submission Integration

**Page Config:**
```json
{
  "page_type": "form",
  "page_config": {
    "form_schema_id": 1,
    "submitEndpoint": "/api/form-submissions/",
    "successUrl": "/accounts/2"
  }
}
```

**React/TypeScript Example:**
```typescript
const FormPage = ({ pageConfig }) => {
  const [formSchema, setFormSchema] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Load form schema
    fetch(`/api/forms/${pageConfig.form_schema_id}/`)
      .then(r => r.json())
      .then(data => setFormSchema(data));
  }, []);

  const handleSubmit = async (formData) => {
    try {
      const response = await fetch(pageConfig.submitEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          form_schema_id: pageConfig.form_schema_id,
          data: formData
        })
      });

      if (response.ok) {
        // Redirect on success
        navigate(pageConfig.successUrl);
      }
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Render form fields from schema */}
    </form>
  );
};
```

---

## Permission & Access Control

All report endpoints automatically check:

1. **User Authentication** - Must be logged in
2. **Report Access Level** - `public`, `internal`, `restricted`, or `private`
3. **Required Permissions** - Custom permissions defined on report
4. **Role Restrictions** - Role-based access if configured
5. **Branch Scoping** - Reports are scoped to user's branch

**Error Responses:**

**403 Forbidden:**
```json
{
  "error": "Permission denied"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Report not found: savings_report_101_001"
}
```

---

## Testing the Endpoints

### cURL Examples:

**Get report by code:**
```bash
curl -X GET "http://localhost:8000/api/reports/templates/by-code/savings_report_101_001/" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Run report with parameters:**
```bash
curl -X GET "http://localhost:8000/api/reports/templates/2/run/?start_date=2025-01-01&end_date=2025-12-28" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Execute report (POST method):**
```bash
curl -X POST "http://localhost:8000/api/reports/templates/2/execute/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"start_date": "2025-01-01", "end_date": "2025-12-28"}}'
```

---

## Production Checklist

- [x] Report lookup by ID
- [x] Report lookup by code
- [x] Report execution (POST with body)
- [x] Report execution (GET with query params)
- [x] Permission checks on all endpoints
- [x] Branch scoping
- [x] Error handling
- [x] Access control validation
- [x] Forms integration ready
- [x] Documentation complete

**Status: ✅ PRODUCTION READY**
