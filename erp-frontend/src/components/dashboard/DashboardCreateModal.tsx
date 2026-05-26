import React, { useState } from 'react';
import { X, Loader, Plus, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface DashboardCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (dashboardId: number) => void;
}

const DashboardCreateModal: React.FC<DashboardCreateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    is_default: false,
    is_active: true,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Dashboard name is required');
      return;
    }

    if (!formData.slug.trim()) {
      setError('Dashboard slug is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const payload = {
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        description: formData.description.trim() || '',
        is_default: formData.is_default,
        is_active: formData.is_active,
        // Add required fields based on API documentation
        grid_columns: 12,
        show_navigation: true,
        navigation_config: {},
        site_refresh: false,
        refresh_interval: 30000,
      };

      console.log('Creating dashboard with payload:', payload);

      const response = await api.post('/dashboards/', payload);
      const createdDashboard = response.data || response;

      console.log('Dashboard created successfully:', createdDashboard);

      // Reset form
      setFormData({
        name: '',
        slug: '',
        description: '',
        is_default: false,
        is_active: true,
      });

      // Close modal and redirect to edit page
      onClose();
      onSuccess(createdDashboard.id);
    } catch (err: any) {
      console.error('Error creating dashboard:', err);

      let errorMessage = 'Failed to create dashboard';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.response?.data) {
        // Handle validation errors
        const errors = err.response.data;
        if (typeof errors === 'object') {
          const errorMessages = Object.entries(errors)
            .map(
              ([field, messages]) =>
                `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`
            )
            .join('; ');
          errorMessage = errorMessages;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (!creating) {
      setFormData({
        name: '',
        slug: '',
        description: '',
        is_default: false,
        is_active: true,
      });
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: '#111827',
              margin: 0,
            }}
          >
            Create New Dashboard
          </h2>
          <button
            onClick={handleClose}
            disabled={creating}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: '#6b7280',
              cursor: creating ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
              borderRadius: '4px',
              opacity: creating ? 0.5 : 1,
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'start',
              gap: '0.75rem',
            }}
          >
            <AlertCircle
              size={20}
              color="#dc2626"
              style={{ flexShrink: 0, marginTop: '0.125rem' }}
            />
            <div style={{ color: '#dc2626', fontSize: '0.875rem', lineHeight: '1.4' }}>{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Dashboard Name */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Dashboard Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g., Sales Dashboard, Financial Overview"
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  opacity: creating ? 0.5 : 1,
                }}
                required
              />
            </div>

            {/* Dashboard Slug */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Dashboard Slug *
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={e => setFormData({ ...formData, slug: e.target.value })}
                placeholder="auto-generated-from-name"
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  opacity: creating ? 0.5 : 1,
                }}
                required
              />
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                URL-friendly identifier (auto-generated from name)
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this dashboard..."
                rows={3}
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  opacity: creating ? 0.5 : 1,
                }}
              />
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={e => setFormData({ ...formData, is_default: e.target.checked })}
                  disabled={creating}
                  style={{ cursor: creating ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                  Set as default dashboard
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  disabled={creating}
                  style={{ cursor: creating ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#374151' }}>Dashboard is active</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={creating}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: 'white',
                color: '#374151',
                cursor: creating ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: creating ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !formData.name.trim() || !formData.slug.trim()}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                borderRadius: '8px',
                background:
                  creating || !formData.name.trim() || !formData.slug.trim()
                    ? '#9ca3af'
                    : '#3b82f6',
                color: 'white',
                cursor:
                  creating || !formData.name.trim() || !formData.slug.trim()
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {creating ? (
                <>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create Dashboard
                </>
              )}
            </button>
          </div>
        </form>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default DashboardCreateModal;
