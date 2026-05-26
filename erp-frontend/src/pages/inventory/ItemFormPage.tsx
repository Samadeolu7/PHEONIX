import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Package, AlertCircle } from 'lucide-react';
import {
  useInventoryItem,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useInventoryCategories,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';
import { InventoryItem } from '../../services/inventoryService';

interface ItemFormData {
  sku: string;
  name: string;
  barcode: string;
  description: string;
  category: number | '';
  unit_of_measure: string;
  cost_price: string;
  selling_price: string;
  minimum_selling_price: string;
  valuation_method: 'fifo' | 'lifo' | 'average';
  reorder_level: string;
  reorder_quantity: string;
  is_active: boolean;
  is_sellable: boolean;
  is_purchasable: boolean;
  track_serial_numbers: boolean;
  track_batch_numbers: boolean;
  track_expiry: boolean;
}

const ItemFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const isEditing = !!id;

  // Fetch existing item data if editing
  const { data: existingItem, isLoading: itemLoading } = useInventoryItem(
    parseInt(id || '0'),
    isEditing
  );

  // Fetch categories for dropdown
  const { data: categoriesData } = useInventoryCategories();
  const categories = categoriesData?.results || [];

  // Mutations
  const createItemMutation = useCreateInventoryItem();
  const updateItemMutation = useUpdateInventoryItem();

  const [formData, setFormData] = useState<ItemFormData>({
    sku: '',
    name: '',
    barcode: '',
    description: '',
    category: '',
    unit_of_measure: '',
    cost_price: '',
    selling_price: '',
    minimum_selling_price: '',
    valuation_method: 'fifo',
    reorder_level: '',
    reorder_quantity: '',
    is_active: true,
    is_sellable: true,
    is_purchasable: true,
    track_serial_numbers: false,
    track_batch_numbers: false,
    track_expiry: false,
  });

  const [errors, setErrors] = useState<Partial<ItemFormData>>({});

  // Populate form with existing data when editing
  useEffect(() => {
    if (existingItem && isEditing) {
      setFormData({
        sku: existingItem.sku || '',
        name: existingItem.name || '',
        barcode: existingItem.barcode || '',
        description: existingItem.description || '',
        category: existingItem.category || '',
        unit_of_measure: existingItem.unit_of_measure || '',
        cost_price: existingItem.cost_price || '',
        selling_price: existingItem.selling_price || '',
        minimum_selling_price: existingItem.minimum_selling_price || '',
        valuation_method: existingItem.valuation_method || 'fifo',
        reorder_level: existingItem.reorder_level || '',
        reorder_quantity: existingItem.reorder_quantity || '',
        is_active: existingItem.is_active ?? true,
        is_sellable: existingItem.is_sellable ?? true,
        is_purchasable: existingItem.is_purchasable ?? true,
        track_serial_numbers: existingItem.track_serial_numbers ?? false,
        track_batch_numbers: existingItem.track_batch_numbers ?? false,
        track_expiry: existingItem.track_expiry ?? false,
      });
    }
  }, [existingItem, isEditing]);

  const handleInputChange = (field: keyof ItemFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<ItemFormData> = {};

    if (!formData.sku.trim()) newErrors.sku = 'SKU is required';
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.cost_price) newErrors.cost_price = 'Cost price is required';
    if (!formData.selling_price) newErrors.selling_price = 'Selling price is required';

    // Validate decimal format
    const decimalRegex = /^-?\d{0,16}(?:\.\d{0,2})?$/;
    if (formData.cost_price && !decimalRegex.test(formData.cost_price)) {
      newErrors.cost_price = 'Invalid price format';
    }
    if (formData.selling_price && !decimalRegex.test(formData.selling_price)) {
      newErrors.selling_price = 'Invalid price format';
    }
    if (formData.minimum_selling_price && !decimalRegex.test(formData.minimum_selling_price)) {
      newErrors.minimum_selling_price = 'Invalid price format';
    }

    // Validate price logic
    if (formData.cost_price && formData.selling_price) {
      const costPrice = parseFloat(formData.cost_price);
      const sellingPrice = parseFloat(formData.selling_price);
      if (sellingPrice < costPrice) {
        newErrors.selling_price = 'Selling price should be higher than cost price';
      }
    }

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
        category: Number(formData.category),
        minimum_selling_price: formData.minimum_selling_price || null,
      };

      if (isEditing && id) {
        await updateItemMutation.mutateAsync({
          id: parseInt(id),
          data: submitData,
        });
        toast.success('Item updated successfully');
      } else {
        await createItemMutation.mutateAsync(submitData);
        toast.success('Item created successfully');
      }

      navigate('/inventory/items');
    } catch (err: unknown) {
      console.error('Failed to save item:', err);
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} item`);
    }
  };

  const isLoading = createItemMutation.isPending || updateItemMutation.isPending;

  if (itemLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading item...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory/items')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Item' : 'Add New Item'}
          </h1>
          <p className="text-gray-600">
            {isEditing ? 'Update item information' : 'Create a new inventory item'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={e => handleInputChange('sku', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.sku ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter SKU"
                maxLength={100}
              />
              {errors.sku && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.sku}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter item name"
                maxLength={200}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Barcode</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={e => handleInputChange('barcode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter barcode"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category}
                onChange={e =>
                  handleInputChange('category', e.target.value ? parseInt(e.target.value) : '')
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.category ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.category}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter item description"
              />
            </div>
          </div>
        </div>

        {/* Pricing & Inventory */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Inventory</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit of Measure
              </label>
              <input
                type="text"
                value={formData.unit_of_measure}
                onChange={e => handleInputChange('unit_of_measure', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., unit, kg, liter, box"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Valuation Method
              </label>
              <select
                value={formData.valuation_method}
                onChange={e => handleInputChange('valuation_method', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="fifo">FIFO - First In First Out</option>
                <option value="lifo">LIFO - Last In First Out</option>
                <option value="average">Weighted Average</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cost Price <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.cost_price}
                onChange={e => handleInputChange('cost_price', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.cost_price ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
              {errors.cost_price && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.cost_price}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selling Price <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.selling_price}
                onChange={e => handleInputChange('selling_price', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.selling_price ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
              {errors.selling_price && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.selling_price}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Selling Price
              </label>
              <input
                type="text"
                value={formData.minimum_selling_price}
                onChange={e => handleInputChange('minimum_selling_price', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.minimum_selling_price ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
              {errors.minimum_selling_price && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.minimum_selling_price}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reorder Level</label>
              <input
                type="text"
                value={formData.reorder_level}
                onChange={e => handleInputChange('reorder_level', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reorder Quantity
              </label>
              <input
                type="text"
                value={formData.reorder_quantity}
                onChange={e => handleInputChange('reorder_quantity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => handleInputChange('is_active', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Active</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_sellable}
                  onChange={e => handleInputChange('is_sellable', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Sellable</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_purchasable}
                  onChange={e => handleInputChange('is_purchasable', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Purchasable</span>
              </label>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Tracking Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.track_serial_numbers}
                    onChange={e => handleInputChange('track_serial_numbers', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Track Serial Numbers</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.track_batch_numbers}
                    onChange={e => handleInputChange('track_batch_numbers', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Track Batch Numbers</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.track_expiry}
                    onChange={e => handleInputChange('track_expiry', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Track Expiry Dates</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/inventory/items')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isLoading ? 'Saving...' : isEditing ? 'Update Item' : 'Create Item'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ItemFormPage;
