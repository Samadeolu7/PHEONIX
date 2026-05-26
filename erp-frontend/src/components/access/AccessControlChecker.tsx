// src/components/access/AccessControlChecker.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { entitlementService, ServiceAccessCheck } from '../../services/entitlementService';
import { useToast } from '../../hooks/useToast';
import {
  Shield,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Clock,
  RefreshCw,
  User,
  Settings,
  Eye,
  X,
} from 'lucide-react';

interface AccessControlCheckerProps {
  clientId: number;
  serviceCode: string;
  serviceName: string;
  onAccessGranted?: () => void;
  onAccessDenied?: (reason: string) => void;
  showModal?: boolean;
  onClose?: () => void;
  className?: string;
}

interface AccessControlResult {
  allowed: boolean;
  reason: string;
  paymentPercentage: number;
  requiredPercentage: number;
  amountPaid: string;
  balance: string;
  entitlementId?: number;
  accessLevel: 'none' | 'partial' | 'full';
  restrictions: string[];
  nextPaymentDue?: string;
}

const AccessControlChecker: React.FC<AccessControlCheckerProps> = ({
  clientId,
  serviceCode,
  serviceName,
  onAccessGranted,
  onAccessDenied,
  showModal = false,
  onClose,
  className = '',
}) => {
  const [accessResult, setAccessResult] = useState<AccessControlResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    checkAccess();
  }, [clientId, serviceCode]);

  const checkAccess = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check service access through entitlement service
      const result = await entitlementService.checkServiceAccess(clientId, serviceCode);

      const accessResult: AccessControlResult = {
        allowed: result.can_access,
        reason: result.reason || '',
        paymentPercentage: result.payment_percentage || 0,
        requiredPercentage: result.required_percentage || 100,
        amountPaid: result.amount_paid || '0',
        balance: result.balance || '0',
        entitlementId: result.entitlement_id,
        accessLevel: result.access_level || 'none',
        restrictions: result.restrictions || [],
        nextPaymentDue: result.next_payment_due,
      };

      setAccessResult(accessResult);

      // Trigger callbacks
      if (accessResult.allowed && onAccessGranted) {
        onAccessGranted();
      } else if (!accessResult.allowed && onAccessDenied) {
        onAccessDenied(accessResult.reason);
      }
    } catch (err: any) {
      console.error('Access control check failed:', err);
      const errorMessage = err.response?.data?.message || 'Failed to check access permissions';
      setError(errorMessage);

      if (onAccessDenied) {
        onAccessDenied(errorMessage);
      }
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  const handleRetry = () => {
    setRetrying(true);
    checkAccess();
  };

  const handlePayNow = () => {
    if (accessResult?.entitlementId) {
      navigate(`/entitlements/${accessResult.entitlementId}/payment`);
    } else {
      navigate(`/clients/${clientId}/entitlements`);
    }
  };

  const handleViewEntitlement = () => {
    if (accessResult?.entitlementId) {
      navigate(`/entitlements/${accessResult.entitlementId}`);
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const getAccessIcon = () => {
    if (loading) return <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />;
    if (error) return <AlertTriangle className="h-6 w-6 text-red-500" />;
    if (accessResult?.allowed) return <CheckCircle className="h-6 w-6 text-green-500" />;
    return <Lock className="h-6 w-6 text-red-500" />;
  };

  const getAccessColor = () => {
    if (loading) return 'border-blue-200 bg-blue-50';
    if (error) return 'border-red-200 bg-red-50';
    if (accessResult?.allowed) return 'border-green-200 bg-green-50';
    return 'border-red-200 bg-red-50';
  };

  const getProgressColor = () => {
    if (!accessResult) return 'bg-gray-200';
    if (accessResult.paymentPercentage >= accessResult.requiredPercentage) return 'bg-green-500';
    if (accessResult.paymentPercentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Inline component (non-modal)
  const AccessControlContent = () => (
    <div className={`border rounded-lg p-4 ${getAccessColor()} ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {getAccessIcon()}
          <div>
            <h3 className="font-semibold text-gray-900">{serviceName} Access</h3>
            <p className="text-sm text-gray-600">Client ID: {clientId}</p>
          </div>
        </div>
        {!loading && !error && (
          <button
            onClick={handleRetry}
            className="text-gray-400 hover:text-gray-600"
            title="Refresh access status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600">Checking access permissions...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-4">
          <p className="text-sm text-red-600 mb-2">{error}</p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
          >
            {retrying ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Retry
          </button>
        </div>
      )}

      {accessResult && !loading && !error && (
        <div className="space-y-3">
          {/* Access Status */}
          <div
            className={`flex items-center gap-2 p-2 rounded ${
              accessResult.allowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {accessResult.allowed ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            <span className="font-medium">
              {accessResult.allowed ? 'Access Granted' : 'Access Denied'}
            </span>
          </div>

          {/* Payment Progress */}
          <div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Payment Progress</span>
              <span>
                {accessResult.paymentPercentage.toFixed(1)}% of {accessResult.requiredPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
                style={{ width: `${Math.min(accessResult.paymentPercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Payment Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Amount Paid:</span>
              <p className="font-medium">{formatCurrency(accessResult.amountPaid)}</p>
            </div>
            <div>
              <span className="text-gray-500">Balance:</span>
              <p className="font-medium text-red-600">{formatCurrency(accessResult.balance)}</p>
            </div>
          </div>

          {/* Access Level */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Access Level:</span>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                accessResult.accessLevel === 'full'
                  ? 'bg-green-100 text-green-800'
                  : accessResult.accessLevel === 'partial'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
              }`}
            >
              {accessResult.accessLevel.toUpperCase()}
            </span>
          </div>

          {/* Restrictions */}
          {accessResult.restrictions.length > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Restrictions:</p>
              <ul className="text-sm text-red-600 space-y-1">
                {accessResult.restrictions.map((restriction, index) => (
                  <li key={index} className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {restriction}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reason */}
          {!accessResult.allowed && accessResult.reason && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">{accessResult.reason}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {!accessResult.allowed && parseFloat(accessResult.balance) > 0 && (
              <button
                onClick={handlePayNow}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                <CreditCard className="h-4 w-4" />
                Pay Now
              </button>
            )}
            {accessResult.entitlementId && (
              <button
                onClick={handleViewEntitlement}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
              >
                <Eye className="h-4 w-4" />
                View Details
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Modal version
  if (showModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold">Access Control Check</h2>
            </div>
            {onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="p-4">
            <AccessControlContent />
          </div>
        </div>
      </div>
    );
  }

  // Inline version
  return <AccessControlContent />;
};

export default AccessControlChecker;
