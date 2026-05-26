/**
 * PHYSICAL COUNT FORM PAGE
 *
 * Create/edit physical inventory counts with:
 * - Count metadata (date, location, counted by)
 * - Bulk add count lines with item lookup
 * - Variance display and editing
 * - Workflow action buttons (submit, approve, reject, post)
 */

import React, { useState, useEffect } from 'react';
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
  Search,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import physicalCountService from '../../services/physicalCountService';
import type {
  PhysicalCount,
  PhysicalCountLine,
  PhysicalCountFormData,
  PhysicalCountLineCreate,
  VarianceReason,
} from '../../types/physicalCount';
import type { InventoryItem, Location } from '../../types/inventory';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

// ================================================================
// VARIANCE REASON OPTIONS
// ================================================================

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

// ================================================================
// MAIN COMPONENT
// ================================================================

const PhysicalCountForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // State
  const [count, setCount] = useState<PhysicalCount | null>(null);
  const [formData, setFormData] = useState<PhysicalCountFormData>({
    count_date: new Date().toISOString().split('T')[0],
    location: 0,
    notes: '',
  });

  const [locations, setLocations] = useState<Location[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Count lines state
  const [showAddLines, setShowAddLines] = useState(false);
  const [newLines, setNewLines] = useState<PhysicalCountLineCreate[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [countedQty, setCountedQty] = useState<string>('');
  const [lineNotes, setLineNotes] = useState<string>('');
  const [lineReason, setLineReason] = useState<VarianceReason | undefined>();

  // ================================================================
  // DATA LOADING
  // ================================================================

  useEffect(() => {
    if (isEditMode) {
      loadCount();
    }
  }, [id]);

  const loadCount = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await physicalCountService.getPhysicalCount(parseInt(id));
      setCount(data);

      // Populate form
      setFormData({
        count_date: data.count_date,
        location: data.location,
        counted_by: data.counted_by,
        notes: data.notes || '',
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load count');
      console.error('Error loading count:', err);
    } finally {
      setLoading(false);
    }
  };

  // ================================================================
  // FORM HANDLERS
  // ================================================================

  const handleInputChange = (field: keyof PhysicalCountFormData, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSaveCount = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isEditMode && id) {
        const updated = await physicalCountService.updatePhysicalCount(parseInt(id), formData);
        setCount(updated);
        setSuccess('Count updated successfully');
      } else {
        const created = await physicalCountService.createPhysicalCount(formData);
        setSuccess('Count created successfully');
        navigate(`/inventory/physical-counts/${created.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save count');
      console.error('Error saving count:', err);
    } finally {
      setLoading(false);
    }
  };

  // ================================================================
  // COUNT LINE HANDLERS
  // ================================================================

  const handleAddLineToList = () => {
    if (!selectedItem || !countedQty) {
      setError('Please select an item and enter counted quantity');
      return;
    }

    const newLine: PhysicalCountLineCreate = {
      item_id: selectedItem,
      counted_quantity: parseFloat(countedQty),
      notes: lineNotes,
      variance_reason: lineReason,
    };

    setNewLines([...newLines, newLine]);

    // Reset form
    setSelectedItem(null);
    setCountedQty('');
    setLineNotes('');
    setLineReason(undefined);
  };

  const handleRemoveLineFromList = (index: number) => {
    setNewLines(newLines.filter((_, i) => i !== index));
  };

  const handleSaveLines = async () => {
    if (!id || newLines.length === 0) {
      setError('No lines to add');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await physicalCountService.addCountLines(parseInt(id), { lines: newLines });

      setSuccess(`Added ${newLines.length} lines successfully`);
      setNewLines([]);
      setShowAddLines(false);

      // Reload count
      await loadCount();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add lines');
      console.error('Error adding lines:', err);
    } finally {
      setLoading(false);
    }
  };

  // ================================================================
  // WORKFLOW HANDLERS
  // ================================================================

  const handleSubmitCount = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      await physicalCountService.submitCount(parseInt(id));
      setSuccess('Count submitted for review');
      await loadCount();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit count');
      console.error('Error submitting count:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCount = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      await physicalCountService.approveCount(parseInt(id));
      setSuccess('Count approved');
      await loadCount();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to approve count');
      console.error('Error approving count:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectCount = async () => {
    if (!id) return;

    const notes = prompt('Enter rejection reason:');
    if (!notes) return;

    try {
      setLoading(true);
      setError(null);

      await physicalCountService.rejectCount(parseInt(id), { review_notes: notes });
      setSuccess('Count rejected');
      await loadCount();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reject count');
      console.error('Error rejecting count:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostAdjustments = async () => {
    if (!id) return;

    if (
      !confirm(
        'Are you sure you want to post stock adjustments? This will update inventory quantities.'
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await physicalCountService.postAdjustments(parseInt(id));
      setSuccess(
        `Posted ${result.adjustments_posted} adjustments (${formatCurrency(result.total_value)})`
      );
      await loadCount();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to post adjustments');
      console.error('Error posting adjustments:', err);
    } finally {
      setLoading(false);
    }
  };

  // ================================================================
  // RENDER HELPERS
  // ================================================================

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

  // ================================================================
  // RENDER
  // ================================================================

  if (loading && !count && isEditMode) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading count...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
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

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-green-800">
            <Check className="w-5 h-5" />
            <p>{success}</p>
          </div>
        </div>
      )}

      {/* Count Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Count Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Count Date *</label>
            <input
              type="date"
              value={formData.count_date}
              onChange={e => handleInputChange('count_date', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
            <select
              value={formData.location}
              onChange={e => handleInputChange('location', parseInt(e.target.value))}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value={0}>Select Location</option>
              {locations.map(loc => (
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
              onChange={e => handleInputChange('notes', e.target.value)}
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
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Save Count
            </button>
          </div>
        )}
      </div>

      {/* Count Lines */}
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

          {/* Add Lines Form */}
          {showAddLines && canEdit && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-3">Add Count Lines</h3>

              {/* Line Entry Form */}
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

              {/* Lines to be added */}
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
                        onClick={() => handleRemoveLineFromList(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleSaveLines}
                    disabled={loading}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save {newLines.length} Lines
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Existing Lines Table */}
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

          {/* Workflow Actions */}
          <div className="mt-6 flex gap-3">
            {canSubmit && (
              <button
                onClick={handleSubmitCount}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                Submit for Review
              </button>
            )}
            {canApprove && (
              <button
                onClick={handleApproveCount}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
                Approve
              </button>
            )}
            {canReject && (
              <button
                onClick={handleRejectCount}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-5 h-5" />
                Reject
              </button>
            )}
            {canPost && (
              <button
                onClick={handlePostAdjustments}
                disabled={loading}
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
