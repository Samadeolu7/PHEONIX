import React from 'react';
import { useParams } from 'react-router-dom';
import ParentAccountSummary from '../components/accounts/ParentAccountSummary';

const AccountSummaryPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();

  if (!accountId) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            color: '#991b1b',
          }}
        >
          Invalid account ID
        </div>
      </div>
    );
  }

  return <ParentAccountSummary accountId={accountId} />;
};

export default AccountSummaryPage;
