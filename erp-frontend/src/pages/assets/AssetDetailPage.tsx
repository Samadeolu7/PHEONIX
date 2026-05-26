/**
 * Fixed Asset Detail Page
 * Shows complete asset information with depreciation, maintenance, movements
 */

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  useFixedAsset,
  useAssetDepreciationSchedule,
  useAssetMaintenanceHistory,
  useDisposeAsset,
  usePostDepreciation,
  usePostMaintenance,
  useTransferAsset,
  useAssetTransfers,
  useAssetAssignmentHistory,
} from '../../hooks/useAssets';
import { accountService } from '../../services/accountService';
import type { Account } from '../../types/accounts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  ArrowLeft,
  Edit,
  TrendingDown,
  Wrench,
  MapPin,
  DollarSign,
  Calendar,
  Package,
  AlertCircle,
  CheckCircle,
  FileText,
  Gauge,
  Fuel,
  ArrowRightLeft,
  UserCheck,
  Clock,
  ClipboardList,
  Zap,
} from 'lucide-react';
import type { AssetStatus, AssetTransfer, AssetAssignment } from '../../types/assets';

const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('details');
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [disposalForm, setDisposalForm] = useState({
    disposal_date: new Date().toISOString().split('T')[0],
    disposal_amount: '',
    disposal_notes: '',
    bank_account_id: null as number | null,
  });
  const [disposalErrors, setDisposalErrors] = useState<Record<string, string>>({});

  // ── Transfer state ────────────────────────────────────────────
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    to_location: '',
    reason: '',
    notes: '',
    transfer_date: new Date().toISOString().split('T')[0],
  });
  const [transferErrors, setTransferErrors] = useState<Record<string, string>>({});

  const { data: asset, isLoading } = useFixedAsset(parseInt(id!));
  const { data: depreciationSchedule = [] } = useAssetDepreciationSchedule(parseInt(id!));
  const { data: maintenanceHistory = [] } = useAssetMaintenanceHistory(parseInt(id!));

  const disposeMutation = useDisposeAsset();
  const postDepreciationMutation = usePostDepreciation();
  const postMaintenanceMutation = usePostMaintenance();
  const transferMutation = useTransferAsset();

  const { data: assetTransfers = [] } = useAssetTransfers(parseInt(id!));
  const { data: assignmentHistory = [] } = useAssetAssignmentHistory(parseInt(id!));

  // Load all accounts when the disposal modal is open so the user can pick
  // the bank/cash account that receives disposal proceeds.
  const { data: allAccounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'all-for-disposal'],
    queryFn: () => accountService.getAccounts(),
    enabled: showDisposalModal,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="container mx-auto p-6">Loading asset details...</div>;
  }

  if (!asset) {
    return <div className="container mx-auto p-6">Asset not found</div>;
  }

  const formatCurrency = (value: string | number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(typeof value === 'string' ? parseFloat(value) : value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: AssetStatus) => {
    const variants: Record<AssetStatus, string> = {
      draft: 'bg-gray-100 text-gray-600',
      active: 'bg-green-100 text-green-800',
      idle: 'bg-yellow-100 text-yellow-800',
      maintenance: 'bg-blue-100 text-blue-800',
      disposed: 'bg-gray-100 text-gray-800',
      sold: 'bg-purple-100 text-purple-800',
    };

    const labels: Record<AssetStatus, string> = {
      draft: 'Draft — Not Yet Acquired',
      active: 'Active',
      idle: 'Idle',
      maintenance: 'Maintenance',
      disposed: 'Disposed',
      sold: 'Sold',
    };

    return <Badge className={variants[status]}>{labels[status]}</Badge>;
  };

  const handleDispose = () => {
    setDisposalForm({
      disposal_date: new Date().toISOString().split('T')[0],
      disposal_amount: '',
      disposal_notes: '',
      bank_account_id: null,
    });
    setDisposalErrors({});
    setShowDisposalModal(true);
  };

  const handleDisposalSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!disposalForm.disposal_date) {
      errors.disposal_date = 'Disposal date is required';
    }
    if (!disposalForm.disposal_amount || isNaN(parseFloat(disposalForm.disposal_amount))) {
      errors.disposal_amount = 'A valid disposal amount is required';
    }
    const proceeds = parseFloat(disposalForm.disposal_amount || '0');
    if (proceeds > 0 && !disposalForm.bank_account_id) {
      errors.bank_account_id = 'Select an account to receive the proceeds';
    }
    if (Object.keys(errors).length > 0) {
      setDisposalErrors(errors);
      return;
    }
    await disposeMutation.mutateAsync({
      id: asset!.id,
      data: {
        disposal_date: disposalForm.disposal_date,
        disposal_amount: disposalForm.disposal_amount,
        disposal_notes: disposalForm.disposal_notes,
        ...(proceeds > 0 && disposalForm.bank_account_id
          ? { bank_account_id: disposalForm.bank_account_id }
          : {}),
      },
    });
    setShowDisposalModal(false);
  };

  const handlePostDepreciation = async (depId: number) => {
    if (!confirm('Post this depreciation entry to the General Ledger?')) return;
    await postDepreciationMutation.mutateAsync(depId);
  };

  const handlePostMaintenance = async (maintId: number) => {
    if (!confirm('Post this maintenance cost to the General Ledger?')) return;
    await postMaintenanceMutation.mutateAsync(maintId);
  };

  const handleTransferOpen = () => {
    setTransferForm({
      to_location: asset?.current_location || '',
      reason: '',
      notes: '',
      transfer_date: new Date().toISOString().split('T')[0],
    });
    setTransferErrors({});
    setShowTransferModal(true);
  };

  const handleTransferSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!transferForm.to_location.trim()) errors.to_location = 'Destination location is required';
    if (!transferForm.transfer_date) errors.transfer_date = 'Transfer date is required';
    if (Object.keys(errors).length > 0) {
      setTransferErrors(errors);
      return;
    }
    await transferMutation.mutateAsync({
      id: asset!.id,
      data: {
        to_location: transferForm.to_location,
        reason: transferForm.reason || undefined,
        notes: transferForm.notes || undefined,
        transfer_date: transferForm.transfer_date,
      },
    });
    setShowTransferModal(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/assets')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{asset.asset_number}</h1>
              {getStatusBadge(asset.status)}
            </div>
            <p className="text-gray-600 mt-1">{asset.name}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link to="/assets/fuel-monitor">
            <Button variant="outline">
              <Gauge className="h-4 w-4 mr-2" />
              Fuel Monitor
            </Button>
          </Link>
          <Link to={`/expenses/resource-consumption/create?asset_id=${asset.id}`}>
            <Button variant="outline">
              <Fuel className="h-4 w-4 mr-2" />
              Log Consumption
            </Button>
          </Link>
          <Link to={`/assets/${asset.id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit Asset
            </Button>
          </Link>
          {asset.status !== 'disposed' && (
            <Button variant="outline" onClick={handleTransferOpen}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer Asset
            </Button>
          )}
          {asset.status !== 'disposed' && (
            <Button variant="destructive" onClick={() => navigate(`/assets/${asset.id}/dispose`)}>
              Dispose Asset
            </Button>
          )}
        </div>
      </div>
      {/* Draft asset banner */}
      {asset.status === 'draft' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <ClipboardList className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-blue-800 text-sm">Registered — Not Yet Purchased</p>
            <p className="text-blue-700 text-sm mt-1">
              This asset exists in the system as a shell record with no financial value. To give it
              a purchase price and activate it, raise an <strong>Asset Purchase</strong>, assign
              this asset to a line, add a supplier and price, get approval, then
              <strong> Activate</strong>.
            </p>
          </div>
          <Link to="/assets/purchases/new">
            <Button size="sm" variant="outline" className="shrink-0 border-blue-300 text-blue-700">
              <Zap className="w-3.5 h-3.5 mr-1" />
              New Purchase
            </Button>
          </Link>
        </div>
      )}
      {/* Incomplete details banner — shown for skeleton assets created via acquisition */}
      {!asset.serial_number &&
        !asset.registration_number &&
        !asset.make &&
        asset.status !== 'disposed' &&
        asset.status !== 'sold' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm">Asset details incomplete</p>
              <p className="text-amber-700 text-sm mt-1">
                This asset is missing its serial number, registration/plate number, and make/model.
                These are usually filled in after an acquisition is posted — please edit to complete
                the record.
              </p>
            </div>
            <Link to={`/assets/${asset.id}/edit`}>
              <Button size="sm" variant="outline" className="shrink-0">
                Complete details
              </Button>
            </Link>
          </div>
        )}
      {/* Key Metrics — only when asset has been financially activated */}
      {asset.status !== 'draft' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <DollarSign className="h-4 w-4 mr-2" />
                Purchase Price
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(asset.purchase_price)}</div>
              <p className="text-xs text-gray-500 mt-1">{formatDate(asset.purchase_date)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <TrendingDown className="h-4 w-4 mr-2" />
                Book Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(asset.current_value)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {(
                  (parseFloat(asset.current_value) / parseFloat(asset.purchase_price)) *
                  100
                ).toFixed(1)}
                % of original
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Depreciation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(asset.accumulated_depreciation)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Accumulated to date</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                <Wrench className="h-4 w-4 mr-2" />
                Maintenance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{maintenanceHistory.length}</div>
              <p className="text-xs text-gray-500 mt-1">Total records</p>
            </CardContent>
          </Card>
        </div>
      )}{' '}
      {/* end non-draft Key Metrics */}
      {/* Tabbed Content */}
      <div className="space-y-4">
        {/* Custom Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'details', label: 'Details' },
              { id: 'depreciation', label: 'Depreciation Schedule' },
              { id: 'maintenance', label: 'Maintenance History' },
              {
                id: 'transfers',
                label: `Transfers${assetTransfers.length > 0 ? ` (${assetTransfers.length})` : ''}`,
              },
              { id: 'assignments', label: 'Assignment History' },
              { id: 'location', label: 'Location & Movement' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <Card>
              <CardHeader>
                <CardTitle>Asset Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Asset Number (FAR ID)</p>
                      <p className="font-medium">{asset.asset_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Category</p>
                      <p className="font-medium">{asset.category_details?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Serial Number</p>
                      <p className="font-medium">{asset.serial_number || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Registration Number</p>
                      <p className="font-medium">{asset.registration_number || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Make/Model</p>
                      <p className="font-medium">
                        {asset.make && asset.model ? `${asset.make} ${asset.model}` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Year</p>
                      <p className="font-medium">{asset.year || 'N/A'}</p>
                    </div>
                    {asset.registered_at && (
                      <div>
                        <p className="text-sm text-gray-600">Registered On</p>
                        <p className="font-medium">{formatDate(asset.registered_at)}</p>
                      </div>
                    )}
                    {asset.depreciation_batch_id && (
                      <div>
                        <p className="text-sm text-gray-600">Depreciation Batch</p>
                        <p className="font-medium font-mono text-xs">
                          {asset.depreciation_batch_id}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Financial Information</h3>
                  {asset.status === 'draft' ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
                      <ClipboardList className="w-4 h-4 inline mr-1.5 opacity-70" />
                      No financial data yet — price will be set when the asset is activated via a
                      purchase.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Purchase Date</p>
                        <p className="font-medium">
                          {asset.purchase_date ? formatDate(asset.purchase_date) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Purchase Price</p>
                        <p className="font-medium">
                          {asset.purchase_price ? formatCurrency(asset.purchase_price) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Salvage Value</p>
                        <p className="font-medium">{formatCurrency(asset.salvage_value)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Current Value</p>
                        <p className="font-medium">{formatCurrency(asset.current_value)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Depreciation Settings */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Depreciation Settings</h3>
                  {asset.status === 'draft' ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
                      <ClipboardList className="w-4 h-4 inline mr-1.5 opacity-70" />
                      Depreciation will be configured when the asset is activated.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Method</p>
                        <p className="font-medium capitalize">
                          {(asset.depreciation_method || '').replace('_', ' ') || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Useful Life</p>
                        <p className="font-medium">{asset.useful_life_years} years</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Depreciation Start Date</p>
                        <p className="font-medium">
                          {asset.depreciation_start_date
                            ? formatDate(asset.depreciation_start_date)
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Accumulated Depreciation</p>
                        <p className="font-medium text-red-600">
                          {formatCurrency(asset.accumulated_depreciation)}
                        </p>
                      </div>
                    </div>
                  )}{' '}
                  {/* end non-draft depreciation settings */}
                </div>

                {/* Description */}
                {asset.description && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Description</h3>
                    <p className="text-gray-700">{asset.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Depreciation Schedule Tab */}
          {activeTab === 'depreciation' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Depreciation Schedule</CardTitle>
                    <CardDescription>{depreciationSchedule.length} entries</CardDescription>
                  </div>
                  <Button>
                    <FileText className="h-4 w-4 mr-2" />
                    Run Depreciation
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {asset.status === 'draft' ? (
                  <div className="flex flex-col items-center py-12 text-center gap-3">
                    <ClipboardList className="w-10 h-10 text-gray-300" />
                    <p className="font-medium text-gray-500">No depreciation schedule yet</p>
                    <p className="text-sm text-gray-400 max-w-sm">
                      Depreciation will begin once this asset is activated (purchase price and
                      method are set during the purchase activation step).
                    </p>
                  </div>
                ) : depreciationSchedule.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No depreciation entries yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Period
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Amount
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {depreciationSchedule.map(entry => (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 text-sm">
                              {formatDate(entry.period_start)} - {formatDate(entry.period_end)}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {formatCurrency(entry.depreciation_amount)}
                            </td>
                            <td className="px-4 py-3">
                              {entry.is_posted ? (
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Posted
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-800">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Not Posted
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {!entry.is_posted && (
                                <Button size="sm" onClick={() => handlePostDepreciation(entry.id)}>
                                  Post to GL
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Maintenance History Tab */}
          {activeTab === 'maintenance' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Maintenance History</CardTitle>
                    <CardDescription>{maintenanceHistory.length} records</CardDescription>
                  </div>
                  <Button>
                    <Wrench className="h-4 w-4 mr-2" />
                    Add Maintenance
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {maintenanceHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No maintenance records yet</div>
                ) : (
                  <div className="space-y-4">
                    {maintenanceHistory.map(record => (
                      <div key={record.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">
                                {record.maintenance_type.replace('_', ' ')}
                              </span>
                              <span className="text-sm text-gray-500">
                                {formatDate(record.maintenance_date)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{record.description}</p>
                            {record.performed_by && (
                              <p className="text-xs text-gray-500 mt-1">
                                Performed by: {record.performed_by}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{formatCurrency(record.cost)}</div>
                            {!record.is_posted && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2"
                                onClick={() => handlePostMaintenance(record.id)}
                              >
                                Post to GL
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Transfers Tab */}
          {activeTab === 'transfers' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Transfer History</CardTitle>
                    <CardDescription>{assetTransfers.length} transfer record(s)</CardDescription>
                  </div>
                  {asset.status !== 'disposed' && (
                    <Button onClick={handleTransferOpen}>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transfer Asset
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {assetTransfers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No transfer records yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            From
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            To
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Reason
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            By
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(assetTransfers as AssetTransfer[]).map(t => (
                          <tr key={t.id}>
                            <td className="px-4 py-3 text-sm">{formatDate(t.transfer_date)}</td>
                            <td className="px-4 py-3 text-sm">{t.from_location || '—'}</td>
                            <td className="px-4 py-3 text-sm font-medium">{t.to_location}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{t.reason || '—'}</td>
                            <td className="px-4 py-3 text-sm">{t.transferred_by_name || '—'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                  t.status === 'acknowledged'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {t.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Assignment History Tab */}
          {activeTab === 'assignments' && (
            <Card>
              <CardHeader>
                <CardTitle>Assignment History</CardTitle>
                <CardDescription>Staff custody and location changes</CardDescription>
              </CardHeader>
              <CardContent>
                {assignmentHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No assignment records yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Staff
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Location
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Assigned
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Returned
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(assignmentHistory as AssetAssignment[]).map(a => (
                          <tr key={a.id} className={a.is_current ? 'bg-blue-50' : ''}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <UserCheck className="h-4 w-4 text-gray-400" />
                                <span className="text-sm font-medium">{a.staff_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{a.location || '—'}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(a.assigned_date)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {a.unassigned_date ? formatDate(a.unassigned_date) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {a.is_current ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  <Clock className="h-3 w-3" /> Current
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                  Returned
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Location & Movement Tab */}
          {activeTab === 'location' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Location & Assignment</CardTitle>
                  <Button>
                    <MapPin className="h-4 w-4 mr-2" />
                    Update Location
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <MapPin className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-1">Current Location</div>
                      <div className="text-lg">{asset.current_location || 'Not set'}</div>
                      {asset.assigned_to && (
                        <div className="text-sm text-gray-600 mt-2">
                          Assigned to: {asset.assigned_to}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>

                  {/* Movement history would go here */}
                  <div className="text-sm text-gray-500">
                    Movement tracking history will appear here
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {/* ── Disposal Modal ───────────────────────────────────────── */}
      {showDisposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Dispose Asset</h2>
              <button
                aria-label="Close modal"
                onClick={() => setShowDisposalModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You are about to dispose of <strong>{asset.asset_number}</strong> — {asset.name}.{' '}
                  This will mark the asset as disposed and post the disposal journal entry.
                </AlertDescription>
              </Alert>

              {/* Disposal Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Disposal Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  aria-label="Disposal date"
                  value={disposalForm.disposal_date}
                  onChange={e => setDisposalForm(f => ({ ...f, disposal_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {disposalErrors.disposal_date && (
                  <p className="mt-1 text-sm text-red-600">{disposalErrors.disposal_date}</p>
                )}
              </div>

              {/* Proceeds Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Disposal Proceeds <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={disposalForm.disposal_amount}
                  onChange={e =>
                    setDisposalForm(f => ({
                      ...f,
                      disposal_amount: e.target.value,
                      bank_account_id: null,
                    }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {disposalErrors.disposal_amount && (
                  <p className="mt-1 text-sm text-red-600">{disposalErrors.disposal_amount}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Enter 0 if the asset is being scrapped with no proceeds.
                </p>
              </div>

              {/* Bank/Cash Account — only when proceeds > 0 */}
              {parseFloat(disposalForm.disposal_amount || '0') > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Receiving Account (Bank / Cash) <span className="text-red-500">*</span>
                  </label>
                  <select
                    aria-label="Receiving account"
                    value={disposalForm.bank_account_id ?? ''}
                    onChange={e =>
                      setDisposalForm(f => ({
                        ...f,
                        bank_account_id: e.target.value ? parseInt(e.target.value) : null,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select account —</option>
                    {allAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code ? `${acc.code} — ` : ''}
                        {acc.name}
                      </option>
                    ))}
                  </select>
                  {disposalErrors.bank_account_id && (
                    <p className="mt-1 text-sm text-red-600">{disposalErrors.bank_account_id}</p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={3}
                  placeholder="Optional disposal notes…"
                  value={disposalForm.disposal_notes}
                  onChange={e => setDisposalForm(f => ({ ...f, disposal_notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowDisposalModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisposalSubmit}
                disabled={disposeMutation.isPending}
              >
                {disposeMutation.isPending ? 'Processing…' : 'Confirm Disposal'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Transfer Asset Modal ─────────────────────────────── */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                Transfer Asset
              </h2>
              <button
                aria-label="Close modal"
                onClick={() => setShowTransferModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Transferring <strong>{asset.asset_number}</strong> — {asset.name}
              </p>

              {/* Transfer Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transfer Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  aria-label="Transfer date"
                  value={transferForm.transfer_date}
                  onChange={e => setTransferForm(f => ({ ...f, transfer_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {transferErrors.transfer_date && (
                  <p className="mt-1 text-sm text-red-600">{transferErrors.transfer_date}</p>
                )}
              </div>

              {/* Destination Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destination Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Block B, Office 3"
                  aria-label="Destination location"
                  value={transferForm.to_location}
                  onChange={e => setTransferForm(f => ({ ...f, to_location: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {transferErrors.to_location && (
                  <p className="mt-1 text-sm text-red-600">{transferErrors.to_location}</p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  placeholder="Reason for transfer"
                  aria-label="Transfer reason"
                  value={transferForm.reason}
                  onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  aria-label="Transfer notes"
                  placeholder="Additional notes…"
                  value={transferForm.notes}
                  onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowTransferModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleTransferSubmit} disabled={transferMutation.isPending}>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                {transferMutation.isPending ? 'Transferring…' : 'Confirm Transfer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetDetailPage;
