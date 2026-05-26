import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';
import {
  useStaffPayInfo,
  useSalaryComponents,
  useAssignComponentToStaff,
  useUpdateStaffPayInfo,
  useRemoveComponentFromStaff,
  usePayComponentRemovals,
  useCreatePayComponentRemoval,
} from '../../hooks/useSalaryComponents';
import hrService from '../../services/hrService';
import { useQuery } from '@tanstack/react-query';
import { SalaryComponent, StaffPayInfo } from '../../types/salaryComponent';

interface AssignComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: number;
  existingComponents: StaffPayInfo[];
}

const AssignComponentModal: React.FC<AssignComponentModalProps> = ({
  isOpen,
  onClose,
  staffId,
  existingComponents,
}) => {
  const [selectedComponent, setSelectedComponent] = useState<number | ''>('');
  const [amount, setAmount] = useState('');

  const { data: componentsData } = useSalaryComponents();
  const assignMutation = useAssignComponentToStaff();

  const availableComponents =
    componentsData?.results?.filter(
      component => !existingComponents.some(existing => existing.component.id === component.id)
    ) || [];

  const selectedComponentData = componentsData?.results?.find(c => c.id === selectedComponent);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedComponent && amount) {
      assignMutation.mutate(
        {
          staff: staffId,
          component: selectedComponent as number,
          amount,
        },
        {
          onSuccess: () => {
            onClose();
            setSelectedComponent('');
            setAmount('');
          },
        }
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Assign Component</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="assign-component"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Component
            </label>
            <select
              id="assign-component"
              value={selectedComponent}
              onChange={e => {
                setSelectedComponent(e.target.value ? parseInt(e.target.value) : '');
                const component = componentsData?.results?.find(
                  c => c.id === parseInt(e.target.value)
                );
                if (component) {
                  setAmount(component.default_amount);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a component</option>
              {availableComponents.map(component => (
                <option key={component.id} value={component.id}>
                  {component.name} ({component.component_type})
                  {component.component_type === 'EARNING' &&
                    (component.is_taxable ? ' — Taxable' : ' — Non-Taxable')}
                </option>
              ))}
            </select>
            {selectedComponentData && selectedComponentData.component_type === 'EARNING' && (
              <p
                className={`text-xs mt-1 font-medium ${
                  selectedComponentData.is_taxable ? 'text-orange-600' : 'text-blue-600'
                }`}
              >
                {selectedComponentData.is_taxable
                  ? '⚠ Taxable — included in PAYE income calculation'
                  : '✓ Non-Taxable — excluded from PAYE, included in pension gross'}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="assign-amount" className="block text-sm font-medium text-gray-700 mb-2">
              Amount (NGN)
            </label>
            <input
              id="assign-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
            {selectedComponentData && (
              <p className="text-sm text-gray-500 mt-1">
                Default:{' '}
                {new Intl.NumberFormat('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                }).format(parseFloat(selectedComponentData.default_amount))}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={assignMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Assign Component
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface EditAmountModalProps {
  isOpen: boolean;
  onClose: () => void;
  payInfo: StaffPayInfo;
  staffId: number;
}

const EditAmountModal: React.FC<EditAmountModalProps> = ({ isOpen, onClose, payInfo, staffId }) => {
  const [amount, setAmount] = useState(payInfo.amount);
  const updateMutation = useUpdateStaffPayInfo();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(
      {
        id: payInfo.id,
        amount,
        staffId,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Edit Amount</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Component</label>
            <p className="text-gray-900 font-medium">{payInfo.component.name}</p>
            <p className="text-sm text-gray-500">{payInfo.component.component_type}</p>
          </div>

          <div>
            <label htmlFor="edit-amount" className="block text-sm font-medium text-gray-700 mb-2">
              Amount (NGN)
            </label>
            <input
              id="edit-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Update Amount
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const StaffPayComponentsPage: React.FC = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingPayInfo, setEditingPayInfo] = useState<StaffPayInfo | null>(null);
  const [removalTarget, setRemovalTarget] = useState<StaffPayInfo | null>(null);
  const [removalReason, setRemovalReason] = useState('');

  // Fetch staff basic info using hrService directly (how it was working before)
  const {
    data: staff,
    isLoading: isLoadingStaff,
    error: staffError,
  } = useQuery({
    queryKey: ['staff', staffId],
    queryFn: () => hrService.getStaffMember(staffId!),
    enabled: Boolean(staffId),
  });

  // Fetch staff pay info using the correct endpoint: GET /api/hr/staff-pay-info/?staff=1
  const {
    data: payInfoData,
    isLoading: isLoadingPayInfo,
    error: payInfoError,
  } = useStaffPayInfo(staffId || '');

  // Fetch salary components to get component details
  const { data: componentsData } = useSalaryComponents();

  const removeMutation = useRemoveComponentFromStaff();
  const createRemovalMutation = useCreatePayComponentRemoval();

  // Fetch pending removal requests for this staff so we can badge the affected components
  const parsedStaffId = staff?.id || 0;
  const { data: pendingRemovalsData } = usePayComponentRemovals({
    status: 'PENDING',
    staff: staffId,
  });
  const pendingRemovalPayInfoIds = new Set<number>(
    (pendingRemovalsData?.results ?? []).map(r => r.staff_pay_info)
  );

  const isLoading = isLoadingStaff || isLoadingPayInfo;
  const error = staffError || payInfoError;

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const handleRemoveComponent = (payInfo: StaffPayInfo) => {
    setRemovalReason('');
    setRemovalTarget(payInfo);
  };

  const handleSubmitRemovalRequest = () => {
    if (!removalTarget || !removalReason.trim()) return;
    createRemovalMutation.mutate(
      { staff_pay_info: removalTarget.id, reason: removalReason.trim() },
      {
        onSuccess: () => {
          setRemovalTarget(null);
          setRemovalReason('');
        },
      }
    );
  };

  // Transform raw pay info data using salary components data
  const transformPayInfoData = () => {
    if (!payInfoData?.results || !componentsData?.results) return [];

    // Create a map of component ID to component details
    const componentsMap = new Map();
    componentsData.results.forEach((comp: SalaryComponent) => {
      componentsMap.set(comp.id, comp);
    });

    // Transform the raw pay info data
    return payInfoData.results.map((item: any) => {
      const componentDetails = componentsMap.get(item.component);

      return {
        id: item.id,
        staff: item.staff,
        component: {
          id: item.component,
          name: componentDetails?.name || item.component_name,
          component_type: componentDetails?.component_type || 'EARNING',
          default_amount: componentDetails?.default_amount || item.amount,
          created_at: componentDetails?.created_at || item.created_at,
        },
        amount: item.amount,
      } as StaffPayInfo;
    });
  };

  // Use transformed pay info data
  const transformedPayInfo = transformPayInfoData();
  const earnings = transformedPayInfo.filter(p => p.component.component_type === 'EARNING') || [];
  const deductions =
    transformedPayInfo.filter(p => p.component.component_type === 'DEDUCTION') || [];

  const totalEarnings = earnings.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalDeductions = deductions.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const netPay = totalEarnings - totalDeductions;

  // Payroll estimate computations
  const taxableEarnings = earnings
    .filter(p => p.component.is_taxable !== false)
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const nonTaxableEarnings = totalEarnings - taxableEarnings;
  const estimatedPension = totalEarnings * 0.08; // employee 8% on gross
  const estimatedEmployerPension = totalEarnings * 0.1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Failed to load staff information</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          aria-label="Back to staff"
          onClick={() => navigate('/hr/staff')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Pay Components</h1>
          <p className="text-gray-600">
            {staff.staff_id ? `${staff.staff_id} • ` : ''}
            {staff.first_name} {staff.last_name} - {staff.position}
          </p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Assign Component
        </button>
      </div>

      {/* Staff Info Card */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-4">
          {staff.photo && (
            <img
              src={staff.photo}
              alt={`${staff.first_name} ${staff.last_name}`}
              className="w-16 h-16 rounded-full object-cover"
            />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {staff.staff_id ? `${staff.staff_id} • ` : ''}
              {staff.first_name} {staff.last_name}
            </h2>
            <p className="text-gray-600">{staff.position}</p>
            <p className="text-gray-500">{staff.department}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Earnings</p>
              <p className="text-xl font-semibold text-green-600">
                {formatCurrency(totalEarnings.toString())}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Deductions</p>
              <p className="text-xl font-semibold text-red-600">
                {formatCurrency(totalDeductions.toString())}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Net Pay</p>
              <p className="text-xl font-semibold text-blue-600">
                {formatCurrency(netPay.toString())}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings Section */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b bg-green-50">
          <h3 className="text-lg font-semibold text-green-800 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Earnings ({earnings.length})
          </h3>
        </div>
        <div className="p-6">
          {earnings.length > 0 ? (
            <div className="space-y-3">
              {earnings.map(payInfo => (
                <div
                  key={payInfo.id}
                  className="flex items-center justify-between p-4 border border-green-200 rounded-lg bg-green-50"
                >
                  <div>
                    <h4 className="font-medium text-gray-900">{payInfo.component.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      {payInfo.component.is_taxable !== false ? (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                          Taxable
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          Non-Taxable
                        </span>
                      )}
                      {pendingRemovalPayInfoIds.has(payInfo.id) && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock className="h-3 w-3" />
                          Removal Pending
                        </span>
                      )}
                      {payInfo.component.description && (
                        <span className="text-xs text-gray-500 truncate max-w-xs">
                          {payInfo.component.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-green-600">
                      {formatCurrency(payInfo.amount)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingPayInfo(payInfo)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                        title="Edit amount"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveComponent(payInfo)}
                        disabled={pendingRemovalPayInfoIds.has(payInfo.id)}
                        className={`p-1 rounded ${pendingRemovalPayInfoIds.has(payInfo.id) ? 'text-yellow-500 cursor-not-allowed opacity-60' : 'text-red-600 hover:bg-red-100'}`}
                        title={
                          pendingRemovalPayInfoIds.has(payInfo.id)
                            ? 'Removal already pending approval'
                            : 'Request removal'
                        }
                      >
                        {pendingRemovalPayInfoIds.has(payInfo.id) ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No earning components assigned</p>
          )}
        </div>
      </div>

      {/* Deductions Section */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b bg-red-50">
          <h3 className="text-lg font-semibold text-red-800 flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Deductions ({deductions.length})
          </h3>
        </div>
        <div className="p-6">
          {deductions.length > 0 ? (
            <div className="space-y-3">
              {deductions.map(payInfo => (
                <div
                  key={payInfo.id}
                  className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50"
                >
                  <div>
                    <h4 className="font-medium text-gray-900">{payInfo.component.name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Deduction
                      </span>
                      {pendingRemovalPayInfoIds.has(payInfo.id) && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock className="h-3 w-3" />
                          Removal Pending
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-red-600">
                      {formatCurrency(payInfo.amount)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingPayInfo(payInfo)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                        title="Edit amount"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveComponent(payInfo)}
                        disabled={pendingRemovalPayInfoIds.has(payInfo.id)}
                        className={`p-1 rounded ${pendingRemovalPayInfoIds.has(payInfo.id) ? 'text-yellow-500 cursor-not-allowed opacity-60' : 'text-red-600 hover:bg-red-100'}`}
                        title={
                          pendingRemovalPayInfoIds.has(payInfo.id)
                            ? 'Removal already pending approval'
                            : 'Request removal'
                        }
                      >
                        {pendingRemovalPayInfoIds.has(payInfo.id) ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No deduction components assigned</p>
          )}
        </div>
      </div>

      {/* Payroll Estimate */}
      {earnings.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b bg-indigo-50">
            <h3 className="text-lg font-semibold text-indigo-800">Payroll Estimate</h3>
            <p className="text-xs text-indigo-600">
              Based on currently assigned components. Final amounts are calculated when payroll is
              processed.
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Gross Pay</span>
                <span className="font-semibold">{formatCurrency(totalEarnings.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 flex items-center gap-1">
                  Taxable Income
                  <span className="px-1 rounded text-xs bg-orange-100 text-orange-700">
                    PAYE basis
                  </span>
                </span>
                <span className="font-medium text-orange-700">
                  {formatCurrency(taxableEarnings.toString())}
                </span>
              </div>
              {nonTaxableEarnings > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    Non-Taxable Allowances
                    <span className="px-1 rounded text-xs bg-blue-100 text-blue-700">Exempt</span>
                  </span>
                  <span className="font-medium text-blue-700">
                    {formatCurrency(nonTaxableEarnings.toString())}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Employee Pension (8%)</span>
                <span className="font-medium text-red-600">
                  – {formatCurrency(estimatedPension.toFixed(2))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Employer Pension (10%)</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(estimatedEmployerPension.toFixed(2))}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-500 text-xs">
                  PAYE is calculated using Nigerian tiered bands when payroll runs
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AssignComponentModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        staffId={parsedStaffId}
        existingComponents={transformedPayInfo}
      />

      {editingPayInfo && (
        <EditAmountModal
          isOpen={true}
          onClose={() => setEditingPayInfo(null)}
          payInfo={editingPayInfo}
          staffId={parsedStaffId}
        />
      )}

      {/* Request Removal Modal */}
      {removalTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-1 text-red-700">Request Component Removal</h3>
            <p className="text-sm text-gray-600 mb-4">
              Removing <strong>{removalTarget.component.name}</strong> from this staff member's pay
              structure requires approval. The component will remain active until an authorised
              approver reviews and approves this request.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for removal <span className="text-red-500">*</span>
              </label>
              <textarea
                value={removalReason}
                onChange={e => setRemovalReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 text-sm"
                placeholder="e.g. Staff loan fully recovered, component no longer applicable..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemovalTarget(null);
                  setRemovalReason('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!removalReason.trim() || createRemovalMutation.isPending}
                onClick={handleSubmitRemovalRequest}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
              >
                {createRemovalMutation.isPending ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffPayComponentsPage;
