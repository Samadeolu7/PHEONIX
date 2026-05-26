import React from 'react';
import { PayablesList } from '../../components/liabilities/PayablesList';

// ============================================================================
// PAYABLES LIST PAGE
// ============================================================================

export const PayablesListPage: React.FC = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Accounts Payable</h1>
        <p className="text-muted-foreground mt-2">
          Manage vendor payments with 3-way matching and accountability tracking
        </p>
      </div>

      <PayablesList />
    </div>
  );
};

export default PayablesListPage;
