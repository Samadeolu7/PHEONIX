// src/pages/hr/StaffExcelImportPage.tsx
// Bulk-import staff records from a payroll-format Excel workbook.
// The backend creates / updates Staff, SalaryComponent, and StaffPayInfo records.

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Users,
  UserPlus,
  RefreshCw,
  SkipForward,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportSummary {
  total_rows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  success: boolean;
}

interface ImportRow {
  row: number;
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string | null;
  staff_id: number | null;
}

interface ImportResult {
  summary: ImportSummary;
  rows: ImportRow[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const StaffExcelImportPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'created' | 'updated' | 'skipped' | 'error'>('all');

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
      setResult(null);
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setSelectedFile(file);
      setResult(null);
      setErrorMsg(null);
    } else {
      setErrorMsg('Please drop an Excel file (.xlsx or .xls)');
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    setErrorMsg(null);
    setFilter('all');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await api.postFormData('/hr/staff/import/', formData);
      setResult(response as ImportResult);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        'Upload failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setUploading(false);
    }
  };

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const filteredRows = result
    ? filter === 'all'
      ? result.rows
      : result.rows.filter(r => r.status === filter)
    : [];

  // ── Status badge ──────────────────────────────────────────────────────────

  const StatusBadge: React.FC<{ status: ImportRow['status'] }> = ({ status }) => {
    const map: Record<ImportRow['status'], { bg: string; color: string; label: string }> = {
      created: { bg: '#d1fae5', color: '#065f46', label: '✓ Created' },
      updated: { bg: '#dbeafe', color: '#1d4ed8', label: '↻ Updated' },
      skipped: { bg: '#f3f4f6', color: '#6b7280', label: '— Skipped' },
      error: { bg: '#fee2e2', color: '#991b1b', label: '✗ Error' },
    };
    const s = map[status];
    return (
      <span
        style={{
          background: s.bg,
          color: s.color,
          padding: '0.2rem 0.6rem',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {s.label}
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
        <button
          onClick={() => navigate('/hr/staff')}
          style={{
            padding: '0.5rem',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Staff Excel Import</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Bulk-import staff from a payroll spreadsheet — creates employee records, salary
            components, and pay assignments automatically.
          </p>
        </div>
      </div>

      {/* ── Expected column format ───────────────────────────────────────── */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '0.5rem',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          color: '#1e40af',
        }}
      >
        <strong>Expected column headers (order flexible — matched by name):</strong>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.375rem 1.5rem',
            marginTop: '0.625rem',
          }}
        >
          {[
            { col: 'Name', note: 'Required — First Last format' },
            { col: 'Basic', note: 'Earnings' },
            { col: 'Housing', note: 'Earnings' },
            { col: 'Transport', note: 'Earnings' },
            { col: 'Entertainment', note: 'Earnings' },
            { col: 'Utility', note: 'Earnings' },
            { col: 'Lunch', note: 'Earnings' },
            { col: 'Leave Allow', note: 'Earnings' },
            { col: 'PAYE Deduct', note: 'Deduction' },
            { col: 'Loan Deductions', note: 'Deduction' },
            { col: 'Pension Deductions', note: 'Deduction' },
            { col: 'Dev. Levy & Other', note: 'Deduction' },
            { col: 'PAYE PIN', note: 'Optional — staff info' },
            { col: 'PENSION (PEN number)', note: 'Optional — staff info' },
            { col: 'PFA', note: 'Pension fund administrator' },
            { col: 'Bank', note: 'Optional — staff info' },
            { col: 'Account Number', note: 'Optional — staff info' },
          ].map(item => (
            <div key={item.col} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontWeight: 600, color: '#1e40af' }}>{item.col}</span>
              <span style={{ color: '#3b82f6', fontSize: '0.75rem' }}>— {item.note}</span>
            </div>
          ))}
        </div>
        <p style={{ color: '#3b82f6', marginTop: '0.625rem', marginBottom: 0 }}>
          Any title / blank rows above the header are skipped automatically. A percentage row
          immediately after the header (e.g. 16%, 10%…) is also skipped. Existing staff are{' '}
          <strong>updated</strong> (blank supplementary fields filled in); new staff are{' '}
          <strong>created</strong>.
        </p>
      </div>

      {/* ── Drop zone ────────────────────────────────────────────────────── */}
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : selectedFile ? '#10b981' : '#d1d5db'}`,
          borderRadius: '0.75rem',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#eff6ff' : selectedFile ? '#f0fdf4' : '#f9fafb',
          transition: 'all 0.2s',
          marginBottom: '1.5rem',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {selectedFile ? (
          <div>
            <FileSpreadsheet size={40} color="#10b981" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ fontWeight: 600, color: '#065f46', margin: '0 0 0.25rem' }}>
              {selectedFile.name}
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              {(selectedFile.size / 1024).toFixed(1)} KB — click to change
            </p>
          </div>
        ) : (
          <div>
            <Upload size={40} color="#9ca3af" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 0.25rem' }}>
              Drop your Excel file here or click to browse
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              Supports .xlsx and .xls
            </p>
          </div>
        )}
      </div>

      {/* ── Upload button ─────────────────────────────────────────────────── */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.75rem',
          background: !selectedFile || uploading ? '#e5e7eb' : '#2563eb',
          color: !selectedFile || uploading ? '#9ca3af' : 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: !selectedFile || uploading ? 'not-allowed' : 'pointer',
          marginBottom: '2rem',
          transition: 'background 0.2s',
        }}
      >
        {uploading ? (
          <>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Importing…
          </>
        ) : (
          <>
            <Upload size={18} />
            Import Staff
          </>
        )}
      </button>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {errorMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            color: '#991b1b',
          }}
        >
          <XCircle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0 }}>{errorMsg}</p>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {[
              {
                label: 'Total Rows',
                value: result.summary.total_rows,
                icon: <Users size={20} color="#6b7280" />,
                bg: '#f9fafb',
                border: '#e5e7eb',
                textColor: '#374151',
              },
              {
                label: 'Created',
                value: result.summary.created,
                icon: <UserPlus size={20} color="#10b981" />,
                bg: '#f0fdf4',
                border: '#bbf7d0',
                textColor: '#065f46',
              },
              {
                label: 'Updated',
                value: result.summary.updated,
                icon: <RefreshCw size={20} color="#2563eb" />,
                bg: '#eff6ff',
                border: '#bfdbfe',
                textColor: '#1d4ed8',
              },
              {
                label: 'Skipped',
                value: result.summary.skipped,
                icon: <SkipForward size={20} color="#f59e0b" />,
                bg: '#fffbeb',
                border: '#dfc99a',
                textColor: '#92400e',
              },
              {
                label: 'Errors',
                value: result.summary.errors,
                icon: (
                  <XCircle size={20} color={result.summary.errors > 0 ? '#ef4444' : '#9ca3af'} />
                ),
                bg: result.summary.errors > 0 ? '#fef2f2' : '#f9fafb',
                border: result.summary.errors > 0 ? '#fecaca' : '#e5e7eb',
                textColor: result.summary.errors > 0 ? '#991b1b' : '#374151',
              },
            ].map(card => (
              <div
                key={card.label}
                style={{
                  background: card.bg,
                  border: `1px solid ${card.border}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                {card.icon}
                <div>
                  <div
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: card.textColor,
                      lineHeight: 1,
                    }}
                  >
                    {card.value}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
                    {card.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Success / partial-success banner */}
          {result.summary.success ? (
            result.summary.errors === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '0.5rem',
                  padding: '0.875rem 1.25rem',
                  marginBottom: '1.5rem',
                  color: '#166534',
                  fontWeight: 500,
                }}
              >
                <CheckCircle2 size={20} />
                Import completed successfully — all rows processed without errors.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#fffbeb',
                  border: '1px solid #dfc99a',
                  borderRadius: '0.5rem',
                  padding: '0.875rem 1.25rem',
                  marginBottom: '1.5rem',
                  color: '#78350f',
                  fontWeight: 500,
                }}
              >
                <AlertTriangle size={20} />
                Import completed with {result.summary.errors} error(s) — check the rows below.
              </div>
            )
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                padding: '0.875rem 1.25rem',
                marginBottom: '1.5rem',
                color: '#991b1b',
                fontWeight: 500,
              }}
            >
              <XCircle size={20} />
              Import failed — all rows encountered errors.
            </div>
          )}

          {/* Row filter tabs */}
          {result.rows.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                {(
                  [
                    { key: 'all', label: `All (${result.rows.length})` },
                    { key: 'created', label: `Created (${result.summary.created})` },
                    { key: 'updated', label: `Updated (${result.summary.updated})` },
                    { key: 'skipped', label: `Skipped (${result.summary.skipped})` },
                    { key: 'error', label: `Errors (${result.summary.errors})` },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    style={{
                      padding: '0.375rem 0.875rem',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: filter === tab.key ? '#2563eb' : '#d1d5db',
                      background: filter === tab.key ? '#2563eb' : 'white',
                      color: filter === tab.key ? 'white' : '#374151',
                      fontSize: '0.875rem',
                      fontWeight: filter === tab.key ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Row details table */}
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.875rem',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Row #', 'Name', 'Status', 'Staff ID', 'Note'].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '0.625rem 0.75rem',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: '#374151',
                            borderBottom: '1px solid #e5e7eb',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, idx) => (
                      <tr
                        key={row.row}
                        style={{
                          background:
                            row.status === 'error'
                              ? '#fef9f9'
                              : idx % 2 === 0
                                ? 'white'
                                : '#f9fafb',
                          borderBottom: '1px solid #e5e7eb',
                        }}
                      >
                        <td
                          style={{
                            padding: '0.6rem 0.75rem',
                            color: '#9ca3af',
                            fontFamily: 'monospace',
                          }}
                        >
                          {row.row}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{row.name}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <StatusBadge status={row.status} />
                        </td>
                        <td
                          style={{
                            padding: '0.6rem 0.75rem',
                            fontFamily: 'monospace',
                            color: row.staff_id ? '#374151' : '#9ca3af',
                          }}
                        >
                          {row.staff_id ?? '—'}
                        </td>
                        <td
                          style={{
                            padding: '0.6rem 0.75rem',
                            color: row.status === 'error' ? '#b91c1c' : '#6b7280',
                            fontSize: '0.8rem',
                            maxWidth: 320,
                          }}
                        >
                          {row.message ?? '—'}
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: '2rem',
                            textAlign: 'center',
                            color: '#9ca3af',
                          }}
                        >
                          No rows match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* View Staff button */}
              {(result.summary.created > 0 || result.summary.updated > 0) && (
                <div style={{ marginTop: '1.5rem' }}>
                  <button
                    onClick={() => navigate('/hr/staff')}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <Users size={16} />
                    View Staff List
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default StaffExcelImportPage;
