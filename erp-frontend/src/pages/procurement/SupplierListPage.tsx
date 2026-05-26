import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Eye, Trash2, Building, Phone, Mail, MapPin } from 'lucide-react';
import { useSuppliers, useDeleteSupplier } from '../../hooks/useSuppliers';
import { useToast } from '../../hooks/useToast';

const SupplierListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // React Query hooks
  const {
    data: suppliersData,
    isLoading,
    error,
    refetch,
  } = useSuppliers({
    search: searchTerm || undefined,
    is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
  });

  const deleteSupplierMutation = useDeleteSupplier();

  const suppliers = suppliersData?.results || [];

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch =
      searchTerm === '' ||
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contact_person.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && supplier.is_active) ||
      (statusFilter === 'inactive' && !supplier.is_active);

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;

    try {
      await deleteSupplierMutation.mutateAsync(id);
      toast.success('Supplier deleted successfully');
    } catch (err) {
      console.error('Error deleting supplier:', err);
      toast.error('Failed to delete supplier');
    }
  };

  const handleSearch = () => {
    refetch();
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
          <p style={{ color: '#6b7280' }}>Loading suppliers...</p>
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
          <Building style={{ width: '2rem', height: '2rem', color: '#14b8a6' }} />
          Suppliers
        </h1>
        <p style={{ color: '#6b7280' }}>
          Manage your supplier relationships and vendor information
        </p>
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
            placeholder="Search suppliers..."
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
          <button
            onClick={handleSearch}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Search style={{ width: '1rem', height: '1rem' }} />
            Search
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            background: 'white',
          }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <button
          onClick={() => navigate('/procurement/suppliers/create')}
          style={{
            padding: '0.5rem 1rem',
            background: '#14b8a6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
          }}
        >
          <Plus style={{ width: '1rem', height: '1rem' }} />
          Add Supplier
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            color: '#dc2626',
          }}
        >
          Failed to load suppliers. Please try again.
        </div>
      )}

      {/* Suppliers List */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Suppliers ({filteredSuppliers.length})
          </h2>
        </div>

        {filteredSuppliers.length === 0 ? (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
            <h3
              style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}
            >
              No Suppliers Found
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280' }}>
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Add your first supplier to get started'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={() => navigate('/procurement/suppliers/create')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#14b8a6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Add First Supplier
              </button>
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
                    Supplier
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Contact
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Location
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Payment Terms
                  </th>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    Balance
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
                {filteredSuppliers.map(supplier => (
                  <tr key={supplier.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: '2px' }}>{supplier.name}</div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          Code: {supplier.supplier_code}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontSize: '0.875rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            marginBottom: '2px',
                          }}
                        >
                          <Phone
                            style={{ width: '0.75rem', height: '0.75rem', color: '#6b7280' }}
                          />
                          {supplier.phone}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Mail style={{ width: '0.75rem', height: '0.75rem', color: '#6b7280' }} />
                          {supplier.email}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin style={{ width: '0.75rem', height: '0.75rem', color: '#6b7280' }} />
                        {supplier.address || 'No address provided'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {supplier.payment_terms}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontSize: '0.875rem' }}>
                        <div style={{ fontWeight: 500, color: '#6b7280' }}>Outstanding</div>
                        <div style={{ fontSize: '0.875rem', color: parseFloat(supplier.outstanding_balance) > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>
                          ₦{parseFloat(supplier.outstanding_balance || '0').toLocaleString()}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: supplier.is_active ? '#d1fae5' : '#fee2e2',
                          color: supplier.is_active ? '#065f46' : '#991b1b',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        {supplier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={() => navigate(`/procurement/suppliers/${supplier.id}/view`)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            color: '#0369a1',
                          }}
                          title="View Details"
                        >
                          <Eye style={{ width: '1rem', height: '1rem' }} />
                        </button>
                        <button
                          onClick={() => navigate(`/procurement/suppliers/${supplier.id}/edit`)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            color: '#16a34a',
                          }}
                          title="Edit"
                        >
                          <Edit style={{ width: '1rem', height: '1rem' }} />
                        </button>
                        <button
                          onClick={() => handleDelete(supplier.id)}
                          disabled={deleteSupplierMutation.isPending}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: deleteSupplierMutation.isPending ? '#f3f4f6' : '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '0.25rem',
                            cursor: deleteSupplierMutation.isPending ? 'not-allowed' : 'pointer',
                            color: deleteSupplierMutation.isPending ? '#9ca3af' : '#dc2626',
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
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierListPage;
