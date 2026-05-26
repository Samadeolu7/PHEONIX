// ReportFilters Component
// Shared filter component for all financial reports with debounced changes

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Calendar, Filter, RotateCcw } from 'lucide-react';
import { ReportFilters as ReportFiltersType, ReportType } from '../../types/financialReports';

interface ReportFiltersProps {
  reportType: ReportType;
  onFiltersChange: (filters: ReportFiltersType) => void;
  initialFilters?: ReportFiltersType;
  loading?: boolean;
}

const ReportFilters: React.FC<ReportFiltersProps> = React.memo(
  ({ reportType, onFiltersChange, initialFilters = {}, loading = false }) => {
    const [debouncedFilters, setDebouncedFilters] = useState<ReportFiltersType>(initialFilters);

    const {
      register,
      watch,
      setValue,
      reset,
      handleSubmit,
      formState: { errors },
    } = useForm<ReportFiltersType>({
      defaultValues: initialFilters,
    });

    // Watch all form values
    const watchedValues = watch();

    // Memoized debounced function for performance
    const debouncedOnChange = useMemo(
      () =>
        debounce((filters: ReportFiltersType) => {
          setDebouncedFilters(filters);
          onFiltersChange(filters);
        }, 300),
      [onFiltersChange]
    );

    // Effect to handle form changes
    useEffect(() => {
      debouncedOnChange(watchedValues);
    }, [watchedValues, debouncedOnChange]);

    // Reset filters
    const handleReset = useCallback(() => {
      const defaultFilters: ReportFiltersType = {};
      reset(defaultFilters);
      onFiltersChange(defaultFilters);
    }, [reset, onFiltersChange]);

    // Memoized date utilities for performance
    const dateUtils = useMemo(
      () => ({
        getTodayDate: () => new Date().toISOString().split('T')[0],
        getYearStartDate: () => {
          const now = new Date();
          return `${now.getFullYear()}-01-01`;
        },
        getLastMonthDates: () => {
          const now = new Date();
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          return {
            start: lastMonth.toISOString().split('T')[0],
            end: lastMonthEnd.toISOString().split('T')[0],
          };
        },
        getLastYearDates: () => {
          const now = new Date();
          const lastYear = now.getFullYear() - 1;
          return {
            start: `${lastYear}-01-01`,
            end: `${lastYear}-12-31`,
          };
        },
      }),
      []
    );

    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-600" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-gray-900">Report Filters</h3>
        </div>

        <form className="space-y-4" role="form" aria-label="Financial report filters">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Start Date - Required for Profit & Loss */}
            {(reportType === 'profit-loss' || reportType === 'trial-balance') && (
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date{' '}
                  {reportType === 'profit-loss' && (
                    <span className="text-red-500" aria-label="required">
                      *
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    id="startDate"
                    type="date"
                    {...register('startDate', {
                      required: reportType === 'profit-loss' ? 'Start date is required' : false,
                    })}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.startDate ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={loading}
                    aria-invalid={errors.startDate ? 'true' : 'false'}
                    aria-describedby={errors.startDate ? 'startDate-error' : undefined}
                  />
                  <Calendar
                    className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none"
                    aria-hidden="true"
                  />
                </div>
                {errors.startDate && (
                  <p id="startDate-error" className="mt-1 text-sm text-red-600" role="alert">
                    {errors.startDate.message}
                  </p>
                )}
              </div>
            )}

            {/* End Date */}
            {(reportType === 'profit-loss' || reportType === 'trial-balance') && (
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <div className="relative">
                  <input
                    id="endDate"
                    type="date"
                    {...register('endDate')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                  <Calendar
                    className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none"
                    aria-hidden="true"
                  />
                </div>
              </div>
            )}

            {/* As Of Date - For Balance Sheet */}
            {reportType === 'balance-sheet' && (
              <div>
                <label htmlFor="asOfDate" className="block text-sm font-medium text-gray-700 mb-1">
                  As Of Date
                </label>
                <div className="relative">
                  <input
                    id="asOfDate"
                    type="date"
                    {...register('asOfDate')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={loading}
                  />
                  <Calendar
                    className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none"
                    aria-hidden="true"
                  />
                </div>
              </div>
            )}

            {/* Detail Level */}
            <div>
              <label htmlFor="detailLevel" className="block text-sm font-medium text-gray-700 mb-1">
                Detail Level
              </label>
              <select
                id="detailLevel"
                {...register('detailLevel')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
                aria-describedby="detailLevel-help"
              >
                <option value="summary">Summary</option>
                <option value="detailed">Detailed</option>
                <option value="all">All Accounts</option>
              </select>
              <p id="detailLevel-help" className="mt-1 text-xs text-gray-500">
                Choose the level of account detail to display
              </p>
            </div>

            {/* Include Zero Balances - Trial Balance only */}
            {reportType === 'trial-balance' && (
              <div className="flex items-center">
                <input
                  id="includeZeroBalances"
                  type="checkbox"
                  {...register('includeZeroBalances')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={loading}
                  aria-describedby="includeZeroBalances-help"
                />
                <label htmlFor="includeZeroBalances" className="ml-2 block text-sm text-gray-700">
                  Include Zero Balances
                </label>
                <p id="includeZeroBalances-help" className="sr-only">
                  Check to include accounts with zero balances in the report
                </p>
              </div>
            )}

            {/* Comparative Analysis */}
            {(reportType === 'profit-loss' || reportType === 'balance-sheet') && (
              <div className="flex items-center">
                <input
                  id="comparative"
                  type="checkbox"
                  {...register('comparative')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={loading}
                  aria-describedby="comparative-help"
                />
                <label htmlFor="comparative" className="ml-2 block text-sm text-gray-700">
                  Comparative Analysis
                </label>
                <p id="comparative-help" className="sr-only">
                  Check to enable comparison with a previous period
                </p>
              </div>
            )}

            {/* Comparative Date - When comparative is enabled */}
            {(reportType === 'profit-loss' || reportType === 'balance-sheet') &&
              watchedValues.comparative && (
                <div>
                  <label
                    htmlFor="comparativeDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {reportType === 'balance-sheet' ? 'Comparative Date' : 'Prior Period Start'}
                  </label>
                  <div className="relative">
                    <input
                      id="comparativeDate"
                      type="date"
                      {...register('comparativeDate')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={loading}
                    />
                    <Calendar
                      className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              )}
          </div>

          {/* Quick Date Presets */}
          <fieldset className="pt-4 border-t border-gray-200">
            <legend className="text-sm font-medium text-gray-700 mb-2">Quick Presets:</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (reportType === 'balance-sheet') {
                    setValue('asOfDate', dateUtils.getTodayDate());
                  } else {
                    setValue('startDate', dateUtils.getYearStartDate());
                    setValue('endDate', dateUtils.getTodayDate());
                  }
                }}
                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                disabled={loading}
              >
                {reportType === 'balance-sheet' ? 'Today' : 'Current Year'}
              </button>

              {reportType !== 'balance-sheet' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const dates = dateUtils.getLastMonthDates();
                      setValue('startDate', dates.start);
                      setValue('endDate', dates.end);
                    }}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                    disabled={loading}
                  >
                    Last Month
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const dates = dateUtils.getLastYearDates();
                      setValue('startDate', dates.start);
                      setValue('endDate', dates.end);
                    }}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                    disabled={loading}
                  >
                    Last Year
                  </button>
                </>
              )}
            </div>
          </fieldset>

          {/* Reset Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors"
              disabled={loading}
              aria-label="Reset all filters to default values"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Filters
            </button>
          </div>
        </form>
      </div>
    );
  }
);

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default ReportFilters;
