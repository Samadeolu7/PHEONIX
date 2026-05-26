// src/pages/receivables/CollectionWorkbench.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  receivablesService,
  CustomerReceivable,
  ActivityLog,
} from '../../services/receivablesService';
import { userManagementService, User } from '../../services/userManagementService';
import { useToast } from '../../hooks/useToast';
import {
  RefreshCw,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  Clock,
  User as UserIcon,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Filter,
  Search,
  Eye,
  Edit,
  Save,
  X,
  Target,
  TrendingUp,
  Activity,
  Users,
  DollarSign,
} from 'lucide-react';

interface CollectionActivity {
  id?: number;
  receivable_id: number;
  activity_type:
    | 'phone_call'
    | 'email'
    | 'meeting'
    | 'letter'
    | 'payment_promise'
    | 'note'
    | 'escalation';
  contact_method?: 'phone' | 'email' | 'in_person' | 'letter';
  contact_person?: string;
  outcome: 'successful' | 'no_answer' | 'busy' | 'promised_payment' | 'dispute' | 'other';
  description: string;
  follow_up_date?: string;
  amount_promised?: string;
  promise_date?: string;
  performed_by?: User;
  created_at?: string;
}

interface PaymentPromise {
  id: number;
  receivable_id: number;
  amount_promised: string;
  promise_date: string;
  status: 'pending' | 'kept' | 'broken' | 'rescheduled';
  created_at: string;
  notes?: string;
  created_by?: User;
  follow_up_date?: string;
  reminder_sent?: boolean;
}

interface CollectionFilters {
  assigned_to?: number;
  aging_bucket?: string;
  priority?: 'high' | 'medium' | 'low';
  last_contact?: string;
  search?: string;
}

