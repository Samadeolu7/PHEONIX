// Staff Form Page - Create/Edit staff form
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import hrService from '../../services/hrService';
import { Branch, branchService } from '../../services/branchService';
import { CreateStaffData, UpdateStaffData, HR_VALIDATION_RULES } from '../../types/hr';

const StaffFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState<
    CreateStaffData & {
      pension_number: string;
      pension_provider: string;
      paye_pin: string;
      bank_name: string;
      bank_account_number: string;
    }
  >({
    first_name: '',
    last_name: '',
    department: '',
    position: '',
    email: '',
    phone: '',
    user: null,
    pension_number: '',
    pension_provider: '',
    paye_pin: '',
    bank_name: '',
    bank_account_number: '',
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch branches for dropdown (React Query replaces manual useEffect + useState)
  const { data: branchesResponse } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchService.getBranches(),
  });
  const branches: Branch[] = (branchesResponse as any)?.results ?? [];

  // Fetch staff data for editing
  const { data: staffData, isLoading: loadingStaff } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => hrService.getStaffMember(id!),
    enabled: isEditing,
  });

  // Load existing staff data for editing
  useEffect(() => {
    if (staffData && isEditing) {
      setFormData({
        first_name: staffData.first_name,
        last_name: staffData.last_name,
        department: staffData.department || '',
        position: staffData.position || '',
        email: staffData.email || '',
        phone: staffData.phone || '',
        user: staffData.user,
        pension_number: (staffData as any).pension_number || '',
        pension_provider: (staffData as any).pension_provider || '',
        paye_pin: (staffData as any).paye_pin || '',
        bank_name: (staffData as any).bank_name || '',
        bank_account_number: (staffData as any).bank_account_number || '',
      });
      if (staffData.photo) {
        setPhotoPreview(staffData.photo);
      }
    }
  }, [staffData, isEditing]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateStaffData) => hrService.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member created successfully!');
      navigate('/hr/staff');
    },
    onError: (error: any) => {
      console.error('Error creating staff:', error);
      toast.error('Failed to create staff member. Please try again.');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateStaffData) => hrService.updateStaff(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['staff', id] });
      toast.success('Staff member updated successfully!');
      navigate('/hr/staff');
    },
    onError: (error: any) => {
      console.error('Error updating staff:', error);
      toast.error('Failed to update staff member. Please try again.');
    },
  });

  const processing = createMutation.isPending || updateMutation.isPending;
  const loading = isEditing && loadingStaff;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      setPhotoFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = e => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    } else if (formData.first_name.length > HR_VALIDATION_RULES.staff.first_name.maxLength) {
      newErrors.first_name = `First name must be ${HR_VALIDATION_RULES.staff.first_name.maxLength} characters or less`;
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    } else if (formData.last_name.length > HR_VALIDATION_RULES.staff.last_name.maxLength) {
      newErrors.last_name = `Last name must be ${HR_VALIDATION_RULES.staff.last_name.maxLength} characters or less`;
    }

    // Optional field validations
    if (
      formData.department &&
      formData.department.length > HR_VALIDATION_RULES.staff.department.maxLength
    ) {
      newErrors.department = `Department must be ${HR_VALIDATION_RULES.staff.department.maxLength} characters or less`;
    }

    if (
      formData.position &&
      formData.position.length > HR_VALIDATION_RULES.staff.position.maxLength
    ) {
      newErrors.position = `Position must be ${HR_VALIDATION_RULES.staff.position.maxLength} characters or less`;
    }

    if (formData.email && formData.email.length > HR_VALIDATION_RULES.staff.email.maxLength) {
      newErrors.email = `Email must be ${HR_VALIDATION_RULES.staff.email.maxLength} characters or less`;
    }

    if (formData.phone && formData.phone.length > HR_VALIDATION_RULES.staff.phone.maxLength) {
      newErrors.phone = `Phone must be ${HR_VALIDATION_RULES.staff.phone.maxLength} characters or less`;
    }

    // Email format validation
    if (formData.email && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
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
      const submitData = {
        ...formData,
        photo: photoFile || undefined,
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
            <p style={{ color: '#6b7280', fontSize: '16px' }}>Loading staff information...</p>
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
            onClick={() => navigate('/hr/staff')}
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
              {isEditing ? 'Edit Staff Member' : 'Create Staff Member'}
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              {isEditing
                ? `Editing: ${staffData?.full_name}`
                : 'Add a new staff member to the system'}
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
          {/* Personal Information */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            {/* Staff ID Badge (edit mode only) */}
            {isEditing && (staffData as any)?.staff_id && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '9999px',
                  marginBottom: '20px',
                  fontSize: '14px',
                  color: '#1d4ed8',
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 400 }}>
                  Staff ID:
                </span>
                <span style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  {(staffData as any).staff_id}
                </span>
              </div>
            )}

            <h2
              style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
            >
              Personal Information
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Photo Upload */}
              <div style={{ marginBottom: '24px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Profile Photo
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ flexShrink: 0 }}>
                    {photoPreview ? (
                      <div style={{ position: 'relative' }}>
                        <img
                          src={photoPreview}
                          alt="Profile preview"
                          style={{
                            height: '80px',
                            width: '80px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #e5e7eb',
                          }}
                        />
                        <button
                          type="button"
                          onClick={removePhoto}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            color: 'white',
                            borderRadius: '50%',
                            border: 'none',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          height: '80px',
                          width: '80px',
                          borderRadius: '50%',
                          background: '#f3f4f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User size={32} color="#9ca3af" />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      id="photo"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="photo"
                      style={{
                        cursor: 'pointer',
                        background: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Upload size={16} />
                      Upload Photo
                    </label>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
                      JPG, PNG up to 5MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Name Fields */}
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
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.first_name ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="Enter first name"
                  />
                  {errors.first_name && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.first_name}
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
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.last_name ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="Enter last name"
                  />
                  {errors.last_name && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.last_name}
                    </p>
                  )}
                </div>
              </div>

              {/* Work Information */}
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
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.department ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="Enter department"
                  />
                  {errors.department && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.department}
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
                    Position
                  </label>
                  <input
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.position ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="Enter position"
                  />
                  {errors.position && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.position}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact Information */}
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
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.email ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="Enter email address"
                  />
                  {errors.email && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.email}
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
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.phone ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="Enter phone number"
                  />
                  {errors.phone && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                      {errors.phone}
                    </p>
                  )}
                </div>
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
                  Branch
                </label>
                <select
                  name="branch"
                  value={formData.branch}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: errors.branch ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="">Select branch...</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                {errors.branch && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                    {errors.branch}
                  </p>
                )}
              </div>

              {/* Pension Information */}
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '24px',
                  marginTop: '8px',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: '#059669' }}>🛡</span> Pension Information
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
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
                      Pension Number
                    </label>
                    <input
                      type="text"
                      name="pension_number"
                      value={formData.pension_number}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                      placeholder="e.g. PEN1234567890"
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                      Pension fund membership ID.
                    </p>
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
                      Pension Provider
                    </label>
                    <input
                      type="text"
                      name="pension_provider"
                      value={formData.pension_provider}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                      placeholder="e.g. NLPC Pension Fund"
                    />
                  </div>
                </div>
              </div>

              {/* Tax Information */}
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '24px',
                  marginTop: '8px',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: '#d97706' }}>🏛</span> Tax Information
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
                    PAYE PIN / TIN
                  </label>
                  <input
                    type="text"
                    name="paye_pin"
                    value={formData.paye_pin}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                    placeholder="e.g. 12345678-0001"
                  />
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                    FIRS Tax Identification Number used for PAYE filing.
                  </p>
                </div>
              </div>

              {/* Banking Information */}
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '24px',
                  marginTop: '8px',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: '#2563eb' }}>🏦</span> Banking Details
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
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
                      Bank Name
                    </label>
                    <input
                      type="text"
                      name="bank_name"
                      value={formData.bank_name}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                      placeholder="e.g. First Bank of Nigeria"
                    />
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
                      Account Number
                    </label>
                    <input
                      type="text"
                      name="bank_account_number"
                      value={formData.bank_account_number}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                      placeholder="10-digit account number"
                    />
                  </div>
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
              Staff Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Full Name:</span>
                <span style={{ fontWeight: 600 }}>
                  {formData.first_name || formData.last_name
                    ? `${formData.first_name} ${formData.last_name}`.trim()
                    : 'Not set'}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Department:</span>
                <span style={{ fontWeight: 600 }}>{formData.department || 'Not set'}</span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Position:</span>
                <span style={{ fontWeight: 600 }}>{formData.position || 'Not set'}</span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Email:</span>
                <span style={{ fontWeight: 600 }}>{formData.email || 'Not set'}</span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Phone:</span>
                <span style={{ fontWeight: 600 }}>{formData.phone || 'Not set'}</span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Photo:</span>
                <span style={{ fontWeight: 600 }}>
                  {photoFile || photoPreview ? 'Uploaded' : 'None'}
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
                disabled={!formData.first_name || !formData.last_name || processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background:
                    !formData.first_name || !formData.last_name || processing
                      ? '#9ca3af'
                      : '#3b82f6',
                  color: 'white',
                  cursor:
                    !formData.first_name || !formData.last_name || processing
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
                    {isEditing ? 'Update Staff' : 'Create Staff'}
                  </>
                )}
              </button>

              <button
                onClick={() => navigate('/hr/staff')}
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

export default StaffFormPage;
