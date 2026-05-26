import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, GraduationCap } from 'lucide-react';
import { clientClassificationService } from '../services/clientClassificationService';

interface ClientClassification {
  id: number;
  name: string;
  code: string;
  description: string;
  priority_level: number;
  credit_limit: string;
  special_rates: string;
  created_at: string;
  updated_at: string;
}

interface ClientClassificationFormData {
  name: string;
  code: string;
  description: string;
  priority_level: number;
  credit_limit: string;
  special_rates: string;
}

const ClientClassificationsPage: React.FC = () => {
  const [classifications, setClassifications] = useState<ClientClassification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClassification, setEditingClassification] = useState<ClientClassification | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [previousPage, setPreviousPage] = useState<string | null>(null);

  const [formData, setFormData] = useState<ClientClassificationFormData>({
    name: '',
    code: '',
    description: '',
    priority_level: 1,
    credit_limit: '0',
    special_rates: '',
  });

  useEffect(() => {
    fetchClassifications();
  }, [currentPage, searchTerm]);

  const fetchClassifications = async () => {
    try {
      setLoading(true);
      const response = await clientClassificationService.getClassifications({
        page: currentPage,
        search: searchTerm,
        ordering: 'name',
      });
      setClassifications(response.results);
      setTotalCount(response.count);
      setNextPage(response.next);
      setPreviousPage(response.previous);
    } catch (err) {
      setError('Failed to fetch student classifications');
      console.error('Error fetching classifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClassification) {
        await clientClassificationService.updateClassification(editingClassification.id, formData);
      } else {
        await clientClassificationService.createClassification(formData);
      }
      setShowModal(false);
      setEditingClassification(null);
      resetForm();
      fetchClassifications();
    } catch (err) {
      setError('Failed to save student classification');
      console.error('Error saving classification:', err);
    }
  };

  const handleEdit = (classification: ClientClassification) => {
    setEditingClassification(classification);
    setFormData({
      name: classification.name,
      code: classification.code,
      description: classification.description,
      priority_level: classification.priority_level,
      credit_limit: classification.credit_limit,
      special_rates: classification.special_rates,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this student classification?')) {
      try {
        await clientClassificationService.deleteClassification(id);
        fetchClassifications();
      } catch (err) {
        setError('Failed to delete student classification');
        console.error('Error deleting classification:', err);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      priority_level: 1,
      credit_limit: '0',
      special_rates: '',
    });
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingClassification(null);
    resetForm();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  if (loading && classifications.length === 0) {
    return <div style={{ padding: '2rem' }}>Loading student classifications...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;
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
          <GraduationCap style={{ width: '2rem', height: '2rem', color: '#4f46e5' }} />
          Student Classification Levels
        </h1>
        <p style={{ color: '#6b7280' }}>
          Manage student classification types and academic settings
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
            placeholder="Search classifications by name or code..."
            value={searchTerm}
            onChange={handleSearchChange}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
          <button
            onClick={fetchClassifications}
            style={{
              padding: '0.5rem 1rem',
              background: '#4f46e5',
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

        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '0.5rem 1rem',
            background: '#4f46e5',
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
          Add Classification Level
        </button>
      </div>

      {/* Classifications List */}
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
            Classification Levels ({classifications.length})
          </h2>
        </div>

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
                  Level Name
                </th>
                <th
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Level Code
                </th>
                <th
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Description
                </th>
                <th
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Priority Order
                </th>
                <th
                  style={{
                    padding: '0.75rem',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Tuition Limit ($)
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
              {classifications.map(classification => (
                <tr key={classification.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 500 }}>{classification.name}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    <span
                      style={{
                        padding: '0.125rem 0.5rem',
                        background: '#e0e7ff',
                        color: '#4f46e5',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}
                    >
                      {classification.code}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem', maxWidth: '200px' }}>
                    <div
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {classification.description || '-'}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    <span
                      style={{
                        padding: '0.125rem 0.5rem',
                        background: '#f3f4f6',
                        borderRadius: '0.25rem',
                      }}
                    >
                      Level {classification.priority_level}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    ${parseFloat(classification.credit_limit).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleEdit(classification)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          color: '#16a34a',
                        }}
                        title="Edit Classification Level"
                      >
                        <Edit style={{ width: '1rem', height: '1rem' }} />
                      </button>
                      <button
                        onClick={() => handleDelete(classification.id)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          color: '#dc2626',
                        }}
                        title="Delete Classification Level"
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
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#374151' }}>
            Showing {classifications.length} of {totalCount} classification levels
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={!previousPage}
              style={{
                padding: '0.25rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                background: 'white',
                cursor: previousPage ? 'pointer' : 'not-allowed',
                opacity: previousPage ? 1 : 0.5,
                fontSize: '0.875rem',
              }}
            >
              Previous
            </button>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                background: '#4f46e5',
                color: 'white',
                borderRadius: '0.25rem',
                fontSize: '0.875rem',
              }}
            >
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={!nextPage}
              style={{
                padding: '0.25rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                background: 'white',
                cursor: nextPage ? 'pointer' : 'not-allowed',
                opacity: nextPage ? 1 : 0.5,
                fontSize: '0.875rem',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
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
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '28rem',
              margin: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
              {editingClassification ? 'Edit Classification Level' : 'Add New Classification Level'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    Level Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                    placeholder="e.g., Freshman, Sophomore, Junior, Senior"
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
                    Level Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                    placeholder="e.g., FR, SO, JR, SR"
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
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                    }}
                    placeholder="Describe this classification level..."
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
                    Priority Order (1 = Highest)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.priority_level}
                    onChange={e =>
                      setFormData({ ...formData, priority_level: parseInt(e.target.value) })
                    }
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
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
                    Maximum Tuition Limit ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.credit_limit}
                    onChange={e => setFormData({ ...formData, credit_limit: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
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
                    Special Academic Rates
                  </label>
                  <input
                    type="text"
                    value={formData.special_rates}
                    onChange={e => setFormData({ ...formData, special_rates: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                    placeholder="e.g., Scholarship rates, Grant eligibility"
                  />
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '1.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={handleModalClose}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {editingClassification ? 'Update Level' : 'Create Level'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientClassificationsPage;
