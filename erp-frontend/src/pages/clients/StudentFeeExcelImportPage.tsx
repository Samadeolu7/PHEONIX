// src/pages/clients/StudentFeeExcelImportPage.tsx
// Upload a school-fees Excel sheet: auto-creates students, posts invoices,
// records full cash payments, and creates FeeEntitlements per student.

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
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportDetail {
  ref: string;
  name: string;
  class: string;
  term: string;
  payment_date: string;
  student_created: boolean;
  invoice_created: boolean;
  invoice_number: string | null;
  invoice_status: 'paid' | 'draft' | null;
  total: string;
  entitlements: number;
  fees: Record<string, string>;
}

interface ImportError {
  ref: string;
  name: string;
  error: string;
}

interface ImportResult {
  students_created: number;
  students_existing: number;
  invoices_created: number;
  invoices_skipped: number;
  classes_created: number;
  entitlements_created: number;
  errors: ImportError[];
  details: ImportDetail[];
}

// ─── Component ───────────────────────────────────────────────────────────────

const StudentFeeExcelImportPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // ── File handling ───────────────────────────────────────────────────────────

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

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await api.postFormData('/clients/clients/school-fees-import/', formData);
      setResult(response);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Upload failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setUploading(false);
    }
  };

  // ── Row expansion (fee breakdown) ───────────────────────────────────────────

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatCurrency = (value: string) => {
    const n = parseFloat(value);
    if (isNaN(n) || n === 0) return '—';
    return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
        <button
          onClick={() => navigate('/clients')}
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
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            School Fees Excel Import
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Upload your school fees spreadsheet — students are created, invoices are posted &amp;
            paid, and access entitlements are granted automatically.
          </p>
        </div>
      </div>

      {/* ── Expected format notice ──────────────────────────────────────────── */}
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
        <strong>
          Two accepted spreadsheet formats (columns are auto-detected by header name):
        </strong>
        <div style={{ marginTop: '0.6rem' }}>
          <strong>Full format</strong> — all fee columns:
          <div
            style={{
              fontFamily: 'monospace',
              background: '#dbeafe',
              borderRadius: '0.25rem',
              padding: '0.35rem 0.6rem',
              marginTop: '0.25rem',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            NAMES &nbsp;|&nbsp; CLASS &nbsp;|&nbsp; TERM &nbsp;|&nbsp; TUITION &nbsp;|&nbsp;
            SUPPLIES &nbsp;|&nbsp; E-PORTAL &nbsp;|&nbsp; LUNCH &nbsp;|&nbsp; TRANSPORT
            &nbsp;|&nbsp; LESSON &nbsp;|&nbsp; SPECIAL EVENT &nbsp;|&nbsp; CODING &nbsp;|&nbsp; PTA
            &nbsp;|&nbsp; PROJECT &nbsp;|&nbsp; TOTAL
          </div>
        </div>
        <div style={{ marginTop: '0.6rem' }}>
          <strong>Simple format</strong> — tuition-only:
          <div
            style={{
              fontFamily: 'monospace',
              background: '#dbeafe',
              borderRadius: '0.25rem',
              padding: '0.35rem 0.6rem',
              marginTop: '0.25rem',
            }}
          >
            NAMES &nbsp;|&nbsp; CLASS &nbsp;|&nbsp; TERM &nbsp;|&nbsp; TUITION
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', color: '#3b82f6' }}>
          <strong>Multiple sheets supported:</strong> put each term's data on its own sheet tab —
          both formats can be mixed in the same workbook. The <strong>TERM</strong> column value
          determines the academic period per row. A <strong>Date</strong> or <strong>Ref</strong>{' '}
          column is optional; if absent, today's date and an auto-generated reference are used.
          Dashes, blanks, and the <strong>TOTAL</strong> column are safely ignored.
        </div>
      </div>

      {/* ── Drop zone ──────────────────────────────────────────────────────── */}
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

      {/* ── Upload button ──────────────────────────────────────────────────── */}
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
            Import &amp; Post Payments
          </>
        )}
      </button>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
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

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      {result && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {[
              {
                label: 'Students Created',
                value: result.students_created,
                icon: <Users size={20} color="#2563eb" />,
                bg: '#eff6ff',
                border: '#bfdbfe',
                textColor: '#1d4ed8',
              },
              {
                label: 'Already Existed',
                value: result.students_existing,
                icon: <Users size={20} color="#6b7280" />,
                bg: '#f9fafb',
                border: '#e5e7eb',
                textColor: '#374151',
              },
              {
                label: 'Invoices Paid',
                value: result.invoices_created,
                icon: <FileText size={20} color="#10b981" />,
                bg: '#f0fdf4',
                border: '#bbf7d0',
                textColor: '#065f46',
              },
              {
                label: 'Entitlements',
                value: result.entitlements_created ?? 0,
                icon: <CheckCircle2 size={20} color="#0891b2" />,
                bg: '#ecfeff',
                border: '#a5f3fc',
                textColor: '#0e7490',
              },
              {
                label: 'Invoices Skipped',
                value: result.invoices_skipped,
                icon: <FileText size={20} color="#f59e0b" />,
                bg: '#fffbeb',
                border: '#dfc99a',
                textColor: '#92400e',
              },
              {
                label: 'Classes Created',
                value: result.classes_created ?? 0,
                icon: <Users size={20} color="#7c3aed" />,
                bg: '#f5f3ff',
                border: '#ddd6fe',
                textColor: '#5b21b6',
              },
              {
                label: 'Errors',
                value: result.errors.length,
                icon: <XCircle size={20} color="#ef4444" />,
                bg: result.errors.length > 0 ? '#fef2f2' : '#f9fafb',
                border: result.errors.length > 0 ? '#fecaca' : '#e5e7eb',
                textColor: result.errors.length > 0 ? '#991b1b' : '#374151',
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

          {/* ── Error list ──────────────────────────────────────────────────── */}
          {result.errors.length > 0 && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 600,
                  color: '#991b1b',
                  marginBottom: '0.75rem',
                }}
              >
                <AlertTriangle size={18} />
                {result.errors.length} row(s) failed to import
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {result.errors.map((e, i) => (
                  <li
                    key={i}
                    style={{ color: '#b91c1c', fontSize: '0.875rem', marginBottom: '0.25rem' }}
                  >
                    <strong>
                      {e.ref} – {e.name}:
                    </strong>{' '}
                    {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Details table ───────────────────────────────────────────────── */}
          {result.details.length > 0 && (
            <div>
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Import Details ({result.details.length} rows)
              </h2>
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
                      {[
                        'Ref',
                        'Name',
                        'Class',
                        'Term',
                        'Date',
                        'Student',
                        'Status',
                        'Invoice #',
                        'Total',
                        '',
                      ].map(h => (
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
                    {result.details.map((row, idx) => (
                      <React.Fragment key={idx}>
                        <tr
                          style={{
                            background: idx % 2 === 0 ? 'white' : '#f9fafb',
                            borderBottom: expandedRows.has(idx) ? 'none' : '1px solid #e5e7eb',
                          }}
                        >
                          <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{row.ref}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>{row.name}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>{row.class}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>{row.term}</td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              fontSize: '0.8rem',
                              color: '#6b7280',
                            }}
                          >
                            {row.payment_date ?? '—'}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            {row.student_created ? (
                              <span
                                style={{
                                  background: '#d1fae5',
                                  color: '#065f46',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '999px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                }}
                              >
                                New
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: '#e5e7eb',
                                  color: '#374151',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '999px',
                                  fontSize: '0.75rem',
                                }}
                              >
                                Exists
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            {row.invoice_status === 'paid' ? (
                              <span
                                style={{
                                  background: '#d1fae5',
                                  color: '#065f46',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '999px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                }}
                              >
                                Paid ✓
                              </span>
                            ) : row.invoice_created ? (
                              <span
                                style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}
                              >
                                Draft
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              fontSize: '0.8rem',
                              color: '#374151',
                              fontFamily: 'monospace',
                            }}
                          >
                            {row.invoice_number ?? '—'}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>
                            {formatCurrency(row.total)}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            {Object.keys(row.fees).length > 0 && (
                              <button
                                onClick={() => toggleRow(idx)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#6b7280',
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '0.25rem',
                                }}
                                title={expandedRows.has(idx) ? 'Hide fees' : 'Show fees'}
                              >
                                {expandedRows.has(idx) ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                        {/* Fee breakdown row */}
                        {expandedRows.has(idx) && Object.keys(row.fees).length > 0 && (
                          <tr
                            style={{
                              background: idx % 2 === 0 ? '#fafafa' : '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                            }}
                          >
                            <td colSpan={10} style={{ padding: '0.5rem 1.5rem 0.75rem' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '0.5rem',
                                }}
                              >
                                {Object.entries(row.fees).map(([name, amount]) => (
                                  <span
                                    key={name}
                                    style={{
                                      background: '#e0f2fe',
                                      color: '#0369a1',
                                      borderRadius: '0.375rem',
                                      padding: '0.25rem 0.625rem',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {name}: {formatCurrency(amount)}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Success message ──────────────────────────────────────────────── */}
          {result.errors.length === 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '0.5rem',
                padding: '0.875rem 1.25rem',
                marginTop: '1.5rem',
                color: '#166534',
                fontWeight: 500,
              }}
            >
              <CheckCircle2 size={20} />
              Import completed successfully — all invoices are posted and paid.
            </div>
          )}
        </>
      )}

      {/* ── Spin keyframe ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default StudentFeeExcelImportPage;
