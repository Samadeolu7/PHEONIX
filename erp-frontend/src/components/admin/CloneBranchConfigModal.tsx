import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  Copy,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Branch, CloneConfigResult } from '../../services/branchService';
import { useCloneBranchConfig, useCloneBranchConfigPreview } from '../../hooks/useBranches';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
}

const LABEL_MAP: Record<string, string> = {
  account_categories: 'Account Categories',
  product_categories: 'Product Categories',
  fees: 'Fees',
  salary_components: 'Salary Components',
  leave_types: 'Leave Types',
  workflow_templates: 'Workflow Templates',
  form_schemas: 'Form Schemas',
  gl_accounts: 'GL Accounts',
  products: 'Products',
  income_categories: 'Income Categories',
  inventory_categories: 'Inventory Categories',
  service_items: 'Service Items',
  inventory_items: 'Inventory Items',
  expense_categories: 'Expense Categories',
  asset_categories: 'Asset Categories',
  loan_products: 'Loan Products',
  savings_products: 'Savings Products',
  fee_structures: 'Fee Structures',
  loan_product_fees: 'Loan Product Fees',
  loan_savings_requirements: 'Loan Savings Requirements',
  product_requirements: 'Product Requirements',
  fee_structure_components: 'Fee Structure Components',
  hr_config: 'HR Configuration',
  inventory_config: 'Inventory Configuration',
  procurement_config: 'Procurement Configuration',
  income_accounting_config: 'Income Accounting Configuration',
  income_category_overrides: 'Income Category Account Overrides',
  notification_templates: 'Notification Templates',
  client_registration_config: 'Client Registration Config',
  client_classifications: 'Client Classifications',
  workflow_defaults: 'Workflow Defaults',
  dashboard_themes: 'Dashboard Themes',
  dashboard_templates: 'Dashboard Templates',
};

const label = (key: string) => LABEL_MAP[key] ?? key.replace(/_/g, ' ');

type Step = 'form' | 'preview' | 'cloning' | 'result';

interface BreakdownTableProps {
  created: Record<string, number>;
  skipped: Record<string, number>;
  createdLabel: string;
  skippedLabel: string;
  createdColor: string;
}

