import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { journalVoucherService, JournalVoucher } from '../services/journalVoucherService';
import { usePermission } from '../hooks/usePermissions';
import { useRequestRepaymentReversal } from '../hooks/useLoans';

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
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [txnDetail, setTxnDetail] = useState<JournalVoucher | null>(null);
  const [txnDetailLoading, setTxnDetailLoading] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseConfirming, setReverseConfirming] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const [loanReversalReason, setLoanReversalReason] = useState('');
  const [loanReversalConfirming, setLoanReversalConfirming] = useState(false);
  const [loanReversalError, setLoanReversalError] = useState('');
  const [loanReversalSuccess, setLoanReversalSuccess] = useState('');

  const { hasPageAccess } = usePermission();
  const canReverseTxn = hasPageAccess('common', 'business-day', 'edit');
  const requestRepaymentReversalMutation = useRequestRepaymentReversal();

  useEffect(() => {
    setReverseReason('');
    setReverseConfirming(false);
    setReverseError('');
    setLoanReversalReason('');
    setLoanReversalConfirming(false);
    setLoanReversalError('');
    setLoanReversalSuccess('');

    const txnId = selectedEntry?.transaction?.id ?? selectedEntry?.id;
    if (!txnId) {
      setTxnDetail(null);
      return;
    }
    let cancelled = false;
    setTxnDetailLoading(true);
    setTxnDetail(null);
    journalVoucherService
      .getJournalVoucher(txnId)
      .then(data => {
        if (!cancelled) setTxnDetail(data);
      })
      .catch(() => {
        if (!cancelled) setTxnDetail(null);
      })
      .finally(() => {
        if (!cancelled) setTxnDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEntry]);

  const goToAccountLedger = (targetAccountId: number) => {
    setSelectedEntry(null);
    navigate(`/accounts/${targetAccountId}/ledger`);
  };

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

  const handleRequestLoanRepaymentReversal = async () => {
    if (!selectedEntry || !loanReversalReason.trim()) return;
    const txnId = selectedEntry.transaction?.id ?? selectedEntry.id;
    setLoanReversalError('');
    try {
      await requestRepaymentReversalMutation.mutateAsync({
        journal_entry: txnId,
        reason: loanReversalReason,
      });
      setLoanReversalConfirming(false);
      setLoanReversalReason('');
      setLoanReversalSuccess(
        'Reversal requested — a different, second approver must confirm it from Loans → Repayment Reversals before anything actually changes.'
      );
    } catch (err: any) {
      setLoanReversalError(
        err?.response?.data?.error || err?.response?.data?.detail || 'Failed to request reversal.'
      );
    }
  };

  const handleReverseTransaction = async () => {
    if (!selectedEntry || !reverseReason.trim()) return;
    const txnId = selectedEntry.transaction?.id ?? selectedEntry.id;
    setReversing(true);
    setReverseError('');
    try {
      await api.post(`/transactions/transactions/${txnId}/reverse/`, { reason: reverseReason });
      setSelectedEntry(null);
      setReverseReason('');
      setReverseConfirming(false);
      await fetchAccountAndTransactions();
    } catch (err: any) {
      setReverseError(
        err?.response?.data?.error || err?.response?.data?.detail || 'Failed to reverse transaction.'
      );
    } finally {
      setReversing(false);
    }
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

              {/* Debit / Credit legs of this transaction, each linking to its own ledger */}
              <div style={{ marginTop: '16px' }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  Transaction Entries
                </div>
                {txnDetailLoading ? (
                  <div style={{ padding: '12px 0', fontSize: '13px', color: '#9ca3af' }}>
                    Loading entries…
                  </div>
                ) : txnDetail && txnDetail.entries.length > 0 ? (
                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    {txnDetail.entries.map(entry => {
                      const isCurrentAccount = String(entry.account.id) === accountId;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => !isCurrentAccount && goToAccountLedger(entry.account.id)}
                          disabled={isCurrentAccount}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            border: 'none',
                            borderBottom: '1px solid #f3f4f6',
                            background: isCurrentAccount ? '#f9fafb' : 'white',
                            cursor: isCurrentAccount ? 'default' : 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: entry.side === 'DR' ? '#dbeafe' : '#fce7f3',
                                color: entry.side === 'DR' ? '#1e40af' : '#9d174d',
                              }}
                            >
                              {entry.side}
                            </span>
                            <span style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                              {entry.account.code}
                            </span>
                            <span
                              style={{
                                fontSize: '13px',
                                color: isCurrentAccount ? '#9ca3af' : '#2563eb',
                                fontWeight: 500,
                              }}
                            >
                              {entry.account.name}
                              {isCurrentAccount && ' (this ledger)'}
                            </span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                              {formatCurrency(Number(entry.amount))}
                            </span>
                            {!isCurrentAccount && (
                              <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 500 }}>
                                View Ledger →
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '12px 0', fontSize: '13px', color: '#9ca3af' }}>
                    Unable to load the other entries for this transaction.
                  </div>
                )}
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
              {canReverseTxn &&
                !selectedEntry.is_reversed &&
                !selectedEntry.transaction?.is_reversal &&
                selectedEntry.transaction?.series === 'LNPMT' && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                    }}
                  >
                    <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#92400e' }}>
                      This is a loan repayment — reversing it also has to unwind the repayment
                      schedule and loan balances, so it goes through Loans → Repayment Reversals
                      and always needs two different approvers. Nothing changes until then.
                    </p>
                    {loanReversalSuccess && (
                      <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#065f46' }}>
                        {loanReversalSuccess}
                      </p>
                    )}
                    {loanReversalError && (
                      <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#b91c1c' }}>
                        {loanReversalError}
                      </p>
                    )}
                    {!loanReversalSuccess && (
                      !loanReversalConfirming ? (
                        <button
                          onClick={() => setLoanReversalConfirming(true)}
                          style={{
                            width: '100%',
                            padding: '9px',
                            background: 'white',
                            color: '#92400e',
                            border: '1px solid #d97706',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Request Loan Repayment Reversal
                        </button>
                      ) : (
                        <>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#92400e',
                              marginBottom: '6px',
                            }}
                          >
                            Reason for reversal (required)
                          </label>
                          <textarea
                            value={loanReversalReason}
                            onChange={e => setLoanReversalReason(e.target.value)}
                            rows={2}
                            placeholder="Explain why this repayment is being reversed…"
                            style={{
                              width: '100%',
                              padding: '8px',
                              fontSize: '13px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              marginBottom: '10px',
                              fontFamily: 'inherit',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setLoanReversalConfirming(false);
                                setLoanReversalReason('');
                                setLoanReversalError('');
                              }}
                              disabled={requestRepaymentReversalMutation.isPending}
                              style={{
                                flex: 1,
                                padding: '9px',
                                background: 'white',
                                color: '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleRequestLoanRepaymentReversal}
                              disabled={requestRepaymentReversalMutation.isPending || !loanReversalReason.trim()}
                              style={{
                                flex: 1,
                                padding: '9px',
                                background:
                                  requestRepaymentReversalMutation.isPending || !loanReversalReason.trim()
                                    ? '#fca5a5'
                                    : '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor:
                                  requestRepaymentReversalMutation.isPending || !loanReversalReason.trim()
                                    ? 'not-allowed'
                                    : 'pointer',
                              }}
                            >
                              {requestRepaymentReversalMutation.isPending ? 'Submitting…' : 'Submit Request'}
                            </button>
                          </div>
                        </>
                      )
                    )}
                  </div>
                )}
              {canReverseTxn &&
                !selectedEntry.is_reversed &&
                !selectedEntry.transaction?.is_reversal &&
                selectedEntry.transaction?.series !== 'LNPMT' && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '14px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                    }}
                  >
                    {reverseError && (
                      <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#b91c1c' }}>
                        {reverseError}
                      </p>
                    )}
                    {!reverseConfirming ? (
                      <button
                        onClick={() => setReverseConfirming(true)}
                        style={{
                          width: '100%',
                          padding: '9px',
                          background: 'white',
                          color: '#92400e',
                          border: '1px solid #d97706',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Reverse This Transaction
                      </button>
                    ) : (
                      <>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#92400e',
                            marginBottom: '6px',
                          }}
                        >
                          Reason for reversal (required)
                        </label>
                        <textarea
                          value={reverseReason}
                          onChange={e => setReverseReason(e.target.value)}
                          rows={2}
                          placeholder="Explain why this transaction is being reversed…"
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '13px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            marginBottom: '10px',
                            fontFamily: 'inherit',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setReverseConfirming(false);
                              setReverseReason('');
                              setReverseError('');
                            }}
                            disabled={reversing}
                            style={{
                              flex: 1,
                              padding: '9px',
                              background: 'white',
                              color: '#374151',
                              border: '1px solid #d1d5db',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleReverseTransaction}
                            disabled={reversing || !reverseReason.trim()}
                            style={{
                              flex: 1,
                              padding: '9px',
                              background: reversing || !reverseReason.trim() ? '#fca5a5' : '#dc2626',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: reversing || !reverseReason.trim() ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {reversing ? 'Reversing…' : 'Confirm Reversal'}
                          </button>
                        </div>
                      </>
                    )}
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
