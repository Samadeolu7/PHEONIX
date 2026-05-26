// src/pages/receivables/ReceivableDetail.tsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { receivablesService } from '../../services/receivablesService';
import { useToast } from '../../hooks/useToast';
import UnifiedPaymentModal from '../../components/modals/UnifiedPaymentModal';
import WorkflowStatusIndicator from '../../components/receivables/WorkflowStatusIndicator';
import {
  Clock,
  User,
  DollarSign,
  FileText,
  Calendar,
  Phone,
  Mail,
  ArrowLeft,
  Edit,
  Send,
  AlertTriangle,
  MessageSquare,
  UserCheck,
  TrendingUp,
  Activity,
  XCircle,
  RotateCcw,
} from 'lucide-react';

// Interfaces based on documented API response
interface ReceivableDetail {
  id: number;
  client: {
    id: number;
    full_name: string;
    email?: string;
    phone?: string;
  };
  receivable_type: 'invoice' | 'entitlement' | 'loan' | 'other';
  content_object?: {
    id: number;
    invoice_number?: string;
    description?: string;
    invoice_date?: string;
  };
  reference_number: string;
  original_amount: string;
  amount_paid: string;
  balance: string;
  due_date: string;
  aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  days_overdue: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off';
  overdue_interest_rate?: string;
  accrued_interest?: string;
  last_reminder_sent?: string;
  reminder_count?: number;
  assigned_to?: {
    id: number;
    full_name: string;
  };
  collection_notes?: string;
  activity_logs: ActivityLog[];
  created_at: string;
  updated_at: string;
}

interface ActivityLog {
  id: number;
  activity_type: string;
  amount?: string;
  description: string;
  performed_by?: {
    id: number;
    full_name: string;
  };
  created_at: string;
}

const ReceivableDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [receivable, setReceivable] = useState<ReceivableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'collection'>('overview');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [writeOffModalOpen, setWriteOffModalOpen] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState('');
  const [writeOffSubmitting, setWriteOffSubmitting] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('bank_transfer');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (id) {
      loadReceivable(parseInt(id));
    }
  }, [id]);

  const loadReceivable = async (receivableId: number) => {
    try {
      setLoading(true);
      const data = await receivablesService.getReceivable(receivableId);
      setReceivable(data);
    } catch (error) {
      console.error('Error loading receivable:', error);
      toast.error('Failed to load receivable details');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !receivable) return;

    try {
      setAddingNote(true);
      await receivablesService.addNote(receivable.id, { note: newNote });
      toast.success('Note added successfully');
      setNewNote('');
      // Reload receivable to get updated notes
      await loadReceivable(receivable.id);
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleSendReminder = async () => {
    if (!receivable) return;

    try {
      await receivablesService.sendReminder(receivable.id, {
        reminder_type: 'email',
        template: 'overdue_reminder',
        custom_message: 'Please settle your outstanding balance at your earliest convenience.',
      });
      toast.success('Reminder sent successfully');
      // Reload receivable to get updated reminder count
      await loadReceivable(receivable.id);
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast.error('Failed to send reminder');
    }
  };

  const handleWriteOff = async () => {
    if (!receivable || !writeOffReason.trim()) return;
    try {
      setWriteOffSubmitting(true);
      const res = await receivablesService.writeOff(receivable.id, {
        reason: writeOffReason.trim(),
      });
      toast.success(res.message || 'Receivable written off');
      setWriteOffModalOpen(false);
      setWriteOffReason('');
      await loadReceivable(receivable.id);
    } catch (error) {
      console.error('Error writing off receivable:', error);
      toast.error('Failed to write off receivable');
    } finally {
      setWriteOffSubmitting(false);
    }
  };

  const handleRefund = async () => {
    if (!receivable || !refundReason.trim() || !refundAmount) return;
    try {
      setRefundSubmitting(true);
      const res = await receivablesService.issueRefund(receivable.id, {
        amount: parseFloat(refundAmount),
        reason: refundReason.trim(),
        refund_method: refundMethod,
      });
      toast.success(res.message || 'Refund issued successfully');
      setRefundModalOpen(false);
      setRefundAmount('');
      setRefundReason('');
      setRefundMethod('bank_transfer');
      await loadReceivable(receivable.id);
    } catch (error) {
      console.error('Error issuing refund:', error);
      toast.error('Failed to issue refund');
    } finally {
      setRefundSubmitting(false);
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const getStatusBadge = (status: ReceivableDetail['status']) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      partial: { color: 'bg-blue-100 text-blue-800', label: 'Partial' },
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
      written_off: { color: 'bg-gray-100 text-gray-800', label: 'Written Off' },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getAgingBadge = (bucket: ReceivableDetail['aging_bucket']) => {
    const bucketConfig = {
      current: { color: 'bg-green-100 text-green-800', label: 'Current' },
      '1-30': { color: 'bg-yellow-100 text-yellow-800', label: '1-30 days' },
      '31-60': { color: 'bg-orange-100 text-orange-800', label: '31-60 days' },
      '61-90': { color: 'bg-red-100 text-red-800', label: '61-90 days' },
      '90+': { color: 'bg-red-200 text-red-900', label: '90+ days' },
    };

    const config = bucketConfig[bucket];
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getTypeIcon = (type: ReceivableDetail['receivable_type']) => {
    const typeConfig = {
      invoice: { icon: '📄', label: 'Invoice', color: 'text-blue-600' },
      entitlement: { icon: '🎓', label: 'School Fee', color: 'text-green-600' },
      loan: { icon: '💰', label: 'Loan', color: 'text-purple-600' },
      other: { icon: '📋', label: 'Other', color: 'text-gray-600' },
    };

    return typeConfig[type];
  };

  const getActivityIcon = (activityType: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      payment: <DollarSign className="h-4 w-4 text-green-600" />,
      adjustment: <Edit className="h-4 w-4 text-blue-600" />,
      interest_applied: <TrendingUp className="h-4 w-4 text-orange-600" />,
      reminder_sent: <Send className="h-4 w-4 text-purple-600" />,
      note_added: <MessageSquare className="h-4 w-4 text-gray-600" />,
      assigned: <UserCheck className="h-4 w-4 text-indigo-600" />,
      default: <Activity className="h-4 w-4 text-gray-600" />,
    };

    return iconMap[activityType] || iconMap.default;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"
          data-testid="loading-spinner"
        ></div>
      </div>
    );
  }

  if (!receivable) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Receivable Not Found</h2>
          <p className="text-gray-600 mb-4">The requested receivable could not be found.</p>
          <Link
            to="/receivables/list"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Back to Receivables
          </Link>
        </div>
      </div>
    );
  }

  const typeInfo = getTypeIcon(receivable.receivable_type);
  const paymentProgress =
    (parseFloat(receivable.amount_paid || '0') / parseFloat(receivable.original_amount)) * 100;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-4">
            <Link
              to="/receivables/list"
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center space-x-3">
              <span className={`text-3xl ${typeInfo.color}`}>{typeInfo.icon}</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{receivable.reference_number}</h1>
                <p className="text-gray-600">
                  {typeInfo.label} • {receivable.client.full_name}
                </p>
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleSendReminder}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 flex items-center space-x-2"
            >
              <Send className="h-4 w-4" />
              <span>Send Reminder</span>
            </button>
            <button
              onClick={() => setPaymentModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 flex items-center space-x-2"
            >
              <DollarSign className="h-4 w-4" />
              <span>Record Payment</span>
            </button>
            {receivable.status !== 'paid' && receivable.status !== 'written_off' && (
              <button
                onClick={() => setWriteOffModalOpen(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 flex items-center space-x-2"
              >
                <XCircle className="h-4 w-4" />
                <span>Write Off</span>
              </button>
            )}
            {receivable.amount_paid > 0 && receivable.status !== 'written_off' && (
              <button
                onClick={() => setRefundModalOpen(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 flex items-center space-x-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Refund</span>
              </button>
            )}
          </div>
        </div>

        {/* Status and Progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {getStatusBadge(receivable.status)}
            {getAgingBadge(receivable.aging_bucket)}
            {receivable.days_overdue > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                <AlertTriangle className="h-4 w-4 mr-1" />
                {receivable.days_overdue} days overdue
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Payment Progress</p>
            <p className="text-lg font-semibold text-gray-900">{paymentProgress.toFixed(1)}%</p>
          </div>
        </div>

        {/* Workflow Status */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Collection Workflow</h3>
            <Link to="/receivables/workflows" className="text-xs text-blue-600 hover:text-blue-700">
              Manage Workflows
            </Link>
          </div>
          <div className="mt-2">
            <WorkflowStatusIndicator
              receivableId={receivable.id}
              showDetails={true}
              onWorkflowAction={(action, workflowId) => {
                console.log(`Workflow action: ${action}`, workflowId);
                // Optionally reload receivable data after workflow actions
                loadReceivable(receivable.id);
              }}
            />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-green-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(paymentProgress, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview', icon: FileText },
            { key: 'activity', label: 'Activity Timeline', icon: Activity },
            { key: 'collection', label: 'Collection Notes', icon: MessageSquare },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {activeTab === 'overview' && <OverviewTab receivable={receivable} />}

          {activeTab === 'activity' && (
            <ActivityTimelineTab activities={receivable.activity_logs || []} loading={loading} />
          )}

          {activeTab === 'collection' && (
            <CollectionNotesTab
              receivable={receivable}
              newNote={newNote}
              setNewNote={setNewNote}
              onAddNote={handleAddNote}
              addingNote={addingNote}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <ClientInfoCard receivable={receivable} />
          <QuickActionsCard receivable={receivable} onSendReminder={handleSendReminder} />
          <CollectionInfoCard receivable={receivable} />
        </div>
      </div>

      {/* Write-Off Confirmation Modal */}
      {writeOffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Write Off Receivable</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will write off the outstanding balance of{' '}
              <strong>{formatCurrency(receivable.balance)}</strong>. This action cannot be easily
              undone.
            </p>
            <label
              htmlFor="write-off-reason"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="write-off-reason"
              rows={3}
              value={writeOffReason}
              onChange={e => setWriteOffReason(e.target.value)}
              placeholder="Enter reason for write-off…"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setWriteOffModalOpen(false);
                  setWriteOffReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleWriteOff}
                disabled={!writeOffReason.trim() || writeOffSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {writeOffSubmitting ? 'Processing…' : 'Confirm Write Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Issue Refund</h3>
            <p className="text-sm text-gray-500 mb-4">
              Issue a refund against payments received (max{' '}
              <strong>{formatCurrency(String(receivable.amount_paid))}</strong>).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={receivable.amount_paid}
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select
                  aria-label="Refund method"
                  value={refundMethod}
                  onChange={e => setRefundMethod(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  placeholder="Enter reason for refund…"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setRefundModalOpen(false);
                  setRefundAmount('');
                  setRefundReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={!refundReason.trim() || !refundAmount || refundSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refundSubmitting ? 'Processing…' : 'Issue Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Tab Components
const OverviewTab: React.FC<{ receivable: ReceivableDetail }> = ({ receivable }) => {
  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  return (
    <div className="space-y-6">
      {/* Financial Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-600 mb-1">Original Amount</p>
            <p className="text-2xl font-bold text-blue-900">
              {formatCurrency(receivable.original_amount)}
            </p>
          </div>

          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-sm font-medium text-green-600 mb-1">Amount Paid</p>
            <p className="text-2xl font-bold text-green-900">
              {formatCurrency(receivable.amount_paid || '0')}
            </p>
          </div>

          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-sm font-medium text-red-600 mb-1">Outstanding Balance</p>
            <p className="text-2xl font-bold text-red-900">{formatCurrency(receivable.balance)}</p>
          </div>
        </div>
      </div>

      {/* Receivable Details */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Receivable Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Reference Number</label>
            <p className="text-sm text-gray-900">{receivable.reference_number}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Type</label>
            <p className="text-sm text-gray-900 capitalize">{receivable.receivable_type}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Due Date</label>
            <p className="text-sm text-gray-900">{formatDate(receivable.due_date)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Days Overdue</label>
            <p
              className={`text-sm font-medium ${receivable.days_overdue > 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {receivable.days_overdue > 0 ? `${receivable.days_overdue} days` : 'Current'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
            <p className="text-sm text-gray-900">{formatDate(receivable.created_at)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
            <p className="text-sm text-gray-900">{formatDate(receivable.updated_at)}</p>
          </div>
        </div>
      </div>

      {/* Linked Invoice Details */}
      {receivable.content_object && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Linked Invoice Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {receivable.content_object.invoice_number && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Invoice Number
                </label>
                <p className="text-sm text-gray-900">{receivable.content_object.invoice_number}</p>
              </div>
            )}

            {receivable.content_object.description && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
                <p className="text-sm text-gray-900">{receivable.content_object.description}</p>
              </div>
            )}

            {receivable.content_object.invoice_date && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Invoice Date</label>
                <p className="text-sm text-gray-900">
                  {formatDate(receivable.content_object.invoice_date)}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Actions</label>
              <Link
                to={`/sales/invoices/${receivable.content_object.id}/view`}
                className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
              >
                <FileText className="h-4 w-4 mr-1" />
                View Invoice
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Interest Information */}
      {receivable.accrued_interest && parseFloat(receivable.accrued_interest) > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-yellow-800 mb-4">Interest Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-yellow-700 mb-1">
                Interest Rate
              </label>
              <p className="text-sm text-yellow-900">
                {receivable.overdue_interest_rate
                  ? `${receivable.overdue_interest_rate}% per annum`
                  : 'N/A'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-yellow-700 mb-1">
                Accrued Interest
              </label>
              <p className="text-sm font-bold text-yellow-900">
                {formatCurrency(receivable.accrued_interest)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ActivityTimelineTab: React.FC<{ activities: ActivityLog[]; loading: boolean }> = ({
  activities,
  loading,
}) => {
  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const getActivityIcon = (activityType: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      payment: <DollarSign className="h-4 w-4 text-green-600" />,
      adjustment: <Edit className="h-4 w-4 text-blue-600" />,
      interest_applied: <TrendingUp className="h-4 w-4 text-orange-600" />,
      reminder_sent: <Send className="h-4 w-4 text-purple-600" />,
      note_added: <MessageSquare className="h-4 w-4 text-gray-600" />,
      assigned: <UserCheck className="h-4 w-4 text-indigo-600" />,
      default: <Activity className="h-4 w-4 text-gray-600" />,
    };

    return iconMap[activityType] || iconMap.default;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Timeline</h3>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No activity recorded yet</p>
        </div>
      ) : (
        <div className="flow-root">
          <ul className="-mb-8">
            {activities.map((activity, activityIdx) => (
              <li key={activity.id}>
                <div className="relative pb-8">
                  {activityIdx !== activities.length - 1 ? (
                    <span
                      className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                      aria-hidden="true"
                    />
                  ) : null}
                  <div className="relative flex space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-gray-900">
                          {activity.description}
                          {activity.amount && (
                            <span className="font-medium text-green-600 ml-2">
                              {formatCurrency(activity.amount)}
                            </span>
                          )}
                        </p>
                        {activity.performed_by && (
                          <p className="text-xs text-gray-500">
                            by {activity.performed_by.full_name}
                          </p>
                        )}
                      </div>
                      <div className="whitespace-nowrap text-right text-sm text-gray-500">
                        <time dateTime={activity.created_at}>
                          {formatDateTime(activity.created_at)}
                        </time>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const CollectionNotesTab: React.FC<{
  receivable: ReceivableDetail;
  newNote: string;
  setNewNote: (note: string) => void;
  onAddNote: () => void;
  addingNote: boolean;
}> = ({ receivable, newNote, setNewNote, onAddNote, addingNote }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Collection Notes</h3>

      {/* Add New Note */}
      <div className="mb-6">
        <label htmlFor="new-note" className="block text-sm font-medium text-gray-700 mb-2">
          Add Collection Note
        </label>
        <div className="space-y-3">
          <textarea
            id="new-note"
            rows={3}
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Enter collection note..."
          />
          <button
            onClick={onAddNote}
            disabled={!newNote.trim() || addingNote}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingNote ? (
              <>
                <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Adding...
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4 mr-2" />
                Add Note
              </>
            )}
          </button>
        </div>
      </div>

      {/* Existing Notes */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-3">Collection History</h4>
        {receivable.collection_notes ? (
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
              {receivable.collection_notes}
            </pre>
          </div>
        ) : (
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No collection notes yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Sidebar Components
const ClientInfoCard: React.FC<{ receivable: ReceivableDetail }> = ({ receivable }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Client Information</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Name</label>
          <p className="text-sm text-gray-900">{receivable.client.full_name}</p>
        </div>

        {receivable.client.email && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <a
                href={`mailto:${receivable.client.email}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {receivable.client.email}
              </a>
            </div>
          </div>
        )}

        {receivable.client.phone && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Phone</label>
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <a
                href={`tel:${receivable.client.phone}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {receivable.client.phone}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const QuickActionsCard: React.FC<{ receivable: ReceivableDetail; onSendReminder: () => void }> = ({
  receivable,
  onSendReminder,
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
      <div className="space-y-3">
        <Link
          to={`/receivables/payments/record?client=${receivable.client.id}`}
          className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
        >
          <DollarSign className="h-4 w-4 mr-2" />
          Record Payment
        </Link>

        <button
          onClick={onSendReminder}
          className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
        >
          <Send className="h-4 w-4 mr-2" />
          Send Reminder
        </button>

        <Link
          to={`/receivables/statements/generate?client=${receivable.client.id}`}
          className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Statement
        </Link>

        <Link
          to={`/receivables/list?client=${receivable.client.id}`}
          className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
        >
          <User className="h-4 w-4 mr-2" />
          View All Client Receivables
        </Link>
      </div>
    </div>
  );
};

const CollectionInfoCard: React.FC<{ receivable: ReceivableDetail }> = ({ receivable }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Collection Information</h3>
      <div className="space-y-3">
        {receivable.assigned_to && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Assigned Collector
            </label>
            <div className="flex items-center space-x-2">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              <p className="text-sm text-gray-900">{receivable.assigned_to.full_name}</p>
            </div>
          </div>
        )}

        {receivable.reminder_count !== undefined && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Reminder Count</label>
            <p className="text-sm text-gray-900">{receivable.reminder_count} reminders sent</p>
          </div>
        )}

        {receivable.last_reminder_sent && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Last Reminder</label>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <p className="text-sm text-gray-900">{formatDate(receivable.last_reminder_sent)}</p>
            </div>
          </div>
        )}

        {receivable.days_overdue > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">Overdue</p>
                <p className="text-xs text-red-600">{receivable.days_overdue} days past due</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceivableDetail;
