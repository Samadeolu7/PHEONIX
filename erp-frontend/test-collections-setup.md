# Collections Testing Setup Guide

## Quick Test Data Creation

### 1. Student Data
```json
{
  "name": "John Smith",
  "email": "john.smith@student.edu",
  "phone": "+1-555-0123",
  "student_id": "STU2024001",
  "classification": "Undergraduate"
}
```

### 2. Fee Structure Data
```json
{
  "name": "Fall 2024 Tuition",
  "amount": 2500.00,
  "type": "tuition",
  "access_level": "full_access",
  "recurring": false,
  "industry_type": "education"
}
```

### 3. Entitlement Data
```json
{
  "client_id": "[student_id]",
  "fee_structure_id": "[fee_structure_id]",
  "academic_period": "Fall 2024",
  "due_date": "2024-01-15", // Past date to make overdue
  "amount": 2500.00,
  "status": "active",
  "access_level": "full"
}
```

## Testing Checklist

### Collections Dashboard Tests
- [ ] Overdue summary shows correct amounts
- [ ] Aging chart displays receivables by bucket
- [ ] Priority list shows 90+ day items
- [ ] Assigned collections appear correctly

### Collection Workbench Tests
- [ ] Receivable list loads with filters
- [ ] Quick actions work (Call, Email, Note)
- [ ] Activity timeline shows history
- [ ] Payment recording functions
- [ ] Collection notes save properly

### Reminder Management Tests
- [ ] Schedule reminder interface works
- [ ] Template selection functions
- [ ] Send history displays correctly
- [ ] Automated rules can be configured

## Expected Workflow
1. Student entitlement created → Invoice generated
2. Invoice becomes overdue → Appears in collections
3. Collector assigned → Workbench activities
4. Reminders scheduled → Automated follow-up
5. Payment received → Collections updated

## API Endpoints to Verify
- GET /api/receivables/ (list receivables)
- GET /api/receivables/aging/ (aging data)
- POST /api/receivables/collection-activity/ (log activity)
- POST /api/receivables/reminders/ (schedule reminders)
- GET /api/receivables/overdue/ (overdue items)