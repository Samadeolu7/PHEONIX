/**
 * Asset Disposal Page
 *
 * Full accounting instrument for fixed-asset disposal.
 *
 * Journal entries generated on submission:
 *   1. Dr  Asset Disposal A/c          cost
 *      Cr  Fixed Asset A/c             cost          ← remove asset at carrying cost
 *
 *   2. Dr  Accumulated Depreciation    acc_dep
 *      Cr  Asset Disposal A/c          acc_dep       ← clear accumulated depreciation
 *
 *   3. Dr  Bank / Cash A/c             proceeds      ← record sale/scrap proceeds (if any)
 *      Cr  Asset Disposal A/c          proceeds
 *      — OR, for theft with pending insurance claim —
 *      Dr  Insurance Claims Receivable  insured_amount
 *      Cr  Asset Disposal A/c           insured_amount
 *
 *   4a. If book_value > proceeds (LOSS):
 *       Dr  Loss on Asset Disposal     loss
 *       Cr  Asset Disposal A/c         loss
 *
 *   4b. If proceeds > book_value (GAIN):
 *       Dr  Asset Disposal A/c         gain
 *       Cr  Gain on Asset Disposal     gain
 *
 * Net Asset Disposal A/c balance after all entries = 0 (fully cleared).
 */

import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  BookOpen,
  DollarSign,
  Calendar,
  FileText,
  Building,
  Search,
  X,
  Layers,
} from 'lucide-react';

import { useFixedAsset, useDisposeAsset, useFixedAssets } from '../../hooks/useAssets';
import { accountService } from '../../services/accountService';
import { useToast } from '../../hooks/useToast';
import type { Account } from '../../types/accounts';
import type { FixedAsset } from '../../types/assets';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (value: string | number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    typeof value === 'string' ? parseFloat(value) || 0 : value
  );

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface JournalRowProps {
  description: string;
  accountName: string;
  debit?: number;
  credit?: number;
  isTotal?: boolean;
  highlight?: 'gain' | 'loss' | 'neutral';
}

