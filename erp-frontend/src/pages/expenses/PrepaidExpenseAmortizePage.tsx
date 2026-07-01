import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calculator, Save, AlertTriangle, DollarSign } from 'lucide-react';
import { usePrepaidExpense, useAmortizePrepaidExpense } from '../../hooks/usePrepaidExpenses';
import { AmortizePrepaidExpense, ValidationError } from '../../types/prepaidExpense';

const PrepaidExpenseAmortizePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const expenseId = Number(id);

  const [formData, setFormData] = useState<AmortizePrepaidExpense>({
    amount: '',
    period_end_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [errors, setErrors] = useState<ValidationError>({});

  // Queries
  const { data: prepaidExpense, isLoading } = usePrepaidExpense(expenseId);

  // Mutations
  const amortizePrepaidExpense = useAmortizePrepaidExpense();

  const handleInputChange = (field: keyof AmortizePrepaidExpense, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationError = {};

    // Required field validations
    if (!formData.amount) {
      newErrors.amount = ['Amount is required'];
    } else {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        newErrors.amount = ['Amount must be a positive number'];
      } else if (amount > remainingAmount) {
        newErrors.amount = [
          `Amount cannot exceed remaining amount (₦${remainingAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })})`,
        ];
      }
    }

    if (!formData.period_end_date) newErrors.period_end_date = ['Period end date is required'];

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm() || !prepaidExpense) return;

    try {
      await amortizePrepaidExpense.mutateAsync({
        id: expenseId,
        data: formData,
        expenseData: prepaidExpense,
      });
      alert('Amortization recorded successfully');
      navigate('/expenses/prepaid');
    } catch (error: any) {
      if (error.response?.data) {
        setErrors(error.response.data);
      } else {
        alert('Failed to record amortization');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!prepaidExpense) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" />
            <span className="text-red-800 font-medium">Prepaid expense not found</span>
          </div>
          <p className="text-red-700 mt-1">The requested prepaid expense could not be found.</p>
        </div>
      </div>
    );
  }

  const remainingAmount = parseFloat(prepaidExpense.remaining_amount);
  const canAmortize = remainingAmount > 0 && prepaidExpense.status !== 'fully_consumed';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/expenses/prepaid')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back to Prepaid Expenses
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Amortize Prepaid Expense</h1>
          <p className="text-gray-600">Record amortization for {prepaidExpense.reference_number}</p>
        </div>
      </div>

      {/* Expense Summary */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Expense Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Total Amount</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ₦
              {parseFloat(prepaidExpense.total_amount).toLocaleString('en-NG', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calculator size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Consumed Amount</span>
            </div>
            <p className="text-2xl font-bold text-orange-600">
              ₦
              {parseFloat(prepaidExpense.consumed_amount).toLocaleString('en-NG', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Remaining Amount</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              ₦{remainingAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Consumption Progress</span>
            <span>
              {(
                (parseFloat(prepaidExpense.consumed_amount) /
                  parseFloat(prepaidExpense.total_amount)) *
                100
              ).toFixed(1)}
              %
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{
                width: `${(parseFloat(prepaidExpense.consumed_amount) / parseFloat(prepaidExpense.total_amount)) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Category:</span>
            <span className="ml-2 font-medium">{prepaidExpense.category_name}</span>
          </div>
          <div>
            <span className="text-gray-600">Status:</span>
            <span
              className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                prepaidExpense.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : prepaidExpense.status === 'partially_consumed'
                    ? 'bg-yellow-100 text-yellow-800'
                    : prepaidExpense.status === 'fully_consumed'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-red-100 text-red-800'
              }`}
            >
              {prepaidExpense.status.replace('_', ' ')}
            </span>
          </div>
          {prepaidExpense.purchase_date && (
            <div>
              <span className="text-gray-600">Purchase Date:</span>
              <span className="ml-2">
                {new Date(prepaidExpense.purchase_date).toLocaleDateString()}
              </span>
            </div>
          )}
          {prepaidExpense.supplier_name && (
            <div>
              <span className="text-gray-600">Supplier:</span>
              <span className="ml-2">{prepaidExpense.supplier_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Amortization Form */}
      {canAmortize ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Amortization Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amortization Amount *
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={remainingAmount}
                    value={formData.amount}
                    onChange={e => handleInputChange('amount', e.target.value)}
                    className={`w-full border rounded-md pl-10 pr-3 py-2 ${
                      errors.amount ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                    required
                  />
                </div>
                {errors.amount && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    {errors.amount[0]}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Amount to amortize (Max: ₦
                  {remainingAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })})
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period End Date *
                </label>
                <input
                  type="date"
                  value={formData.period_end_date}
                  onChange={e => handleInputChange('period_end_date', e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.period_end_date ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                />
                {errors.period_end_date && (
                  <p className="mt-1 text-sm text-red-600">{errors.period_end_date[0]}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  End date of the period this amortization covers
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={e => handleInputChange('notes', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Optional notes about this amortization..."
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/expenses/prepaid')}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={amortizePrepaidExpense.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={20} />
              {amortizePrepaidExpense.isPending ? 'Recording...' : 'Record Amortization'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-600" />
            <span className="text-yellow-800 font-medium">Cannot Amortize</span>
          </div>
          <p className="text-yellow-700 mt-1">
            {remainingAmount <= 0
              ? 'This prepaid expense has been fully consumed and cannot be amortized further.'
              : 'This prepaid expense cannot be amortized at this time.'}
          </p>
          <button
            onClick={() => navigate('/expenses/prepaid')}
            className="mt-4 inline-flex items-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
          >
            <ArrowLeft size={16} />
            Back to Prepaid Expenses
          </button>
        </div>
      )}
    </div>
  );
};

export default PrepaidExpenseAmortizePage;
