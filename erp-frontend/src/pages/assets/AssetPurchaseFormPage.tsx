/**
 * Asset Purchase Form Page
 *
 * Lets users record a single purchase against one supplier that covers
 * multiple asset types and quantities.  One PO and one AP entry are
 * created for the whole batch; individual FixedAsset records are
 * generated per line × quantity when the purchase is "posted".
 *
 * Routes
 *   /assets/purchases/new         → create a new draft
 *   /assets/purchases/:id         → view / post an existing draft
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  useAssetAcquisition,
  useCreateAssetAcquisition,
  useUpdateAssetAcquisition,
  usePostAssetAcquisition,
  useAssetCategories,
  useSubmitAcquisition,
  useApproveAcquisition,
  useRejectAcquisition,
  useCreateAssetCategory,
} from '../../hooks/useAssets';
import { useAllSuppliers } from '../../hooks/useSuppliers';
import { accountService } from '../../services/accountService';
import type { Account } from '../../types/accounts';
import type {
  CreateAssetAcquisitionLineRequest,
  CreateAssetAcquisitionRequest,
  CreateAssetCategoryRequest,
  DepreciationMethod,
} from '../../types/assets';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Send,
  Info,
  CheckCircle,
  Building,
  Package,
  DollarSign,
  ShoppingCart,
  ThumbsUp,
  ThumbsDown,
  X,
  Clock,
  AlertCircle,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'units_of_production', label: 'Units of Production' },
];

const PAYMENT_TERMS = [
  { value: 'cash', label: 'Cash on Delivery' },
  { value: 'net_15', label: 'Net 15 Days' },
  { value: 'net_30', label: 'Net 30 Days' },
  { value: 'net_60', label: 'Net 60 Days' },
  { value: 'net_90', label: 'Net 90 Days' },
];

// ─── Line item draft type (local state) ──────────────────────────────────────

interface LineDraft {
  /** Internal key for React key prop – not sent to API */
  _key: string;
  /** Linked registered asset (when converted from a requisition) – read-only */
  registered_asset?: number | null;
  registered_asset_name?: string;
  registered_asset_number?: string;
  /** Required only when NOT linked to a registered asset */
  asset_category: number | '';
  name: string;
  description: string;
  quantity: number;
  unit_price: string;
  /** Depreciation overrides – empty string = inherit from category */
  depreciation_method: string;
  useful_life_years: string;
  salvage_value_percentage: string;
  /** Whether the depreciation override panel is expanded */
  showOverrides: boolean;
}

// ─── Inline account picker for category modal ────────────────────────────────

