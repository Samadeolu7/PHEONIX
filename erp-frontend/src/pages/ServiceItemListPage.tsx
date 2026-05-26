import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Search,
  Filter,
  DollarSign,
  Package,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import {
  serviceItemService,
  ServiceItem,
  ServiceItemFilters,
  IncomeCategory,
  CreateServiceItemData,
  UpdateServiceItemData,
} from '../services/serviceItemService';
import { inventoryService } from '../services/inventoryService';
import { InventoryCategory } from '../types/inventory';

interface Pagination {
  count: number;
  next: string | null;
  previous: string | null;
  currentPage: number;
}

const ServiceItemListPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [invCategories, setInvCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ServiceItemFilters>({});
  const [pagination, setPagination] = useState<Pagination>({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ServiceItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateServiceItemData>({
    name: '',
    code: '',
    description: '',
    category: 0,
    default_price: '0.00',
    creates_entitlement: true,
    is_active: true,
    service_type: 'standard',
    allows_material_requests: false,
    material_request_limit: null,
    material_request_config: null,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Helper function to format currency in Naira
  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `₦${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  useEffect(() => {
    loadServiceItems();
    loadCategories();
    loadInvCategories();
  }, [filters]);

  const loadServiceItems = async () => {
    try {
      setLoading(true);
      const response = await serviceItemService.getServiceItems(filters);
      setServiceItems(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    } catch (error) {
      console.error('Error loading service items:', error);
      showError('Failed to load service items');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await serviceItemService.getIncomeCategories({ is_active: true });
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadInvCategories = async () => {
    try {
      const res = await inventoryService.getCategories();
      setInvCategories(res.results || res);
    } catch (error) {
      console.error('Error loading inventory categories:', error);
    }
  };

  // ── material_request_config helpers ──────────────────────────────────────
  const getMRItemTypes = (): string[] =>
    (formData.material_request_config as any)?.allowed_item_types || [];

  const getMRCategoryCodes = (): string[] =>
    (formData.material_request_config as any)?.allowed_categories || [];

  const toggleMRItemType = (label: string) => {
    const current = getMRItemTypes();
    const updated = current.includes(label)
      ? current.filter(t => t !== label)
      : [...current, label];
    handleFormChange('material_request_config', {
      ...(formData.material_request_config as any),
      allowed_item_types: updated,
    });
  };

  const toggleMRCategoryCode = (code: string) => {
    const current = getMRCategoryCodes();
    const updated = current.includes(code) ? current.filter(c => c !== code) : [...current, code];
    handleFormChange('material_request_config', {
      ...(formData.material_request_config as any),
      allowed_categories: updated,
    });
  };

  // Distinct item_type labels present in inventory categories (non-empty)
  const distinctItemTypes = Array.from(
    new Set(invCategories.map(c => c.item_type).filter(Boolean))
  ) as string[];

  const handleFilterChange = (key: keyof ServiceItemFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      category: 0,
      default_price: '0.00',
      creates_entitlement: true,
      is_active: true,
      service_type: 'standard',
      allows_material_requests: false,
      material_request_limit: null,
      material_request_config: null,
    });
    setFormErrors({});
    setShowCreateModal(true);
  };

  const openEditModal = (item: ServiceItem) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      description: item.description,
      category: item.category,
      default_price: item.default_price,
      creates_entitlement: item.creates_entitlement,
      is_active: item.is_active,
      entitlement_config: item.entitlement_config,
      service_type: item.service_type || 'standard',
      allows_material_requests: item.allows_material_requests || false,
      material_request_limit: item.material_request_limit,
      material_request_config: item.material_request_config,
    });
    setFormErrors({});
    setShowEditModal(true);
  };

  const handleFormChange = (field: keyof CreateServiceItemData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormErrors(prev => ({ ...prev, [field]: '' }));

    // Auto-generate code from name - only if code is empty
    if (field === 'name' && !formData.code) {
      const autoCode = value
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 20);
      setFormData(prev => ({ ...prev, code: autoCode }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!formData.code.trim()) {
      errors.code = 'Code is required';
    }
    if (!formData.category || formData.category === 0) {
      errors.category = 'Category is required';
    }
    const price = parseFloat(formData.default_price);
    if (isNaN(price) || price < 0) {
      errors.default_price = 'Price must be 0 or greater';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      await serviceItemService.createServiceItem(formData);
      success('Service item created successfully');
      setShowCreateModal(false);
      loadServiceItems();
    } catch (error: any) {
      console.error('Error creating service item:', error);
      if (error.response?.data) {
        const apiErrors = error.response.data;
        if (typeof apiErrors === 'object') {
          setFormErrors(apiErrors);
        } else {
          showError('Failed to create service item');
        }
      } else {
        showError('Failed to create service item');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedItem || !validateForm()) return;

    try {
      setSubmitting(true);
      await serviceItemService.updateServiceItem(selectedItem.id, formData);
      success('Service item updated successfully');
      setShowEditModal(false);
      setSelectedItem(null);
      loadServiceItems();
    } catch (error: any) {
      console.error('Error updating service item:', error);
      if (error.response?.data) {
        const apiErrors = error.response.data;
        if (typeof apiErrors === 'object') {
          setFormErrors(apiErrors);
        } else {
          showError('Failed to update service item');
        }
      } else {
        showError('Failed to update service item');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: ServiceItem) => {
    try {
      if (item.is_active) {
        await serviceItemService.deactivateServiceItem(item.id);
        success('Service item deactivated');
      } else {
        await serviceItemService.activateServiceItem(item.id);
        success('Service item activated');
      }
      loadServiceItems();
    } catch (error) {
      console.error('Error toggling service item status:', error);
      showError('Failed to update service item status');
    }
  };

  const handleDelete = async (item: ServiceItem) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      await serviceItemService.deleteServiceItem(item.id);
      success('Service item deleted successfully');
      loadServiceItems();
    } catch (error) {
      console.error('Error deleting service item:', error);
      showError('Failed to delete service item');
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-4 p-2 hover:bg-gray-200 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Service Items</h1>
            <p className="text-gray-600 mt-1">Manage your service catalog for invoicing and fees</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            Create Service Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <Filter className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Name or code..."
                value={filters.search || ''}
                onChange={e => handleFilterChange('search', e.target.value)}
                className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={
                filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'
              }
              onChange={e =>
                handleFilterChange(
                  'is_active',
                  e.target.value === 'all' ? undefined : e.target.value === 'active'
                )
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={filters.category || ''}
              onChange={e =>
                handleFilterChange(
                  'category',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
            <select
              value={(filters as any).service_type || ''}
              onChange={e => handleFilterChange('service_type' as any, e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="standard">Standard</option>
              <option value="inventory_access">Inventory Access</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={filters.ordering || ''}
              onChange={e => handleFilterChange('ordering', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Default</option>
              <option value="name">Name (A-Z)</option>
              <option value="-name">Name (Z-A)</option>
              <option value="default_price">Price (Low to High)</option>
              <option value="-default_price">Price (High to Low)</option>
              <option value="-created_at">Newest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading service items...</p>
          </div>
        ) : serviceItems.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No service items found</p>
            <p className="text-gray-400 text-sm mt-2">
              Create your first service item to get started
            </p>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entitlement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {serviceItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        {item.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-gray-600">{item.code}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{item.category_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-900">
                        <span className="font-medium">{formatCurrency(item.default_price)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {item.service_type === 'inventory_access' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            📦 Inventory Access
                          </span>
                        )}
                        {item.service_type === 'hybrid' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            ⚡ Hybrid
                          </span>
                        )}
                        {(!item.service_type || item.service_type === 'standard') && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Standard
                          </span>
                        )}
                        {item.allows_material_requests && (
                          <div className="text-xs text-blue-600 flex items-center gap-1">
                            <span>✓ MR enabled</span>
                            {(item.material_request_config as any)?.allowed_item_types?.length >
                              0 && (
                              <span className="text-gray-400">
                                ·{' '}
                                {(item.material_request_config as any).allowed_item_types.join(
                                  ', '
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {item.creates_entitlement ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          <XCircle className="w-3 h-3 mr-1" />
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded transition"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`p-1 rounded transition ${
                            item.is_active
                              ? 'text-orange-600 hover:text-orange-900 hover:bg-orange-50'
                              : 'text-green-600 hover:text-green-900 hover:bg-green-50'
                          }`}
                          title={item.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {item.is_active ? (
                            <ToggleRight className="w-4 h-4" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.count > 10 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={!pagination.previous}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={!pagination.next}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing{' '}
                      <span className="font-medium">{(pagination.currentPage - 1) * 10 + 1}</span>{' '}
                      to{' '}
                      <span className="font-medium">
                        {Math.min(pagination.currentPage * 10, pagination.count)}
                      </span>{' '}
                      of <span className="font-medium">{pagination.count}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={!pagination.previous}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={!pagination.next}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Service Item</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => handleFormChange('name', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      formErrors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.name && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => handleFormChange('code', e.target.value.toUpperCase())}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono ${
                      formErrors.code ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.code && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.code}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => handleFormChange('category', parseInt(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      formErrors.category ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value={0}>Select a category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.category && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.category}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Price (₦) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_price}
                    onChange={e => handleFormChange('default_price', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      formErrors.default_price ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.default_price && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.default_price}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => handleFormChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe what this service covers..."
                  />
                </div>

                <div className="space-y-4 border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Service Type & Material Requests
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Service Type
                    </label>
                    <select
                      value={formData.service_type || 'standard'}
                      onChange={e => handleFormChange('service_type', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="standard">Standard Service</option>
                      <option value="inventory_access">Inventory Access Only</option>
                      <option value="hybrid">Hybrid (Service + Inventory)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.service_type === 'standard' &&
                        'Pure service with no inventory access'}
                      {formData.service_type === 'inventory_access' &&
                        'Authorizes material requests without service component'}
                      {formData.service_type === 'hybrid' &&
                        'Provides both service and inventory access'}
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="allows_material_requests"
                      checked={formData.allows_material_requests ?? false}
                      onChange={e => handleFormChange('allows_material_requests', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label
                      htmlFor="allows_material_requests"
                      className="ml-2 block text-sm text-gray-900"
                    >
                      Allows material requests (e.g., textbooks, uniforms)
                    </label>
                  </div>

                  {formData.allows_material_requests && (
                    <div className="space-y-4 pl-2 border-l-2 border-blue-100">
                      {/* Limit */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Material Request Limit
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formData.material_request_limit || ''}
                          onChange={e =>
                            handleFormChange(
                              'material_request_limit',
                              e.target.value ? parseInt(e.target.value) : null
                            )
                          }
                          placeholder="Leave empty for unlimited"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Maximum number of material requests allowed per invoice (leave empty for
                          unlimited)
                        </p>
                      </div>

                      {/* Allowed item types (by item_type label) */}
                      {distinctItemTypes.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Allowed Inventory Item Types
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            Invoices with this service item will only allow material requests for
                            the selected inventory types.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {distinctItemTypes.map(itype => (
                              <label
                                key={itype}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                                  getMRItemTypes().includes(itype)
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={getMRItemTypes().includes(itype)}
                                  onChange={() => toggleMRItemType(itype)}
                                />
                                {itype}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Allowed individual categories (by code) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Allowed Inventory Categories
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Optionally restrict to specific categories (overrides item type if set).
                        </p>
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                          {invCategories.length === 0 ? (
                            <p className="text-xs text-gray-400">No inventory categories found.</p>
                          ) : (
                            invCategories.map(cat => (
                              <label
                                key={cat.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded"
                                  checked={getMRCategoryCodes().includes(cat.code)}
                                  onChange={() => toggleMRCategoryCode(cat.code)}
                                />
                                <span className="text-sm text-gray-800">{cat.name}</span>
                                <span className="text-xs text-gray-400">{cat.code}</span>
                                {cat.item_type && (
                                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                    {cat.item_type}
                                  </span>
                                )}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="creates_entitlement"
                    checked={formData.creates_entitlement}
                    onChange={e => handleFormChange('creates_entitlement', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="creates_entitlement" className="ml-2 block text-sm text-gray-900">
                    Creates entitlement when invoiced
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={e => handleFormChange('is_active', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Service Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Edit Service Item: {selectedItem.name}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => handleFormChange('name', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      formErrors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.name && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => handleFormChange('code', e.target.value.toUpperCase())}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono ${
                      formErrors.code ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.code && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.code}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => handleFormChange('category', parseInt(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      formErrors.category ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value={0}>Select a category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.category && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.category}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Price (₦) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_price}
                    onChange={e => handleFormChange('default_price', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      formErrors.default_price ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.default_price && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.default_price}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => handleFormChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe what this service covers..."
                  />
                </div>

                <div className="space-y-4 border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Service Type & Material Requests
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Service Type
                    </label>
                    <select
                      value={formData.service_type || 'standard'}
                      onChange={e => handleFormChange('service_type', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="standard">Standard Service</option>
                      <option value="inventory_access">Inventory Access Only</option>
                      <option value="hybrid">Hybrid (Service + Inventory)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.service_type === 'standard' &&
                        'Pure service with no inventory access'}
                      {formData.service_type === 'inventory_access' &&
                        'Authorizes material requests without service component'}
                      {formData.service_type === 'hybrid' &&
                        'Provides both service and inventory access'}
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit_allows_material_requests"
                      checked={formData.allows_material_requests ?? false}
                      onChange={e => handleFormChange('allows_material_requests', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label
                      htmlFor="edit_allows_material_requests"
                      className="ml-2 block text-sm text-gray-900"
                    >
                      Allows material requests (e.g., textbooks, uniforms)
                    </label>
                  </div>

                  {formData.allows_material_requests && (
                    <div className="space-y-4 pl-2 border-l-2 border-blue-100">
                      {/* Limit */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Material Request Limit
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formData.material_request_limit || ''}
                          onChange={e =>
                            handleFormChange(
                              'material_request_limit',
                              e.target.value ? parseInt(e.target.value) : null
                            )
                          }
                          placeholder="Leave empty for unlimited"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Maximum number of material requests allowed per invoice (leave empty for
                          unlimited)
                        </p>
                      </div>

                      {/* Allowed item types (by item_type label) */}
                      {distinctItemTypes.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Allowed Inventory Item Types
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            Invoices with this service item will only allow material requests for
                            the selected inventory types.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {distinctItemTypes.map(itype => (
                              <label
                                key={itype}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                                  getMRItemTypes().includes(itype)
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={getMRItemTypes().includes(itype)}
                                  onChange={() => toggleMRItemType(itype)}
                                />
                                {itype}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Allowed individual categories (by code) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Allowed Inventory Categories
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Optionally restrict to specific categories (overrides item type if set).
                        </p>
                        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                          {invCategories.length === 0 ? (
                            <p className="text-xs text-gray-400">No inventory categories found.</p>
                          ) : (
                            invCategories.map(cat => (
                              <label
                                key={cat.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded"
                                  checked={getMRCategoryCodes().includes(cat.code)}
                                  onChange={() => toggleMRCategoryCode(cat.code)}
                                />
                                <span className="text-sm text-gray-800">{cat.name}</span>
                                <span className="text-xs text-gray-400">{cat.code}</span>
                                {cat.item_type && (
                                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                    {cat.item_type}
                                  </span>
                                )}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="edit_creates_entitlement"
                    checked={formData.creates_entitlement}
                    onChange={e => handleFormChange('creates_entitlement', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="edit_creates_entitlement"
                    className="ml-2 block text-sm text-gray-900"
                  >
                    Creates entitlement when invoiced
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="edit_is_active"
                    checked={formData.is_active}
                    onChange={e => handleFormChange('is_active', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="edit_is_active" className="ml-2 block text-sm text-gray-900">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedItem(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Update Service Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceItemListPage;
