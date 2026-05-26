// Leave Type Form Page - Create/Edit leave types
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Calendar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import hrService from '../../services/hrService';
import { CreateLeaveTypeData, UpdateLeaveTypeData, HR_VALIDATION_RULES } from '../../types/hr';

const LeaveTypeFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState<CreateLeaveTypeData>({
    name: '',
    is_paid: true,
    requires_approval: true,
    requires_medical_certificate: false,
    default_days_per_year: 21,
    allow_carryover: false,
    max_carryover_days: 0,
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch leave type data for editing
  const { data: leaveTypeData, isLoading: loadingLeaveType } = useQuery({
    queryKey: ['leave-type', id],
    queryFn: () => hrService.getLeaveType(Number(id)),
    enabled: isEditing,
  });

  // Load existing leave type data for editing
  useEffect(() => {
    if (leaveTypeData && isEditing) {
      setFormData({
        name: leaveTypeData.name || '',
        is_paid: leaveTypeData.is_paid || false,
        requires_approval: leaveTypeData.requires_approval || false,
        requires_medical_certificate: leaveTypeData.requires_medical_certificate || false,
        default_days_per_year: leaveTypeData.default_days_per_year || 0,
        allow_carryover: leaveTypeData.allow_carryover || false,
        max_carryover_days: leaveTypeData.max_carryover_days || 0,
        description: leaveTypeData.description || '',
      });
    }
  }, [leaveTypeData, isEditing]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateLeaveTypeData) => hrService.createLeaveType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      toast.success('Leave type created successfully!');
      navigate('/hr/leave-types');
    },
    onError: (error: any) => {
      console.error('Error creating leave type:', error);
      toast.error('Failed to create leave type. Please try again.');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateLeaveTypeData) => hrService.updateLeaveType(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      queryClient.invalidateQueries({ queryKey: ['leave-type', id] });
      toast.success('Leave type updated successfully!');
      navigate('/hr/leave-types');
    },
    onError: (error: any) => {
      console.error('Error updating leave type:', error);
      toast.error('Failed to update leave type. Please try again.');
    },
  });

  const processing = createMutation.isPending || updateMutation.isPending;
  const loading = isEditing && loadingLeaveType;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        [name]: checked,
      }));
    } else if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: value === '' ? 0 : parseInt(value),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.name.trim()) {
      newErrors.name = 'Leave type name is required';
    } else if (formData.name.length > HR_VALIDATION_RULES.leaveType.name.maxLength) {
      newErrors.name = `Name must be ${HR_VALIDATION_RULES.leaveType.name.maxLength} characters or less`;
    }

    // Validate days per year
    if (formData.default_days_per_year !== undefined) {
      if (
        formData.default_days_per_year < HR_VALIDATION_RULES.leaveType.default_days_per_year.min
      ) {
        newErrors.default_days_per_year = `Days per year must be ${HR_VALIDATION_RULES.leaveType.default_days_per_year.min} or more`;
      } else if (
        formData.default_days_per_year > HR_VALIDATION_RULES.leaveType.default_days_per_year.max
      ) {
        newErrors.default_days_per_year = `Days per year cannot exceed ${HR_VALIDATION_RULES.leaveType.default_days_per_year.max}`;
      }
    }

    // Validate carryover days
    if (formData.allow_carryover && formData.max_carryover_days !== undefined) {
      if (formData.max_carryover_days < 0) {
        newErrors.max_carryover_days = 'Carryover days cannot be negative';
      } else if (
        formData.max_carryover_days > HR_VALIDATION_RULES.leaveType.max_carryover_days.max
      ) {
        newErrors.max_carryover_days = `Carryover days cannot exceed ${HR_VALIDATION_RULES.leaveType.max_carryover_days.max}`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }

    try {
      // Clean up data before submission
      const submitData = {
        ...formData,
        // If carryover is not allowed, set max_carryover_days to 0
        max_carryover_days: formData.allow_carryover ? formData.max_carryover_days : 0,
      };

      if (isEditing) {
        await updateMutation.mutateAsync(submitData);
      } else {
        await createMutation.mutateAsync(submitData);
      }
    } catch (error) {
      // Error handling is done in mutation callbacks
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
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
                width: '40px',
                height: '40px',
                border: '4px solid #f3f4f6',
                borderTop: '4px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }}
            ></div>
            <p style={{ color: '#6b7280', fontSize: '16px' }}>Loading leave type...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/hr/leave-types')}
            style={{
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#1f2937',
              }}
            >
              {isEditing ? 'Edit Leave Type' : 'Create Leave Type'}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              {isEditing ? `Editing: ${leaveTypeData?.name}` : 'Configure a new type of leave'}
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '32px',
        }}
      >
        {/* Main Form */}
        <div>
          {/* Basic Information */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h2
              style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
            >
              Basic Information
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Leave Type Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: errors.name ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                  placeholder="e.g., Annual Leave, Sick Leave, Maternity Leave"
                />
                {errors.name && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                    {errors.name}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                  placeholder="Brief description of this leave type..."
                />
              </div>

              {/* Leave Properties */}
              <div style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                  }}
                >
                  Leave Properties
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="is_paid"
                      name="is_paid"
                      checked={formData.is_paid}
                      onChange={handleInputChange}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="is_paid" style={{ fontSize: '14px', color: '#1f2937' }}>
                      This is a paid leave type
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="requires_approval"
                      name="requires_approval"
                      checked={formData.requires_approval}
                      onChange={handleInputChange}
                      style={{ marginRight: '8px' }}
                    />
                    <label
                      htmlFor="requires_approval"
                      style={{ fontSize: '14px', color: '#1f2937' }}
                    >
                      Requires manager approval
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="requires_medical_certificate"
                      name="requires_medical_certificate"
                      checked={formData.requires_medical_certificate}
                      onChange={handleInputChange}
                      style={{ marginRight: '8px' }}
                    />
                    <label
                      htmlFor="requires_medical_certificate"
                      style={{ fontSize: '14px', color: '#1f2937' }}
                    >
                      Requires medical certificate
                    </label>
                  </div>
                </div>
              </div>

              {/* Allocation Settings */}
              <div style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                  }}
                >
                  Allocation Settings
                </h3>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Default Days Per Year
                  </label>
                  <input
                    type="number"
                    name="default_days_per_year"
                    value={formData.default_days_per_year || ''}
                    onChange={handleInputChange}
                    min="0"
                    max="365"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.default_days_per_year
                        ? '2px solid #ef4444'
                        : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="0 for unlimited"
                  />
                  {errors.default_days_per_year && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.default_days_per_year}
                    </p>
                  )}
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                    Set to 0 for unlimited leave
                  </p>
                </div>
              </div>

              {/* Carryover Settings */}
              <div style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                  }}
                >
                  Carryover Settings
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="allow_carryover"
                      name="allow_carryover"
                      checked={formData.allow_carryover}
                      onChange={handleInputChange}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="allow_carryover" style={{ fontSize: '14px', color: '#1f2937' }}>
                      Allow unused days to carry over to next year
                    </label>
                  </div>

                  {formData.allow_carryover && (
                    <div style={{ marginLeft: '24px' }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '8px',
                          fontSize: '14px',
                          fontWeight: 600,
                        }}
                      >
                        Maximum Carryover Days
                      </label>
                      <input
                        type="number"
                        name="max_carryover_days"
                        value={formData.max_carryover_days || ''}
                        onChange={handleInputChange}
                        min="0"
                        max="365"
                        style={{
                          width: '200px',
                          padding: '12px',
                          border: errors.max_carryover_days
                            ? '2px solid #ef4444'
                            : '2px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '14px',
                        }}
                        placeholder="Maximum days to carry over"
                      />
                      {errors.max_carryover_days && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                          {errors.max_carryover_days}
                        </p>
                      )}
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Leave blank for no limit
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Actions Sidebar */}
        <div>
          {/* Form Summary */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              Leave Type Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Name:</span>
                <span style={{ fontWeight: 600 }}>{formData.name || 'Not set'}</span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Paid:</span>
                <span style={{ fontWeight: 600, color: formData.is_paid ? '#10b981' : '#ef4444' }}>
                  {formData.is_paid ? 'Yes' : 'No'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Requires Approval:</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: formData.requires_approval ? '#10b981' : '#ef4444',
                  }}
                >
                  {formData.requires_approval ? 'Yes' : 'No'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Medical Cert:</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: formData.requires_medical_certificate ? '#10b981' : '#ef4444',
                  }}
                >
                  {formData.requires_medical_certificate ? 'Required' : 'Not required'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Days/Year:</span>
                <span style={{ fontWeight: 600 }}>
                  {formData.default_days_per_year === 0
                    ? 'Unlimited'
                    : formData.default_days_per_year}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Carryover:</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: formData.allow_carryover ? '#10b981' : '#ef4444',
                  }}
                >
                  {formData.allow_carryover
                    ? `Yes (${formData.max_carryover_days || 'Unlimited'} max)`
                    : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3
              style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: !formData.name || processing ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  cursor: !formData.name || processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {processing ? (
                  <>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid transparent',
                        borderTop: '2px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    ></div>
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {isEditing ? 'Update Leave Type' : 'Create Leave Type'}
                  </>
                )}
              </button>

              <button
                onClick={() => navigate('/hr/leave-types')}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: processing ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add CSS for spin animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LeaveTypeFormPage;
