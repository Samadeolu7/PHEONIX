// Payroll Form Page - Create new payroll period
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Calendar, DollarSign, Users, FileText } from 'lucide-react';
import { PayrollForm } from '../../components/hr/PayrollForm';
import { PersonnelChangesReport } from '../../components/hr/PersonnelChangesReport';
import { hrService } from '../../services/hrService';
import { useToast } from '../../hooks/useToast';
import { Payroll, CreatePayrollData, UpdatePayrollData, PayrollStatus } from '../../types/hr';

const PayrollFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { success, error: showError } = useToast();

  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [showPersonnelReport, setShowPersonnelReport] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreatePayrollData>({
    period_start: '',
    period_end: '',
    pay_date: '',
    status: PayrollStatus.DRAFT,
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load payroll record for editing
  useEffect(() => {
    if (isEdit && id) {
      loadPayroll();
    } else {
      // Set default dates for new payroll
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const payDate = new Date(today.getFullYear(), today.getMonth(), 27); // 27th of current month

      setFormData({
        period_start: firstDayOfMonth.toISOString().split('T')[0],
        period_end: lastDayOfMonth.toISOString().split('T')[0],
        pay_date: payDate.toISOString().split('T')[0],
        status: PayrollStatus.DRAFT,
        notes: '',
      });
    }
  }, [isEdit, id]);

  const loadPayroll = async () => {
    try {
      setInitialLoading(true);
      const response = await hrService.getPayroll(Number(id));
      setPayroll(response);

      // Populate form with existing data
      setFormData({
        period_start: response.period_start,
        period_end: response.period_end,
        pay_date: response.pay_date,
        status: response.status || PayrollStatus.DRAFT,
        notes: response.notes || '',
      });
    } catch (error) {
      console.error('Error loading payroll:', error);

      showError(error.response?.data?.error || 'Failed to load payroll record');
      // showToast('Failed to load payroll record', 'error');
      navigate('/hr/payroll');
    } finally {
      setInitialLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.period_start) {
      newErrors.period_start = 'Period start date is required';
    }

    if (!formData.period_end) {
      newErrors.period_end = 'Period end date is required';
    }

    if (!formData.pay_date) {
      newErrors.pay_date = 'Pay date is required';
    }

    // Validate date logic
    if (formData.period_start && formData.period_end) {
      const startDate = new Date(formData.period_start);
      const endDate = new Date(formData.period_end);

      if (endDate <= startDate) {
        newErrors.period_end = 'Period end date must be after start date';
      }
    }

    if (formData.period_end && formData.pay_date) {
      const endDate = new Date(formData.period_end);
      const payDate = new Date(formData.pay_date);

      if (payDate < endDate) {
        newErrors.pay_date = 'Pay date should be after period end date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      if (isEdit && id) {
        const updateData: UpdatePayrollData = { ...formData };
        await hrService.updatePayroll(Number(id), updateData);
        success('Payroll updated successfully');
        // showToast('Payroll updated successfully', 'success');
        // Small delay to ensure toast is visible before navigation
        setTimeout(() => navigate('/hr/payroll'), 1500);
      } else {
        await hrService.createPayroll(formData);
        success('Payroll created successfully');
        // Small delay to ensure toast is visible before navigation
        setTimeout(() => navigate('/hr/payroll'), 1500);
      }
    } catch (error: any) {
      console.error('Error saving payroll:', error);

      // Handle validation errors from API
      if (error.response?.data) {
        const apiErrors: Record<string, string> = {};
        Object.entries(error.response.data).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            apiErrors[key] = value[0];
          } else {
            apiErrors[key] = String(value);
          }
        });
        setErrors(apiErrors);
      }

      showError(isEdit ? 'Failed to update payroll' : 'Failed to create payroll');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: keyof CreatePayrollData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error when field is modified
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const calculatePeriodDays = (): number => {
    if (!formData.period_start || !formData.period_end) return 0;

    const start = new Date(formData.period_start);
    const end = new Date(formData.period_end);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return diffDays;
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/hr/payroll')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEdit ? 'Edit Payroll Period' : 'Create Payroll Period'}
              </h1>
              <p className="text-gray-600">
                {isEdit
                  ? `Update payroll period ${payroll?.reference_number}`
                  : 'Set up a new payroll period for processing'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Period Duration</p>
                <p className="text-xl font-semibold text-gray-900">{calculatePeriodDays()} days</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Expected Payslips</p>
                <p className="text-xl font-semibold text-gray-900">
                  {payroll?.payslips_count || 'TBD'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-purple-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Status</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formData.status === PayrollStatus.DRAFT ? 'Draft' : formData.status}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Personnel Changes Report Button */}
        {!isEdit && formData.period_start && formData.period_end && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowPersonnelReport(!showPersonnelReport)}
              className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 hover:bg-yellow-100 transition-colors duration-200 flex items-center justify-between"
            >
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-yellow-600 mr-3" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-yellow-900">
                    Step 1: Review Personnel Changes Report
                  </p>
                  <p className="text-xs text-yellow-700">
                    View new hires, terminations, leave, and overtime before creating payroll
                  </p>
                </div>
              </div>
              <div className="text-yellow-600">{showPersonnelReport ? '▼' : '▶'}</div>
            </button>
          </div>
        )}

        {/* Personnel Changes Report Display */}
        {showPersonnelReport && formData.period_start && formData.period_end && (
          <div className="mb-6">
            <PersonnelChangesReport
              periodStart={formData.period_start}
              periodEnd={formData.period_end}
              onClose={() => setShowPersonnelReport(false)}
            />
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Payroll Period Details</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <PayrollForm
              formData={formData}
              errors={errors}
              onChange={handleFieldChange}
              loading={loading}
              isEdit={isEdit}
            />

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/hr/payroll')}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isEdit ? 'Update Payroll' : 'Create Payroll'}
              </button>
            </div>
          </form>
        </div>

        {/* Help Information */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Payroll Period Guidelines</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Period start and end dates define the work period for this payroll</li>
            <li>• Pay date should typically be after the period end date</li>
            <li>• Once created, you can calculate payroll to generate payslips</li>
            <li>• After calculation, the payroll needs approval before processing</li>
            <li>• Only draft payrolls can be edited or deleted</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PayrollFormPage;
