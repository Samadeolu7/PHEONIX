// src/pages/admin/BranchFormPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { branchService, Branch, CreateBranchData } from '../../services/branchService';
import { tenantManagementService, TenantOption } from '../../services/tenantManagementService';
import { useToast } from '../../hooks/useToast';
import { ArrowLeft, Save, Building } from 'lucide-react';

const BranchFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [originalData, setOriginalData] = useState<CreateBranchData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const { success, error: showError } = useToast();

  const [formData, setFormData] = useState<CreateBranchData>({
    name: '',
    code: '',
    address: '',
    is_active: true,
    is_deleted: false,
    owner: null,
    created_by: null,
  });

  useEffect(() => {
    loadTenants();
    if (isEditMode && id) {
      loadBranch();
    }
  }, [id, isEditMode]);

  // Check for changes when formData updates
  useEffect(() => {
    if (isEditMode && originalData) {
      const hasFormChanges = Object.keys(formData).some(key => {
        return (
          formData[key as keyof CreateBranchData] !== originalData[key as keyof CreateBranchData]
        );
      });
      setHasChanges(hasFormChanges);
    } else if (!isEditMode) {
      // For create mode, check if required fields are filled
      const requiredFieldsFilled = formData.name && formData.code;
      setHasChanges(Boolean(requiredFieldsFilled));
    }
  }, [formData, originalData, isEditMode]);

  const loadTenants = async () => {
    try {
      const tenantOptions = await tenantManagementService.getTenantOptions({ is_active: true });
      setTenants(tenantOptions);
    } catch (error) {
      console.error('Error loading tenants:', error);
      showError('Failed to load tenants');
    }
  };

  const loadBranch = async () => {
    try {
      setLoading(true);
      const branch = await branchService.getBranch(Number(id));
      const branchData: CreateBranchData = {
        name: branch.name,
        code: branch.code,
        address: branch.address || '',
        is_active: branch.is_active,
        is_deleted: branch.is_deleted,
        owner: branch.owner,
        created_by: branch.created_by,
      };
      setFormData(branchData);
      setOriginalData(branchData);
    } catch (error) {
      console.error('Error loading branch:', error);
      showError('Failed to load branch');
      navigate('/admin/branches');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CreateBranchData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.name || !formData.code) {
      showError('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);

      if (isEditMode && id) {
        await branchService.updateBranch(Number(id), formData);
        success('Branch updated successfully');
      } else {
        await branchService.createBranch(formData);
        success('Branch created successfully');
      }

      navigate('/admin/branches');
    } catch (error: any) {
      console.error('Error saving branch:', error);
      showError(error.message || 'Failed to save branch');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
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
            onClick={() => navigate('/admin/branches')}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3">
            <Building className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEditMode ? 'Edit Branch' : 'Create New Branch'}
              </h1>
              <p className="text-gray-600">
                {isEditMode ? 'Update branch information' : 'Add a new branch to the organization'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Branch Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Branch Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Branch Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter branch name"
                required
                maxLength={100}
              />
              <p className="text-sm text-gray-500 mt-1">Maximum 100 characters</p>
            </div>

            {/* Branch Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={e => handleInputChange('code', e.target.value.toUpperCase())}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter branch code"
                required
                maxLength={10}
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-sm text-gray-500 mt-1">
                Maximum 10 characters, will be converted to uppercase
              </p>
            </div>

            {/* Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea
                value={formData.address}
                onChange={e => handleInputChange('address', e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter branch address"
              />
            </div>

            {/* Owner (Tenant) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner (Tenant)</label>
              <select
                value={formData.owner || ''}
                onChange={e =>
                  handleInputChange('owner', e.target.value ? Number(e.target.value) : null)
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select tenant...</option>
                {tenants.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.domain_type})
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

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/admin/branches')}
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
            {submitting ? 'Saving...' : isEditMode ? 'Update Branch' : 'Create Branch'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BranchFormPage;
