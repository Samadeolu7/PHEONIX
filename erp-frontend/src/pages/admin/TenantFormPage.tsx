import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CreateTenantData, tenantManagementService } from '../../services/tenantManagementService';
import { useTenant, useCreateTenant, useUpdateTenant } from '../../hooks/useTenants';
import { useToast } from '../../hooks/useToast';
import { ArrowLeft, Save, Building2 } from 'lucide-react';

const TenantFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const [submitting, setSubmitting] = useState(false);
  const [originalData, setOriginalData] = useState<CreateTenantData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const { success, error: showError } = useToast();

  const { data: tenant, isLoading: tenantLoading } = useTenant(isEditMode ? Number(id) : 0);
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();

  const [formData, setFormData] = useState<CreateTenantData>({
    name: '',
    slug: '',
    domain_type: 'microfinance',
    domain_config: {},
    enabled_features: [],
    custom_labels: {},
    settings: {},
    is_active: true,
  });

  useEffect(() => {
    if (tenant) {
      const tenantData: CreateTenantData = {
        name: tenant.name,
        slug: tenant.slug,
        domain_type: tenant.domain_type,
        domain_config: tenant.domain_config || {},
        enabled_features: tenant.enabled_features || [],
        custom_labels: tenant.custom_labels || {},
        settings: tenant.settings || {},
        is_active: tenant.is_active,
      };
      setFormData(tenantData);
      setOriginalData(tenantData);
    }
  }, [tenant]);

  useEffect(() => {
    if (isEditMode && originalData) {
      const hasFormChanges = Object.keys(formData).some(key => {
        return (
          JSON.stringify(formData[key as keyof CreateTenantData]) !==
          JSON.stringify(originalData[key as keyof CreateTenantData])
        );
      });
      setHasChanges(hasFormChanges);
    } else if (!isEditMode) {
      const requiredFieldsFilled = formData.name && formData.slug;
      setHasChanges(Boolean(requiredFieldsFilled));
    }
  }, [formData, originalData, isEditMode]);

  useEffect(() => {
    if (!tenantLoading && isEditMode && !tenant) {
      showError('Failed to load tenant');
      navigate('/admin/tenants');
    }
  }, [tenantLoading, tenant, isEditMode, navigate, showError]);

  const handleInputChange = (field: keyof CreateTenantData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    if (field === 'name' && !isEditMode) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.name || !formData.slug) {
      showError('Please fill in all required fields');
      return;
    }

    const slugRegex = /^[-a-zA-Z0-9_]+$/;
    if (!slugRegex.test(formData.slug)) {
      showError('Slug can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    try {
      setSubmitting(true);

      if (isEditMode && id) {
        await updateTenant.mutateAsync({ id: Number(id), data: formData });
        success('Tenant updated successfully');
      } else {
        await createTenant.mutateAsync(formData);
        success('Tenant created successfully');
      }

      navigate('/admin/tenants');
    } catch (error: any) {
      console.error('Error saving tenant:', error);
      showError(error.message || 'Failed to save tenant');
    } finally {
      setSubmitting(false);
    }
  };

  const domainTypeOptions = tenantManagementService.getDomainTypeOptions();

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/tenants')}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEditMode ? 'Edit Tenant' : 'Create New Tenant'}
              </h1>
              <p className="text-gray-600">
                {isEditMode ? 'Update tenant information' : 'Add a new tenant to the system'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tenant Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tenant Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter tenant name"
                required
                maxLength={150}
              />
              <p className="text-sm text-gray-500 mt-1">Maximum 150 characters</p>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={e => handleInputChange('slug', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter tenant slug"
                required
                maxLength={200}
                pattern="^[-a-zA-Z0-9_]+$"
                disabled={isEditMode}
              />
              <p className="text-sm text-gray-500 mt-1">
                {isEditMode
                  ? 'Slug cannot be changed after creation'
                  : 'Only letters, numbers, hyphens, and underscores. Auto-generated from name.'}
              </p>
            </div>

            {/* Domain Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Domain Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.domain_type}
                onChange={e => handleInputChange('domain_type', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                required
              >
                {domainTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="is_active"
                    checked={formData.is_active === true}
                    onChange={() => handleInputChange('is_active', true)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="is_active"
                    checked={formData.is_active === false}
                    onChange={() => handleInputChange('is_active', false)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Inactive</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Configuration</h3>

          <div className="space-y-4">
            {/* Domain Config */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Domain Configuration (JSON)
              </label>
              <textarea
                value={JSON.stringify(formData.domain_config, null, 2)}
                onChange={e => {
                  try {
                    const config = JSON.parse(e.target.value);
                    handleInputChange('domain_config', config);
                  } catch (error) {
                    // Invalid JSON, keep the text as is for user to fix
                  }
                }}
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                placeholder='{"key": "value"}'
              />
              <p className="text-sm text-gray-500 mt-1">
                Domain-specific settings and customizations
              </p>
            </div>

            {/* Enabled Features */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enabled Features (JSON Array)
              </label>
              <textarea
                value={JSON.stringify(formData.enabled_features, null, 2)}
                onChange={e => {
                  try {
                    const features = JSON.parse(e.target.value);
                    handleInputChange('enabled_features', features);
                  } catch (error) {
                    // Invalid JSON, keep the text as is for user to fix
                  }
                }}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                placeholder='["feature1", "feature2"]'
              />
              <p className="text-sm text-gray-500 mt-1">List of enabled features for this tenant</p>
            </div>

            {/* Custom Labels */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Labels (JSON)
              </label>
              <textarea
                value={JSON.stringify(formData.custom_labels, null, 2)}
                onChange={e => {
                  try {
                    const labels = JSON.parse(e.target.value);
                    handleInputChange('custom_labels', labels);
                  } catch (error) {
                    // Invalid JSON, keep the text as is for user to fix
                  }
                }}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                placeholder='{"field_name": "Custom Label"}'
              />
              <p className="text-sm text-gray-500 mt-1">Custom field labels for this tenant</p>
            </div>

            {/* Settings */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                General Settings (JSON)
              </label>
              <textarea
                value={JSON.stringify(formData.settings, null, 2)}
                onChange={e => {
                  try {
                    const settings = JSON.parse(e.target.value);
                    handleInputChange('settings', settings);
                  } catch (error) {
                    // Invalid JSON, keep the text as is for user to fix
                  }
                }}
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-sm"
                placeholder='{"setting_name": "value"}'
              />
              <p className="text-sm text-gray-500 mt-1">General settings for this tenant</p>
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/admin/tenants')}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || (!hasChanges && isEditMode) || (!hasChanges && !isEditMode)}
            className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {submitting ? 'Saving...' : isEditMode ? 'Update Tenant' : 'Create Tenant'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TenantFormPage;
