// src/components/incomes/AccessControlChecker.tsx
import React, { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { entitlementService, ServiceAccessCheck } from '../../services/entitlementService';

export interface AccessControlCheckerProps {
  entitlementId: number;
  serviceCode: string;
  serviceName: string;
  onPaymentRequired?: (entitlementId: number, requiredAmount: string) => void;
  onUpgradeRequired?: (entitlementId: number, upgradeOptions: UpgradeOption[]) => void;
  className?: string;
  showDetails?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

export interface UpgradeOption {
  type: 'payment' | 'upgrade_plan';
  title: string;
  description: string;
  amount?: string;
  action: () => void;
}

export interface AccessStatus {
  canAccess: boolean;
  accessLevel: 'none' | 'partial' | 'full';
  reason?: string;
  paymentPercentage: number;
  amountPaid: string;
  balance: string;
  allowedServices: string[];
  restrictedServices: string[];
  lastChecked: Date;
}

const AccessControlChecker: React.FC<AccessControlCheckerProps> = ({
  entitlementId,
  serviceCode,
  serviceName,
  onPaymentRequired,
  onUpgradeRequired,
  className = '',
  showDetails = true,
  autoRefresh = false,
  refreshInterval = 30000, // 30 seconds default
}) => {
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkAccess = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response: ServiceAccessCheck = await entitlementService.checkServiceAccess(
        entitlementId,
        serviceCode
      );

      setAccessStatus({
        canAccess: response.can_access,
        accessLevel: response.current_access_level,
        reason: response.reason,
        paymentPercentage: response.payment_percentage,
        amountPaid: response.amount_paid,
        balance: response.balance,
        allowedServices: response.allowed_services,
        restrictedServices: response.restricted_services,
        lastChecked: new Date(),
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to check service access');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, [entitlementId, serviceCode]);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        checkAccess(true);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, entitlementId, serviceCode]);

  const handlePaymentAction = () => {
    if (accessStatus && onPaymentRequired) {
      onPaymentRequired(entitlementId, accessStatus.balance);
    }
  };

  const handleUpgradeAction = () => {
    if (accessStatus && onUpgradeRequired) {
      const upgradeOptions: UpgradeOption[] = [
        {
          type: 'payment',
          title: 'Make Payment',
          description: `Pay ${accessStatus.balance} to unlock full access`,
          amount: accessStatus.balance,
          action: handlePaymentAction,
        },
      ];

      // Add upgrade plan option if partial access
      if (accessStatus.accessLevel === 'partial') {
        upgradeOptions.push({
          type: 'upgrade_plan',
          title: 'Upgrade Access Level',
          description: 'Upgrade to premium plan for full service access',
          action: () => {
            // Handle upgrade plan logic
            console.log('Upgrade plan requested');
          },
        });
      }

      onUpgradeRequired(entitlementId, upgradeOptions);
    }
  };

  const getAccessIcon = () => {
    if (!accessStatus) return <Shield className="w-5 h-5 text-gray-400" />;

    if (accessStatus.canAccess) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getAccessStatusColor = () => {
    if (!accessStatus) return 'text-gray-500';
    return accessStatus.canAccess ? 'text-green-600' : 'text-red-600';
  };

  const getAccessStatusText = () => {
    if (!accessStatus) return 'Checking...';
    return accessStatus.canAccess ? 'Access Granted' : 'Access Denied';
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
        <div className="flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-gray-400 animate-spin mr-2" />
          <span className="text-sm text-gray-500">Checking service access...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Access Check Failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
          <button onClick={() => checkAccess()} className="ml-4 text-red-600 hover:text-red-800">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!accessStatus) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {getAccessIcon()}
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">{serviceName}</h3>
              <p className={`text-sm ${getAccessStatusColor()}`}>{getAccessStatusText()}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {refreshing && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
            <button
              onClick={() => checkAccess(true)}
              className="text-gray-400 hover:text-gray-600"
              title="Refresh access status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="p-4 space-y-4">
          {/* Payment Status */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Payment Status</span>
              <span className="text-sm text-gray-600">
                {accessStatus.paymentPercentage.toFixed(1)}% paid
              </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full ${
                  accessStatus.paymentPercentage >= 100
                    ? 'bg-green-500'
                    : accessStatus.paymentPercentage >= 50
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(accessStatus.paymentPercentage, 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-gray-600">
              <span>Paid: {formatCurrency(accessStatus.amountPaid)}</span>
              <span>Balance: {formatCurrency(accessStatus.balance)}</span>
            </div>
          </div>

          {/* Access Reason */}
          {accessStatus.reason && !accessStatus.canAccess && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start">
                <Info className="w-4 h-4 text-yellow-600 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Access Restriction</p>
                  <p className="text-sm text-yellow-700 mt-1">{accessStatus.reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Service Access Matrix */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Service Access</h4>
            <div className="space-y-2">
              {/* Allowed Services */}
              {accessStatus.allowedServices.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Available Services</p>
                  <div className="flex flex-wrap gap-1">
                    {accessStatus.allowedServices.map((service, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Restricted Services */}
              {accessStatus.restrictedServices.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Restricted Services</p>
                  <div className="flex flex-wrap gap-1">
                    {accessStatus.restrictedServices.map((service, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800"
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {!accessStatus.canAccess && (
            <div className="flex space-x-3 pt-2">
              {parseFloat(accessStatus.balance) > 0 && (
                <button
                  onClick={handlePaymentAction}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Make Payment
                </button>
              )}

              <button
                onClick={handleUpgradeAction}
                className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                View Options
              </button>
            </div>
          )}

          {/* Last Checked */}
          <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-100">
            Last checked: {accessStatus.lastChecked.toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessControlChecker;
