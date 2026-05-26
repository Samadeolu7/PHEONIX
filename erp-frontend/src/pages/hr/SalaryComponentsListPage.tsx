import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Filter } from 'lucide-react';
import { useSalaryComponents, useDeleteSalaryComponent } from '../../hooks/useSalaryComponents';
import { SalaryComponent } from '../../types/salaryComponent';

const SalaryComponentsListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [componentType, setComponentType] = useState<'EARNING' | 'DEDUCTION' | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useSalaryComponents({
    component_type: componentType || undefined,
    page,
    page_size: 20,
  });

  const deleteMutation = useDeleteSalaryComponent();

  const handleDelete = async (component: SalaryComponent) => {
    if (window.confirm(`Are you sure you want to delete "${component.name}"?`)) {
      deleteMutation.mutate(component.id);
    }
  };

  const filteredComponents =
    data?.results?.filter(component =>
      component.name.toLowerCase().includes(search.toLowerCase())
    ) || [];

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const getComponentTypeBadge = (type: 'EARNING' | 'DEDUCTION') => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    if (type === 'EARNING') {
      return `${baseClasses} bg-green-100 text-green-800`;
    }
    return `${baseClasses} bg-red-100 text-red-800`;
  };

  const getTaxabilityBadge = (component: SalaryComponent) => {
    if (component.component_type === 'DEDUCTION') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          N/A
        </span>
      );
    }
    return component.is_taxable ? (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
        Taxable
      </span>
    ) : (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        Non-Taxable
      </span>
    );
  };

  const getPensionBadge = (component: SalaryComponent) => {
    if (component.component_type === 'DEDUCTION') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          N/A
        </span>
      );
    }
    return component.is_pensionable ? (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        Pensionable
      </span>
    ) : (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        Excluded
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Failed to load salary components</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salary Components</h1>
          <p className="text-gray-600">Manage earnings and deduction components</p>
        </div>
        <Link
          to="/hr/salary-components/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Component
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search components..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              aria-label="Filter by component type"
              value={componentType}
              onChange={e => setComponentType(e.target.value as 'EARNING' | 'DEDUCTION' | '')}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="EARNING">Earnings</option>
              <option value="DEDUCTION">Deductions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Components Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Component Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Taxability
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pension Base
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Default Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredComponents.map(component => (
                <tr key={component.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{component.name}</div>
                    {component.description && (
                      <div className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">
                        {component.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getComponentTypeBadge(component.component_type)}>
                      {component.component_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getTaxabilityBadge(component)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getPensionBadge(component)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {formatCurrency(component.default_amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {new Date(component.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/hr/salary-components/${component.id}/edit`}
                        className="text-blue-600 hover:text-blue-900 p-1"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(component)}
                        className="text-red-600 hover:text-red-900 p-1"
                        title="Delete"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredComponents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No salary components found</p>
            <Link
              to="/hr/salary-components/new"
              className="text-blue-600 hover:text-blue-800 mt-2 inline-block"
            >
              Create your first component
            </Link>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.count > 20 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.count)} of {data.count}{' '}
            components
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page * 20 >= data.count}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryComponentsListPage;
