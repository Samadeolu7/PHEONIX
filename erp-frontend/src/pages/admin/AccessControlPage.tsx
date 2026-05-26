// src/pages/admin/AccessControlPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { entitlementService } from '../../services/entitlementService';
import { userManagementService } from '../../services/userManagementService';
import { useToast } from '../../hooks/useToast';
import AccessControlChecker from '../../components/access/AccessControlChecker';
import {
  Shield,
  ArrowLeft,
  Users,
  Settings,
  RefreshCw,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Key,
  Lock,
  Unlock,
} from 'lucide-react';

interface AccessControlEntry {
  id: string;
  clientId: number;
  clientName: string;
  serviceCode: string;
  serviceName: string;
  accessLevel: 'none' | 'partial' | 'full';
  paymentPercentage: number;
  lastChecked: string;
  status: 'granted' | 'denied' | 'pending';
  restrictions: string[];
}

const AccessControlPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [accessEntries, setAccessEntries] = useState<AccessControlEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'granted' | 'denied' | 'pending'>('all');
  const [selectedEntry, setSelectedEntry] = useState<AccessControlEntry | null>(null);
  const [showChecker, setShowChecker] = useState(false);

  // Mock services for demo
  const services = [
    { code: 'classes', name: 'Attend Classes' },
    { code: 'library', name: 'Library Access' },
    { code: 'sports', name: 'Sports Facilities' },
    { code: 'exams', name: 'Examinations' },
    { code: 'graduation', name: 'Graduation' },
    { code: 'transcript', name: 'Transcript Request' },
  ];

  useEffect(() => {
    loadAccessControlData();
  }, []);

  const loadAccessControlData = async () => {
    try {
      setLoading(true);

      // In a real implementation, this would fetch from an access control API
      // For now, we'll generate mock data based on entitlements
      const entitlements = await entitlementService.getEntitlements({ status: 'active' });

      const mockEntries: AccessControlEntry[] = [];

      if (entitlements.results) {
        entitlements.results.forEach((entitlement, index) => {
          services.forEach((service, serviceIndex) => {
            const paymentPercentage = parseFloat(entitlement.payment_percentage);
            const requiredPercentage = entitlement.access_rules.full_access_at_percent || 100;
            const isRestricted = entitlement.access_rules.restricted_services.includes(
              service.code
            );

            let status: 'granted' | 'denied' | 'pending' = 'pending';
            let restrictions: string[] = [];

            if (entitlement.status !== 'active') {
              status = 'denied';
              restrictions.push(`Entitlement ${entitlement.status}`);
            } else if (isRestricted && paymentPercentage < requiredPercentage) {
              status = 'denied';
              restrictions.push(`Requires ${requiredPercentage}% payment`);
            } else if (paymentPercentage >= (entitlement.access_rules.minimum_percent || 0)) {
              status = 'granted';
            } else {
              status = 'denied';
              restrictions.push('Below minimum payment threshold');
            }

            mockEntries.push({
              id: `${entitlement.id}-${service.code}`,
              clientId: entitlement.client,
              clientName: entitlement.client_name,
              serviceCode: service.code,
              serviceName: service.name,
              accessLevel: entitlement.current_access_level,
              paymentPercentage,
              lastChecked: new Date().toISOString(),
              status,
              restrictions,
            });
          });
        });
      }

      setAccessEntries(mockEntries);
    } catch (error: any) {
      console.error('Failed to load access control data:', error);
      showError('Failed to load access control data');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = accessEntries.filter(entry => {
    const matchesSearch =
      searchTerm === '' ||
      entry.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.serviceName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleRefreshAccess = async (entry: AccessControlEntry) => {
    try {
      // In a real implementation, this would refresh the access check
      const result = await entitlementService.checkServiceAccess(entry.clientId, entry.serviceCode);

      // Update the entry with fresh data
      setAccessEntries(prev =>
        prev.map(e =>
          e.id === entry.id
            ? {
                ...e,
                status: result.can_access ? 'granted' : 'denied',
                paymentPercentage: result.payment_percentage,
                accessLevel: result.access_level || 'none',
                restrictions: result.restrictions || [],
                lastChecked: new Date().toISOString(),
              }
            : e
        )
      );

      showSuccess('Access status refreshed');
    } catch (error: any) {
      console.error('Failed to refresh access:', error);
      showError('Failed to refresh access status');
    }
  };

  const handleViewDetails = (entry: AccessControlEntry) => {
    setSelectedEntry(entry);
    setShowChecker(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'granted':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'denied':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'granted':
        return 'bg-green-100 text-green-800';
      case 'denied':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAccessLevelIcon = (level: string) => {
    switch (level) {
      case 'full':
        return <Unlock className="h-4 w-4 text-green-500" />;
      case 'partial':
        return <Key className="h-4 w-4 text-yellow-500" />;
      case 'none':
        return <Lock className="h-4 w-4 text-red-500" />;
      default:
        return <Lock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Access Control Management</h1>
                <p className="text-gray-600">Monitor and manage service access permissions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients or services..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Status Filter */}
              <div className="relative">
                <Filter className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="granted">Granted</option>
                  <option value="denied">Denied</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={loadAccessControlData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Access Control Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Access Control Entries ({filteredEntries.length})
            </h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Access Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Checked
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <div>
                            <p className="font-medium text-gray-900">{entry.clientName}</p>
                            <p className="text-sm text-gray-500">ID: {entry.clientId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-medium text-gray-900">{entry.serviceName}</p>
                        <p className="text-sm text-gray-500">{entry.serviceCode}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getAccessLevelIcon(entry.accessLevel)}
                          <span className="capitalize">{entry.accessLevel}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className={`h-2 rounded-full ${
                                entry.paymentPercentage >= 80
                                  ? 'bg-green-500'
                                  : entry.paymentPercentage >= 50
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(entry.paymentPercentage, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">
                            {entry.paymentPercentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(entry.status)}
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}
                          >
                            {entry.status.toUpperCase()}
                          </span>
                        </div>
                        {entry.restrictions.length > 0 && (
                          <p className="text-xs text-red-600 mt-1">{entry.restrictions[0]}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(entry.lastChecked).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewDetails(entry)}
                            className="text-blue-600 hover:text-blue-800"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRefreshAccess(entry)}
                            className="text-gray-600 hover:text-gray-800"
                            title="Refresh Access"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredEntries.length === 0 && (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Access Entries Found</h3>
              <p className="text-gray-600">No access control entries match your current filters.</p>
            </div>
          )}
        </div>

        {/* Access Control Checker Modal */}
        {showChecker && selectedEntry && (
          <AccessControlChecker
            clientId={selectedEntry.clientId}
            serviceCode={selectedEntry.serviceCode}
            serviceName={selectedEntry.serviceName}
            showModal={true}
            onClose={() => {
              setShowChecker(false);
              setSelectedEntry(null);
            }}
            onAccessGranted={() => console.log('Access granted')}
            onAccessDenied={reason => console.log('Access denied:', reason)}
          />
        )}
      </div>
    </div>
  );
};

export default AccessControlPage;
