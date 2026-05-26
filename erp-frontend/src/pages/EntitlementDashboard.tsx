import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap,
  CreditCard,
  Shield,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  Activity,
  TrendingUp,
  Users,
  Eye,
  RefreshCw,
  Zap,
  Lock,
  Unlock,
  Star,
  AlertTriangle,
} from 'lucide-react';
import {
  entitlementService,
  FeeEntitlement,
  ServiceAccessCheck,
} from '../services/entitlementService';
import { useToast } from '../hooks/useToast';
import UnifiedPaymentModal from '../components/modals/UnifiedPaymentModal';
import { CustomerReceivable } from '../services/receivablesService';

interface ServiceAccessStatus {
  service: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  category: 'basic' | 'premium' | 'advanced';
  can_access: boolean;
  reason?: string;
}

const EntitlementDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('client');

  const [entitlements, setEntitlements] = useState<FeeEntitlement[]>([]);
  const [selectedEntitlement, setSelectedEntitlement] = useState<FeeEntitlement | null>(null);
  const [serviceAccess, setServiceAccess] = useState<ServiceAccessStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { success, error: showError } = useToast();

  // Define available services with their details
  const availableServices: Omit<ServiceAccessStatus, 'can_access' | 'reason'>[] = [
    {
      service: 'classes',
      name: 'Class Attendance',
      description: 'Attend regular classes and lectures',
      icon: GraduationCap,
      category: 'basic',
    },
    {
      service: 'library',
      name: 'Library Access',
      description: 'Access to library resources and study areas',
      icon: Users,
      category: 'basic',
    },
    {
      service: 'exams',
      name: 'Examinations',
      description: 'Participate in tests and examinations',
      icon: Star,
      category: 'premium',
    },
    {
      service: 'labs',
      name: 'Laboratory Access',
      description: 'Access to computer and science laboratories',
      icon: Zap,
      category: 'premium',
    },
    {
      service: 'sports',
      name: 'Sports Facilities',
      description: 'Access to sports facilities and activities',
      icon: Activity,
      category: 'premium',
    },
    {
      service: 'graduation',
      name: 'Graduation Eligibility',
      description: 'Eligible for graduation and certificate issuance',
      icon: GraduationCap,
      category: 'advanced',
    },
    {
      service: 'transcript',
      name: 'Transcript Services',
      description: 'Request official transcripts and certificates',
      icon: Shield,
      category: 'advanced',
    },
  ];

  useEffect(() => {
    if (clientId) {
      fetchClientEntitlements();
    } else {
      showError('Client ID is required');
      navigate('/incomes/entitlements');
    }
  }, [clientId]);

  useEffect(() => {
    if (entitlements.length > 0) {
      checkServiceAccess();
    }
  }, [entitlements]);

  const fetchClientEntitlements = async () => {
    try {
      setLoading(true);
      const response = await entitlementService.getEntitlements({
        client: Number(clientId),
        status: 'active',
      });

      setEntitlements(response.results || []);
    } catch (error: any) {
      console.error('Failed to fetch entitlements:', error);
      showError('Failed to load entitlements');
    } finally {
      setLoading(false);
    }
  };

  const checkServiceAccess = async () => {
    if (entitlements.length === 0) return;

    try {
      const accessChecks = await Promise.allSettled(
        availableServices.map(async service => {
          // Check access for the first active entitlement
          const activeEntitlement = entitlements.find(e => e.status === 'active');
          if (!activeEntitlement) {
            return {
              ...service,
              can_access: false,
              reason: 'No active entitlement found',
            };
          }

          try {
            const accessCheck = await entitlementService.checkServiceAccess(
              activeEntitlement.id,
              service.service
            );
            return {
              ...service,
              can_access: accessCheck.can_access,
              reason: accessCheck.reason,
            };
          } catch (error) {
            return {
              ...service,
              can_access: false,
              reason: 'Unable to check access',
            };
          }
        })
      );

      const serviceStatuses = accessChecks.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            ...availableServices[index],
            can_access: false,
            reason: 'Access check failed',
          };
        }
      });

      setServiceAccess(serviceStatuses);
    } catch (error: any) {
      console.error('Failed to check service access:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchClientEntitlements();
    setRefreshing(false);
    success('Dashboard refreshed');
  };

  const handleQuickPayment = (entitlement: FeeEntitlement) => {
    setSelectedEntitlement(entitlement);
    setShowPaymentModal(true);
  };

  const handlePaymentRecorded = () => {
    setShowPaymentModal(false);
    setSelectedEntitlement(null);
    fetchClientEntitlements();
    success('Payment recorded successfully');
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
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
      >
        <StatusIcon className="w-3 h-3 mr-1" />
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
        icon: Lock,
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
        icon: Unlock,
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

  const getPaymentPercentageColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'basic':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'premium':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'advanced':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeEntitlements = entitlements.filter(e => e.status === 'active');
  const totalBalance = entitlements.reduce((sum, e) => sum + parseFloat(e.balance), 0);
  const totalPaid = entitlements.reduce((sum, e) => sum + parseFloat(e.amount_paid), 0);
  const totalAmount = entitlements.reduce((sum, e) => sum + parseFloat(e.total_amount), 0);
  const overallProgress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <GraduationCap className="h-8 w-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Entitlements Dashboard</h1>
            <p className="text-gray-600">View your payment status and service access</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/incomes/entitlements')}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Eye className="mr-2 h-4 w-4" />
            View All Entitlements
          </button>
        </div>
      </div>

      {entitlements.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No entitlements found</h3>
          <p className="mt-1 text-sm text-gray-500">
            You don't have any entitlements yet. Contact your administrator for assistance.
          </p>
        </div>
      ) : (
        <>
          {/* Overview Cards */}
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
                    }).format(totalAmount)}
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
                    }).format(totalPaid)}
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
                  <p className="text-sm font-medium text-gray-500">Outstanding Balance</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Intl.NumberFormat('en-NG', {
                      style: 'currency',
                      currency: 'NGN',
                      minimumFractionDigits: 0,
                    }).format(totalBalance)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className={`h-8 w-8 ${getPaymentPercentageColor(overallProgress)}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Overall Progress</p>
                  <p className={`text-2xl font-bold ${getPaymentPercentageColor(overallProgress)}`}>
                    {overallProgress.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Active Entitlements */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <GraduationCap className="mr-2 h-5 w-5" />
                Active Entitlements ({activeEntitlements.length})
              </h3>
            </div>
            <div className="p-6">
              {activeEntitlements.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="mx-auto h-8 w-8 text-yellow-400" />
                  <h4 className="mt-2 text-sm font-medium text-gray-900">No Active Entitlements</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    You don't have any active entitlements at the moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {activeEntitlements.map(entitlement => (
                    <div key={entitlement.id} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-lg font-medium text-gray-900">
                            {entitlement.fee_structure.name}
                          </h4>
                          <p className="text-sm text-gray-500">
                            Invoice: {entitlement.invoice.invoice_number}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3">
                          {getAccessLevelBadge(entitlement.current_access_level)}
                          {getStatusBadge(entitlement.status)}
                        </div>
                      </div>

                      {/* Payment Progress */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Payment Progress
                          </span>
                          <span
                            className={`text-sm font-medium ${getPaymentPercentageColor(entitlement.payment_percentage)}`}
                          >
                            {entitlement.payment_percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full ${
                              entitlement.payment_percentage >= 80
                                ? 'bg-green-500'
                                : entitlement.payment_percentage >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(entitlement.payment_percentage, 100)}%` }}
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
                            Balance:{' '}
                            {new Intl.NumberFormat('en-NG', {
                              style: 'currency',
                              currency: 'NGN',
                              minimumFractionDigits: 0,
                            }).format(parseFloat(entitlement.balance))}
                          </span>
                        </div>
                      </div>

                      {/* Validity Period */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          Valid: {new Date(entitlement.valid_from).toLocaleDateString()} -{' '}
                          {new Date(entitlement.valid_until).toLocaleDateString()}
                        </div>
                        {parseFloat(entitlement.balance) > 0 && (
                          <button
                            onClick={() => handleQuickPayment(entitlement)}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Make Payment
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Service Access Matrix */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                Service Access Matrix
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Your current access to various services based on payment status
              </p>
            </div>
            <div className="p-6">
              {serviceAccess.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="mx-auto h-8 w-8 text-gray-400" />
                  <h4 className="mt-2 text-sm font-medium text-gray-900">Loading Service Access</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Checking your access to available services...
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {serviceAccess.map(service => {
                    const ServiceIcon = service.icon;
                    return (
                      <div
                        key={service.service}
                        className={`border rounded-lg p-4 ${
                          service.can_access
                            ? 'border-green-200 bg-green-50'
                            : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center">
                            <ServiceIcon
                              className={`h-5 w-5 mr-2 ${
                                service.can_access ? 'text-green-600' : 'text-red-600'
                              }`}
                            />
                            <span className="font-medium text-gray-900">{service.name}</span>
                          </div>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getCategoryColor(service.category)}`}
                          >
                            {service.category}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{service.description}</p>
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              service.can_access
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {service.can_access ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Available
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 mr-1" />
                                Restricted
                              </>
                            )}
                          </span>
                        </div>
                        {!service.can_access && service.reason && (
                          <p className="text-xs text-red-600 mt-2">{service.reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Payment Modal */}
          {showPaymentModal && selectedEntitlement && (
            <UnifiedPaymentModal
              isOpen={showPaymentModal}
              onClose={() => {
                setShowPaymentModal(false);
                setSelectedEntitlement(null);
              }}
              receivable={{
                id: selectedEntitlement.id,
                client: selectedEntitlement.client.id,
                client_name: selectedEntitlement.client.full_name,
                receivable_type: 'entitlement',
                object_id: selectedEntitlement.id,
                content_type: 0,
                content_type_name: 'entitlement',
                reference_number: `ENT-${selectedEntitlement.id}`,
                original_amount: selectedEntitlement.total_amount,
                amount_paid: selectedEntitlement.amount_paid,
                balance: selectedEntitlement.balance,
                due_date: selectedEntitlement.valid_until,
                aging_bucket: 'current',
                days_overdue: 0,
                status: selectedEntitlement.status === 'active' ? 'partial' : 'pending',
                overdue_interest_rate: '0.00',
                accrued_interest: '0.00',
                last_reminder_sent: null,
                reminder_count: 0,
                assigned_to: null,
                created_at: selectedEntitlement.valid_from,
                updated_at: selectedEntitlement.valid_from,
              }}
              onPaymentRecorded={handlePaymentRecorded}
            />
          )}
        </>
      )}
    </div>
  );
};

export default EntitlementDashboard;
