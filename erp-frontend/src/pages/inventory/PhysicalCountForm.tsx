import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  X,
  Plus,
  Trash2,
  Send,
  Check,
  XCircle,
  DollarSign,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  usePhysicalCount,
  useCreatePhysicalCount,
  useUpdatePhysicalCount,
  useAddCountLines,
  useSubmitPhysicalCount,
  useApprovePhysicalCount,
  useRejectPhysicalCount,
  usePostAdjustments,
} from '../../hooks/usePhysicalCount';
import { useInventoryLocationsList } from '../../hooks/useInventory';
import { useInventoryItems } from '../../hooks/useInventory';
import type {
  PhysicalCountLine,
  PhysicalCountFormData,
  PhysicalCountLineCreate,
  VarianceReason,
} from '../../types/physicalCount';
import { formatCurrency } from '../../utils/formatters';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const varianceReasonOptions: { value: VarianceReason; label: string }[] = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'miscount', label: 'Miscount' },
  { value: 'system_error', label: 'System Error' },
  { value: 'transfer_not_recorded', label: 'Transfer Not Recorded' },
  { value: 'sale_not_recorded', label: 'Sale Not Recorded' },
  { value: 'other', label: 'Other' },
];

const PhysicalCountForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const countId = id ? parseInt(id) : undefined;
  const isEditMode = !!countId;

  const { data: count, isLoading: loadingCount } = usePhysicalCount(countId ?? 0, isEditMode);
  const { data: locations = [] } = useInventoryLocationsList();
  const { data: itemsData } = useInventoryItems({ page: 1, ordering: 'name' });
  const items = itemsData?.results ?? [];

  const createMutation = useCreatePhysicalCount();
  const updateMutation = useUpdatePhysicalCount();
  const addLinesMutation = useAddCountLines();
  const submitMutation = useSubmitPhysicalCount();
  const approveMutation = useApprovePhysicalCount();
  const rejectMutation = useRejectPhysicalCount();
  const postMutation = usePostAdjustments();

  const [formData, setFormData] = useState<PhysicalCountFormData>({
    count_date: new Date().toISOString().split('T')[0],
    location: 0,
    notes: '',
  });
  const formInitRef = useRef(false);

  useEffect(() => {
    if (count && !formInitRef.current) {
      formInitRef.current = true;
      /* eslint-disable react-hooks/set-state-in-effect */
      setFormData({
        count_date: count.count_date,
        location: count.location,
        counted_by: count.counted_by,
        notes: count.notes || '',
      });
    }
  }, [count]);

  const [showAddLines, setShowAddLines] = useState(false);
  const [newLines, setNewLines] = useState<PhysicalCountLineCreate[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [countedQty, setCountedQty] = useState('');
  const [lineNotes, setLineNotes] = useState('');
  const [lineReason, setLineReason] = useState<VarianceReason | undefined>();

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    addLinesMutation.isPending ||
    submitMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    postMutation.isPending;

  const handleSaveCount = () => {
    if (isEditMode && countId) {
      updateMutation.mutate(
        { id: countId, data: formData },
        {
          onSuccess: () => {},
          onError: () => {},
        }
      );
    } else {
      createMutation.mutate(formData, {
        onSuccess: created => {
          navigate(`/inventory/physical-counts/${created.id}`);
        },
      });
    }
  };

  const handleAddLineToList = () => {
    if (!selectedItem || !countedQty) return;
    setNewLines(prev => [
      ...prev,
      {
        item_id: selectedItem,
        counted_quantity: parseFloat(countedQty),
        notes: lineNotes,
        variance_reason: lineReason,
      },
    ]);
    setSelectedItem(null);
    setCountedQty('');
    setLineNotes('');
    setLineReason(undefined);
  };

  const handleSaveLines = () => {
    if (!countId || newLines.length === 0) return;
    addLinesMutation.mutate(
      { countId, lines: newLines },
      {
        onSuccess: () => {
          setNewLines([]);
          setShowAddLines(false);
        },
      }
    );
  };

  const handleSubmitCount = () => {
    if (!countId) return;
    submitMutation.mutate(countId);
  };

  const handleApproveCount = () => {
    if (!countId) return;
    approveMutation.mutate({ countId });
  };

  const handleRejectCount = () => {
    if (!countId) return;
    const notes = prompt('Enter rejection reason:');
    if (!notes) return;
    rejectMutation.mutate({ countId, reviewNotes: notes });
  };

  const handlePostAdjustments = () => {
    if (!countId) return;
    if (
      !confirm(
        'Are you sure you want to post stock adjustments? This will update inventory quantities.'
      )
    )
      return;
    postMutation.mutate(countId);
  };

  const renderVarianceIndicator = (line: PhysicalCountLine) => {
    if (line.variance === 0) {
      return <span className="text-green-600">✓ Match</span>;
    }
    const isPositive = line.variance > 0;
    return (
      <div className="flex items-center gap-1">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-green-600" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-600" />
        )}
        <span className={isPositive ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {line.variance > 0 ? '+' : ''}
          {line.variance}
        </span>
        <span className="text-gray-500 text-sm">({line.variance_percent.toFixed(1)}%)</span>
      </div>
    );
  };

  const canEdit = !count || count.status === 'draft' || count.status === 'in_progress';
  const canSubmit =
    count &&
    (count.status === 'draft' || count.status === 'in_progress') &&
    (count.total_lines || 0) > 0;
  const { canUserApprove } = useApprovalGuard();
  const canApprove = canUserApprove && count && count.status === 'pending_review';
  const canReject = canUserApprove && count && count.status === 'pending_review';
  const canPost = count && count.status === 'approved';

  if (loadingCount && isEditMode) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading count...</p>
        </div>
      </div>
    );
  }

  const errorMsg =
    createMutation.error?.message ||
    updateMutation.error?.message ||
    addLinesMutation.error?.message ||
    submitMutation.error?.message ||
    approveMutation.error?.message ||
    rejectMutation.error?.message ||
    postMutation.error?.message;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? `Edit Count: ${count?.count_number}` : 'New Physical Count'}
          </h1>
          {count && (
            <p className="mt-2 text-gray-600">
              Status: <span className="font-medium">{count.status}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/inventory/physical-counts')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="w-5 h-5" />
          Close
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Count Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Count Date *</label>
            <input
              type="date"
              value={formData.count_date}
              onChange={e => setFormData(prev => ({ ...prev, count_date: e.target.value }))}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
            <select
              value={formData.location}
              onChange={e => setFormData(prev => ({ ...prev, location: parseInt(e.target.value) }))}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value={0}>Select Location</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              disabled={!canEdit}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Enter any notes about this count..."
            />
          </div>
        </div>
        {canEdit && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSaveCount}
              disabled={isMutating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Save Count
            </button>
          </div>
        )}
      </div>

      {isEditMode && count && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Count Lines</h2>
            {canEdit && (
              <button
                onClick={() => setShowAddLines(!showAddLines)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Lines
              </button>
            )}
          </div>

          {showAddLines && canEdit && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-3">Add Count Lines</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                  <select
                    value={selectedItem || ''}
                    onChange={e => setSelectedItem(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select Item</option>
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.sku} - {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Counted Qty
                  </label>
                  <input
                    type="number"
                    value={countedQty}
                    onChange={e => setCountedQty(e.target.value)}
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <select
                    value={lineReason || ''}
                    onChange={e => setLineReason(e.target.value as VarianceReason)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select Reason</option>
                    {varianceReasonOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={lineNotes}
                    onChange={e => setLineNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddLineToList}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Add
                  </button>
                </div>
              </div>

              {newLines.length > 0 && (
                <div className="space-y-2">
                  {newLines.map((line, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-white rounded border"
                    >
                      <span>
                        Item #{line.item_id} - Qty: {line.counted_quantity}
                      </span>
                      <button
                        onClick={() => setNewLines(prev => prev.filter((_, i) => i !== index))}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleSaveLines}
                    disabled={addLinesMutation.isPending}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save {newLines.length} Lines
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Item
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    System Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Counted Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Variance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {count.count_lines && count.count_lines.length > 0 ? (
                  count.count_lines.map(line => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">{line.item_name}</div>
                          <div className="text-sm text-gray-500">{line.item_sku}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{line.system_quantity}</td>
                      <td className="px-4 py-3 text-right font-medium">{line.counted_quantity}</td>
                      <td className="px-4 py-3 text-right">{renderVarianceIndicator(line)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(line.variance_value)}
                      </td>
                      <td className="px-4 py-3">{line.variance_reason || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No count lines added yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            {canSubmit && (
              <button
                onClick={handleSubmitCount}
                disabled={submitMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                Submit for Review
              </button>
            )}
            {canApprove && (
              <button
                onClick={handleApproveCount}
                disabled={approveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
                Approve
              </button>
            )}
            {canReject && (
              <button
                onClick={handleRejectCount}
                disabled={rejectMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-5 h-5" />
                Reject
              </button>
            )}
            {canPost && (
              <button
                onClick={handlePostAdjustments}
                disabled={postMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                <DollarSign className="w-5 h-5" />
                Post Adjustments
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhysicalCountForm;
