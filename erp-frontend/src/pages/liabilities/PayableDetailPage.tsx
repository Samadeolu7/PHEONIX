import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PayableDetail } from '../../components/liabilities/PayableDetail';

// ============================================================================
// PAYABLE DETAIL PAGE
// ============================================================================

export const PayableDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-destructive">Invalid payable ID</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <PayableDetail payableId={parseInt(id)} />
    </div>
  );
};

export default PayableDetailPage;
