import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  useSalaryComponent,
  useCreateSalaryComponent,
  useUpdateSalaryComponent,
} from '../../hooks/useSalaryComponents';
import { CreateSalaryComponentRequest } from '../../types/salaryComponent';
import { useQuery } from '@tanstack/react-query';
import { accountService } from '../../services/accountService';

interface FormData {
  name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  default_amount: string;
  is_taxable: boolean;
  is_pensionable: boolean;
  description: string;
  gl_account: string; // stored as string (select value), converted to number on submit
  /** DEDUCTION only: true when cash is physically disbursed to staff at approval time */
  is_advance: boolean;
}

const SalaryComponentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { data: component, isLoading } = useSalaryComponent(isEdit ? parseInt(id!) : 0);
  const createMutation = useCreateSalaryComponent();
  const updateMutation = useUpdateSalaryComponent();

  // GL accounts (ASSET + LIABILITY) for deduction mapping
  const { data: glAccounts = [] } = useQuery({
    queryKey: ['accounts', 'deduction-gl'],
    queryFn: async () => {
      const [assets, liabilities] = await Promise.all([
        accountService.getAccounts({ account_type: 'ASSET' }),
        accountService.getAccounts({ account_type: 'LIABILITY' }),
      ]);
      const list = [...(assets || []), ...(liabilities || [])];
      // Only postable (child) accounts
      return list.filter(
        (a: any) => a.account_level === 'CHILD' || a.level === 'CHILD' || !a.account_level
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    watch,
    setValue,
  } = useForm<FormData>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      component_type: 'EARNING',
      default_amount: '',
      is_taxable: true,
      is_pensionable: false,
      description: '',
      gl_account: '',
      is_advance: false,
    },
  });

  const componentType = watch('component_type');
  const isTaxable = watch('is_taxable');
  const isPensionable = watch('is_pensionable');
  const isAdvance = watch('is_advance');

  // When type switches to DEDUCTION, EARNING-only flags are irrelevant — lock to false
  // is_advance is intentionally NOT reset here — it is a DEDUCTION-only field
  useEffect(() => {
    if (componentType === 'DEDUCTION') {
      setValue('is_taxable', true);
      setValue('is_pensionable', false);
    }
  }, [componentType, setValue]);

  useEffect(() => {
    if (component) {
      reset({
        name: component.name,
        component_type: component.component_type,
        default_amount: component.default_amount,
        is_taxable: component.is_taxable ?? true,
        is_pensionable: component.is_pensionable ?? false,
        description: component.description ?? '',
        gl_account: component.gl_account ? String(component.gl_account) : '',
        is_advance: component.is_advance ?? false,
      });
    }
  }, [component, reset]);

  const onSubmit = async (data: FormData) => {
    const payload: CreateSalaryComponentRequest = {
      name: data.name.trim(),
      component_type: data.component_type,
      default_amount: data.default_amount,
      is_taxable: data.component_type === 'DEDUCTION' ? false : data.is_taxable,
      is_pensionable: data.component_type === 'DEDUCTION' ? false : data.is_pensionable,
      description: data.description.trim(),
      gl_account: data.gl_account ? parseInt(data.gl_account) : null,
      is_advance: data.component_type === 'DEDUCTION' ? data.is_advance : false,
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: parseInt(id!), data: payload },
        { onSuccess: () => navigate('/hr/salary-components') }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate('/hr/salary-components'),
      });
    }
  };

  const formatCurrency = (amount: string) => {
    if (!amount) return '';
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
      parseFloat(amount)
    );
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          aria-label="Back to salary components"
          onClick={() => navigate('/hr/salary-components')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Salary Component' : 'Create Salary Component'}
          </h1>
          <p className="text-gray-600">
            {isEdit ? 'Update component details' : 'Add a new salary component'}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm border">
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Component Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Component Name *
            </label>
            <input
              type="text"
              id="name"
              {...register('name', {
                required: 'Component name is required',
                maxLength: { value: 100, message: 'Max 100 characters' },
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Basic Salary, Housing Allowance, Transport Allowance"
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>

          {/* Component Type */}
          <div>
            <label
              htmlFor="component_type"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Component Type *
            </label>
            <select
              id="component_type"
              {...register('component_type', { required: 'Component type is required' })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.component_type ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="EARNING">Earning</option>
              <option value="DEDUCTION">Deduction</option>
            </select>
            {errors.component_type && (
              <p className="mt-1 text-sm text-red-600">{errors.component_type.message}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {componentType === 'EARNING'
                ? 'Added to staff gross pay'
                : 'Subtracted from staff gross pay'}
            </p>
          </div>

          {/* Default Amount */}
          <div>
            <label
              htmlFor="default_amount"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Default Amount (NGN) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              id="default_amount"
              {...register('default_amount', {
                required: 'Default amount is required',
                min: { value: 0, message: 'Amount must be positive' },
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.default_amount ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="0.00"
            />
            {errors.default_amount && (
              <p className="mt-1 text-sm text-red-600">{errors.default_amount.message}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              Staff-specific amounts can be overridden on the staff pay setup screen
            </p>
          </div>

          {/* Taxability (EARNING only) */}
          {componentType === 'EARNING' && (
            <div
              className={`rounded-lg border p-4 ${
                isTaxable ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {isTaxable ? (
                  <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="is_taxable" className="text-sm font-semibold text-gray-800">
                      Include in PAYE Taxable Income
                    </label>
                    {/* Toggle switch */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="is_taxable"
                        {...register('is_taxable')}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    {isTaxable ? (
                      <>
                        <strong>Taxable:</strong> This earning will be included in the monthly PAYE
                        computation. Annual income = monthly taxable × 12, taxed across the
                        progressive bands (0% → 15% → 18% → 21% → 23% → 25%).
                      </>
                    ) : (
                      <>
                        <strong>Non-Taxable:</strong> This earning is excluded from PAYE (e.g. Leave
                        Allowance under the Nigerian PIT Act).
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Pension base toggle */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="is_pensionable" className="text-sm font-semibold text-gray-800">
                      Include in Pension Contribution Base
                    </label>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {isPensionable ? (
                        <>
                          <strong>Pensionable:</strong> Counted in the 8% employee / 10% employer
                          pension base (Basic + Housing + Transport only, per Nigerian Pension
                          Reform Act).
                        </>
                      ) : (
                        <>
                          <strong>Not Pensionable:</strong> Excluded from the pension base. Leave
                          Allowance, Entertainment, Utility, and Lunch are excluded.
                        </>
                      )}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="is_pensionable"
                      {...register('is_pensionable')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* PAYE bands reminder */}
              {isTaxable && (
                <div className="mt-3 pt-3 border-t border-orange-200">
                  <div className="flex items-center gap-1 text-xs text-orange-700 mb-1">
                    <Info className="h-3.5 w-3.5" />
                    <span className="font-semibold">Nigerian PAYE Tax Bands (Annual)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-orange-800">
                    {[
                      ['First ₦800k', '0%'],
                      ['Next ₦2.2m', '15%'],
                      ['Next ₦9m', '18%'],
                      ['Next ₦13m', '21%'],
                      ['Next ₦25m', '23%'],
                      ['Balance', '25%'],
                    ].map(([label, rate]) => (
                      <div
                        key={label}
                        className="flex justify-between bg-orange-100 px-2 py-1 rounded"
                      >
                        <span>{label}</span>
                        <span className="font-bold">{rate}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-orange-600">
                    Annual PAYE is divided by 12 for the monthly deduction shown on payslips.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Pension note (always shown for earnings) */}
          {componentType === 'EARNING' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                <strong>Pension:</strong> Employee (8%) and employer (10%) pension contributions are
                always computed on <em>total gross pay</em> — regardless of this component's
                taxability setting.
              </p>
            </div>
          )}

          {/* GL Account (DEDUCTION only) */}
          {componentType === 'DEDUCTION' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800">
                  <strong>GL Account Mapping:</strong> Select the balance-sheet account for this
                  deduction type (e.g. <em>Staff Advances and Loans – 1112</em>).
                  <br />
                  On approval: <strong>Dr</strong> this account / <strong>Cr</strong> Bank (advance
                  given).
                  <br />
                  At payroll: <strong>Dr</strong> Salary Payable / <strong>Cr</strong> this account
                  (recovery).
                </p>
              </div>
              <div>
                <label
                  htmlFor="gl_account"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  GL Account <span className="text-gray-400">(optional)</span>
                </label>
                <select
                  id="gl_account"
                  {...register('gl_account')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">— No GL mapping (generic payroll deduction) —</option>
                  {glAccounts.map((acct: any) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.code} – {acct.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* is_advance toggle */}
              <div
                className={`rounded-lg border p-4 ${
                  isAdvance ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 pr-4">
                    <label htmlFor="is_advance" className="text-sm font-semibold text-gray-800">
                      Cash Advance Disbursement
                    </label>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {isAdvance ? (
                        <>
                          <strong className="text-red-700">Advance mode ON:</strong> When a
                          bonus/deduction request using this component is <em>approved</em>, the
                          system will immediately post a journal entry:{' '}
                          <strong>DR: {'{GL Account above}'} / CR: Bank</strong>. Use this for
                          Salary Advances and Staff Loans where cash is physically handed to the
                          employee.
                        </>
                      ) : (
                        <>
                          <strong>Advance mode OFF:</strong> No cash moves at approval time. The
                          deduction is applied only when the payroll is run. Use this for
                          cooperative dues, development levy, and other salary-only reductions.
                        </>
                      )}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      id="is_advance"
                      {...register('is_advance')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                  </label>
                </div>
                {isAdvance && !watch('gl_account') && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />A GL Account must be
                    selected above for the advance journal entry to post correctly.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={2}
              {...register('description')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description of what this component covers"
            />
          </div>

          {/* Preview */}
          {watch('name') && watch('default_amount') && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{watch('name')}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      componentType === 'EARNING'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {componentType}
                  </span>
                  {componentType === 'EARNING' && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        isTaxable ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {isTaxable ? 'Taxable' : 'Non-Taxable'}
                    </span>
                  )}
                  {componentType === 'EARNING' && isPensionable && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      Pensionable
                    </span>
                  )}
                  {componentType === 'DEDUCTION' && isAdvance && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Cash Advance
                    </span>
                  )}
                </div>
                <span className="font-medium text-gray-900">
                  {formatCurrency(watch('default_amount'))}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={() => navigate('/hr/salary-components')}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isEdit ? 'Update Component' : 'Create Component'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalaryComponentFormPage;
