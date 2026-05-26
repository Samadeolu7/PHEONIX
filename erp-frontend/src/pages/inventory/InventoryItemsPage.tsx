import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Trash2, Package } from 'lucide-react';
import {
  useInventoryItems,
  useInventoryCategories,
  useDeleteInventoryItem,
} from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';

export default function InventoryItemsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const toast = useToast();

  const {
    data: itemsData,
    isLoading,
    error,
  } = useInventoryItems({
    search: searchTerm,
    category: parseInt(categoryFilter) || undefined,
    page,
  });

  const { data: categories } = useInventoryCategories();
  const deleteItemMutation = useDeleteInventoryItem();

  const items = itemsData?.results || [];
  const totalPages = Math.ceil((itemsData?.count || 0) / 20);
  const categoryOptions = categories?.results || [];

  const handleDeleteItem = async (item: any) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteItemMutation.mutateAsync(item.id);
      toast.success(`Item "${item.name}" deleted successfully!`);
    } catch (error) {
      toast.error(`Failed to delete item "${item.name}". Please try again.`);
    }
  };

  if (isLoading) {
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
          <p style={{ color: '#6b7280' }}>Loading inventory items...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            color: '#dc2626',
          }}
        >
          Error loading inventory items: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Package style={{ width: '2rem', height: '2rem', color: '#3b82f6' }} />
          Inventory Items
        </h1>
        <p style={{ color: '#6b7280' }}>Manage your inventory items and stock levels</p>
      </div>

      {/* Search and Actions */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search items by name, SKU, or barcode..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
          <Search
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '1rem',
              height: '1rem',
              color: '#9ca3af',
            }}
          />
        </div>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            background: 'white',
          }}
        >
          <option value="">All Categories</option>
          {categoryOptions?.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <Link
          to="/inventory/items/create"
          style={{
            padding: '0.5rem 1rem',
            background: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
          }}
        >
          <Plus style={{ width: '1rem', height: '1rem' }} />
          Add Item
        </Link>
      </div>

      {/* Items List */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Items ({items.length})</h2>
        </div>

        {items.length === 0 ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
            <h3
              style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}
            >
              No Inventory Items Found
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280' }}>
              {searchTerm || categoryFilter
                ? 'Try adjusting your search or filters'
                : 'Add your first inventory item to get started'}
            </p>
            {!searchTerm && !categoryFilter && (
              <Link
                to="/inventory/items/create"
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'inline-block',
                }}
              >
                Add First Item
              </Link>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Item
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    SKU
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Category
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Stock Level
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Unit Price
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: '2px' }}>{item.name}</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {item.description}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{item.sku}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {item.category_name || '-'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div className="text-sm text-gray-900">
                        <div style={{ fontWeight: 500 }}>
                          {item.total_stock ?? item.current_stock ?? 0} {item.unit_of_measure}
                        </div>
                        {parseFloat(item.reorder_level || '0') > 0 &&
                          (item.total_stock ?? item.current_stock ?? 0) <= parseFloat(item.reorder_level) && (
                            <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>Low Stock</div>
                          )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      ₦
                      {typeof item.selling_price === 'number'
                        ? item.selling_price.toFixed(2)
                        : parseFloat(item.selling_price || '0').toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: item.is_active ? '#d1fae5' : '#fee2e2',
                          color: item.is_active ? '#065f46' : '#991b1b',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                        <Link
                          to={`/inventory/items/${item.id}/view`}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '0.25rem',
                            color: '#0369a1',
                            textDecoration: 'none',
                          }}
                          title="View Details"
                        >
                          <Eye style={{ width: '1rem', height: '1rem' }} />
                        </Link>
                        <Link
                          to={`/inventory/items/${item.id}/edit`}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '0.25rem',
                            color: '#16a34a',
                            textDecoration: 'none',
                          }}
                          title="Edit"
                        >
                          <Edit style={{ width: '1rem', height: '1rem' }} />
                        </Link>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          disabled={deleteItemMutation.isPending}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: deleteItemMutation.isPending ? '#f3f4f6' : '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '0.25rem',
                            color: deleteItemMutation.isPending ? '#9ca3af' : '#dc2626',
                            cursor: deleteItemMutation.isPending ? 'not-allowed' : 'pointer',
                          }}
                          title="Delete"
                        >
                          <Trash2 style={{ width: '1rem', height: '1rem' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, itemsData?.count || 0)} of{' '}
                  {itemsData?.count || 0} items
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    style={{
                      padding: '0.25rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      background: page === 1 ? '#f9fafb' : 'white',
                      color: page === 1 ? '#9ca3af' : '#374151',
                      cursor: page === 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    style={{
                      padding: '0.25rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      background: page === totalPages ? '#f9fafb' : 'white',
                      color: page === totalPages ? '#9ca3af' : '#374151',
                      cursor: page === totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
