import React, { useState } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Tag,
  Package,
  DollarSign,
  AlertCircle,
  Save,
  X,
} from 'lucide-react';
import {
  useInventoryCategories,
  useCreateInventoryCategory,
  useUpdateInventoryCategory,
  useDeleteInventoryCategory,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';
import { InventoryCategory } from '../../services/inventoryService';

interface CategoryFormData {
  name: string;
  code: string;
  description: string;
  inventory_account: number | '';
  cogs_account: number | '';
  sales_account: number | '';
}

const CategoriesPage: React.FC = () => {
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InventoryCategory | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch categories
  const {
    data: categoriesData,
    isLoading,
    error,
  } = useInventoryCategories({
    search: searchQuery || undefined,
    page: currentPage,
    ordering: 'name',
  });

  // Mutations
  const createCategoryMutation = useCreateInventoryCategory();
  const updateCategoryMutation = useUpdateInventoryCategory();
  const deleteCategoryMutation = useDeleteInventoryCategory();

  const categories = categoriesData?.results || [];
  const totalCategories = categoriesData?.count || 0;
  const totalPages = Math.ceil(totalCategories / 20);

  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    code: '',
    description: '',
    inventory_account: '',
    cogs_account: '',
    sales_account: '',
  });

  const [errors, setErrors] = useState<Partial<CategoryFormData>>({});

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      inventory_account: '',
      cogs_account: '',
      sales_account: '',
    });
    setErrors({});
    setEditingCategory(null);
    setShowForm(false);
  };

  const handleEdit = (category: InventoryCategory) => {
    setFormData({
      name: category.name,
      code: category.code,
      description: category.description || '',
      inventory_account: category.inventory_account,
      cogs_account: category.cogs_account,
      sales_account: category.sales_account,
    });
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (
      !confirm(`Are you sure you want to delete category "${name}"? This action cannot be undone.`)
    ) {
      return;
    }

    try {
      await deleteCategoryMutation.mutateAsync(id);
      toast.success('Category deleted successfully');
    } catch (err: unknown) {
      console.error('Failed to delete category:', err);
      toast.error('Failed to delete category');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<CategoryFormData> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.code.trim()) newErrors.code = 'Code is required';
    if (!formData.inventory_account) newErrors.inventory_account = 'Inventory account is required';
    if (!formData.cogs_account) newErrors.cogs_account = 'COGS account is required';
    if (!formData.sales_account) newErrors.sales_account = 'Sales account is required';

    // Validate lengths
    if (formData.name.length > 100) newErrors.name = 'Name must be 100 characters or less';
    if (formData.code.length > 20) newErrors.code = 'Code must be 20 characters or less';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    try {
      const submitData = {
        ...formData,
        inventory_account: Number(formData.inventory_account),
        cogs_account: Number(formData.cogs_account),
        sales_account: Number(formData.sales_account),
      };

      if (editingCategory) {
        await updateCategoryMutation.mutateAsync({
          id: editingCategory.id,
          data: submitData,
        });
        toast.success('Category updated successfully');
      } else {
        await createCategoryMutation.mutateAsync(submitData);
        toast.success('Category created successfully');
      }

      resetForm();
    } catch (err: unknown) {
      console.error('Failed to save category:', err);
      toast.error(`Failed to ${editingCategory ? 'update' : 'create'} category`);
    }
  };

  const isLoading_form = createCategoryMutation.isPending || updateCategoryMutation.isPending;

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load categories</p>
          <button
            onClick={() => window.location.reload()}
            className="text-blue-600 hover:text-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Categories</h1>
          <p className="text-gray-600">Organize your inventory items into categories</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h2>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter category name"
                      maxLength={100}
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.code ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter category code"
                      maxLength={20}
                    />
                    {errors.code && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.code}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter category description"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Inventory Account <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.inventory_account}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          inventory_account: e.target.value ? parseInt(e.target.value) : '',
                        }))
                      }
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.inventory_account ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Asset account ID"
                    />
                    {errors.inventory_account && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.inventory_account}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Asset account for inventory valuation
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      COGS Account <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.cogs_account}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          cogs_account: e.target.value ? parseInt(e.target.value) : '',
                        }))
                      }
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.cogs_account ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Expense account ID"
                    />
                    {errors.cogs_account && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.cogs_account}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      Expense account for cost of goods sold
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sales Account <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.sales_account}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          sales_account: e.target.value ? parseInt(e.target.value) : '',
                        }))
                      }
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.sales_account ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Income account ID"
                    />
                    {errors.sales_account && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.sales_account}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">Income account for sales</p>
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-6 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    disabled={isLoading_form}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading_form}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLoading_form ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isLoading_form
                      ? 'Saving...'
                      : editingCategory
                        ? 'Update Category'
                        : 'Create Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-gray-200 rounded w-24"></div>
                <div className="h-8 w-8 bg-gray-200 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-16"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))
        ) : categories.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Tag className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No categories found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery
                ? 'Try adjusting your search criteria'
                : 'Get started by creating a new category'}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Add First Category
                </button>
              </div>
            )}
          </div>
        ) : (
          categories.map(category => (
            <div
              key={category.id}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Tag className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{category.name}</h3>
                    <p className="text-sm text-gray-500">Code: {category.code}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="text-blue-600 hover:text-blue-700"
                    title="Edit Category"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id, category.name)}
                    className="text-red-600 hover:text-red-700"
                    title="Delete Category"
                    disabled={deleteCategoryMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {category.description && (
                <p className="text-sm text-gray-600 mb-4">{category.description}</p>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Inventory Account:</span>
                  <span className="font-medium">{category.inventory_account_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">COGS Account:</span>
                  <span className="font-medium">{category.cogs_account_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Sales Account:</span>
                  <span className="font-medium">{category.sales_account_name}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                    currentPage === page
                      ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                      : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