const CatAccountSelect: React.FC<{
  accounts: Account[];
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
}> = ({ accounts, value, onChange, error }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = accounts.find(a => parseInt(a.id) === value);
  const filtered = accounts.filter(
    a =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.code ?? '').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-500' : 'border-gray-300'}`}
      >
        {selected ? (
          <span className="truncate text-gray-800">
            {selected.code ? `[${selected.code}] ` : ''}
            {selected.name}
          </span>
        ) : (
          <span className="text-gray-400">— Select account —</span>
        )}
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts…"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {value != null && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
              >
                — Clear selection —
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No accounts match</p>
            ) : (
              filtered.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange(parseInt(a.id));
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${parseInt(a.id) === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'}`}
                >
                  {a.code && <span className="text-gray-400 mr-1">[{a.code}]</span>}
                  {a.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

const emptyLine = (): LineDraft => ({
  _key: Math.random().toString(36).slice(2),
  asset_category: '',
  name: '',
  description: '',
  quantity: 1,
  unit_price: '',
  depreciation_method: '',
  useful_life_years: '',
  salvage_value_percentage: '',
  showOverrides: false,
});

const fmt = (n: number) =>
  n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Component ────────────────────────────────────────────────────────────────

const AssetAcquisitionFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isViewing = !!id; // viewing an existing draft

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: existingAcquisition, isLoading: loadingExisting } = useAssetAcquisition(
    isViewing ? parseInt(id!) : 0
  );
  const { data: categories = [] } = useAssetCategories();
  const { data: suppliers = [] } = useAllSuppliers({ is_active: true });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useCreateAssetAcquisition();
  const updateMutation = useUpdateAssetAcquisition();
  const postMutation = usePostAssetAcquisition();
  const submitMutation = useSubmitAcquisition();
  const approveMutation = useApproveAcquisition();
  const rejectMutation = useRejectAcquisition();

  // ── Header state ──────────────────────────────────────────────────────────
  const [supplier, setSupplier] = useState<number | ''>('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState('net_30');
  const [notes, setNotes] = useState('');

  // ── Line items ────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  // ── Errors ────────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Post result ───────────────────────────────────────────────────────────
  const [postResult, setPostResult] = useState<{
    assets_activated: number;
    asset_ids: number[];
    reference_number: string;
    depreciation_batch_id?: string | null;
  } | null>(null);
  // ── Reject modal ─────────────────────────────────────────
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // ── Category modal ────────────────────────────────────────
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [pendingCategoryLineKey, setPendingCategoryLineKey] = useState<string | null>(null);
  const emptyCatForm = {
    name: '',
    code: '',
    description: '',
    default_depreciation_method: 'straight_line' as DepreciationMethod,
    default_useful_life_years: 5,
    default_salvage_value_percentage: '10.00',
    asset_account: null as number | null,
    depreciation_account: null as number | null,
    accumulated_depreciation_account: null as number | null,
    maintenance_expense_account: null as number | null,
  };
  const [catForm, setCatForm] = useState(emptyCatForm);
  const [catErrors, setCatErrors] = useState<Record<string, string>>({});
  const createCategoryMutation = useCreateAssetCategory();
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => accountService.getAccounts(),
    staleTime: 5 * 60 * 1000,
    enabled: showCategoryModal,
  });

  const openCategoryModal = (lineKey: string) => {
    setPendingCategoryLineKey(lineKey);
    setCatForm(emptyCatForm);
    setCatErrors({});
    setShowCategoryModal(true);
  };

  const setCatField = <K extends keyof typeof emptyCatForm>(
    field: K,
    value: (typeof emptyCatForm)[K]
  ) => {
    setCatForm(prev => ({ ...prev, [field]: value }));
    if (catErrors[field])
      setCatErrors(prev => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
  };

  const handleCategoryModalSubmit = async () => {
    const e: Record<string, string> = {};
    if (!catForm.name.trim()) e.name = 'Name is required';
    if (!catForm.code.trim()) e.code = 'Code is required';
    if (!catForm.default_depreciation_method) e.default_depreciation_method = 'Select a method';
    if (!catForm.default_useful_life_years || catForm.default_useful_life_years < 1)
      e.default_useful_life_years = 'Useful life must be at least 1 year';
    if (!catForm.default_salvage_value_percentage.trim())
      e.default_salvage_value_percentage = 'Salvage % is required';
    if (!catForm.asset_account) e.asset_account = 'Asset account is required';
    if (!catForm.depreciation_account)
      e.depreciation_account = 'Depreciation expense account is required';
    if (!catForm.accumulated_depreciation_account)
      e.accumulated_depreciation_account = 'Accumulated depreciation account is required';
    if (Object.keys(e).length > 0) {
      setCatErrors(e);
      return;
    }

    const payload: CreateAssetCategoryRequest = {
      name: catForm.name.trim(),
      code: catForm.code.trim(),
      description: catForm.description.trim() || undefined,
      default_depreciation_method: catForm.default_depreciation_method,
      default_useful_life_years: catForm.default_useful_life_years,
      default_salvage_value_percentage: catForm.default_salvage_value_percentage,
      asset_account: catForm.asset_account!,
      depreciation_account: catForm.depreciation_account!,
      accumulated_depreciation_account: catForm.accumulated_depreciation_account!,
      maintenance_expense_account: catForm.maintenance_expense_account ?? undefined,
    };

    try {
      const newCat = await createCategoryMutation.mutateAsync(payload);
      if (pendingCategoryLineKey) {
        updateLine(pendingCategoryLineKey, { asset_category: newCat.id });
      }
      setShowCategoryModal(false);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: Record<string, unknown> } };
      if (apiErr.response?.data) {
        const apiErrors: Record<string, string> = {};
        Object.entries(apiErr.response.data).forEach(([k, v]) => {
          apiErrors[k] = Array.isArray(v) ? String(v[0]) : String(v);
        });
        setCatErrors(apiErrors);
      }
    }
  };
  // ── Populate when viewing an existing draft ───────────────────────────────
  useEffect(() => {
    if (isViewing && existingAcquisition) {
      setSupplier(existingAcquisition.supplier ?? '');
      setPurchaseDate(existingAcquisition.purchase_date);
      setPaymentTerms(existingAcquisition.payment_terms || 'net_30');
      setNotes(existingAcquisition.notes || '');
      if (existingAcquisition.lines?.length) {
        setLines(
          existingAcquisition.lines.map(l => ({
            _key: l.id.toString(),
            registered_asset: l.registered_asset ?? null,
            registered_asset_name: l.registered_asset_name,
            registered_asset_number: l.registered_asset_number,
            asset_category: l.asset_category,
            name: l.name,
            description: l.description || '',
            quantity: l.quantity,
            unit_price: l.unit_price,
            depreciation_method: l.depreciation_method || '',
            useful_life_years: l.useful_life_years?.toString() || '',
            salvage_value_percentage: l.salvage_value_percentage || '',
            showOverrides: !!(
              l.depreciation_method ||
              l.useful_life_years ||
              l.salvage_value_percentage
            ),
          }))
        );
      }
    }
  }, [isViewing, existingAcquisition]);

  // ── Auto-fill payment terms from supplier ────────────────────────────────
  const handleSupplierChange = (val: string) => {
    const suppId = val ? parseInt(val) : '';
    setSupplier(suppId);
    if (suppId) {
      const s = suppliers.find(x => x.id === suppId);
      if (s?.payment_terms) setPaymentTerms(s.payment_terms);
    }
  };

  // ── Line helpers ──────────────────────────────────────────────────────────
  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines(prev => prev.map(l => (l._key === key ? { ...l, ...patch } : l)));
    // Clear line-level errors
    const prefix = `line_${key}`;
    setErrors(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(prefix)) delete next[k];
      });
      return next;
    });
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const removeLine = (key: string) =>
    setLines(prev => (prev.length > 1 ? prev.filter(l => l._key !== key) : prev));

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalAmount = useMemo(() => {
    return lines.reduce((sum, l) => {
      const price = parseFloat(l.unit_price) || 0;
      return sum + price * (l.quantity || 1);
    }, 0);
  }, [lines]);

  const lineTotalFor = (l: LineDraft) => (parseFloat(l.unit_price) || 0) * (l.quantity || 1);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!supplier) errs.supplier = 'Supplier is required';
    if (!purchaseDate) errs.purchaseDate = 'Purchase date is required';

    lines.forEach(l => {
      if (!l.registered_asset && !l.asset_category)
        errs[`line_${l._key}_category`] = 'Category required';
      if (!l.name.trim()) errs[`line_${l._key}_name`] = 'Name required';
      if (!l.unit_price || parseFloat(l.unit_price) <= 0)
        errs[`line_${l._key}_price`] = 'Valid price required';
      if (!l.quantity || l.quantity < 1) errs[`line_${l._key}_qty`] = 'Quantity ≥ 1 required';
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Build API payload ─────────────────────────────────────────────────────
  const buildPayload = (): CreateAssetAcquisitionRequest => ({
    supplier: supplier as number,
    purchase_date: purchaseDate,
    payment_terms: paymentTerms,
    notes,
    lines: lines.map(
      (l): CreateAssetAcquisitionLineRequest => ({
        registered_asset: l.registered_asset || undefined,
        asset_category: l.asset_category || undefined,
        name: l.name,
        description: l.description || undefined,
        quantity: l.quantity,
        unit_price: l.unit_price,
        depreciation_method: l.depreciation_method || undefined,
        useful_life_years: l.useful_life_years ? parseInt(l.useful_life_years) : undefined,
        salvage_value_percentage: l.salvage_value_percentage || undefined,
      })
    ),
  });

  // ── Submit new acquisition for approval ──────────────────────────────────
  const handleSubmitForApproval = async () => {
    if (!validate()) return;
    const created = await createMutation.mutateAsync(buildPayload());
    // Backend auto-submits; navigate to the view page so the user sees status
    navigate(`/assets/acquisitions/${created.id}`);
  };

  // ── Resubmit a rejected acquisition for approval ──────────────────────────
  const handleResubmit = async () => {
    if (!id || !validate()) return;
    await updateMutation.mutateAsync({ id: parseInt(id), data: buildPayload() });
    await submitMutation.mutateAsync(parseInt(id));
  };

  // ── Approve (auto-posts on the backend) ──────────────────────────────────
  const handleApprove = async () => {
    if (!id) return;
    if (
      !confirm(
        'Approve this acquisition? It will be posted immediately and all asset records created.'
      )
    )
      return;
    const result = await approveMutation.mutateAsync(parseInt(id));
    setPostResult({
      assets_activated: (result as any).assets_activated ?? 0,
      asset_ids: (result as any).asset_ids ?? [],
      reference_number:
        (result as any).reference_number ?? existingAcquisition?.reference_number ?? '',
      depreciation_batch_id: (result as any).depreciation_batch_id,
    });
  };

  // ── Post an already-approved acquisition (migration path for legacy records) ─
  const handlePostExisting = async () => {
    if (!id) return;
    const result = await postMutation.mutateAsync(parseInt(id));
    setPostResult({
      assets_activated: result.assets_activated ?? 0,
      asset_ids: result.asset_ids ?? [],
      reference_number: result.reference_number,
      depreciation_batch_id: result.depreciation_batch_id,
    });
  };

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleRejectConfirm = async () => {
    if (!id || !rejectReason.trim()) return;
    await rejectMutation.mutateAsync({ id: parseInt(id), reason: rejectReason });
    setShowRejectModal(false);
    setRejectReason('');
  };
  // ── Success screen ────────────────────────────────────────────────────────
  if (postResult) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="text-center space-y-6 py-12">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Acquisition Approved & Posted!</h2>
            <p className="text-gray-500 mt-1">Reference: {postResult.reference_number}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 space-y-1">
            {postResult.assets_activated > 0 && (
              <p className="font-semibold">
                {postResult.assets_activated} asset
                {postResult.assets_activated !== 1 ? 's' : ''} activated and added to the Fixed
                Asset Register
              </p>
            )}
            <p className="text-sm mt-1">
              A Purchase Order, Accounts Payable entry, and GL journal entry have been created.
            </p>
            {postResult.depreciation_batch_id && (
              <p className="text-sm">
                Depreciation batch <strong>#{postResult.depreciation_batch_id}</strong> initialised.
              </p>
            )}
          </div>
          {postResult.asset_ids.length > 0 && (
            <div className="text-left space-y-2 w-full max-w-md mx-auto">
              <p className="text-sm font-semibold text-gray-700">
                Next step — review each asset to add serial number, location, and other details:
              </p>
              {postResult.asset_ids.map((assetId, i) => (
                <Link
                  key={assetId}
                  to={`/assets/${assetId}/edit`}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 transition-colors"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Complete details for Asset {i + 1} of {postResult.asset_ids.length} &rarr;
                </Link>
              ))}
            </div>
          )}
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/assets')}>
              View Asset Register
            </Button>
            <Button onClick={() => navigate('/assets/acquisitions/new')}>
              <Plus className="h-4 w-4 mr-2" />
              New Purchase
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isViewing && loadingExisting) {
    return <div className="container mx-auto p-6 text-gray-500">Loading acquisition…</div>;
  }

  const isPosted = isViewing && existingAcquisition?.status === 'posted';
  const isDraft = isViewing && existingAcquisition?.status === 'draft';
  const isSubmitted = isViewing && existingAcquisition?.status === 'submitted';
  const isApproved = isViewing && existingAcquisition?.status === 'approved';
  const isRejected = isViewing && existingAcquisition?.status === 'rejected';
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    postMutation.isPending ||
    submitMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending;
  // Form fields editable when creating new, or viewing a draft/rejected acquisition
  const fieldsDisabled = isViewing && !isDraft && !isRejected;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/assets')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isViewing
              ? `Purchase ${existingAcquisition?.reference_number ?? ''}`
              : 'New Bulk Asset Purchase'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isViewing
              ? 'Review and post this purchase to generate assets and GL entries'
              : 'Register multiple asset types from one supplier under a single Purchase Order'}
          </p>
        </div>
        {isViewing && existingAcquisition && (
          <Badge
            className={
              isPosted
                ? 'bg-green-100 text-green-800'
                : isSubmitted
                  ? 'bg-yellow-100 text-yellow-800'
                  : isApproved
                    ? 'bg-teal-100 text-teal-800'
                    : isRejected
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-700'
            }
          >
            {isPosted
              ? 'Posted'
              : isSubmitted
                ? 'Pending Approval'
                : isApproved
                  ? 'Approved'
                  : isRejected
                    ? 'Rejected'
                    : 'Draft'}
          </Badge>
        )}
      </div>

      {/* Posted summary */}
      {isPosted && existingAcquisition && (
        <Alert>
          <AlertDescription className="space-y-1">
            <p className="font-medium text-green-800">
              ✓ Posted on{' '}
              {existingAcquisition.posted_at
                ? new Date(existingAcquisition.posted_at).toLocaleDateString()
                : '—'}{' '}
              by {existingAcquisition.posted_by_name ?? 'system'}
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700 mt-1">
              {existingAcquisition.purchase_order_number && (
                <span>
                  PO: <strong>{existingAcquisition.purchase_order_number}</strong>
                </span>
              )}
              {existingAcquisition.accounts_payable_reference && (
                <span>
                  AP: <strong>{existingAcquisition.accounts_payable_reference}</strong>
                </span>
              )}
              <span>
                Assets created: <strong>{existingAcquisition.asset_count ?? '—'}</strong>
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Section 1: Purchase Details ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="h-4 w-4 text-teal-600" />
            Purchase Details
          </CardTitle>
          <CardDescription>
            One Purchase Order and Accounts Payable will be created for the total of all lines
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select
              aria-label="Supplier"
              value={supplier.toString()}
              onChange={e => handleSupplierChange(e.target.value)}
              disabled={fieldsDisabled}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 ${
                errors.supplier ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select supplier…</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name} ({s.supplier_code})
                </option>
              ))}
            </select>
            {errors.supplier && <p className="text-xs text-red-500 mt-1">{errors.supplier}</p>}
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchase / Invoice Date <span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
              disabled={fieldsDisabled}
              className={errors.purchaseDate ? 'border-red-500' : ''}
            />
            {errors.purchaseDate && (
              <p className="text-xs text-red-500 mt-1">{errors.purchaseDate}</p>
            )}
          </div>

          {/* Payment Terms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
            {fieldsDisabled ? (
              <p className="text-sm text-gray-700 py-2">
                {PAYMENT_TERMS.find(t => t.value === paymentTerms)?.label ?? paymentTerms}
              </p>
            ) : (
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none disabled:bg-gray-50 disabled:text-gray-500"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={fieldsDisabled}
              placeholder="Optional notes about this purchase…"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Line Items ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                Asset Line Items
              </CardTitle>
              <CardDescription>
                Each line creates one (or more) Fixed Assets — one per unit of quantity
              </CardDescription>
            </div>
            {!fieldsDisabled && (
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" />
                Add Line
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Column header */}
          <div className="hidden md:grid grid-cols-[2fr_2fr_80px_140px_120px_32px] gap-2 px-2 pb-1 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Asset / Category</span>
            <span>Name / Description</span>
            <span>Qty</span>
            <span>Unit Price (₦)</span>
            <span>Total</span>
            <span />
          </div>

          {lines.map((line, idx) => {
            const cat = categories.find(c => c.id === line.asset_category);
            const lineTotal = lineTotalFor(line);

            return (
              <div
                key={line._key}
                className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50"
              >
                {/* Main row */}
                <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_80px_140px_120px_32px] gap-2 items-start">
                  {/* Category / Registered Asset */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5 md:hidden">
                      {line.registered_asset ? 'Linked Asset' : 'Category *'}
                    </label>
                    {line.registered_asset ? (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-teal-50 border border-teal-200 rounded text-sm">
                        <Package className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                        <span className="font-mono text-xs text-teal-700 flex-shrink-0">
                          {line.registered_asset_number}
                        </span>
                        <span className="text-teal-900 truncate">{line.registered_asset_name}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          <select
                            aria-label={`Category line ${idx + 1}`}
                            value={line.asset_category.toString()}
                            onChange={e =>
                              updateLine(line._key, {
                                asset_category: e.target.value ? parseInt(e.target.value) : '',
                              })
                            }
                            disabled={fieldsDisabled}
                            className={`flex-1 min-w-0 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 ${
                              errors[`line_${line._key}_category`]
                                ? 'border-red-500'
                                : 'border-gray-300'
                            }`}
                          >
                            <option value="">Select category…</option>
                            {categories.map(c => (
                              <option key={c.id} value={c.id.toString()}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {!fieldsDisabled && (
                            <button
                              type="button"
                              title="Create new category"
                              onClick={() => openCategoryModal(line._key)}
                              className="flex-shrink-0 flex items-center justify-center w-8 h-8 border border-gray-300 rounded text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {errors[`line_${line._key}_category`] && (
                          <p className="text-xs text-red-500 mt-0.5">
                            {errors[`line_${line._key}_category`]}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5 md:hidden">Name *</label>
                    <Input
                      value={line.name}
                      onChange={e => updateLine(line._key, { name: e.target.value })}
                      disabled={fieldsDisabled}
                      placeholder="e.g. HP ProBook Laptop"
                      className={`text-sm h-8 ${
                        errors[`line_${line._key}_name`] ? 'border-red-500' : ''
                      }`}
                    />
                    {errors[`line_${line._key}_name`] && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {errors[`line_${line._key}_name`]}
                      </p>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5 md:hidden">Qty *</label>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={e =>
                        updateLine(line._key, {
                          quantity: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      disabled={fieldsDisabled}
                      className={`text-sm h-8 text-center ${
                        errors[`line_${line._key}_qty`] ? 'border-red-500' : ''
                      }`}
                    />
                    {errors[`line_${line._key}_qty`] && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {errors[`line_${line._key}_qty`]}
                      </p>
                    )}
                  </div>

                  {/* Unit Price */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5 md:hidden">
                      Unit Price (₦) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unit_price}
                      onChange={e => updateLine(line._key, { unit_price: e.target.value })}
                      disabled={fieldsDisabled}
                      placeholder="0.00"
                      className={`text-sm h-8 ${
                        errors[`line_${line._key}_price`] ? 'border-red-500' : ''
                      }`}
                    />
                    {errors[`line_${line._key}_price`] && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {errors[`line_${line._key}_price`]}
                      </p>
                    )}
                  </div>

                  {/* Line Total */}
                  <div className="flex items-center h-8">
                    <span className="text-sm font-semibold text-gray-900">₦{fmt(lineTotal)}</span>
                  </div>

                  {/* Remove */}
                  <div className="flex items-center h-8">
                    {!fieldsDisabled && lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line._key)}
                        className="text-red-400 hover:text-red-600 p-1 rounded"
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Description row */}
                {!fieldsDisabled && (
                  <div>
                    <Input
                      value={line.description}
                      onChange={e => updateLine(line._key, { description: e.target.value })}
                      placeholder="Optional description / model / spec…"
                      className="text-sm h-7 text-gray-500 border-dashed"
                    />
                  </div>
                )}

                {/* Category info pill */}
                {cat && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      Dep: {cat.default_depreciation_method.replace('_', ' ')}
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      Life: {cat.default_useful_life_years}y
                    </span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      Salvage: {cat.default_salvage_value_percentage}%
                    </span>
                  </div>
                )}

                {/* Depreciation override toggle */}
                {!fieldsDisabled && (
                  <button
                    type="button"
                    onClick={() => updateLine(line._key, { showOverrides: !line.showOverrides })}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {line.showOverrides ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Depreciation overrides
                    {(line.depreciation_method ||
                      line.useful_life_years ||
                      line.salvage_value_percentage) && (
                      <span className="ml-1 bg-orange-100 text-orange-700 px-1.5 rounded-full">
                        custom
                      </span>
                    )}
                  </button>
                )}

                {line.showOverrides && !fieldsDisabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-3 border-l-2 border-orange-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Depreciation Method
                        <span className="ml-1 text-gray-400 font-normal">
                          (blank = category default)
                        </span>
                      </label>
                      <select
                        aria-label={`Depreciation method line ${idx + 1}`}
                        value={line.depreciation_method}
                        onChange={e =>
                          updateLine(line._key, { depreciation_method: e.target.value })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">— inherit from category —</option>
                        {DEPRECIATION_METHODS.map(m => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Useful Life (years)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={line.useful_life_years}
                        onChange={e => updateLine(line._key, { useful_life_years: e.target.value })}
                        placeholder={cat?.default_useful_life_years?.toString() ?? ''}
                        className="text-xs h-8"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Salvage Value %
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={line.salvage_value_percentage}
                        onChange={e =>
                          updateLine(line._key, { salvage_value_percentage: e.target.value })
                        }
                        placeholder={cat?.default_salvage_value_percentage ?? ''}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                )}

                {/* Posted line: show created assets */}
                {isPosted &&
                  existingAcquisition &&
                  (() => {
                    const savedLine = existingAcquisition.lines.find(
                      l => l.id.toString() === line._key
                    );
                    if (savedLine?.fixed_asset_ids?.length) {
                      return (
                        <div className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                          {savedLine.fixed_asset_ids.length} asset
                          {savedLine.fixed_asset_ids.length !== 1 ? 's' : ''} created
                          {savedLine.fixed_asset_ids.map(aid => (
                            <Link
                              key={aid}
                              to={`/assets/${aid}`}
                              className="ml-2 underline hover:text-green-900"
                            >
                              #{aid}
                            </Link>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
              </div>
            );
          })}

          {/* Add line button at bottom */}
          {!fieldsDisabled && (
            <button
              type="button"
              onClick={addLine}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add another asset type
            </button>
          )}

          {/* Total */}
          <div className="flex justify-end items-center gap-3 pt-2 border-t">
            <span className="text-sm font-medium text-gray-600">Grand Total:</span>
            <span className="text-xl font-bold text-gray-900">₦{fmt(totalAmount)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Accounting info banner ── */}
      {!fieldsDisabled && (
        <div className="p-4 bg-blue-50 rounded-lg flex gap-3 text-sm text-blue-800">
          <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">What happens when you submit:</p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside text-blue-700">
              <li>The acquisition is sent for approval</li>
              <li>
                Once approved, a <strong>Purchase Order</strong> and{' '}
                <strong>Accounts Payable</strong> entry are created automatically
              </li>
              <li>
                GL entry: <strong>DR</strong> Fixed Asset Account(s) / <strong>CR</strong> Accounts
                Payable
              </li>
              <li>
                One <strong>Fixed Asset</strong> record per line × quantity (auto-numbered)
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Status Banner for workflow states ── */}
      {isSubmitted && (
        <Alert className="border-blue-300 bg-blue-50">
          <Clock className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Pending Approval</strong> — Submitted by{' '}
            {existingAcquisition?.submitted_by_name ?? 'staff'} on{' '}
            {existingAcquisition?.submitted_at
              ? new Date(existingAcquisition.submitted_at).toLocaleDateString()
              : '—'}
            . An approver must review before assets are created.
          </AlertDescription>
        </Alert>
      )}

      {isRejected && (
        <Alert className="border-red-300 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Rejected</strong>
            {existingAcquisition?.rejection_reason
              ? ` — ${existingAcquisition.rejection_reason}`
              : ''}
            {'. '}
            Update the details and resubmit for approval.
          </AlertDescription>
        </Alert>
      )}

      {isApproved && (
        <Alert className="border-green-300 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Approved</strong> — This acquisition was approved before automatic posting was
            enabled. Click <strong>Post Acquisition</strong> below to create the PO, AP entry, GL
            journal and Fixed Asset records.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Error summary ── */}
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>Please fix the highlighted errors before continuing.</AlertDescription>
        </Alert>
      )}

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 flex-wrap">
        <Button type="button" variant="outline" onClick={() => navigate('/assets/acquisitions')}>
          {isPosted || isSubmitted ? 'Back to List' : 'Cancel'}
        </Button>

        {/* Submit for approval – new acquisitions */}
        {!isViewing && (
          <Button type="button" onClick={handleSubmitForApproval} disabled={isPending}>
            <Send className="h-4 w-4 mr-2" />
            {createMutation.isPending ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        )}

        {/* Resubmit rejected acquisition */}
        {isRejected && (
          <Button
            type="button"
            onClick={handleResubmit}
            disabled={isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="h-4 w-4 mr-2" />
            {isPending ? 'Resubmitting…' : 'Resubmit for Approval'}
          </Button>
        )}

        {/* Approve / Reject – only for submitted */}
        {isSubmitted && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectReason('');
                setShowRejectModal(true);
              }}
              disabled={isPending}
              className="border-red-400 text-red-700 hover:bg-red-50"
            >
              <ThumbsDown className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              {approveMutation.isPending ? 'Approving & Posting…' : 'Approve & Post'}
            </Button>
          </>
        )}

        {/* Post – only for legacy approved-but-not-posted records */}
        {isApproved && (
          <Button
            type="button"
            onClick={handlePostExisting}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700 text-white border-0 shadow-sm"
            style={{ backgroundColor: '#16a34a', color: '#ffffff', border: 'none' }}
          >
            <Send className="h-4 w-4 mr-2" />
            {postMutation.isPending ? 'Posting…' : 'Post Acquisition'}
          </Button>
        )}
      </div>

      {/* ── Create Category Modal ── */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">New Asset Category</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Configure GL accounts and depreciation defaults
                </p>
              </div>
              <button
                aria-label="Close"
                onClick={() => setShowCategoryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Basic details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={catForm.name}
                    onChange={e => setCatField('name', e.target.value)}
                    placeholder="e.g. Office Equipment"
                    className={catErrors.name ? 'border-red-500' : ''}
                  />
                  {catErrors.name && <p className="text-xs text-red-500 mt-1">{catErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={catForm.code}
                    onChange={e => setCatField('code', e.target.value)}
                    placeholder="e.g. OFF-EQ"
                    className={catErrors.code ? 'border-red-500' : ''}
                  />
                  {catErrors.code && <p className="text-xs text-red-500 mt-1">{catErrors.code}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={catForm.description}
                    onChange={e => setCatField('description', e.target.value)}
                    placeholder="Optional description…"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Depreciation defaults */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-500" />
                  Depreciation Defaults
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Method <span className="text-red-500">*</span>
                    </label>
                    <select
                      aria-label="Depreciation method"
                      value={catForm.default_depreciation_method}
                      onChange={e =>
                        setCatField(
                          'default_depreciation_method',
                          e.target.value as DepreciationMethod
                        )
                      }
                      className={`w-full px-2 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${catErrors.default_depreciation_method ? 'border-red-500' : 'border-gray-300'}`}
                    >
                      {DEPRECIATION_METHODS.map(m => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {catErrors.default_depreciation_method && (
                      <p className="text-xs text-red-500 mt-1">
                        {catErrors.default_depreciation_method}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Useful Life (years) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={catForm.default_useful_life_years}
                      onChange={e =>
                        setCatField(
                          'default_useful_life_years',
                          Math.max(1, parseInt(e.target.value) || 1)
                        )
                      }
                      className={catErrors.default_useful_life_years ? 'border-red-500' : ''}
                    />
                    {catErrors.default_useful_life_years && (
                      <p className="text-xs text-red-500 mt-1">
                        {catErrors.default_useful_life_years}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Salvage Value % <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={catForm.default_salvage_value_percentage}
                      onChange={e =>
                        setCatField('default_salvage_value_percentage', e.target.value)
                      }
                      className={catErrors.default_salvage_value_percentage ? 'border-red-500' : ''}
                    />
                    {catErrors.default_salvage_value_percentage && (
                      <p className="text-xs text-red-500 mt-1">
                        {catErrors.default_salvage_value_percentage}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* GL Accounts */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  GL Account Mappings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Asset Account */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asset Account <span className="text-red-500">*</span>
                    </label>
                    <CatAccountSelect
                      accounts={accounts}
                      value={catForm.asset_account}
                      onChange={v => setCatField('asset_account', v)}
                      error={catErrors.asset_account}
                    />
                  </div>
                  {/* Depreciation Expense */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Depreciation Expense Account <span className="text-red-500">*</span>
                    </label>
                    <CatAccountSelect
                      accounts={accounts}
                      value={catForm.depreciation_account}
                      onChange={v => setCatField('depreciation_account', v)}
                      error={catErrors.depreciation_account}
                    />
                  </div>
                  {/* Accumulated Depreciation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Accumulated Depreciation Account <span className="text-red-500">*</span>
                    </label>
                    <CatAccountSelect
                      accounts={accounts}
                      value={catForm.accumulated_depreciation_account}
                      onChange={v => setCatField('accumulated_depreciation_account', v)}
                      error={catErrors.accumulated_depreciation_account}
                    />
                  </div>
                  {/* Maintenance Expense (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maintenance Expense Account
                      <span className="ml-1 text-xs text-gray-400 font-normal">(optional)</span>
                    </label>
                    <CatAccountSelect
                      accounts={accounts}
                      value={catForm.maintenance_expense_account}
                      onChange={v => setCatField('maintenance_expense_account', v)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowCategoryModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCategoryModalSubmit}
                disabled={createCategoryMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                {createCategoryMutation.isPending ? 'Creating…' : 'Create Category'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold text-gray-900">Reject Acquisition</h2>
              <button
                aria-label="Close"
                onClick={() => setShowRejectModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Alert className="border-red-300 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  Rejecting will mark this acquisition as rejected. The creator can update it and
                  resubmit for approval.
                </AlertDescription>
              </Alert>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  aria-label="Rejection reason"
                  placeholder="Explain why this acquisition is being rejected…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetAcquisitionFormPage;