const CollectionWorkbench: React.FC = () => {
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [selectedReceivable, setSelectedReceivable] = useState<CustomerReceivable | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [paymentPromises, setPaymentPromises] = useState<PaymentPromise[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [filters, setFilters] = useState<CollectionFilters>({});

  // Activity form state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityForm, setActivityForm] = useState<CollectionActivity>({
    receivable_id: 0,
    activity_type: 'phone_call',
    outcome: 'successful',
    description: '',
  });

  // Statistics
  const [workbenchStats, setWorkbenchStats] = useState({
    totalAssigned: 0,
    contactedToday: 0,
    promisesDue: 0,
    escalationNeeded: 0,
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { error: showError, success: showSuccess } = useToast();

  useEffect(() => {
    loadCollectionData();
    loadCollectors();
  }, [filters]);

  useEffect(() => {
    if (selectedReceivable) {
      loadActivityLogs(selectedReceivable.id);
      loadPaymentPromises(selectedReceivable.id);
    }
  }, [selectedReceivable]);

  const loadCollectionData = async () => {
    try {
      setLoading(true);

      // Load receivables assigned to current user or filtered
      const response = await receivablesService.getReceivables({
        status: 'overdue',
        assigned_to: filters.assigned_to,
        aging_bucket: filters.aging_bucket,
        search: filters.search,
        ordering: '-days_overdue,-balance',
      });

      const receivablesData = response.results || [];
      setReceivables(receivablesData);

      // Calculate workbench statistics
      const today = new Date().toISOString().split('T')[0];
      const stats = {
        totalAssigned: receivablesData.length,
        contactedToday: receivablesData.filter(
          r => r.last_reminder_sent && r.last_reminder_sent.startsWith(today)
        ).length,
        promisesDue: 0, // Would be calculated from payment promises
        escalationNeeded: receivablesData.filter(
          r => r.days_overdue > 90 || parseFloat(r.balance) > 1000000
        ).length,
      };
      setWorkbenchStats(stats);

      // Auto-select first receivable if none selected
      if (!selectedReceivable && receivablesData.length > 0) {
        setSelectedReceivable(receivablesData[0]);
      }
    } catch (error) {
      console.error('Error loading collection data:', error);
      showError('Failed to load collection data');
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async (receivableId: number) => {
    try {
      setActivityLoading(true);
      const response = await receivablesService.getActivityLogs({
        receivable: receivableId,
        ordering: '-created_at',
      });
      setActivityLogs(response.results || []);
    } catch (error) {
      console.error('Error loading activity logs:', error);
      // Continue without activity logs if API fails
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadPaymentPromises = async (receivableId: number) => {
    try {
      // Mock payment promises - would come from API
      const mockPromises: PaymentPromise[] = [
        {
          id: 1,
          receivable_id: receivableId,
          amount_promised: '500000',
          promise_date: '2024-02-15',
          status: 'pending',
          created_at: '2024-02-01T10:00:00Z',
          notes: 'Client promised to pay by month end',
        },
      ];
      setPaymentPromises(mockPromises);
    } catch (error) {
      console.error('Error loading payment promises:', error);
      setPaymentPromises([]);
    }
  };

  const loadCollectors = async () => {
    try {
      const users = await userManagementService.getUsers();
      const activeCollectors = users.filter(
        user =>
          user.is_active &&
          (user.role_names.includes('Collections') || user.role_names.includes('Finance'))
      );
      setCollectors(activeCollectors);
    } catch (error) {
      console.error('Error loading collectors:', error);
      setCollectors([]);
    }
  };

  const handleActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedReceivable) {
      showError('Please select a receivable first');
      return;
    }

    try {
      // Add note to receivable (using existing API)
      await receivablesService.addNote(selectedReceivable.id, {
        note: `${activityForm.activity_type.toUpperCase()}: ${activityForm.description}${
          activityForm.follow_up_date ? ` | Follow-up: ${activityForm.follow_up_date}` : ''
        }${
          activityForm.amount_promised
            ? ` | Promised: ${formatCurrency(parseFloat(activityForm.amount_promised))}`
            : ''
        }`,
      });

      showSuccess('Collection activity recorded successfully');

      // Reset form
      setActivityForm({
        receivable_id: selectedReceivable.id,
        activity_type: 'phone_call',
        outcome: 'successful',
        description: '',
      });
      setShowActivityForm(false);

      // Reload data
      loadActivityLogs(selectedReceivable.id);
      loadCollectionData();
    } catch (error) {
      console.error('Error recording activity:', error);
      showError('Failed to record collection activity');
    }
  };

  const handleSendReminder = async (receivableId: number) => {
    try {
      await receivablesService.sendReminder(receivableId, {
        reminder_type: 'email',
        template: 'collection_reminder',
        custom_message:
          'This is a follow-up regarding your outstanding balance. Please contact us to arrange payment.',
      });

      showSuccess('Collection reminder sent successfully');
      loadCollectionData();
    } catch (error) {
      console.error('Error sending reminder:', error);
      showError('Failed to send reminder');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const getPriorityLevel = (receivable: CustomerReceivable): 'high' | 'medium' | 'low' => {
    const balance = parseFloat(receivable.balance);
    const daysOverdue = receivable.days_overdue;

    if (daysOverdue > 90 || balance > 1000000) return 'high';
    if (daysOverdue > 60 || balance > 500000) return 'medium';
    return 'low';
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-100 border-red-200';
      case 'medium':
        return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'low':
        return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    }
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'phone_call':
        return <Phone className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'meeting':
        return <Users className="h-4 w-4" />;
      case 'letter':
        return <FileText className="h-4 w-4" />;
      case 'payment_promise':
        return <Target className="h-4 w-4" />;
      case 'note':
        return <MessageSquare className="h-4 w-4" />;
      case 'escalation':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'successful':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'promised_payment':
        return <Target className="h-4 w-4 text-blue-600" />;
      case 'dispute':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'no_answer':
      case 'busy':
        return <XCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-600" />;
    }
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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Collection Workbench</h1>
            <p className="text-gray-600">
              Manage collection activities and track customer interactions
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadCollectionData()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Statistics Bar */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Assigned</p>
                <p className="text-2xl font-bold text-blue-900">{workbenchStats.totalAssigned}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Contacted Today</p>
                <p className="text-2xl font-bold text-green-900">{workbenchStats.contactedToday}</p>
              </div>
              <Phone className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">Promises Due</p>
                <p className="text-2xl font-bold text-orange-900">{workbenchStats.promisesDue}</p>
              </div>
              <Target className="h-8 w-8 text-orange-600" />
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Escalation Needed</p>
                <p className="text-2xl font-bold text-red-900">{workbenchStats.escalationNeeded}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Receivables List */}
        <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
          {/* Filters */}
          <div className="p-4 border-b border-gray-200">
            <div className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={filters.search || ''}
                  onChange={e => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.aging_bucket || ''}
                  onChange={e =>
                    setFilters({ ...filters, aging_bucket: e.target.value || undefined })
                  }
                >
                  <option value="">All Ages</option>
                  <option value="1-30">1-30 days</option>
                  <option value="31-60">31-60 days</option>
                  <option value="61-90">61-90 days</option>
                  <option value="90+">90+ days</option>
                </select>
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  value={filters.assigned_to || ''}
                  onChange={e =>
                    setFilters({
                      ...filters,
                      assigned_to: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">All Collectors</option>
                  {collectors.map(collector => (
                    <option key={collector.id} value={collector.id}>
                      {collector.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Receivables List */}
          <div className="flex-1 overflow-y-auto">
            {receivables.length > 0 ? (
              <div className="space-y-1 p-2">
                {receivables.map(receivable => {
                  const priority = getPriorityLevel(receivable);
                  const isSelected = selectedReceivable?.id === receivable.id;

                  return (
                    <div
                      key={receivable.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-2 border-blue-200'
                          : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => setSelectedReceivable(receivable)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 truncate">
                            {receivable.client_name}
                          </h4>
                          <p className="text-sm text-gray-600">{receivable.reference_number}</p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(priority)}`}
                        >
                          {priority.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-lg font-bold text-red-600">
                            {formatCurrency(parseFloat(receivable.balance))}
                          </p>
                          <p className="text-xs text-gray-500">
                            {receivable.days_overdue} days overdue
                          </p>
                        </div>
                        <div className="text-right">
                          {receivable.last_reminder_sent ? (
                            <p className="text-xs text-gray-500">
                              Last contact: {formatDate(receivable.last_reminder_sent)}
                            </p>
                          ) : (
                            <p className="text-xs text-red-500">No contact yet</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Receivables</h3>
                  <p className="text-gray-500">No receivables match your current filters.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Activity Management */}
        <div className="flex-1 flex flex-col">
          {selectedReceivable ? (
            <>
              {/* Receivable Header */}
              <div className="bg-white border-b border-gray-200 p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {selectedReceivable.client_name}
                    </h2>
                    <p className="text-gray-600">{selectedReceivable.reference_number}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-2xl font-bold text-red-600">
                        {formatCurrency(parseFloat(selectedReceivable.balance))}
                      </span>
                      <span className="text-sm text-gray-500">
                        {selectedReceivable.days_overdue} days overdue
                      </span>
                      <span className="text-sm text-gray-500">
                        Due: {formatDate(selectedReceivable.due_date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/receivables/${selectedReceivable.id}/view`)}
                      className="flex items-center gap-2 px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </button>
                    <button
                      onClick={() => handleSendReminder(selectedReceivable.id)}
                      className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                    >
                      <Mail className="h-4 w-4" />
                      Send Reminder
                    </button>
                    <button
                      onClick={() => setShowActivityForm(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Log Activity
                    </button>
                  </div>
                </div>
              </div>

              {/* Activity Content */}
              <div className="flex-1 overflow-hidden">
                <div className="h-full flex">
                  {/* Activity Timeline */}
                  <div className="flex-1 p-6 overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Activity Timeline</h3>
                      {activityLoading && (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      )}
                    </div>

                    {activityLogs.length > 0 ? (
                      <div className="space-y-4">
                        {activityLogs.map((log, index) => (
                          <div key={log.id} className="flex gap-3">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                {getActivityIcon(log.activity_type)}
                              </div>
                            </div>
                            <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 capitalize">
                                    {log.activity_type.replace('_', ' ')}
                                  </span>
                                  {log.amount && (
                                    <span className="text-sm text-green-600 font-medium">
                                      {formatCurrency(parseFloat(log.amount))}
                                    </span>
                                  )}
                                </div>
                                <span className="text-sm text-gray-500">
                                  {formatDateTime(log.created_at)}
                                </span>
                              </div>
                              <p className="text-gray-700 mb-2">{log.description}</p>
                              {log.performed_by && (
                                <div className="flex items-center gap-1 text-sm text-gray-500">
                                  <UserIcon className="h-3 w-3" />
                                  <span>{log.performed_by.full_name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Activity Yet</h3>
                        <p className="text-gray-500 mb-4">
                          Start logging collection activities to track your progress.
                        </p>
                        <button
                          onClick={() => setShowActivityForm(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Log First Activity
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payment Promises Sidebar */}
                  <div className="w-80 bg-gray-50 border-l border-gray-200 p-4 overflow-y-auto">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Promises</h3>

                    {paymentPromises.length > 0 ? (
                      <div className="space-y-3">
                        {paymentPromises.map(promise => (
                          <div
                            key={promise.id}
                            className="bg-white rounded-lg border border-gray-200 p-3"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-medium text-gray-900">
                                {formatCurrency(parseFloat(promise.amount_promised))}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  promise.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : promise.status === 'kept'
                                      ? 'bg-green-100 text-green-800'
                                      : promise.status === 'broken'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {promise.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              Due: {formatDate(promise.promise_date)}
                            </p>
                            {promise.notes && (
                              <p className="text-sm text-gray-500">{promise.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Target className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm">No payment promises recorded</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Receivable</h3>
                <p className="text-gray-500">
                  Choose a receivable from the list to manage collection activities.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity Form Modal */}
      {showActivityForm && selectedReceivable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Log Collection Activity</h3>
              <button
                onClick={() => setShowActivityForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleActivitySubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Activity Type
                  </label>
                  <select
                    value={activityForm.activity_type}
                    onChange={e =>
                      setActivityForm({
                        ...activityForm,
                        activity_type: e.target.value as CollectionActivity['activity_type'],
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="phone_call">Phone Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="letter">Letter</option>
                    <option value="payment_promise">Payment Promise</option>
                    <option value="note">Note</option>
                    <option value="escalation">Escalation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Outcome</label>
                  <select
                    value={activityForm.outcome}
                    onChange={e =>
                      setActivityForm({
                        ...activityForm,
                        outcome: e.target.value as CollectionActivity['outcome'],
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="successful">Successful</option>
                    <option value="no_answer">No Answer</option>
                    <option value="busy">Busy</option>
                    <option value="promised_payment">Promised Payment</option>
                    <option value="dispute">Dispute</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {activityForm.activity_type !== 'note' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Person (Optional)
                  </label>
                  <input
                    type="text"
                    value={activityForm.contact_person || ''}
                    onChange={e =>
                      setActivityForm({ ...activityForm, contact_person: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Name of person contacted"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={activityForm.description}
                  onChange={e => setActivityForm({ ...activityForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  placeholder="Describe the activity and any important details..."
                  required
                />
              </div>

              {activityForm.outcome === 'promised_payment' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount Promised
                    </label>
                    <input
                      type="number"
                      value={activityForm.amount_promised || ''}
                      onChange={e =>
                        setActivityForm({ ...activityForm, amount_promised: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                      min="0"
                      step="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Promise Date
                    </label>
                    <input
                      type="date"
                      value={activityForm.promise_date || ''}
                      onChange={e =>
                        setActivityForm({ ...activityForm, promise_date: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Follow-up Date (Optional)
                </label>
                <input
                  type="date"
                  value={activityForm.follow_up_date || ''}
                  onChange={e =>
                    setActivityForm({ ...activityForm, follow_up_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowActivityForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Save className="h-4 w-4" />
                  Save Activity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionWorkbench;