const BreakdownTable: React.FC<BreakdownTableProps> = ({
  created,
  skipped,
  createdLabel,
  skippedLabel,
  createdColor,
}) => {
  const allKeys = Array.from(new Set([...Object.keys(created), ...Object.keys(skipped)]));
  if (allKeys.length === 0) return null;

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '20px',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f9fafb' }}>
            <th
              style={{
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 500,
                color: '#6b7280',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              Category
            </th>
            <th
              style={{
                padding: '8px 12px',
                textAlign: 'right',
                fontWeight: 500,
                color: createdColor,
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              {createdLabel}
            </th>
            <th
              style={{
                padding: '8px 12px',
                textAlign: 'right',
                fontWeight: 500,
                color: '#9ca3af',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              {skippedLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key, idx) => (
            <tr
              key={key}
              style={{
                backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa',
              }}
            >
              <td style={{ padding: '7px 12px', color: '#374151' }}>{label(key)}</td>
              <td
                style={{
                  padding: '7px 12px',
                  textAlign: 'right',
                  fontWeight: 500,
                  color: (created[key] ?? 0) > 0 ? createdColor : '#d1d5db',
                }}
              >
                {created[key] ?? 0}
              </td>
              <td
                style={{
                  padding: '7px 12px',
                  textAlign: 'right',
                  color: '#9ca3af',
                }}
              >
                {skipped[key] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface WarningsListProps {
  errors: string[];
  show: boolean;
  onToggle: () => void;
}

const WarningsList: React.FC<WarningsListProps> = ({ errors, show, onToggle }) => {
  if (errors.length === 0) return null;
  return (
    <div
      style={{
        border: '1px solid #fde68a',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '20px',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#fffbeb',
          border: 'none',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          color: '#92400e',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} style={{ color: '#d97706' }} />
          {errors.length} warning{errors.length !== 1 ? 's' : ''} (items skipped due to missing
          dependencies)
        </span>
        {show ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {show && (
        <ul
          style={{
            margin: 0,
            padding: '8px 14px 12px 32px',
            listStyle: 'disc',
            backgroundColor: '#fffbeb',
          }}
        >
          {errors.map((e, i) => (
            <li key={i} style={{ fontSize: '12px', color: '#78350f', marginBottom: '4px' }}>
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const CloneBranchConfigModal: React.FC<Props> = ({ isOpen, onClose, branches }) => {
  const { mutateAsync: previewConfig, isPending: isPreviewing } = useCloneBranchConfigPreview();
  const { mutateAsync: cloneConfig, isPending: isCloning } = useCloneBranchConfig();
  const [step, setStep] = useState<Step>('form');
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [preview, setPreview] = useState<CloneConfigResult | null>(null);
  const [result, setResult] = useState<CloneConfigResult | null>(null);
  const [previewError, setPreviewError] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showWarnings, setShowWarnings] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setSourceId('');
      setTargetId('');
      setPreview(null);
      setResult(null);
      setPreviewError('');
      setErrorMsg('');
      setShowWarnings(false);
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'cloning') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, step, onClose]);

  if (!isOpen) return null;

  const activeSourceId = sourceId ? parseInt(sourceId, 10) : null;
  const activeTargetId = targetId ? parseInt(targetId, 10) : null;
  const canSubmit =
    activeSourceId !== null &&
    activeTargetId !== null &&
    activeSourceId !== activeTargetId;

  const sourceBranch = branches.find(b => b.id === activeSourceId);
  const targetBranch = branches.find(b => b.id === activeTargetId);

  const handlePreview = async () => {
    if (!activeSourceId || !activeTargetId) return;
    setPreviewError('');
    try {
      const res = await previewConfig({
        sourceBranchId: activeSourceId,
        targetBranchId: activeTargetId,
      });
      setPreview(res);
      setShowWarnings(false);
      setStep('preview');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || 'Preview failed. Please try again.';
      setPreviewError(msg);
    }
  };

  const handleClone = async () => {
    if (!activeSourceId || !activeTargetId) return;
    setStep('cloning');
    setErrorMsg('');
    try {
      const res = await cloneConfig({
        sourceBranchId: activeSourceId,
        targetBranchId: activeTargetId,
      });
      setResult(res);
      setStep('result');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Clone failed. Please try again.';
      setErrorMsg(msg);
      setStep('result');
    }
  };

  const totalCreated = result ? Object.values(result.created).reduce((a, b) => a + b, 0) : 0;
  const totalSkipped = result ? Object.values(result.skipped).reduce((a, b) => a + b, 0) : 0;

  const previewWillCreate = preview
    ? Object.values(preview.created).reduce((a, b) => a + b, 0)
    : 0;
  const previewAlreadyExists = preview
    ? Object.values(preview.skipped).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={step !== 'cloning' ? onClose : undefined}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Copy size={18} style={{ color: '#2563eb' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                Clone Branch Configuration
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                Copy config data between branches
              </p>
            </div>
          </div>
          {step !== 'cloning' && (
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
                padding: '4px',
                borderRadius: '4px',
                lineHeight: 1,
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* ── FORM STEP ── */}
          {step === 'form' && (
            <>
              {/* Info banner */}
              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '24px',
                  fontSize: '13px',
                  color: '#1e40af',
                  lineHeight: '1.5',
                }}
              >
                <strong>What gets copied:</strong> chart of accounts, products, loan &amp; savings
                products, fee structures, income/expense/inventory/asset categories, HR salary
                components &amp; leave types, HR/inventory/procurement approval workflow
                configuration, income GL account mapping, notification templates, client
                registration &amp; classification config, and automation templates.
                <br />
                <span style={{ color: '#6b7280' }}>
                  Transactions, clients, staff records, and account balances are never copied.
                  Existing records in the target branch are skipped. You'll see an exact
                  category-by-category breakdown before anything is written.
                </span>
              </div>

              {/* Branch selectors */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  gap: '12px',
                  alignItems: 'end',
                  marginBottom: '24px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    Source Branch
                  </label>
                  <select
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '14px',
                      color: '#111827',
                      backgroundColor: 'white',
                    }}
                  >
                    <option value="">Select source…</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} disabled={b.id === activeTargetId}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                  {sourceBranch && (
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6b7280' }}>
                      Copy FROM this branch
                    </p>
                  )}
                </div>

                <div style={{ paddingBottom: '10px' }}>
                  <ArrowRight size={20} style={{ color: '#9ca3af' }} />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    Target Branch
                  </label>
                  <select
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '14px',
                      color: '#111827',
                      backgroundColor: 'white',
                    }}
                  >
                    <option value="">Select target…</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} disabled={b.id === activeSourceId}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                  {targetBranch && (
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6b7280' }}>
                      Copy INTO this branch
                    </p>
                  )}
                </div>
              </div>

              {activeSourceId === activeTargetId && activeSourceId !== null && (
                <p
                  style={{
                    fontSize: '13px',
                    color: '#dc2626',
                    marginBottom: '16px',
                  }}
                >
                  Source and target must be different branches.
                </p>
              )}

              {previewError && (
                <p
                  style={{
                    fontSize: '13px',
                    color: '#dc2626',
                    marginBottom: '16px',
                  }}
                >
                  {previewError}
                </p>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '9px 18px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePreview}
                  disabled={!canSubmit || isPreviewing}
                  style={{
                    padding: '9px 18px',
                    border: 'none',
                    borderRadius: '8px',
                    background: canSubmit && !isPreviewing ? '#2563eb' : '#93c5fd',
                    color: 'white',
                    cursor: canSubmit && !isPreviewing ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Copy size={15} />
                  {isPreviewing ? 'Checking…' : 'Preview Changes'}
                </button>
              </div>
            </>
          )}

          {/* ── PREVIEW STEP ── */}
          {step === 'preview' && preview && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>
                    Nothing has been written yet
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                    {preview.source_branch} → {preview.target_branch} — review, then confirm
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 700, color: '#2563eb' }}>
                    {previewWillCreate}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#1e40af' }}>will be created</p>
                </div>
                <div
                  style={{
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 700, color: '#6b7280' }}>
                    {previewAlreadyExists}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>already exist</p>
                </div>
              </div>

              <BreakdownTable
                created={preview.created}
                skipped={preview.skipped}
                createdLabel="Will Create"
                skippedLabel="Already Exists"
                createdColor="#2563eb"
              />

              <WarningsList
                errors={preview.errors}
                show={showWarnings}
                onToggle={() => setShowWarnings(v => !v)}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  onClick={() => setStep('form')}
                  style={{
                    padding: '9px 18px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleClone}
                  disabled={isCloning}
                  style={{
                    padding: '9px 18px',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#2563eb',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Copy size={15} />
                  Confirm &amp; Clone
                </button>
              </div>
            </>
          )}

          {/* ── CLONING STEP ── */}
          {step === 'cloning' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: '3px solid #bfdbfe',
                  borderTopColor: '#2563eb',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 20px',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 6px' }}>
                Cloning configuration…
              </p>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                This may take a moment. Please don't close this window.
              </p>
            </div>
          )}

          {/* ── RESULT STEP ── */}
          {step === 'result' && (
            <>
              {errorMsg ? (
                /* Error state */
                <>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '24px 0 16px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        backgroundColor: '#fef2f2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px',
                      }}
                    >
                      <AlertTriangle size={26} style={{ color: '#dc2626' }} />
                    </div>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>
                      Clone failed
                    </p>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{errorMsg}</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                    <button
                      onClick={() => setStep('preview')}
                      style={{
                        padding: '9px 18px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                      }}
                    >
                      Try Again
                    </button>
                    <button
                      onClick={onClose}
                      style={{
                        padding: '9px 18px',
                        border: 'none',
                        borderRadius: '8px',
                        background: '#2563eb',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                      }}
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : result ? (
                /* Success state */
                <>
                  {/* Success header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#f0fdf4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <CheckCircle size={22} style={{ color: '#16a34a' }} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#111827' }}>
                        Clone complete
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                        {result.source_branch} → {result.target_branch}
                      </p>
                    </div>
                  </div>

                  {/* Summary counts */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#f0fdf4',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        textAlign: 'center',
                      }}
                    >
                      <p
                        style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 700, color: '#16a34a' }}
                      >
                        {totalCreated}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#15803d' }}>records created</p>
                    </div>
                    <div
                      style={{
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        textAlign: 'center',
                      }}
                    >
                      <p
                        style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 700, color: '#6b7280' }}
                      >
                        {totalSkipped}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>already existed</p>
                    </div>
                  </div>

                  <BreakdownTable
                    created={result.created}
                    skipped={result.skipped}
                    createdLabel="Created"
                    skippedLabel="Skipped"
                    createdColor="#16a34a"
                  />

                  <WarningsList
                    errors={result.errors}
                    show={showWarnings}
                    onToggle={() => setShowWarnings(v => !v)}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={onClose}
                      style={{
                        padding: '9px 24px',
                        border: 'none',
                        borderRadius: '8px',
                        background: '#2563eb',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                      }}
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CloneBranchConfigModal;
