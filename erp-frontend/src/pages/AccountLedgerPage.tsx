import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

interface TransactionDetail {
  id: number;
  reference_number: string;
  series: string | null;
  date: string;
  description: string;
  workflow_reference: string | null;
  approved: boolean;
  is_reversal: boolean;
  total_amount: number | null;
}

interface LedgerEntry {
  id: number;
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_type: string;
  // enriched fields from backend
  amount: number;
  side: string;
  client_name: string | null;
  created_by: string | null;
  created_by_id: number | null;
  approved: boolean;
  is_reversed: boolean;
  transaction: TransactionDetail | null;
}

interface LedgerSummary {
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
}

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  balance: string;
}

const AccountLedgerPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    if (accountId) {
      fetchAccountAndTransactions();
    }
  }, [accountId]);

  const fetchAccountAndTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch account details
      const accountData = await api.get(`/accounts/ledger/${accountId}/`);
      setAccount(accountData);

      // Fetch ledger entries from the account ledger endpoint (combined response)
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('date_from', startDate);
      if (endDate) queryParams.append('date_to', endDate);

      // The backend exposes ledger as a detail action: /accounts/ledger/:id/ledger/
      const ledgerResp = await api.get(
        `/accounts/ledger/${accountId}/ledger/?${queryParams.toString()}`
      );

      // The response contains `account` and `entries` — use `entries` as transactions
      const entries = Array.isArray(ledgerResp?.entries)
        ? ledgerResp.entries
        : ledgerResp?.results || [];

      const ledgerEntries = processTransactions(entries);
      setTransactions(ledgerEntries);
      setSummary({
        opening_balance: Number(ledgerResp?.opening_balance ?? 0),
        closing_balance: Number(ledgerResp?.closing_balance ?? 0),
        total_debits: Number(ledgerResp?.total_debits ?? 0),
        total_credits: Number(ledgerResp?.total_credits ?? 0),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load account ledger');
      console.error('Error loading ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (n: number) =>
    `₦${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const processTransactions = (apiTransactions: any[]): LedgerEntry[] => {
    return apiTransactions.map(tx => ({
      id: tx.transaction_id || tx.id || 0,
      date: tx.date || tx.transaction_date || '',
      description: tx.description || '',
      reference: tx.reference_number || tx.reference || '',
      debit: Number(tx.debit || 0),
      credit: Number(tx.credit || 0),
      balance: Number(tx.balance || 0),
      transaction_type: tx.transaction_type || tx.transaction?.series || 'JOURNAL',
      amount: Number(tx.amount || 0),
      side: tx.side || '',
      client_name: tx.client_name || null,
      created_by: tx.created_by || null,
      created_by_id: tx.created_by_id || null,
      approved: tx.approved ?? false,
      is_reversed: tx.is_reversed ?? false,
      transaction: tx.transaction || null,
    }));
  };

  const handleFilter = () => {
    fetchAccountAndTransactions();
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert('No transactions to export');
      return;
    }

    const headers = ['Date', 'Reference', 'Client', 'Description', 'Debit', 'Credit', 'Balance'];
    const csvContent = [
      headers.join(','),
      ...transactions.map(t =>
        [
          t.date,
          t.reference,
          `"${(t.client_name || '').replace(/"/g, '""')}"`,
          `"${t.description.replace(/"/g, '""')}"`,
          t.debit.toFixed(2),
          t.credit.toFixed(2),
          t.balance.toFixed(2),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${account?.code}_ledger_${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
        }}
      >
        <div style={{ textAlign: 'center' }}>
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
          <p style={{ color: '#6b7280' }}>Loading ledger...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', background: '#f9fafb', minHeight: '100vh' }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            color: '#991b1b',
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Error</h3>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!account) return null;

  const totalDebit = summary?.total_debits ?? transactions.reduce((sum, t) => sum + t.debit, 0);
  const totalCredit = summary?.total_credits ?? transactions.reduce((sum, t) => sum + t.credit, 0);
  const closingBalance = summary?.closing_balance ?? 0;
  const openingBalance = summary?.opening_balance ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '24px',
        }}
        className="no-print"
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
                Account Ledger
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                {account.code} • {account.name}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.history.back()}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleExportCSV}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#059669',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                📥 Export CSV
              </button>
              <button
                onClick={handlePrint}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                🖨️ Print
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '4px',
                }}
              >
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '4px',
                }}
              >
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>
            <button
              onClick={handleFilter}
              style={{
                padding: '10px 24px',
                border: 'none',
                borderRadius: '8px',
                background: '#10b981',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>

      {/* Print Header (only visible when printing) */}
      <div className="print-only" style={{ display: 'none', padding: '24px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>
          Account Ledger
        </h1>
        <p style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
          {account.code} - {account.name}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
          Generated: {new Date().toLocaleString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
          className="no-print"
        >
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              padding: '20px',
            }}
          >
            <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
              Opening Balance
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(openingBalance)}
            </div>
          </div>
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              padding: '20px',
            }}
          >
            <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
              Total Debits
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
              {formatCurrency(totalDebit)}
            </div>
          </div>
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              padding: '20px',
            }}
          >
            <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
              Total Credits
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
              {formatCurrency(totalCredit)}
            </div>
          </div>
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              padding: '20px',
            }}
          >
            <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
              Closing Balance
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: closingBalance < 0 ? '#dc2626' : '#111827',
              }}
            >
              {formatCurrency(closingBalance)}
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
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
                    Date
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
                    Reference
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
                    Client
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
                    Description
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
                    Debit
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
                    Credit
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
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '48px 24px',
                        textAlign: 'center',
                        color: '#6b7280',
                      }}
                    >
                      No transactions found for this account
                    </td>
                  </tr>
                ) : (
                  transactions.map((entry, idx) => (
                    <tr
                      key={`${entry.id}-${idx}`}
                      onClick={() => setSelectedEntry(entry)}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        transition: 'background 0.15s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                        {formatDate(entry.date)}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#2563eb',
                          fontFamily: 'monospace',
                          fontWeight: 500,
                        }}
                      >
                        {entry.reference}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#374151',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.client_name || <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                        <div>{entry.description}</div>
                        {entry.is_reversed && (
                          <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>
                            REVERSED
                          </span>
                        )}
                        {entry.transaction?.is_reversal && (
                          <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>
                            REVERSAL
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#059669',
                          textAlign: 'right',
                          fontWeight: 500,
                        }}
                      >
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: '#dc2626',
                          textAlign: 'right',
                          fontWeight: 500,
                        }}
                      >
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '14px',
                          color: entry.balance < 0 ? '#dc2626' : '#111827',
                          textAlign: 'right',
                          fontWeight: 600,
                        }}
                      >
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {transactions.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                    <td
                      colSpan={3}
                      style={{
                        padding: '12px 16px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      TOTALS ({transactions.length} entries)
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#059669',
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {formatCurrency(totalDebit)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#dc2626',
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {formatCurrency(totalCredit)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: closingBalance < 0 ? '#dc2626' : '#111827',
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {formatCurrency(closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ── Transaction Detail Modal ───────────────────────────────── */}
      {selectedEntry && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                  Transaction Details
                </h2>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '13px',
                    color: '#6b7280',
                    fontFamily: 'monospace',
                  }}
                >
                  {selectedEntry.reference}
                </p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Status badges */}
            <div
              style={{
                padding: '12px 24px',
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: selectedEntry.approved ? '#d1fae5' : '#fef3c7',
                  color: selectedEntry.approved ? '#065f46' : '#92400e',
                }}
              >
                {selectedEntry.approved ? '✓ Approved' : '⏳ Pending'}
              </span>
              {selectedEntry.is_reversed && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#fee2e2',
                    color: '#991b1b',
                  }}
                >
                  Reversed
                </span>
              )}
              {selectedEntry.transaction?.is_reversal && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#fef3c7',
                    color: '#92400e',
                  }}
                >
                  Reversal Entry
                </span>
              )}
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: selectedEntry.side === 'DR' ? '#dbeafe' : '#fce7f3',
                  color: selectedEntry.side === 'DR' ? '#1e40af' : '#9d174d',
                }}
              >
                {selectedEntry.side === 'DR' ? 'Debit (DR)' : 'Credit (CR)'}
              </span>
            </div>

            {/* Detail rows */}
            <div style={{ padding: '20px 24px' }}>
              {(
                [
                  ['Date', formatDate(selectedEntry.date)],
                  ['Reference', selectedEntry.reference],
                  [
                    'Series / Type',
                    selectedEntry.transaction?.series ?? selectedEntry.transaction_type,
                  ],
                  ['Description', selectedEntry.description],
                  ['Workflow Ref', selectedEntry.transaction?.workflow_reference ?? '—'],
                  ['Created By', selectedEntry.created_by ?? '—'],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: '#111827',
                      fontWeight: 400,
                      textAlign: 'right',
                      maxWidth: '60%',
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}

              {/* Amounts */}
              <div
                style={{
                  marginTop: '16px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                }}
              >
                {selectedEntry.debit > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                      Debit
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669' }}>
                      {formatCurrency(selectedEntry.debit)}
                    </div>
                  </div>
                )}
                {selectedEntry.credit > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                      Credit
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#dc2626' }}>
                      {formatCurrency(selectedEntry.credit)}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    textAlign: 'center',
                    gridColumn:
                      selectedEntry.debit > 0 && selectedEntry.credit > 0 ? 'span 2' : 'auto',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                    Running Balance After
                  </div>
                  <div
                    style={{
                      fontSize: '20px',
                      fontWeight: 700,
                      color: selectedEntry.balance < 0 ? '#dc2626' : '#111827',
                    }}
                  >
                    {formatCurrency(selectedEntry.balance)}
                  </div>
                </div>
              </div>

              {selectedEntry.transaction?.total_amount != null && (
                <div
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
                    Transaction Total
                  </span>
                  <span style={{ fontSize: '13px', color: '#111827', fontWeight: 600 }}>
                    {formatCurrency(selectedEntry.transaction.total_amount!)}
                  </span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setSelectedEntry(null)}
                style={{
                  padding: '10px 24px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          body {
            background: white !important;
          }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AccountLedgerPage;
