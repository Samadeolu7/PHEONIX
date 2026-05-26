import React, { useState } from 'react';
import { X, Calendar, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { useInitializeLeaveBalances } from '../../hooks/useLeaveBalances';
import { useAllStaff } from '../../hooks/useStaff';

interface LeaveBalanceInitializationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentYear: number;
}

const LeaveBalanceInitializationModal: React.FC<LeaveBalanceInitializationModalProps> = ({
  isOpen,
  onClose,
  currentYear,
}) => {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedStaffIds, setSelectedStaffIds] = useState<number[]>([]);
  const [initializeForAllStaff, setInitializeForAllStaff] = useState(true);

  const { data: staffData } = useAllStaff();
  const initializeMutation = useInitializeLeaveBalances();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      year: selectedYear,
      staff_ids: initializeForAllStaff ? undefined : selectedStaffIds,
    };

    initializeMutation.mutate(data, {
      onSuccess: () => {
        onClose();
        setSelectedStaffIds([]);
        setInitializeForAllStaff(true);
      },
    });
  };

  const handleStaffToggle = (staffId: number) => {
    setSelectedStaffIds(prev =>
      prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
    );
  };

  const handleSelectAll = () => {
    if (selectedStaffIds.length === staffData?.length) {
      setSelectedStaffIds([]);
    } else {
      setSelectedStaffIds(staffData?.map(staff => staff.id) || []);
    }
  };

  if (!isOpen) return null;

  const availableYears = [currentYear - 1, currentYear, currentYear + 1];
  const staffList = staffData || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Initialize Leave Balances</h2>
              <p className="text-sm text-gray-600">Set up leave entitlements for the year</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Year Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {availableYears.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Staff Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Staff Selection</label>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="all-staff"
                  name="staff-selection"
                  checked={initializeForAllStaff}
                  onChange={() => setInitializeForAllStaff(true)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <label htmlFor="all-staff" className="ml-2 text-sm text-gray-700">
                  Initialize for all active staff ({staffList.length} staff members)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="radio"
                  id="selected-staff"
                  name="staff-selection"
                  checked={!initializeForAllStaff}
                  onChange={() => setInitializeForAllStaff(false)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <label htmlFor="selected-staff" className="ml-2 text-sm text-gray-700">
                  Initialize for selected staff only
                </label>
              </div>
            </div>
          </div>

          {/* Staff List (when specific selection is chosen) */}
          {!initializeForAllStaff && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">
                  Select Staff Members ({selectedStaffIds.length} selected)
                </span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {selectedStaffIds.length === staffList.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {staffList.map(staff => (
                  <div key={staff.id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`staff-${staff.id}`}
                      checked={selectedStaffIds.includes(staff.id)}
                      onChange={() => handleStaffToggle(staff.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`staff-${staff.id}`} className="ml-2 text-sm text-gray-700">
                      {staff.full_name} - {staff.department || 'No Department'}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning Message */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-yellow-800">Important Notes</h4>
                <ul className="mt-1 text-sm text-yellow-700 space-y-1">
                  <li>• This will create leave balance records for all leave types</li>
                  <li>• Existing balances for the selected year will not be duplicated</li>
                  <li>• Default entitlements will be set based on leave type configurations</li>
                  <li>
                    • Carryover from previous year will be calculated automatically (if applicable)
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {initializeMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-800">Initialization Failed</h4>
                  <p className="mt-1 text-sm text-red-700">
                    {initializeMutation.error?.response?.data?.message ||
                      'An error occurred while initializing leave balances'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success Display */}
          {initializeMutation.isSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-green-800">Initialization Successful</h4>
                  <p className="mt-1 text-sm text-green-700">
                    Leave balances have been successfully initialized for {selectedYear}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                initializeMutation.isPending ||
                (!initializeForAllStaff && selectedStaffIds.length === 0)
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {initializeMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Initializing...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  Initialize Balances
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeaveBalanceInitializationModal;
