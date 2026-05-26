import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PayableForm } from '../../components/liabilities/PayableForm';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ============================================================================
// CREATE PAYABLE PAGE
// ============================================================================

export const CreatePayablePage: React.FC = () => {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate('/liabilities/payables');
  };

  const handleCancel = () => {
    navigate('/liabilities/payables');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Accounts Payable</h1>
          <p className="text-muted-foreground mt-2">
            Record a new vendor payable with invoice and PO reference
          </p>
        </div>
      </div>

      <PayableForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  );
};

export default CreatePayablePage;
