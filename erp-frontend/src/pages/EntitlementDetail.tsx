import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  GraduationCap,
  User,
  Calendar,
  DollarSign,
  CreditCard,
  Shield,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Eye,
  Pause,
  Play,
  FileText,
  TrendingUp,
  BarChart3,
  Users,
  Settings,
} from 'lucide-react';
import { entitlementService, FeeEntitlement } from '../services/entitlementService';
import { receivablesService, ActivityLog } from '../services/receivablesService';
import { useToast } from '../hooks/useToast';
import UnifiedPaymentModal from '../components/modals/UnifiedPaymentModal';
import { CustomerReceivable } from '../services/receivablesService';

const EntitlementDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entitlement, setEntitlement] = useState<FeeEntitlement | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'access' | 'usage'>(
    'overview'
  );

  const { success, error: showError } = useToast();

  useEffect(() => {
    if (id) {
      fetchEntitlementDetail();
      fetchActivityLogs();
    }
  }, [id]);

  const fetchEntitlementDetail = async () => {
    try {
      setLoading(true);
      const response = await entitlementService.getEntitlement(Number(id));
      setEntitlement(response);
    } catch (error: any) {
      console.error('Failed to fetch entitlement:', error);
      showError('Failed to load entitlement details');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    try {
      if (id) {
        // Fetch activity logs for this entitlement
        const response = await receivablesService.getActivityLogs({
          receivable: Number(id),
        });
        setActivityLogs(response.results || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch activity logs:', error);
      // Don't show error for activity logs as they might not exist
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        icon: Clock,
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        label: 'Pending',
      },
      active: {
        icon: CheckCircle,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Active',
      },
      suspended: {
        icon: AlertCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'Suspended',
      },
      completed: {
        icon: CheckCircle,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        label: 'Completed',
      },
      cancelled: {
        icon: XCircle,
        color: 'text-gray-600',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        label: 'Cancelled',
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.bg} ${config.color} ${config.border}`}
      >
        <StatusIcon className="w-4 h-4 mr-2" />
        {config.label}
      </span>
    );
  };

  const getAccessLevelBadge = (level: string) => {
    const levelConfig = {
      none: {
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'No Access',
        icon: XCircle,
      },
      partial: {
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        label: 'Partial Access',
        icon: Shield,
      },
      full: {
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Full Access',
        icon: CheckCircle,
      },
    };

    const config = levelConfig[level as keyof typeof levelConfig] || levelConfig.none;
    const AccessIcon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.bg} ${config.color} ${config.border}`}
      >
        <AccessIcon className="w-4 h-4 mr-2" />
        {config.label}
      </span>
    );
  };

  const getPaymentPercentageColor = (percentage: string | number) => {
    const numPercentage = typeof percentage === 'string' ? parseFloat(percentage) : percentage;
    if (numPercentage >= 80) return 'text-green-600';
    if (numPercentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleRecordPayment = () => {
    if (!entitlement) return;

    // Convert entitlement to receivable format for UnifiedPaymentModal
    const receivable: CustomerReceivable = {
      id: entitlement.id,
      client: entitlement.client,
      client_name: entitlement.client_name,
      receivable_type: 'entitlement',
      object_id: entitlement.id,
      content_type: 0,
      content_type_name: 'entitlement',
      reference_number: `ENT-${entitlement.id}`,
      original_amount: entitlement.total_amount,
      amount_paid: entitlement.amount_paid,
      balance: entitlement.balance,
      due_date: entitlement.valid_until || '',
      aging_bucket: 'current',
      days_overdue: 0,
      status: entitlement.status === 'active' ? 'partial' : 'pending',
      overdue_interest_rate: '0.00',
      accrued_interest: '0.00',
      last_reminder_sent: null,
      reminder_count: 0,
      assigned_to: null,
      created_at: entitlement.valid_from,
      updated_at: entitlement.created_at,
    };

    setShowPaymentModal(true);
  };

  const handlePaymentRecorded = () => {
    setShowPaymentModal(false);
    fetchEntitlementDetail();
    fetchActivityLogs(); // Refresh activity logs after payment
    success('Payment recorded successfully');
  };

  const handleSuspendEntitlement = async () => {
    if (!entitlement) return;

    try {
      await entitlementService.suspendEntitlement(entitlement.id, {
        reason: 'Suspended via admin action',
      });
      fetchEntitlementDetail();
      success('Entitlement suspended successfully');
    } catch (error: any) {
      console.error('Failed to suspend entitlement:', error);
      showError('Failed to suspend entitlement');
    }
  };

  const handleReactivateEntitlement = async () => {
    if (!entitlement) return;

    try {
      await entitlementService.reactivateEntitlement(entitlement.id);
      fetchEntitlementDetail();
      success('Entitlement reactivated successfully');
    } catch (error: any) {
      console.error('Failed to reactivate entitlement:', error);
      showError('Failed to reactivate entitlement');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!entitlement) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Entitlement not found</h3>
          <p className="mt-1 text-sm text-gray-500">
            The requested entitlement could not be found.
          </p>
          <div className="mt-6">
            <button
              onClick={() => navigate('/incomes/entitlements')}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Entitlements
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/incomes/entitlements')}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Entitlements
          </button>
          <div className="flex items-center">
            <GraduationCap className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Entitlement Details</h1>
              <p className="text-gray-600">ENT-{entitlement.id}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {parseFloat(entitlement.balance) > 0 && (
            <button
              onClick={handleRecordPayment}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Record Payment
            </button>
          )}
          {entitlement.status === 'active' ? (
            <button
              onClick={handleSuspendEntitlement}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Pause className="mr-2 h-4 w-4" />
              Suspend
            </button>
          ) : entitlement.status === 'suspended' ? (
            <button
              onClick={handleReactivateEntitlement}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Play className="mr-2 h-4 w-4" />
              Reactivate
            </button>
          ) : null}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                  minimumFractionDigits: 0,
                }).format(parseFloat(entitlement.total_amount))}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Amount Paid</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                  minimumFractionDigits: 0,
                }).format(parseFloat(entitlement.amount_paid))}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                  minimumFractionDigits: 0,
                }).format(parseFloat(entitlement.balance))}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp
                className={`h-8 w-8 ${getPaymentPercentageColor(entitlement.payment_percentage)}`}
              />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Payment Progress</p>
              <p
                className={`text-2xl font-bold ${getPaymentPercentageColor(entitlement.payment_percentage)}`}
              >
                {parseFloat(entitlement.payment_percentage).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview', icon: Eye },
            { key: 'payments', label: 'Payment History', icon: CreditCard },
            { key: 'access', label: 'Access Control', icon: Shield },
            { key: 'usage', label: 'Usage History', icon: Activity },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Client Information */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="mr-2 h-5 w-5" />
                Client Information
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">Name</p>
                  <p className="text-sm text-gray-900">{entitlement.client_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Client ID</p>
                  <p className="text-sm text-gray-900">#{entitlement.client}</p>
                </div>
              </div>
            </div>

            {/* Fee Structure Information */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Fee Structure
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">Name</p>
                  <p className="text-sm text-gray-900">{entitlement.fee_structure_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Structure ID</p>
                  <p className="text-sm text-gray-900">#{entitlement.fee_structure}</p>
                </div>
              </div>
            </div>

            {/* Invoice Information */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Related Invoice
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">Invoice Number</p>
                  <p className="text-sm text-gray-900">{entitlement.invoice_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Invoice ID</p>
                  <p className="text-sm text-gray-900">#{entitlement.invoice || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Validity Period */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Calendar className="mr-2 h-5 w-5" />
                Validity Period
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">Valid From</p>
                  <p className="text-sm text-gray-900">
                    {new Date(entitlement.valid_from).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Valid Until</p>
                  <p className="text-sm text-gray-900">
                    {entitlement.valid_until
                      ? new Date(entitlement.valid_until).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'No end date'}
                  </p>
                </div>
              </div>
            </div>

            {/* Status and Access */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 lg:col-span-2">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Settings className="mr-2 h-5 w-5" />
                Status & Access Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Current Status</p>
                  {getStatusBadge(entitlement.status)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Access Level</p>
                  {getAccessLevelBadge(entitlement.current_access_level)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Payment Term</p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-50 text-gray-700 border border-gray-200">
                    {entitlement.payment_term_type === 'full_upfront'
                      ? 'Full Upfront'
                      : entitlement.payment_term_type === 'minimum_deposit'
                        ? 'Minimum Deposit'
                        : entitlement.payment_term_type === 'installments'
                          ? 'Installments'
                          : entitlement.payment_term_type === 'prepaid_allocation'
                            ? 'Prepaid Allocation'
                            : entitlement.payment_term_type
                                .replace('_', ' ')
                                .replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
              <CreditCard className="mr-2 h-5 w-5" />
              Payment Progress
            </h3>

            {/* Payment Progress Bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Payment Progress</span>
                <span
                  className={`text-sm font-medium ${getPaymentPercentageColor(entitlement.payment_percentage)}`}
                >
                  {parseFloat(entitlement.payment_percentage).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    parseFloat(entitlement.payment_percentage) >= 80
                      ? 'bg-green-500'
                      : parseFloat(entitlement.payment_percentage) >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(parseFloat(entitlement.payment_percentage), 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm text-gray-600 mt-2">
                <span>
                  Paid:{' '}
                  {new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                    minimumFractionDigits: 0,
                  }).format(parseFloat(entitlement.amount_paid))}
                </span>
                <span>
                  Total:{' '}
                  {new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                    minimumFractionDigits: 0,
                  }).format(parseFloat(entitlement.total_amount))}
                </span>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-500">Minimum Required</p>
                <p className="text-lg font-bold text-gray-900">
                  {new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                    minimumFractionDigits: 0,
                  }).format(parseFloat(entitlement.minimum_required || '0'))}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-gray-500">Amount Paid</p>
                <p className="text-lg font-bold text-blue-600">
                  {new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                    minimumFractionDigits: 0,
                  }).format(parseFloat(entitlement.amount_paid))}
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-gray-500">Outstanding Balance</p>
                <p className="text-lg font-bold text-red-600">
                  {new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                    minimumFractionDigits: 0,
                  }).format(parseFloat(entitlement.balance))}
                </p>
              </div>
            </div>

            {/* Payment History Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Activity className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Payment History</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>
                      Payment history is tracked through the related invoice. To view detailed
                      payment records, please check the invoice details for invoice #
                      {entitlement.invoice_number || 'N/A'}.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'access' && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
              <Shield className="mr-2 h-5 w-5" />
              Access Control Matrix
            </h3>

            {/* Current Access Level */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">Current Access Level</h4>
                {getAccessLevelBadge(entitlement.current_access_level)}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Payment Percentage</p>
                    <p
                      className={`text-lg font-bold ${getPaymentPercentageColor(entitlement.payment_percentage)}`}
                    >
                      {parseFloat(entitlement.payment_percentage).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Access Status</p>
                    <p className="text-lg font-bold text-gray-900">
                      {entitlement.current_access_level === 'full'
                        ? 'Full Access Granted'
                        : entitlement.current_access_level === 'partial'
                          ? 'Limited Access'
                          : 'Access Restricted'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Access Rules Information */}
            <div className="space-y-6">
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-4">
                  Access Rules & Requirements
                </h4>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-blue-800">Minimum Payment Required</p>
                      <p className="text-sm text-blue-700">
                        {new Intl.NumberFormat('en-NG', {
                          style: 'currency',
                          currency: 'NGN',
                          minimumFractionDigits: 0,
                        }).format(parseFloat(entitlement.minimum_required || '0'))}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Payment Term Type</p>
                      <p className="text-sm text-blue-700">
                        {entitlement.payment_term_type
                          .replace('_', ' ')
                          .replace(/\b\w/g, l => l.toUpperCase())}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Access Status */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-4">Service Access Status</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-sm font-medium text-gray-900">Basic Services</span>
                    </div>
                    <span className="text-sm text-green-600">Available</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      {entitlement.current_access_level === 'full' ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mr-3" />
                      )}
                      <span className="text-sm font-medium text-gray-900">Premium Services</span>
                    </div>
                    <span
                      className={`text-sm ${entitlement.current_access_level === 'full' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {entitlement.current_access_level === 'full' ? 'Available' : 'Restricted'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      {entitlement.current_access_level !== 'none' ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mr-3" />
                      )}
                      <span className="text-sm font-medium text-gray-900">System Access</span>
                    </div>
                    <span
                      className={`text-sm ${entitlement.current_access_level !== 'none' ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {entitlement.current_access_level !== 'none' ? 'Granted' : 'Denied'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Access Level Change History */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-4">Access Level History</h4>
                {activityLogs.length > 0 ? (
                  <div className="space-y-3">
                    {activityLogs.slice(0, 10).map(log => (
                      <div key={log.id} className="flex items-start p-3 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0">
                          {log.activity_type === 'payment' ? (
                            <CreditCard className="h-5 w-5 text-green-500 mt-0.5" />
                          ) : log.activity_type === 'access_level_change' ? (
                            <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
                          ) : log.activity_type === 'status_change' ? (
                            <Settings className="h-5 w-5 text-orange-500 mt-0.5" />
                          ) : (
                            <Activity className="h-5 w-5 text-gray-500 mt-0.5" />
                          )}
                        </div>
                        <div className="ml-3 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">
                              {log.activity_type
                                .replace('_', ' ')
                                .replace(/\b\w/g, l => l.toUpperCase())}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(log.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{log.description}</p>
                          {log.amount && (
                            <p className="text-sm text-green-600 mt-1">
                              Amount:{' '}
                              {new Intl.NumberFormat('en-NG', {
                                style: 'currency',
                                currency: 'NGN',
                                minimumFractionDigits: 0,
                              }).format(parseFloat(log.amount))}
                            </p>
                          )}
                          {log.performed_by && (
                            <p className="text-xs text-gray-500 mt-1">
                              By: {log.performed_by.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {activityLogs.length > 10 && (
                      <div className="text-center">
                        <p className="text-sm text-gray-500">
                          Showing 10 of {activityLogs.length} activities
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <Clock className="h-5 w-5 text-yellow-400" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Access History Tracking
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>
                            Access level changes are automatically tracked when payments are
                            recorded. The current access level is determined by the payment
                            percentage and configured rules. No activity has been recorded yet for
                            this entitlement.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
              <Activity className="mr-2 h-5 w-5" />
              Usage History
            </h3>

            {entitlement.payment_term_type === 'prepaid_allocation' && usageHistory ? (
              <div className="space-y-6">
                {/* Usage Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-500">Total Allocated</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {parseFloat(entitlement.allocated_units || '0').toFixed(0)} units
                    </p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-500">Units Consumed</p>
                    <p className="text-2xl font-bold text-red-600">
                      {parseFloat(usageHistory.total_consumed).toFixed(0)} units
                    </p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-500">Remaining Units</p>
                    <p className="text-2xl font-bold text-green-600">
                      {parseFloat(usageHistory.remaining).toFixed(0)} units
                    </p>
                  </div>
                </div>

                {/* Usage Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Usage Progress</span>
                    <span className="text-sm font-medium text-gray-600">
                      {(
                        (parseFloat(usageHistory.total_consumed) /
                          parseFloat(entitlement.allocated_units || '1')) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-blue-500"
                      style={{
                        width: `${Math.min((parseFloat(usageHistory.total_consumed) / parseFloat(entitlement.allocated_units || '1')) * 100, 100)}%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Recent Usage */}
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-4">Recent Usage Activity</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Service
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Units Used
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Remaining
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Location
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {usageHistory.results.slice(0, 10).map(usage => (
                          <tr key={usage.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(usage.usage_date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {usage.service_code
                                .replace('_', ' ')
                                .replace(/\b\w/g, l => l.toUpperCase())}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {parseFloat(usage.units_consumed).toFixed(0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {parseFloat(usage.remaining_units).toFixed(0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {usage.location || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {usageHistory.results.length === 0 && (
                    <div className="text-center py-8">
                      <Activity className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No usage recorded</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        No usage activity has been recorded for this entitlement yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  Usage tracking not applicable
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Usage tracking is only available for prepaid allocation entitlements. This
                  entitlement uses a {entitlement.payment_term_type.replace('_', ' ')} payment
                  model.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && entitlement && (
        <UnifiedPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          receivable={{
            id: entitlement.id,
            client: entitlement.client.id,
            client_name: entitlement.client.full_name,
            receivable_type: 'entitlement',
            object_id: entitlement.id,
            content_type: 0,
            content_type_name: 'entitlement',
            reference_number: `ENT-${entitlement.id}`,
            original_amount: entitlement.total_amount,
            amount_paid: entitlement.amount_paid,
            balance: entitlement.balance,
            due_date: entitlement.valid_until,
            aging_bucket: 'current',
            days_overdue: 0,
            status: entitlement.status === 'active' ? 'partial' : 'pending',
            overdue_interest_rate: '0.00',
            accrued_interest: '0.00',
            last_reminder_sent: null,
            reminder_count: 0,
            assigned_to: null,
            created_at: entitlement.valid_from,
            updated_at: entitlement.valid_from,
          }}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}
    </div>
  );
};

export default EntitlementDetail;
