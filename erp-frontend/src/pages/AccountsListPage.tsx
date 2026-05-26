import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  account_level: string;
  balance: string;
  parent_name?: string;
  generated_form_schema?: { id: number; name: string };
  generated_workflow?: { id: number; name: string };
  generated_page?: { id: number; url_path: string };
}

const AccountsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'parent' | 'child'>('all');
  const [accountType, setAccountType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, [filter, accountType]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams: Record<string, string> = {};

      if (filter !== 'all') {
        queryParams.account_level = filter.toUpperCase();
      }
      if (accountType !== 'all') {
        queryParams.account_type = accountType;
      }

      console.log('🔍 Fetching accounts with params:', queryParams);

      // Build query string manually
      const queryString =
        Object.keys(queryParams).length > 0
          ? '?' + new URLSearchParams(queryParams).toString()
          : '';
      console.log('🔗 Full URL:', `/accounts/${queryString}`);

      const data = await api.get(`/accounts/${queryString}`);

      console.log('📥 Raw API response:', data);
      console.log('📊 Response type:', typeof data, 'Is array:', Array.isArray(data));

      // Handle both paginated response and direct array
      const accountsList = Array.isArray(data) ? data : data.results || [];
      console.log('✅ Processed accounts list:', accountsList);
      console.log('📈 Accounts count:', accountsList.length);

      setAccounts(accountsList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch accounts');
      console.error('❌ Error fetching accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = accounts.filter(
    account =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleNavigateToForm = (account: Account) => {
    if (account.generated_form_schema?.id) {
      // Navigate to the form using the form schema ID
      navigate(`/forms/${account.generated_form_schema.id}`);
    } else {
      alert('No form has been generated for this account yet.');
    }
  };

  const handleNavigateToReport = (account: Account) => {
    // Navigate to the report page using the report code pattern
    // Convert account code format: "100-299" -> "savings_report_100_299"
    const reportCode = `savings_report_${account.code.replace(/-/g, '_')}`;
    navigate(`/report/${reportCode}`);
  };

  const handleDeleteAccount = async (account: Account) => {
    if (
      !window.confirm(
        `Are you sure you want to delete account "${account.name}" (${account.code})? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/accounts/${account.id}/`);
      // Refresh the accounts list after successful deletion
      fetchAccounts();
      alert('Account deleted successfully');
    } catch (err: any) {
      console.error('Error deleting account:', err);
      alert(err.message || 'Failed to delete account');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <div>
              <h1
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: '#111827',
                }}
              >
                Chart of Accounts
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                Manage your accounts and view generated components
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => navigate('/incomes/fee-structures')}
                style={{
                  padding: '12px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '18px' }}>�</span>
                Fee Structures
              </button>
              <button
                onClick={() => navigate('/accounts/hierarchy')}
                style={{
                  padding: '12px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '18px' }}>📊</span>
                View Hierarchy
              </button>
              <button
                onClick={() => navigate('/accounts/new')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '18px' }}>+</span>
                Create Account
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                flex: '1',
                minWidth: '200px',
                padding: '10px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />

            <select
              value={filter}
              onChange={e => setFilter(e.target.value as any)}
              style={{
                padding: '10px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'white',
              }}
            >
              <option value="all">All Levels</option>
              <option value="parent">Parent Accounts</option>
              <option value="child">Child Accounts</option>
            </select>

            <select
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
              style={{
                padding: '10px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                background: 'white',
              }}
            >
              <option value="all">All Types</option>
              <option value="ASSET">Assets</option>
              <option value="LIABILITY">Liabilities</option>
              <option value="EQUITY">Equity</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expenses</option>
              <option value="SAVINGS">Savings</option>
              <option value="LOAN">Loans</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {loading ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '4px solid #e5e7eb',
                borderTop: '4px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p style={{ margin: 0, color: '#6b7280' }}>Loading accounts...</p>
          </div>
        ) : error ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #fecaca',
            }}
          >
            <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>Error</div>
            <div style={{ color: '#6b7280' }}>{error}</div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
            <h3
              style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}
            >
              No Accounts Found
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280' }}>
              {searchTerm
                ? 'Try a different search term'
                : 'Create your first account to get started'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => navigate('/accounts/new')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Create Account
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Code
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Name
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Type
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Level
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Balance
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Components
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#374151',
                        textTransform: 'uppercase',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map(account => (
                    <tr
                      key={account.id}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          fontFamily: 'monospace',
                          color: '#111827',
                        }}
                      >
                        {account.code}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                        <div style={{ fontWeight: 500 }}>{account.name}</div>
                        {account.parent_name && (
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            Parent: {account.parent_name}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 500,
                            background:
                              account.account_type === 'ASSET'
                                ? '#dbeafe'
                                : account.account_type === 'LIABILITY'
                                  ? '#fecaca'
                                  : account.account_type === 'INCOME'
                                    ? '#d1fae5'
                                    : account.account_type === 'EXPENSE'
                                      ? '#fed7aa'
                                      : '#e5e7eb',
                            color:
                              account.account_type === 'ASSET'
                                ? '#1e40af'
                                : account.account_type === 'LIABILITY'
                                  ? '#991b1b'
                                  : account.account_type === 'INCOME'
                                    ? '#065f46'
                                    : account.account_type === 'EXPENSE'
                                      ? '#9a3412'
                                      : '#374151',
                          }}
                        >
                          {account.account_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                        {account.account_level === 'PARENT' ? '📁 Parent' : '📄 Child'}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#111827',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                        }}
                      >
                        $
                        {parseFloat(account.balance).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {account.account_level === 'CHILD' && (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            {account.generated_form_schema && (
                              <div
                                title="Form Generated"
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '4px',
                                  background: '#dbeafe',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '12px',
                                }}
                              >
                                📋
                              </div>
                            )}
                            {account.generated_workflow && (
                              <div
                                title="Workflow Generated"
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '4px',
                                  background: '#d1fae5',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '12px',
                                }}
                              >
                                ⚡
                              </div>
                            )}
                            {account.generated_page && (
                              <div
                                title="Page Generated"
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '4px',
                                  background: '#fef3c7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '12px',
                                }}
                              >
                                📄
                              </div>
                            )}
                            <div
                              title="Report Generated"
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                background: '#e9d5ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                              }}
                            >
                              📊
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          {account.account_level === 'PARENT' ? (
                            <>
                              <button
                                onClick={() => navigate(`/accounts/${account.id}/summary`)}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  background: '#f0fdfa',
                                  color: '#0d9488',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                }}
                              >
                                📊 View Summary
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(account)}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #fecaca',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                }}
                                title="Delete Account"
                              >
                                🗑️
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => navigate(`/accounts/${account.id}/ledger`)}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  background: '#f0fdf4',
                                  color: '#16a34a',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                }}
                                title="View Account Ledger"
                              >
                                📒 Ledger
                              </button>
                              <button
                                onClick={() => handleNavigateToForm(account)}
                                disabled={!account.generated_form_schema}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  background: 'white',
                                  color: '#3b82f6',
                                  cursor: account.generated_form_schema ? 'pointer' : 'not-allowed',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  opacity: account.generated_form_schema ? 1 : 0.5,
                                }}
                              >
                                Form
                              </button>
                              <button
                                onClick={() => handleNavigateToReport(account)}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  background: 'white',
                                  color: '#8b5cf6',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                }}
                              >
                                Report
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(account)}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid #fecaca',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                }}
                                title="Delete Account"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountsListPage;
