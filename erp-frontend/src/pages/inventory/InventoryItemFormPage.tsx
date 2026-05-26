import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Package, Plus, X } from 'lucide-react';
import {
  useInventoryCategories,
  useInventoryItem,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useCreateInventoryCategory,
} from '../../hooks/useInventory';
import {
  useInventoryAccounts,
  useIncomeAccounts,
  useExpenseAccounts,
} from '../../hooks/useAccountsSimple';
import { useToast } from '../../hooks/useToast';

interface ItemFormData {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  category: string;
  unit_of_measure: string;
  cost_price: number;
  selling_price: number;
  minimum_selling_price: number;
  valuation_method: 'fifo' | 'lifo' | 'average';
  reorder_level: number;
  reorder_quantity: number;
  is_active: boolean;
  is_sellable: boolean;
  is_purchasable: boolean;
}

export default function InventoryItemFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const toast = useToast();

  const [formData, setFormData] = useState<ItemFormData>({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    category: '',
    unit_of_measure: 'pcs',
    cost_price: 0,
    selling_price: 0,
    minimum_selling_price: 0,
    valuation_method: 'fifo',
    reorder_level: 0,
    reorder_quantity: 0,
    is_active: true,
    is_sellable: true,
    is_purchasable: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    code: '',
    description: '',
    inventory_account: '',
    cogs_account: '',
    sales_account: '',
  });

  const { data: categories } = useInventoryCategories();
  const { data: item, isLoading: itemLoading } = useInventoryItem(parseInt(id!), isEdit);
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const createCategoryMutation = useCreateInventoryCategory();

  // Account hooks for category creation
  const { data: inventoryAccounts } = useInventoryAccounts();
  const { data: incomeAccounts } = useIncomeAccounts();
  const { data: expenseAccounts } = useExpenseAccounts();

  const categoryOptions = categories?.results || [];

  useEffect(() => {
    if (isEdit && item) {
      setFormData({
        name: item.name || '',
        description: item.description || '',
        sku: item.sku || '',
        barcode: item.barcode || '',
        category: item.category?.toString() || '',
        unit_of_measure: item.unit_of_measure || 'pcs',
        cost_price: parseFloat(item.cost_price || '0'),
        selling_price: parseFloat(item.selling_price || '0'),
        minimum_selling_price: parseFloat(item.minimum_selling_price || '0'),
        valuation_method: item.valuation_method || 'fifo',
        reorder_level: parseFloat(item.reorder_level || '0'),
        reorder_quantity: parseFloat(item.reorder_quantity || '0'),
        is_active: item.is_active ?? true,
        is_sellable: item.is_sellable ?? true,
        is_purchasable: item.is_purchasable ?? true,
      });
    }
  }, [isEdit, item]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Item name is required';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required';
    }

    if (formData.selling_price < 0) {
      newErrors.selling_price = 'Selling price cannot be negative';
    }

    if (formData.cost_price < 0) {
      newErrors.cost_price = 'Cost price cannot be negative';
    }

    if (formData.minimum_selling_price < 0) {
      newErrors.minimum_selling_price = 'Minimum selling price cannot be negative';
    }

    if (formData.minimum_selling_price > formData.selling_price) {
      newErrors.minimum_selling_price = 'Minimum selling price cannot be higher than selling price';
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
      if (isEdit) {
        await updateMutation.mutateAsync({ id: parseInt(id!), data: formData });
        toast.success('Item updated successfully!');
      } else {
        await createMutation.mutateAsync(formData);
        toast.success('Item created successfully!');
      }
      navigate('/inventory/items');
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Failed to save item');
    }
  };

  const handleInputChange = (field: keyof ItemFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryFormData.name.trim() || !categoryFormData.code.trim()) {
      toast.error('Category name and code are required');
      return;
    }

    try {
      const newCategory = await createCategoryMutation.mutateAsync({
        name: categoryFormData.name,
        code: categoryFormData.code,
        description: categoryFormData.description || undefined,
        inventory_account: categoryFormData.inventory_account
          ? parseInt(categoryFormData.inventory_account)
          : undefined,
        cogs_account: categoryFormData.cogs_account
          ? parseInt(categoryFormData.cogs_account)
          : undefined,
        sales_account: categoryFormData.sales_account
          ? parseInt(categoryFormData.sales_account)
          : undefined,
      });

      // Set the newly created category as selected
      setFormData(prev => ({ ...prev, category: newCategory.id.toString() }));

      // Reset form and close modal
      setCategoryFormData({
        name: '',
        code: '',
        description: '',
        inventory_account: '',
        cogs_account: '',
        sales_account: '',
      });
      setShowCategoryModal(false);
      toast.success('Category created successfully!');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to create category');
    }
  };

  if (isEdit && itemLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: '#6b7280' }}>Loading item...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <button
            onClick={() => navigate('/inventory/items')}
            style={{
              padding: '0.5rem',
              background: '#f9fafb',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeft style={{ width: '1.25rem', height: '1.25rem' }} />
          </button>
          <div>
            <h1
              style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Package style={{ width: '2rem', height: '2rem', color: '#3b82f6' }} />
              {isEdit ? 'Edit Item' : 'Add New Item'}
            </h1>
          </div>
        </div>
        <p style={{ color: '#6b7280' }}>
          {isEdit ? 'Update item information' : 'Create a new inventory item'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Basic Information */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 500,
              color: '#111827',
              marginBottom: '1rem',
            }}
          >
            Basic Information
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Item Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors.name ? '1px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter item name"
              />
              {errors.name && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                SKU *
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={e => handleInputChange('sku', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors.sku ? '1px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter SKU"
              />
              {errors.sku && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.sku}
                </p>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Barcode
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={e => handleInputChange('barcode', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter barcode"
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Category
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={formData.category}
                  onChange={e => handleInputChange('category', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    background: 'white',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Category</option>
                  {categoryOptions?.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  style={{
                    padding: '0.75rem',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#374151',
                  }}
                  title="Create New Category"
                >
                  <Plus style={{ width: '1rem', height: '1rem' }} />
                </button>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Unit of Measure
              </label>
              <select
                value={formData.unit_of_measure}
                onChange={e => handleInputChange('unit_of_measure', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  background: 'white',
                  boxSizing: 'border-box',
                }}
              >
                <option value="pcs">Pieces</option>
                <option value="kg">Kilograms</option>
                <option value="lbs">Pounds</option>
                <option value="liters">Liters</option>
                <option value="meters">Meters</option>
                <option value="boxes">Boxes</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => handleInputChange('description', e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              placeholder="Enter item description"
            />
          </div>
        </div>

        {/* Pricing */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 500,
              color: '#111827',
              marginBottom: '1rem',
            }}
          >
            Pricing
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Cost Price
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price}
                onChange={e => handleInputChange('cost_price', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors.cost_price ? '1px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {errors.cost_price && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.cost_price}
                </p>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Selling Price
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.selling_price}
                onChange={e => handleInputChange('selling_price', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors.selling_price ? '1px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {errors.selling_price && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.selling_price}
                </p>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Minimum Selling Price
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.minimum_selling_price}
                onChange={e =>
                  handleInputChange('minimum_selling_price', parseFloat(e.target.value) || 0)
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors.minimum_selling_price ? '1px solid #dc2626' : '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {errors.minimum_selling_price && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.minimum_selling_price}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stock Management */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 500,
              color: '#111827',
              marginBottom: '1rem',
            }}
          >
            Stock Management
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Valuation Method
              </label>
              <select
                value={formData.valuation_method}
                onChange={e => handleInputChange('valuation_method', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  background: 'white',
                  boxSizing: 'border-box',
                }}
              >
                <option value="fifo">FIFO - First In First Out</option>
                <option value="lifo">LIFO - Last In First Out</option>
                <option value="average">Weighted Average</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Reorder Level
              </label>
              <input
                type="number"
                min="0"
                value={formData.reorder_level}
                onChange={e => handleInputChange('reorder_level', parseInt(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Minimum stock level"
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.25rem',
                }}
              >
                Reorder Quantity
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.reorder_quantity}
                onChange={e =>
                  handleInputChange('reorder_quantity', parseFloat(e.target.value) || 0)
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
                placeholder="Quantity to reorder"
              />
            </div>
          </div>
        </div>

        {/* Item Settings */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 500,
              color: '#111827',
              marginBottom: '1rem',
            }}
          >
            Item Settings
          </h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={e => handleInputChange('is_active', e.target.checked)}
                style={{
                  width: '1rem',
                  height: '1rem',
                  accentColor: '#3b82f6',
                }}
              />
              <label htmlFor="is_active" style={{ fontSize: '0.875rem', color: '#374151' }}>
                Item is active
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="is_sellable"
                checked={formData.is_sellable}
                onChange={e => handleInputChange('is_sellable', e.target.checked)}
                style={{
                  width: '1rem',
                  height: '1rem',
                  accentColor: '#3b82f6',
                }}
              />
              <label htmlFor="is_sellable" style={{ fontSize: '0.875rem', color: '#374151' }}>
                Item can be sold
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="is_purchasable"
                checked={formData.is_purchasable}
                onChange={e => handleInputChange('is_purchasable', e.target.checked)}
                style={{
                  width: '1rem',
                  height: '1rem',
                  accentColor: '#3b82f6',
                }}
              />
              <label htmlFor="is_purchasable" style={{ fontSize: '0.875rem', color: '#374151' }}>
                Item can be purchased
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => navigate('/inventory/items')}
            style={{
              padding: '0.75rem 1.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            style={{
              padding: '0.75rem 1.5rem',
              background:
                createMutation.isPending || updateMutation.isPending ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor:
                createMutation.isPending || updateMutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Save style={{ width: '1rem', height: '1rem' }} />
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </form>

      {/* Category Creation Modal */}
      {showCategoryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
                Create New Category
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#6b7280',
                }}
              >
                <X style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
            </div>

            <form onSubmit={handleCreateCategory}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={categoryFormData.name}
                    onChange={e => setCategoryFormData(prev => ({ ...prev, name: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Enter category name"
                    required
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Category Code *
                  </label>
                  <input
                    type="text"
                    value={categoryFormData.code}
                    onChange={e => setCategoryFormData(prev => ({ ...prev, code: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Enter category code"
                    required
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Description
                  </label>
                  <textarea
                    value={categoryFormData.description}
                    onChange={e =>
                      setCategoryFormData(prev => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                    placeholder="Enter category description"
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Inventory Account (Current Asset)
                    </label>
                    <select
                      value={categoryFormData.inventory_account}
                      onChange={e =>
                        setCategoryFormData(prev => ({
                          ...prev,
                          inventory_account: e.target.value,
                        }))
                      }
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        background: 'white',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Select Inventory Account</option>
                      {inventoryAccounts?.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: '0.25rem',
                      }}
                    >
                      COGS Account (Expense)
                    </label>
                    <select
                      value={categoryFormData.cogs_account}
                      onChange={e =>
                        setCategoryFormData(prev => ({ ...prev, cogs_account: e.target.value }))
                      }
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        background: 'white',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Select COGS Account</option>
                      {expenseAccounts?.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: '#374151',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Sales Account (Income)
                    </label>
                    <select
                      value={categoryFormData.sales_account}
                      onChange={e =>
                        setCategoryFormData(prev => ({ ...prev, sales_account: e.target.value }))
                      }
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        background: 'white',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">Select Sales Account</option>
                      {incomeAccounts?.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '1rem',
                  marginTop: '1.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCategoryMutation.isPending}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: createCategoryMutation.isPending ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: createCategoryMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Plus style={{ width: '1rem', height: '1rem' }} />
                  {createCategoryMutation.isPending ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
