import React, { useEffect, useState } from 'react';
import { AccountsService } from '@/services/api/accountsService';
import { AccountChildSummary } from '@/types/accounts';

interface ParentAccountSummaryProps {
  accountId: string;
}

export const ParentAccountSummary: React.FC<ParentAccountSummaryProps> = ({ accountId }) => {
  const [data, setData] = useState<AccountChildSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accountsService = new AccountsService();

  useEffect(() => {
    fetchSummary();
  }, [accountId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await accountsService.getChildrenSummary(accountId);
      setData(result);
      console.log('resilt gotten', result);
    } catch (err: any) {
      setError(err.message || 'Failed to load account summary');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading summary...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#111827' }}>
          {data.parent_account.name}
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          {data.parent_account.code} • {data.parent_account.account_type} Account
        </p>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <SummaryCard label="Total Child Accounts" value={data.summary.total_children.toString()} />
        <SummaryCard
          label="Total Debit Balance"
          value={
            data?.summary?.total_debit_balance
              ? data?.summary?.total_debit_balance.toLocaleString()
              : '-'
          }
          valueColor="#059669"
        />
        <SummaryCard
          label="Total Credit Balance"
          value={
            data?.summary?.total_credit_balance
              ? `₦${data.summary.total_credit_balance.toLocaleString()}`
              : '-'
          }
          valueColor="#dc2626"
        />
        <SummaryCard
          label="Net Balance"
          value={data.summary.net_balance ? `₦${data.summary.net_balance.toLocaleString()}` : '0'}
          valueColor={data.summary.net_balance >= 0 ? '#059669' : '#dc2626'}
        />
      </div>

      {/* Children Table */}
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#111827' }}>
            Child Accounts
          </h2>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={tableHeaderStyle}>Code</th>
                <th style={tableHeaderStyle}>Name</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Balance</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Can Post Transactions</th>
                <th style={tableHeaderStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.children.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: '48px 24px', textAlign: 'center', color: '#6b7280' }}
                  >
                    No child accounts found
                  </td>
                </tr>
              ) : (
                data.children.map(child => (
                  <tr
                    key={child.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={tableCellStyle}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '500' }}>
                        {child.code}
                      </span>
                    </td>
                    <td style={tableCellStyle}>{child.name}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: '600' }}>
                      ₦{child.balance.toLocaleString()}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          background: child.can_post_transactions ? '#d1fae5' : '#fee2e2',
                          color: child.can_post_transactions ? '#065f46' : '#991b1b',
                        }}
                      >
                        {child.can_post_transactions ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      <a
                        href={`/accounts/${child.id}`}
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: '500',
                          fontSize: '14px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        View Details →
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Summary Card Component
interface SummaryCardProps {
  label: string;
  value: string;
  valueColor?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, valueColor = '#111827' }) => {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '20px',
      }}
    >
      <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: valueColor }}>{value}</div>
    </div>
  );
};

// Table Styles
const tableHeaderStyle: { [key: string]: string | number } = {
  padding: '12px 24px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: '600',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tableCellStyle: { [key: string]: string | number } = {
  padding: '16px 24px',
  fontSize: '14px',
  color: '#374151',
};

export default ParentAccountSummary;
