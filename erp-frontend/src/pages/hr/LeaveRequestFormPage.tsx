// Leave Request Form Page - Create/Edit leave request form
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Upload, Calendar, User, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import hrService from '../../services/hrService';
import {
  CreateLeaveRequestData,
  UpdateLeaveRequestData,
  HR_VALIDATION_RULES,
} from '../../types/hr';

const LeaveRequestFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState<CreateLeaveRequestData>({
    staff: searchParams.get('staff') ? Number(searchParams.get('staff')) : 0,
    leave_type: 0,
    start_date: '',
    end_date: '',
    reason: '',
    relief_officer: null,
    medical_certificate: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calculatedDays, setCalculatedDays] = useState<number>(0);

  // Fetch leave request data for editing
  const { data: leaveRequestData, isLoading: loadingLeaveRequest } = useQuery({
    queryKey: ['leave-request', id],
    queryFn: () => hrService.getLeaveRequest(Number(id)),
    enabled: isEditing,
  });

  // Load existing leave request data for editing
  useEffect(() => {
    if (leaveRequestData && isEditing) {
      setFormData({
        staff: leaveRequestData.staff,
        leave_type: leaveRequestData.leave_type,
        start_date: leaveRequestData.start_date,
        end_date: leaveRequestData.end_date,
        reason: leaveRequestData.reason,
        relief_officer: leaveRequestData.relief_officer,
        medical_certificate: leaveRequestData.medical_certificate || null,
      });
    }
  }, [leaveRequestData, isEditing]);

  // Fetch staff for dropdown
  const { data: staffOptions } = useQuery({
    queryKey: ['staff-dropdown'],
    queryFn: () => hrService.getStaffForDropdown(),
  });

  // Fetch leave types for dropdown
  const { data: leaveTypeOptions } = useQuery({
    queryKey: ['leave-types-dropdown'],
    queryFn: () => hrService.getLeaveTypesForDropdown(),
  });

  // Get selected leave type details
  const selectedLeaveType = leaveTypeOptions?.find(lt => lt.id === formData.leave_type);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateLeaveRequestData) => hrService.createLeaveRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Leave request created successfully!');
      navigate('/hr/leave-requests');
    },
    onError: (error: any) => {
      console.error('Error creating leave request:', error);
      toast.error('Failed to create leave request. Please try again.');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateLeaveRequestData) => hrService.updateLeaveRequest(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-request', id] });
      toast.success('Leave request updated successfully!');
      navigate('/hr/leave-requests');
    },
    onError: (error: any) => {
      console.error('Error updating leave request:', error);
      toast.error('Failed to update leave request. Please try again.');
    },
  });

  const processing = createMutation.isPending || updateMutation.isPending;
  const loading = isEditing && loadingLeaveRequest;

  // Calculate leave days when dates change
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const days = hrService.calculateLeaveDays(formData.start_date, formData.end_date);
      setCalculatedDays(days);
    } else {
      setCalculatedDays(0);
    }
  }, [formData.start_date, formData.end_date]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]:
        name === 'staff' || name === 'leave_type' || name === 'relief_officer'
          ? value === ''
            ? name === 'relief_officer'
              ? null
              : 0
            : Number(value)
          : value,
    }));

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
    if (!formData.staff) {
      newErrors.staff = 'Staff member selection is required';
    }

    if (!formData.leave_type) {
      newErrors.leave_type = 'Leave type selection is required';
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }

    if (!formData.end_date) {
      newErrors.end_date = 'End date is required';
    }

    if (!formData.reason.trim()) {
      newErrors.reason = 'Reason for leave is required';
    }

    // Date validation
    if (formData.start_date && formData.end_date) {
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (startDate < today && !isEditing) {
        newErrors.start_date = 'Start date cannot be in the past';
      }

      if (endDate < startDate) {
        newErrors.end_date = 'End date cannot be before start date';
      }
    }

    // Medical certificate validation for sick leave
    if (
      selectedLeaveType?.name.toLowerCase().includes('sick') &&
      !formData.medical_certificate?.trim()
    ) {
      newErrors.medical_certificate = 'Medical certificate URL is required for sick leave';
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
      // Prepare the data, ensuring all required fields are present and properly formatted
      const submitData: CreateLeaveRequestData = {
        staff: formData.staff,
        leave_type: formData.leave_type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason.trim(),
        relief_officer: formData.relief_officer || null,
        medical_certificate: formData.medical_certificate || null,
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

  const handleButtonSubmit = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }

    try {
      // Prepare the data, ensuring all required fields are present and properly formatted
      const submitData: CreateLeaveRequestData = {
        staff: formData.staff,
        leave_type: formData.leave_type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason.trim(),
        relief_officer: formData.relief_officer || null,
        medical_certificate: formData.medical_certificate || null,
      };

      // Log the data being sent for debugging
      console.log('Submitting leave request data:', submitData);

      if (isEditing) {
        await updateMutation.mutateAsync(submitData);
      } else {
        await createMutation.mutateAsync(submitData);
      }
    } catch (error) {
      console.error('Error in handleButtonSubmit:', error);
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
            <p style={{ color: '#6b7280', fontSize: '16px' }}>Loading leave request...</p>
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
            onClick={() => navigate('/hr/leave-requests')}
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
              {isEditing ? 'Edit Leave Request' : 'Create Leave Request'}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              {isEditing ? `Editing leave request` : 'Submit a new leave request'}
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
          {/* Leave Request Information */}
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
              Leave Request Details
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Staff and Leave Type Selection */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Staff Member *
                  </label>
                  <select
                    name="staff"
                    value={formData.staff}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.staff ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select staff member</option>
                    {staffOptions?.map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} {staff.department && `(${staff.department})`}
                      </option>
                    ))}
                  </select>
                  {errors.staff && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.staff}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Leave Type *
                  </label>
                  <select
                    name="leave_type"
                    value={formData.leave_type}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.leave_type ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="">Select leave type</option>
                    {leaveTypeOptions?.map(leaveType => (
                      <option key={leaveType.id} value={leaveType.id}>
                        {leaveType.name} ({leaveType.code})
                      </option>
                    ))}
                  </select>
                  {errors.leave_type && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.leave_type}
                    </p>
                  )}
                </div>
              </div>

              {/* Leave Dates */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '20px',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.start_date ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                  {errors.start_date && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.start_date}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.end_date ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                  {errors.end_date && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.end_date}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    Total Days
                  </label>
                  <div
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      background: '#f9fafb',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    <Calendar size={16} style={{ marginRight: '8px', color: '#6b7280' }} />
                    {calculatedDays} {calculatedDays === 1 ? 'day' : 'days'}
                  </div>
                </div>
              </div>

              {/* Relief Officer */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Relief Officer (Optional)
                </label>
                <select
                  name="relief_officer"
                  value={formData.relief_officer || ''}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select relief officer</option>
                  {staffOptions
                    ?.filter(staff => staff.id !== formData.staff)
                    .map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} {staff.department && `(${staff.department})`}
                      </option>
                    ))}
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Staff member who will cover duties during absence
                </p>
              </div>

              {/* Reason */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Reason for Leave *
                </label>
                <textarea
                  name="reason"
                  rows={4}
                  value={formData.reason}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: errors.reason ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                  placeholder="Please provide a detailed reason for your leave request..."
                />
                {errors.reason && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                    {errors.reason}
                  </p>
                )}
              </div>

              {/* Medical Certificate URL */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Medical Certificate URL
                  {/* {selectedLeaveType?.name.toLowerCase().includes('sick') &&  */}(
                  <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>){/*  } */}
                </label>
                <input
                  type="url"
                  name="medical_certificate"
                  value={formData.medical_certificate || ''}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: errors.medical_certificate ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                  placeholder="https://example.com/medical-certificate.pdf (Optional for now)"
                />
                {errors.medical_certificate && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                    {errors.medical_certificate}
                  </p>
                )}
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Enter the URL of the medical certificate (Cloudinary integration coming soon)
                </p>
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
              Request Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Staff:</span>
                <span style={{ fontWeight: 600 }}>
                  {staffOptions?.find(s => s.id === formData.staff)?.name || 'Not selected'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Leave Type:</span>
                <span style={{ fontWeight: 600 }}>
                  {leaveTypeOptions?.find(lt => lt.id === formData.leave_type)?.name ||
                    'Not selected'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Duration:</span>
                <span style={{ fontWeight: 600 }}>
                  {calculatedDays} {calculatedDays === 1 ? 'day' : 'days'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Relief Officer:</span>
                <span style={{ fontWeight: 600 }}>
                  {formData.relief_officer
                    ? staffOptions?.find(s => s.id === formData.relief_officer)?.name
                    : 'None'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Reason:</span>
                <span style={{ fontWeight: 600 }}>
                  {formData.reason ? 'Provided' : 'Not provided'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Medical Certificate:</span>
                <span style={{ fontWeight: 600 }}>
                  {formData.medical_certificate ? 'Provided' : 'None'}
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
                onClick={handleButtonSubmit}
                disabled={
                  !formData.staff ||
                  !formData.leave_type ||
                  !formData.start_date ||
                  !formData.end_date ||
                  !formData.reason ||
                  processing
                }
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background:
                    !formData.staff ||
                    !formData.leave_type ||
                    !formData.start_date ||
                    !formData.end_date ||
                    !formData.reason ||
                    processing
                      ? '#9ca3af'
                      : '#3b82f6',
                  color: 'white',
                  cursor:
                    !formData.staff ||
                    !formData.leave_type ||
                    !formData.start_date ||
                    !formData.end_date ||
                    !formData.reason ||
                    processing
                      ? 'not-allowed'
                      : 'pointer',
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
                    {isEditing ? 'Update Request' : 'Submit Request'}
                  </>
                )}
              </button>

              <button
                onClick={() => navigate('/hr/leave-requests')}
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

export default LeaveRequestFormPage;