const JournalRow: React.FC<JournalRowProps> = ({
  description,
  accountName,
  debit,
  credit,
  isTotal,
  highlight,
}) => {
  const bgColor =
    highlight === 'gain'
      ? '#f0fdf4'
      : highlight === 'loss'
        ? '#fef2f2'
        : isTotal
          ? '#f9fafb'
          : 'white';
  const textColor =
    highlight === 'gain' ? '#15803d' : highlight === 'loss' ? '#dc2626' : '#1f2937';

  return (
    <tr style={{ background: bgColor, borderBottom: '1px solid #f3f4f6' }}>
      <td
        style={{
          padding: '10px 12px',
          fontSize: '13px',
          color: '#6b7280',
          width: '90px',
          fontWeight: isTotal ? 600 : 400,
        }}
      >
        {description}
      </td>
      <td
        style={{
          padding: '10px 12px',
          fontSize: '13px',
          color: textColor,
          fontWeight: isTotal ? 700 : 500,
        }}
      >
        {accountName}
      </td>
      <td
        style={{
          padding: '10px 12px',
          fontSize: '13px',
          textAlign: 'right',
          fontWeight: isTotal ? 700 : 500,
          color: debit ? '#1d4ed8' : '#9ca3af',
        }}
      >
        {debit !== undefined ? fmt(debit) : '—'}
      </td>
      <td
        style={{
          padding: '10px 12px',
          fontSize: '13px',
          textAlign: 'right',
          fontWeight: isTotal ? 700 : 500,
          color: credit ? '#15803d' : '#9ca3af',
        }}
      >
        {credit !== undefined ? fmt(credit) : '—'}
      </td>
    </tr>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Journal preview builder
// ─────────────────────────────────────────────────────────────────────────────

interface JournalLine {
  description: string;
  accountName: string;
  debit?: number;
  credit?: number;
  highlight?: 'gain' | 'loss' | 'neutral';
}

function buildJournal(
  asset: FixedAsset,
  proceeds: number,
  bankAccountName: string,
  insuranceClaim: boolean
): JournalLine[] {
  const cost = parseFloat(asset.purchase_price) || 0;
  const accDep = parseFloat(asset.accumulated_depreciation) || 0;
  const bookValue = cost - accDep;
  const netResult = proceeds - bookValue; // positive = gain, negative = loss

  // Prefer the asset's own per-asset account (populated once its category
  // is migrated to per-asset tracking — see migrate_category_to_per_asset_
  // accounts) so this preview matches what the backend will actually post
  // to, not a stale category-level account name.
  const categoryDetails = asset.category_details;
  const fixedAssetAccount =
    asset.account_name || categoryDetails?.asset_account_name || 'Fixed Asset A/c';
  const accDepAccount =
    asset.accumulated_depreciation_account_name ||
    categoryDetails?.accumulated_depreciation_account_name ||
    'Accumulated Depreciation A/c';

  const lines: JournalLine[] = [];

  // ── Entry 1: Remove asset at cost ─────────────────────────────────────────
  lines.push(
    { description: 'Dr', accountName: 'Asset Disposal A/c', debit: cost },
    { description: 'Cr', accountName: fixedAssetAccount, credit: cost }
  );

  // ── Entry 2: Clear accumulated depreciation ───────────────────────────────
  if (accDep > 0) {
    lines.push(
      { description: 'Dr', accountName: accDepAccount, debit: accDep },
      { description: 'Cr', accountName: 'Asset Disposal A/c', credit: accDep }
    );
  }

  // ── Entry 3: Record proceeds ──────────────────────────────────────────────
  if (proceeds > 0) {
    const proceedsAccountName = insuranceClaim
      ? 'Insurance Claims Receivable'
      : bankAccountName || 'Bank / Cash A/c';
    lines.push(
      { description: 'Dr', accountName: proceedsAccountName, debit: proceeds },
      { description: 'Cr', accountName: 'Asset Disposal A/c', credit: proceeds }
    );
  }

  // ── Entry 4: Gain or Loss ─────────────────────────────────────────────────
  if (Math.abs(netResult) > 0.005) {
    if (netResult < 0) {
      const loss = Math.abs(netResult);
      lines.push(
        {
          description: 'Dr',
          accountName: 'Loss on Asset Disposal (P&L)',
          debit: loss,
          highlight: 'loss',
        },
        {
          description: 'Cr',
          accountName: 'Asset Disposal A/c',
          credit: loss,
          highlight: 'loss',
        }
      );
    } else {
      lines.push(
        {
          description: 'Dr',
          accountName: 'Asset Disposal A/c',
          debit: netResult,
          highlight: 'gain',
        },
        {
          description: 'Cr',
          accountName: 'Gain on Asset Disposal (P&L)',
          credit: netResult,
          highlight: 'gain',
        }
      );
    }
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  disposal_date: string;
  disposal_amount: string;
  disposal_notes: string;
  bank_account_id: string;
  disposal_reason: 'sold' | 'scrapped' | 'written_off' | 'donated' | 'stolen';
  insurance_claim: boolean;
}

const AssetDisposalPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // ── Asset picker state (used when page is opened without a URL id) ─────────
  const [assetSearch, setAssetSearch] = useState('');
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [pickedAsset, setPickedAsset] = useState<FixedAsset | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleAssetSearchChange = (val: string) => {
    setAssetSearch(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(val.trim());
      setShowAssetDropdown(true);
    }, 300);
  };

  // Query assets matching the search term (only when no URL id)
  const { data: searchResults } = useFixedAssets(
    debouncedSearch ? { search: debouncedSearch } : undefined,
    { fetchAll: false }
  );
  const searchAssets = (searchResults as any)?.results ?? searchResults ?? [];

  // The active asset — either pre-loaded from URL or manually picked
  const assetId = id ? parseInt(id, 10) : NaN;
  const { data: urlAsset, isLoading: assetLoading } = useFixedAsset(assetId);

  // Resolved asset to use throughout the form
  const asset: FixedAsset | undefined = id ? urlAsset : (pickedAsset ?? undefined);

  // Quantity: find sibling assets (same name, active status) for batch disposal
  const [quantity, setQuantity] = useState(1);
  const { data: siblingResults } = useFixedAssets(
    asset ? { search: asset.name, status: 'active' as const } : undefined,
    { fetchAll: true }
  );
  const siblingAssets: FixedAsset[] = useMemo(() => {
    const all: FixedAsset[] = (siblingResults as any)?.results ?? siblingResults ?? [];
    // Keep only active non-disposed assets with the same name (exclude already-disposed)
    return all.filter(
      a => a.name === asset?.name && a.status === 'active' && a.id !== (pickedAsset?.id ?? assetId)
    );
  }, [siblingResults, asset, pickedAsset, assetId]);

  // Total units available for disposal = 1 (the selected) + siblings
  const availableUnits = 1 + siblingAssets.length;

  const disposeMutation = useDisposeAsset();

  const [form, setForm] = useState<FormState>({
    disposal_date: new Date().toISOString().split('T')[0],
    disposal_amount: '',
    disposal_notes: '',
    bank_account_id: '',
    disposal_reason: 'sold',
    insurance_claim: false,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [disposedCount, setDisposedCount] = useState(0);

  // Load accounts for bank/cash selector (only relevant account types)
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => accountService.getAccounts(),
    staleTime: 5 * 60 * 1000,
  });

  // Filter to bank & cash accounts
  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        a =>
          a.account_type === 'asset' &&
          (a.name.toLowerCase().includes('bank') ||
            a.name.toLowerCase().includes('cash') ||
            a.code?.toLowerCase().startsWith('1'))
      ),
    [accounts]
  );

  const proceeds = parseFloat(form.disposal_amount) || 0;
  const cost = parseFloat(asset?.purchase_price || '0') || 0;
  const accDep = parseFloat(asset?.accumulated_depreciation || '0') || 0;
  const bookValue = cost - accDep;
  const netResult = proceeds - bookValue;
  const isGain = netResult > 0.005;
  const isLoss = netResult < -0.005;

  const requiresBankAccount = proceeds > 0 && !form.insurance_claim;

  const selectedBank = bankAccounts.find(a => a.id.toString() === form.bank_account_id);

  const journalLines = useMemo(
    () => (asset ? buildJournal(asset, proceeds, selectedBank?.name || '', form.insurance_claim) : []),
    [asset, proceeds, selectedBank, form.insurance_claim]
  );

  const totalDebits = journalLines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredits = journalLines.reduce((sum, l) => sum + (l.credit || 0), 0);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};

    if (!form.disposal_date) errs.disposal_date = 'Disposal date is required';

    if (form.disposal_amount !== '' && isNaN(parseFloat(form.disposal_amount))) {
      errs.disposal_amount = 'Proceeds must be a valid number';
    }

    if (proceeds < 0) errs.disposal_amount = 'Proceeds cannot be negative';

    if (requiresBankAccount && !form.bank_account_id) {
      errs.bank_account_id = 'A bank/cash account is required when proceeds > 0';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!asset || !validate()) return;

    if (asset.status === 'disposed' || asset.status === 'sold') {
      toast.error('This asset has already been disposed.');
      return;
    }

    const notes = [
      form.disposal_reason ? `Reason: ${form.disposal_reason.replace(/_/g, ' ')}` : '',
      form.insurance_claim ? 'Insurance claim pending' : '',
      quantity > 1 ? `Batch disposal (${quantity} units)` : '',
      form.disposal_notes,
    ]
      .filter(Boolean)
      .join(' | ');

    const disposePayload = {
      disposal_date: form.disposal_date,
      disposal_amount: proceeds.toString(),
      disposal_notes: notes,
      bank_account_id: form.bank_account_id && !form.insurance_claim ? parseInt(form.bank_account_id, 10) : undefined,
      insurance_claim: form.insurance_claim,
    };

    try {
      // Always dispose the primary selected asset
      const assetsToDispose: number[] = [asset.id];

      // For batch (quantity > 1), add sibling asset IDs (up to quantity - 1)
      if (quantity > 1) {
        const extraIds = siblingAssets.slice(0, quantity - 1).map(a => a.id);
        assetsToDispose.push(...extraIds);
      }

      for (const assetIdToDispose of assetsToDispose) {
        await disposeMutation.mutateAsync({ id: assetIdToDispose, data: disposePayload });
      }

      setDisposedCount(assetsToDispose.length);
      setSubmitted(true);
    } catch {
      // error handled by hook
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const fieldStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1.5px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  };

  const errorStyle = { fontSize: '12px', color: '#dc2626', marginTop: '4px' };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading / not found (only when navigated with an ID)
  // ─────────────────────────────────────────────────────────────────────────
  if (id && assetLoading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
        Loading asset details…
      </div>
    );
  }

  if (id && !asset) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <AlertTriangle size={48} color="#f59e0b" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#6b7280' }}>Asset not found.</p>
        <button
          onClick={() => navigate('/assets')}
          style={{
            marginTop: '12px',
            padding: '8px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Back to Assets
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Success screen
  // ─────────────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          maxWidth: '560px',
          margin: '0 auto',
        }}
      >
        <CheckCircle size={64} color="#16a34a" style={{ margin: '0 auto 20px' }} />
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
          {disposedCount > 1 ? `${disposedCount} Assets Disposed Successfully` : 'Asset Disposed Successfully'}
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '8px' }}>
          <strong>{asset?.name}</strong>
          {disposedCount > 1
            ? ` — ${disposedCount} units have been recorded as disposed.`
            : ` (${asset?.asset_number}) has been recorded as disposed.`}
        </p>
        <p style={{ color: '#6b7280', marginBottom: '28px' }}>
          The corresponding journal entries have been posted automatically.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/assets')}
            style={{
              padding: '10px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Assets
          </button>
          {disposedCount === 1 && asset && (
            <button
              onClick={() => navigate(`/assets/${asset.id}`)}
              style={{
                padding: '10px 24px',
                background: 'white',
                color: '#374151',
                border: '1.5px solid #d1d5db',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              View Asset Record
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Already disposed guard (only applies once an asset is selected)
  // ─────────────────────────────────────────────────────────────────────────
  const alreadyDisposed = !!asset && (asset.status === 'disposed' || asset.status === 'sold');

  // Back nav target
  const backTarget = asset ? `/assets/${asset.id}` : '/assets';

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
        <button
          onClick={() => navigate(backTarget)}
          style={{
            padding: '8px',
            border: '1.5px solid #d1d5db',
            borderRadius: '8px',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#1f2937' }}>
            Asset Disposal
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
            {asset ? `${asset.name} \u2014 ${asset.asset_number}` : 'Select an asset to dispose'}
          </p>
        </div>
      </div>

      {/* ── Asset Picker (shown only when no ID in URL) ─────────────────────── */}
      {!id && (
        <div
          style={{
            background: 'white',
            border: '1.5px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} color="#3b82f6" />
            Select Asset
          </h3>

          {pickedAsset ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f0f9ff',
                border: '1.5px solid #bae6fd',
                borderRadius: '8px',
                padding: '12px 16px',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: '#0369a1', fontSize: '15px' }}>{pickedAsset.name}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  {pickedAsset.asset_number} &bull; {pickedAsset.category_name || 'Uncategorised'} &bull; Book value: ₦{(
                    parseFloat(pickedAsset.purchase_price || '0') - parseFloat(pickedAsset.accumulated_depreciation || '0')
                  ).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <button
                onClick={() => {
                  setPickedAsset(null);
                  setAssetSearch('');
                  setDebouncedSearch('');
                  setQuantity(1);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Clear selection"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Type asset name or number…"
                  value={assetSearch}
                  onChange={e => handleAssetSearchChange(e.target.value)}
                  onFocus={() => assetSearch.length >= 2 && setShowAssetDropdown(true)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {showAssetDropdown && debouncedSearch.length >= 2 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    zIndex: 50,
                    maxHeight: '280px',
                    overflowY: 'auto',
                  }}
                >
                  {searchAssets.length === 0 ? (
                    <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '14px' }}>
                      No active assets found
                    </div>
                  ) : (
                    searchAssets.map((a: FixedAsset) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setPickedAsset(a);
                          setAssetSearch(a.name);
                          setShowAssetDropdown(false);
                          setQuantity(1);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f3f4f6',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1f2937' }}>{a.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          {a.asset_number} &bull; {a.category_name || 'Uncategorised'} &bull; Status: {a.status}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* When no asset is selected yet (picker mode, nothing chosen), show a prompt */}
      {!asset && !id && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
          <Layers size={48} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px' }}>Search for an asset above to begin the disposal process.</p>
        </div>
      )}

      {/* Render rest of the form only when an asset is resolved */}
      {asset && (
        <>
      {/* Already disposed warning */}
      {alreadyDisposed && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fca5a5',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '24px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong style={{ color: '#dc2626' }}>Asset already disposed</strong>
            <p style={{ margin: '4px 0 0', color: '#7f1d1d', fontSize: '13px' }}>
              This asset has status <em>{asset.status}</em>. A disposal has already been recorded.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Asset summary card */}
          <div
            style={{
              background: 'white',
              border: '1.5px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px',
                fontSize: '16px',
                fontWeight: 700,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <BookOpen size={18} color="#3b82f6" />
              Asset Financial Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Asset Number', value: asset.asset_number },
                { label: 'Category', value: asset.category_name || '—' },
                {
                  label: 'Purchase Date',
                  value: asset.purchase_date ? fmtDate(asset.purchase_date) : '—',
                },
                { label: 'Cost (at acquisition)', value: fmt(cost), bold: true },
                {
                  label: 'Accumulated Depreciation',
                  value: `(${fmt(accDep)})`,
                  color: '#dc2626',
                },
                {
                  label: 'Net Book Value',
                  value: fmt(bookValue),
                  bold: true,
                  color: bookValue <= 0 ? '#dc2626' : '#1d4ed8',
                  separator: true,
                },
              ].map(row => (
                <React.Fragment key={row.label}>
                  {row.separator && (
                    <div style={{ height: '1px', background: '#e5e7eb', margin: '2px 0' }} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{row.label}</span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: row.bold ? 700 : 500,
                        color: row.color || '#1f2937',
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Disposal form */}
          <div
            style={{
              background: 'white',
              border: '1.5px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <h3
              style={{
                margin: '0 0 18px',
                fontSize: '16px',
                fontWeight: 700,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FileText size={18} color="#3b82f6" />
              Disposal Details
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Disposal date */}
              <div>
                <label style={labelStyle}>
                  <Calendar
                    size={13}
                    style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }}
                  />
                  Disposal Date *
                </label>
                <input
                  type="date"
                  value={form.disposal_date}
                  onChange={e => setForm({ ...form, disposal_date: e.target.value })}
                  style={{
                    ...fieldStyle,
                    borderColor: errors.disposal_date ? '#fca5a5' : '#e5e7eb',
                  }}
                  disabled={alreadyDisposed}
                />
                {errors.disposal_date && <p style={errorStyle}>{errors.disposal_date}</p>}
              </div>

              {/* Disposal reason */}
              <div>
                <label style={labelStyle}>Disposal Method</label>
                <select
                  value={form.disposal_reason}
                  onChange={e =>
                    setForm({
                      ...form,
                      disposal_reason: e.target.value as FormState['disposal_reason'],
                      // reset insurance claim if switching away from stolen
                      insurance_claim:
                        e.target.value === 'stolen' ? form.insurance_claim : false,
                    })
                  }
                  style={fieldStyle}
                  disabled={alreadyDisposed}
                >
                  <option value="sold">Sold</option>
                  <option value="scrapped">Scrapped / Junked</option>
                  <option value="written_off">Written Off</option>
                  <option value="donated">Donated</option>
                  <option value="stolen">Stolen / Lost</option>
                </select>
              </div>

              {/* Batch quantity — shown when there are multiple active units with the same name */}
              {availableUnits > 1 && (
                <div
                  style={{
                    background: '#f0f9ff',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '8px',
                    padding: '14px 16px',
                  }}
                >
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Layers size={14} color="#0369a1" />
                    Batch Disposal Quantity
                  </label>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#64748b' }}>
                    {availableUnits} active unit{availableUnits !== 1 ? 's' : ''} with the name &ldquo;{asset.name}&rdquo; found.
                    Each unit is a separate asset record. Proceeds amount is <strong>per unit</strong>.
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={availableUnits}
                    value={quantity}
                    onChange={e => {
                      const v = Math.max(1, Math.min(availableUnits, parseInt(e.target.value, 10) || 1));
                      setQuantity(v);
                    }}
                    style={{ ...fieldStyle, width: '120px' }}
                    disabled={alreadyDisposed}
                  />
                  <span style={{ marginLeft: '10px', fontSize: '13px', color: '#374151' }}>
                    of {availableUnits} unit{availableUnits !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Insurance claim toggle — only for theft/loss */}
              {form.disposal_reason === 'stolen' && (
                <div
                  style={{
                    background: '#eff6ff',
                    border: '1.5px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '12px 14px',
                  }}
                >
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280' }}>
                    <strong>Uninsured asset?</strong> Leave proceeds as 0 and do not tick the box
                    below — the full net book value will be written off as a loss automatically.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <input
                      type="checkbox"
                      id="insurance_claim"
                      checked={form.insurance_claim}
                      onChange={e =>
                        setForm({ ...form, insurance_claim: e.target.checked, bank_account_id: '' })
                      }
                      style={{ marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                      disabled={alreadyDisposed}
                    />
                    <label htmlFor="insurance_claim" style={{ cursor: 'pointer' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8' }}>
                        Asset is insured — insurance claim pending
                      </span>
                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#4b5563' }}>
                        The expected insurance payout has not yet been received. Enter the claim
                        amount below; it will be recorded as{' '}
                        <strong>Insurance Claims Receivable</strong> (Dr) instead of Cash/Bank.
                      </p>
                    </label>
                  </div>
                </div>
              )}

              {/* Proceeds */}
              <div>
                <label style={labelStyle}>
                  <DollarSign
                    size={13}
                    style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }}
                  />
                  Disposal Proceeds (₦)
                  <span
                    style={{
                      fontWeight: 400,
                      color: '#9ca3af',
                      marginLeft: '6px',
                      fontSize: '12px',
                    }}
                  >
                    — leave 0 if scrapped or no proceeds
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.disposal_amount}
                  onChange={e => setForm({ ...form, disposal_amount: e.target.value })}
                  style={{
                    ...fieldStyle,
                    borderColor: errors.disposal_amount ? '#fca5a5' : '#e5e7eb',
                  }}
                  disabled={alreadyDisposed}
                />
                {errors.disposal_amount && <p style={errorStyle}>{errors.disposal_amount}</p>}
              </div>

              {/* Bank account (required when proceeds > 0 and not insurance claim) */}
              {!form.insurance_claim && (
              <div>
                <label style={labelStyle}>
                  <Building
                    size={13}
                    style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }}
                  />
                  Bank / Cash Account for Proceeds
                  {requiresBankAccount && (
                    <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
                  )}
                </label>
                <select
                  value={form.bank_account_id}
                  onChange={e => setForm({ ...form, bank_account_id: e.target.value })}
                  style={{
                    ...fieldStyle,
                    borderColor: errors.bank_account_id ? '#fca5a5' : '#e5e7eb',
                  }}
                  disabled={alreadyDisposed}
                >
                  <option value="">— None / Not applicable —</option>
                  {accounts
                    .filter(a => a.account_type === 'asset')
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code ? `${a.code} – ` : ''}
                        {a.name}
                      </option>
                    ))}
                </select>
                {errors.bank_account_id && <p style={errorStyle}>{errors.bank_account_id}</p>}
              </div>
              )}

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes / Remarks</label>
                <textarea
                  value={form.disposal_notes}
                  onChange={e => setForm({ ...form, disposal_notes: e.target.value })}
                  placeholder="Enter disposal details, buyer information, authorisation reference…"
                  rows={3}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                  disabled={alreadyDisposed}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Net result card */}
          <div
            style={{
              background: isGain ? '#f0fdf4' : isLoss ? '#fef2f2' : '#f9fafb',
              border: `1.5px solid ${isGain ? '#86efac' : isLoss ? '#fca5a5' : '#e5e7eb'}`,
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              {isGain ? (
                <TrendingUp size={22} color="#15803d" />
              ) : isLoss ? (
                <TrendingDown size={22} color="#dc2626" />
              ) : (
                <CheckCircle size={22} color="#6b7280" />
              )}
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: isGain ? '#15803d' : isLoss ? '#dc2626' : '#1f2937',
                }}
              >
                {isGain ? 'Gain on Disposal' : isLoss ? 'Loss on Disposal' : 'Break-even Disposal'}
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Proceeds', value: fmt(proceeds) },
                { label: 'Net Book Value', value: `(${fmt(bookValue)})` },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{r.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                    {r.value}
                  </span>
                </div>
              ))}
              <div style={{ height: '1px', background: '#d1d5db', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>
                  {isGain ? 'Gain' : isLoss ? 'Loss' : 'Net Result'}
                </span>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: isGain ? '#15803d' : isLoss ? '#dc2626' : '#6b7280',
                  }}
                >
                  {fmt(Math.abs(netResult))}
                </span>
              </div>
            </div>
          </div>

          {/* Journal entry preview */}
          <div
            style={{
              background: 'white',
              border: '1.5px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
              flex: 1,
            }}
          >
            <h3
              style={{
                margin: '0 0 14px',
                fontSize: '16px',
                fontWeight: 700,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <BookOpen size={18} color="#3b82f6" />
              Journal Entry Preview
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#9ca3af' }}>
              These entries will be posted automatically on submission.
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['', 'Account', 'Debit (₦)', 'Credit (₦)'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#6b7280',
                          textAlign: h.includes('₦') ? 'right' : 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((line, i) => (
                    <JournalRow key={i} {...line} />
                  ))}

                  {/* Totals row */}
                  {journalLines.length > 0 && (
                    <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 700, fontSize: '13px' }}>
                        Totals
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: '#1d4ed8',
                        }}
                      >
                        {fmt(totalDebits)}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: '#15803d',
                        }}
                      >
                        {fmt(totalCredits)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Balance check */}
            {journalLines.length > 0 && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  background:
                    Math.abs(totalDebits - totalCredits) < 0.01 ? '#f0fdf4' : '#fef2f2',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color:
                    Math.abs(totalDebits - totalCredits) < 0.01 ? '#15803d' : '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {Math.abs(totalDebits - totalCredits) < 0.01 ? (
                  <>
                    <CheckCircle size={14} /> Journal is balanced
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} /> Journal is unbalanced — check amounts
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{
              background: 'white',
              border: '1.5px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <button
              onClick={handleSubmit}
              disabled={alreadyDisposed || disposeMutation.isPending}
              style={{
                width: '100%',
                padding: '14px',
                background:
                  alreadyDisposed || disposeMutation.isPending ? '#9ca3af' : '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 700,
                cursor:
                  alreadyDisposed || disposeMutation.isPending ? 'not-allowed' : 'pointer',
                marginBottom: '10px',
              }}
            >
              {disposeMutation.isPending
                ? `Processing… (${quantity > 1 ? `0/${quantity}` : ''})`
                : quantity > 1
                ? `Confirm & Dispose ${quantity} Units`
                : 'Confirm & Post Disposal'}
            </button>

            <button
              onClick={() => navigate(backTarget)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'white',
                color: '#374151',
                border: '1.5px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            {alreadyDisposed && (
              <p
                style={{
                  marginTop: '10px',
                  fontSize: '12px',
                  color: '#dc2626',
                  textAlign: 'center',
                }}
              >
                This asset is already disposed. No further action is possible.
              </p>
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default AssetDisposalPage;
