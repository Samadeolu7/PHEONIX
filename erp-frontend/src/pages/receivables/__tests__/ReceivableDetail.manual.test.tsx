// Manual test for ReceivableDetail component
// This file can be used to manually test the component functionality

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import ReceivableDetail from '../ReceivableDetail';

// Mock data for testing
const mockReceivableData = {
  id: 1,
  client: {
    id: 1,
    full_name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+2348012345678',
  },
  receivable_type: 'invoice' as const,
  content_object: {
    id: 1,
    invoice_number: 'INV-20250201-001',
    description: 'Consulting services',
    invoice_date: '2025-02-01',
  },
  reference_number: 'INV-20250201-001',
  original_amount: '100000.00',
  amount_paid: '50000.00',
  balance: '50000.00',
  due_date: '2025-03-01',
  aging_bucket: 'current' as const,
  days_overdue: 0,
  status: 'partial' as const,
  overdue_interest_rate: '12.00',
  accrued_interest: '0.00',
  last_reminder_sent: null,
  reminder_count: 0,
  assigned_to: null,
  collection_notes: null,
  activity_logs: [
    {
      id: 1,
      activity_type: 'payment',
      amount: '50000.00',
      description: 'Payment received via bank transfer',
      performed_by: {
        id: 2,
        full_name: 'Jane Smith',
      },
      created_at: '2025-02-15T10:00:00Z',
    },
  ],
  created_at: '2025-02-01T00:00:00Z',
  updated_at: '2025-02-15T10:00:00Z',
};

const mockPaymentAllocations = [
  {
    id: 1,
    payment_date: '2025-02-15',
    total_payment_amount: '50000.00',
    payment_method: 'bank_transfer',
    reference_number: 'TRX-12345',
    allocated_amount: '50000.00',
    status: 'allocated',
    created_at: '2025-02-15T10:00:00Z',
  },
];

// Test component with mock data
export const TestReceivableDetail = () => {
  return (
    <BrowserRouter>
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">ReceivableDetail Component Test</h1>
        <div className="border rounded-lg p-4">
          <ReceivableDetail />
        </div>
      </div>
    </BrowserRouter>
  );
};

// Manual test checklist:
/*
✅ Component Features to Test:

1. Basic Rendering:
   - Component loads without errors
   - Header displays receivable reference number and client name
   - Status badges show correctly (Partial, Current)
   - Payment progress bar displays correct percentage

2. Tab Navigation:
   - Overview tab shows financial summary and details
   - Activity Timeline tab shows activity logs
   - Payment History tab shows payment allocations
   - Collection Notes tab allows adding notes

3. Financial Information:
   - Original amount, amount paid, and balance display correctly
   - Currency formatting works properly
   - Payment progress calculation is accurate

4. Client Information:
   - Client name, email, and phone display in sidebar
   - Contact links work (mailto: and tel:)

5. Quick Actions:
   - Record Payment button links correctly
   - Send Reminder button functions
   - Generate Statement button links correctly
   - View All Client Receivables button links correctly

6. Linked Invoice Details:
   - Invoice information displays when available
   - Link to view invoice works

7. Collection Features:
   - Collection notes can be added
   - Activity timeline shows all activities
   - Payment history displays correctly

8. Responsive Design:
   - Layout works on different screen sizes
   - Mobile-friendly interface

9. Error Handling:
   - Loading states display correctly
   - Error messages show when API calls fail
   - Empty states display when no data available

10. API Integration:
    - Receivable data loads correctly
    - Payment allocations load correctly
    - Add note functionality works
    - Send reminder functionality works
*/

export default TestReceivableDetail;
