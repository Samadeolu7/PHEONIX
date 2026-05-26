// src/pages/inventory/InitialStockImportPage.tsx
// Upload an Excel sheet to bulk-load opening inventory balances.
// Accounting: Dr Inventory Asset / Cr Share Capital (3100).

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, triggerDownload } from '../../services/api';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Package,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Info,
  FileDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportDetail {
  row: number;
  sku: string;
  name: string;
  category?: string;
  location?: string;
  status: 'imported' | 'skipped';
  reason?: string;
  qty: string;
  unit_cost: string;
  total_value: string;
  item_created?: boolean;
}

interface ValidationError {
  row: number;
  sku: string;
  name: string;
  error: string;
}

interface ImportSummary {
  total_rows_parsed: number;
  items_created: number;
  items_existing_updated: number;
  stock_records_posted: number;
  items_skipped_existing_stock: number;
  validation_errors: number;
  grand_total_value: string;
  count_date: string;
  location: string;
  counted_by: string;
  journal_posted: boolean;
  accounting_entry: string;
}

interface ImportResult {
  success: boolean;
  summary: ImportSummary;
  parse_diagnostics: string[];
  validation_errors: ValidationError[];
  details: ImportDetail[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (value: string | number) => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n) || n === 0) return '—';
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const StatusBadge: React.FC<{ status: 'imported' | 'skipped' }> = ({ status }) =>
  status === 'imported' ? (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#dcfce7',
        color: '#166534',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      <CheckCircle2 size={11} />
      Imported
    </span>
  ) : (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#fef3c7',
        color: '#92400e',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      <AlertTriangle size={11} />
      Skipped
    </span>
  );

// ─── Component ───────────────────────────────────────────────────────────────

const InitialStockImportPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showErrors, setShowErrors] = useState(true);

  // ── File handling ──────────────────────────────────────────────────────────

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

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response: ImportResult = await api.postFormData(
        '/inventory/initial-stock-import/upload/',
        formData
      );
      setResult(response);
      setShowDetails(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Upload failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setUploading(false);
    }
  };

  // ── Download template ──────────────────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const blob = await api.getBlob('/inventory/initial-stock-import/generate-template/');
      triggerDownload(blob, 'phoenix_initial_stock_template.xlsx');
    } catch (err: any) {
      setErrorMsg('Could not download template. Please try again.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // ── Summary cards data ──────────────────────────────────────────────────────

  const summaryCards = result
    ? [
        {
          label: 'Items Created',
          value: result.summary.items_created,
          icon: <Package size={20} color="#2563eb" />,
          bg: '#eff6ff',
          border: '#bfdbfe',
          textColor: '#1d4ed8',
        },
        {
          label: 'Stock Records Posted',
          value: result.summary.stock_records_posted,
          icon: <CheckCircle2 size={20} color="#16a34a" />,
          bg: '#f0fdf4',
          border: '#bbf7d0',
          textColor: '#166534',
        },
        {
          label: 'Skipped (Already Stocked)',
          value: result.summary.items_skipped_existing_stock,
          icon: <AlertTriangle size={20} color="#d97706" />,
          bg: '#fffbeb',
          border: '#dfc99a',
          textColor: '#92400e',
        },
        {
          label: 'Validation Errors',
          value: result.summary.validation_errors,
          icon: <XCircle size={20} color="#dc2626" />,
          bg: '#fef2f2',
          border: '#fecaca',
          textColor: '#991b1b',
        },
        {
          label: 'Total Inventory Value',
          value: fmt(result.summary.grand_total_value),
          icon: <BookOpen size={20} color="#7c3aed" />,
          bg: '#f5f3ff',
          border: '#ddd6fe',
          textColor: '#5b21b6',
        },
      ]
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <button
          onClick={() => navigate('/inventory')}
          style={{
            padding: '0.5rem',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            marginTop: 3,
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            Initial Inventory Upload
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Establish opening stock balances from an Excel spreadsheet. Accounting entry:{' '}
            <strong>Dr 1124 Trading Stock / Cr 3101 Share Capital</strong>. Use{' '}
            <strong>Download Template</strong> to get the pre-formatted Excel file with category
            dropdowns.
          </p>
        </div>
      </div>

      {/* ── Format guide ────────────────────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.6rem' }}>
          <Info size={16} />
          <strong>Expected spreadsheet format</strong>
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Metadata block</strong> (top rows, auto-detected):
          <div
            style={{
              fontFamily: 'monospace',
              background: '#dbeafe',
              borderRadius: '0.25rem',
              padding: '0.35rem 0.6rem',
              marginTop: '0.25rem',
            }}
          >
            Count Date: | [date] &nbsp;|&nbsp; Location: | [warehouse name]
            <br />
            Counted By: | [name]
          </div>
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Data columns</strong> (header row auto-detected):
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
            SKU* &nbsp;|&nbsp; Name* &nbsp;|&nbsp; Category Code* &nbsp;|&nbsp; Category Name
            &nbsp;|&nbsp; Unit of Measure &nbsp;|&nbsp; Opening Qty* &nbsp;|&nbsp; Unit Cost*
            &nbsp;|&nbsp; Selling Price &nbsp;|&nbsp; Reorder Level &nbsp;|&nbsp; Valuation Method
            &nbsp;|&nbsp; Barcode &nbsp;|&nbsp; Notes
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#3b82f6' }}>
            * Required. &nbsp; Columns are detected by header name — order does not matter.
          </p>
        </div>

        <div
          style={{
            marginTop: '0.6rem',
            padding: '0.5rem 0.75rem',
            background: '#fef3c7',
            border: '1px solid #dfc99a',
            borderRadius: '0.375rem',
            color: '#92400e',
            fontSize: '0.8rem',
          }}
        >
          <strong>Important:</strong> Rows where the SKU already has stock at the specified location
          are automatically skipped to prevent double-posting. Run this import only once per item or
          after a full stock reset.
        </div>
      </div>

      {/* ── Drop zone ────────────────────────────────────────────────────────── */}
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

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '2rem',
        }}
      >
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
            transition: 'background 0.2s',
          }}
        >
          {uploading ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Processing…
            </>
          ) : (
            <>
              <Upload size={18} />
              Import Opening Stock
            </>
          )}
        </button>

        <button
          onClick={handleDownloadTemplate}
          disabled={downloadingTemplate}
          title="Download the Excel template with category dropdowns and VLOOKUP pre-filled"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: downloadingTemplate ? '#e5e7eb' : '#f0fdf4',
            color: downloadingTemplate ? '#9ca3af' : '#166534',
            border: `1px solid ${downloadingTemplate ? '#e5e7eb' : '#bbf7d0'}`,
            borderRadius: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: downloadingTemplate ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {downloadingTemplate ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Downloading…
            </>
          ) : (
            <>
              <FileDown size={16} />
              Download Template
            </>
          )}
        </button>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
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

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {summaryCards.map(card => (
              <div
                key={card.label}
                style={{
                  background: card.bg,
                  border: `1px solid ${card.border}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: card.textColor,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {card.icon}
                  {card.label}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: card.textColor,
                  }}
                >
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          {/* Accounting entry confirmation */}
          {result.summary.journal_posted && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '0.5rem',
                padding: '0.875rem 1.25rem',
                marginBottom: '1.25rem',
                fontSize: '0.875rem',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Journal posted:</strong> {result.summary.accounting_entry} —{' '}
                <strong>{fmt(result.summary.grand_total_value)}</strong>
                {result.summary.count_date && (
                  <span style={{ color: '#4b5563', marginLeft: 8 }}>
                    Date: {result.summary.count_date}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Meta info */}
          {(result.summary.location || result.summary.counted_by) && (
            <div
              style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.25rem',
                marginBottom: '1.25rem',
                fontSize: '0.8rem',
                color: '#6b7280',
                display: 'flex',
                gap: '1.5rem',
                flexWrap: 'wrap',
              }}
            >
              {result.summary.location && (
                <span>
                  <strong>Location:</strong> {result.summary.location}
                </span>
              )}
              {result.summary.counted_by && (
                <span>
                  <strong>Counted By:</strong> {result.summary.counted_by}
                </span>
              )}
              {result.summary.count_date && (
                <span>
                  <strong>Count Date:</strong> {result.summary.count_date}
                </span>
              )}
            </div>
          )}

          {/* Parse diagnostics */}
          {result.parse_diagnostics.length > 0 && (
            <div
              style={{
                background: '#fefce8',
                border: '1px solid #fef08a',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.25rem',
                marginBottom: '1.25rem',
                fontSize: '0.8rem',
                color: '#713f12',
              }}
            >
              <strong>Parser diagnostics:</strong>
              <ul style={{ margin: '0.375rem 0 0', paddingLeft: '1.25rem' }}>
                {result.parse_diagnostics.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation errors */}
          {result.validation_errors.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <button
                onClick={() => setShowErrors(v => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 1rem',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  color: '#991b1b',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                <XCircle size={16} />
                {result.validation_errors.length} row(s) failed validation
                {showErrors ? (
                  <ChevronUp size={14} style={{ marginLeft: 'auto' }} />
                ) : (
                  <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                )}
              </button>
              {showErrors && (
                <div
                  style={{
                    border: '1px solid #fecaca',
                    borderTop: 'none',
                    borderRadius: '0 0 0.5rem 0.5rem',
                    overflow: 'auto',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#fef2f2' }}>
                        {['Row', 'SKU', 'Name', 'Error'].map(h => (
                          <th
                            key={h}
                            style={{
                              padding: '0.5rem 0.75rem',
                              textAlign: 'left',
                              color: '#7f1d1d',
                              fontWeight: 600,
                              borderBottom: '1px solid #fecaca',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.validation_errors.map((ve, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fff5f5' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>{ve.row}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>
                            {ve.sku}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{ve.name}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#dc2626' }}>
                            {ve.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Details table */}
          {result.details.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(v => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '0.625rem 1rem',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#374151',
                }}
              >
                <Package size={16} />
                {result.details.length} item(s) processed
                {showDetails ? (
                  <ChevronUp size={14} style={{ marginLeft: 'auto' }} />
                ) : (
                  <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                )}
              </button>

              {showDetails && (
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    borderTop: 'none',
                    borderRadius: '0 0 0.5rem 0.5rem',
                    overflow: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8rem',
                      minWidth: 720,
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {[
                          'Row',
                          'SKU',
                          'Name',
                          'Category',
                          'Location',
                          'Qty',
                          'Unit Cost',
                          'Total Value',
                          'Status',
                        ].map(h => (
                          <th
                            key={h}
                            style={{
                              padding: '0.5rem 0.75rem',
                              textAlign: 'left',
                              color: '#374151',
                              fontWeight: 600,
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
                      {result.details.map((d, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>{d.row}</td>
                          <td
                            style={{
                              padding: '0.5rem 0.75rem',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: '#1d4ed8',
                            }}
                          >
                            {d.sku}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            {d.name}
                            {d.item_created && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: '0.7rem',
                                  background: '#dbeafe',
                                  color: '#1e40af',
                                  padding: '1px 5px',
                                  borderRadius: 6,
                                }}
                              >
                                NEW
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                            {d.category || '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                            {d.location || '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{d.qty}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                            {fmt(d.unit_cost)}
                          </td>
                          <td
                            style={{
                              padding: '0.5rem 0.75rem',
                              textAlign: 'right',
                              fontWeight: 600,
                            }}
                          >
                            {fmt(d.total_value)}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <StatusBadge status={d.status} />
                            {d.reason && (
                              <p
                                style={{
                                  margin: '2px 0 0',
                                  fontSize: '0.72rem',
                                  color: '#9ca3af',
                                }}
                              >
                                {d.reason}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InitialStockImportPage;
