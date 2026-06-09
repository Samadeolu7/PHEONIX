// src/pages/clients/ClientFormPage.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Briefcase,
  Heart,
  Building,
  FileText,
  Users,
  Home,
  Calendar,
  Upload,
} from 'lucide-react';
import { clientService, Client } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';
import { useDomainLabels } from '../../contexts/DomainLabelContext';
import { ClientClassification } from '@/services/clientClassificationService';
import { Branch } from '@/services/branchService';
import { branchService } from '@/services/branchService';
import { useAuth } from '../../contexts/AuthContext';

const ClientFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const { success, error: showError } = useToast();
  const { selectedRole } = useAuth();
  // const { getLabel, isSchool } = useDomainLabels();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classifications, setClassifications] = useState<ClientClassification[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staffList, setStaffList] = useState<{ id: number; name: string }[]>([]);
  const [ninWarning, setNinWarning] = useState<string | null>(null);
  const ninTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSection, setActiveSection] = useState<'basic' | 'financial' | 'nok' | 'employment'>(
    'basic'
  );
  const [originalData, setOriginalData] = useState<Partial<Client>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [formData, setFormData] = useState<Partial<Client>>({
    first_name: '',
    last_name: '',
    middle_name: '',
    title: '',
    gender: 'male',
    date_of_birth: '',
    place_of_birth: '',
    phone_primary: '',
    phone_secondary: '',
    email: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_postal_code: '',
    address_country: 'Nigeria',
    id_type: '',
    id_number: '',
    id_issue_date: '',
    id_expiry_date: '',
    occupation: '',
    employer_name: '',
    employer_address: '',
    employment_status: '',
    annual_income: undefined,
    income_source: '',
    marital_status: '',
    education_level: '',
    next_of_kin_name: '',
    next_of_kin_relationship: '',
    next_of_kin_phone: '',
    next_of_kin_email: '',
    next_of_kin_address: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
    bank_verification_number: '',
    preferred_language: 'English',
    communication_preference: 'sms',
    marketing_consent: false,
    referral_source: '',
    usage_context: 'client',
    classification: undefined,
    status: 'active',
    // Microfinance client-specific fields
    client_type: '', // WL, ML, DC, PR
    nationality: 'Nigerian',
    state_of_origin: '',
    lga: '',
    // Guarantor fields (for loan applications)
    guarantor_name: '',
    guarantor_relationship: '',
    guarantor_phone: '',
    guarantor_email: '',
    guarantor_occupation: '',
    guarantor_home_address: '',
    guarantor_office_address: '',
    // Existing financial fields already in Client model:
    // occupation, employer_name, employer_address, employment_status
    // annual_income, income_source, bank_name, bank_account_name
    // bank_account_number, bank_verification_number
    // branch: undefined, // For multi-branch setups
    branch: undefined,
  } as Partial<Client>);

  useEffect(() => {
    loadData();
  }, [id]);

  // Check for changes when formData updates
  useEffect(() => {
    if (isEditMode && Object.keys(originalData).length > 0) {
      const hasFormChanges = Object.keys(formData).some(key => {
        return formData[key as keyof Client] !== originalData[key as keyof Client];
      });
      setHasChanges(hasFormChanges);
    } else if (!isEditMode) {
      // For create mode, check if required fields are filled
      const requiredFieldsFilled =
        formData.first_name &&
        formData.last_name &&
        formData.phone_primary &&
        formData.date_of_birth;
      setHasChanges(Boolean(requiredFieldsFilled));
    }
  }, [formData, originalData, isEditMode]);

  const loadData = async () => {
    setLoading(true);
    try {
      const classData = await clientService.getClassifications();
      setClassifications(classData);
      const branchData = await branchService.getBranches();
      console.log(branchData);
      setBranches(branchData.results || []);

      // Load staff list for account manager selector (BM+ roles)
      const bmRoles = ['branch_manager', 'supervisor', 'director', 'admin', 'operations'];
      if (selectedRole && bmRoles.includes(selectedRole)) {
        try {
          const token =
            localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
          const res = await fetch('/api/hr/staff/?is_active=true&page_size=200', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const list = (data.results || data).map((s: any) => ({
              id: s.id,
              name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
            }));
            setStaffList(list);
          }
        } catch {
          // non-critical — leave empty
        }
      }

      if (isEditMode && id) {
        const client = await clientService.getClient(Number(id));
        setFormData(client);
        setOriginalData(client);
        // Load existing image preview if available
        if (client.image) {
          setImagePreview(client.image);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleNinChange = (value: string) => {
    handleChange('nin' as any, value);
    setNinWarning(null);
    if (ninTimerRef.current) clearTimeout(ninTimerRef.current);
    const trimmed = value.trim();
    if (trimmed.length !== 11) return;
    ninTimerRef.current = setTimeout(async () => {
      try {
        const result = await clientService.ninCheck(trimmed);
        if (result.exists) {
          const where = result.branch ? ` (Branch: ${result.branch})` : '';
          setNinWarning(
            `NIN already registered${where}. Each NIN must be unique across all branches.`
          );
        }
      } catch {
        // Ignore check errors silently
      }
    }, 600);
  };

  const handleChange = (field: keyof Client, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showError('Image size must be less than 5MB');
        return;
      }

      setImageFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = e => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      setHasChanges(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        showError('Image size must be less than 5MB');
        return;
      }
      setImageFile(file);

      const reader = new FileReader();
      reader.onload = e => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      setHasChanges(true);
    } else {
      showError('Please drop a valid image file');
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData(prev => ({ ...prev, image: null }));
    setHasChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      if (isEditMode && id) {
        await clientService.updateClient(Number(id), formData, imageFile);
        success('Client updated successfully');
      } else {
        await clientService.createClient(formData, imageFile);
        success('Client registered successfully');
      }
      navigate('/clients');
    } catch (err: any) {
      setError(err.message || 'Failed to save client');
      showError(err.message || 'Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Info', icon: User },
    { id: 'financial', label: 'Financial Profile', icon: Briefcase },
    { id: 'nok', label: 'Next of Kin', icon: Users },
    { id: 'employment', label: 'Employment / Business', icon: Building },
  ] as const;

  if (loading && !formData.first_name) {
    return <div style={{ padding: '2rem' }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => navigate('/clients')}
          style={{
            padding: '0.5rem',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            {isEditMode ? `Edit Client` : `Client Registration Form`}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {isEditMode
              ? `Update client information`
              : `Complete all sections to register a new client`}
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        {/* Section Navigation */}
        <div>
          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              padding: '1rem',
            }}
          >
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '1rem',
                color: '#6b7280',
              }}
            >
              SECTIONS
            </h3>
            {sections.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id as any)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: activeSection === section.id ? '#eff6ff' : 'transparent',
                    border: 'none',
                    borderLeft:
                      activeSection === section.id ? '3px solid #3b82f6' : '3px solid transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    color: activeSection === section.id ? '#3b82f6' : '#4b5563',
                    fontWeight: activeSection === section.id ? 600 : 400,
                    fontSize: '0.875rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  <Icon size={18} />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              background: 'white',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              padding: '2rem',
            }}
          >
            {/* Basic Information */}
            {activeSection === 'basic' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Basic Information
                </h2>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Title
                    </label>
                    <select
                      value={formData.title}
                      onChange={e => handleChange('title', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="mr">Mr</option>
                      <option value="mrs">Mrs</option>
                      <option value="miss">Miss</option>
                      <option value="dr">Dr</option>
                      <option value="chief">Chief</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      First Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={e => handleChange('first_name', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Middle Name
                    </label>
                    <input
                      type="text"
                      value={formData.middle_name}
                      onChange={e => handleChange('middle_name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Last Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.last_name}
                      onChange={e => handleChange('last_name', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Gender <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={formData.gender}
                      onChange={e => handleChange('gender', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Phone <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.phone_primary}
                      onChange={e => handleChange('phone_primary', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => handleChange('email', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  {/* Branch */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Branch
                    </label>
                    <select
                      value={formData.branch || ''}
                      onChange={e =>
                        handleChange('branch', e.target.value ? Number(e.target.value) : undefined)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select branch...</option>
                      {branches.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Client Photo Upload */}
                <div style={{ marginTop: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                    Client Photo
                  </h3>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('client-image-upload')?.click()}
                    style={{
                      border: isDragging ? '2px dashed #3b82f6' : '2px dashed #d1d5db',
                      borderRadius: '0.5rem',
                      padding: '2rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: isDragging ? '#eff6ff' : '#f9fafb',
                      transition: 'all 0.2s',
                    }}
                  >
                    <input
                      id="client-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      style={{ display: 'none' }}
                    />
                    {imagePreview ? (
                      <div>
                        <img
                          src={imagePreview}
                          alt="Client preview"
                          style={{
                            maxWidth: '200px',
                            maxHeight: '200px',
                            borderRadius: '0.5rem',
                            marginBottom: '1rem',
                          }}
                        />
                        <div>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              removeImage();
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                            }}
                          >
                            Remove Photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Upload size={48} style={{ margin: '0 auto', color: '#9ca3af' }} />
                        <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                          Click to upload or drag and drop
                        </p>
                        <p style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.75rem' }}>
                          JPG, PNG, GIF up to 5MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Financial Profile */}
            {activeSection === 'financial' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Financial Profile
                </h2>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}
                >
                  {/* Client Type */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Client Type <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={(formData as any).client_type || ''}
                      onChange={e => handleChange('client_type' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select type...</option>
                      <option value="ML">Monthly Loan (ML)</option>
                      <option value="WL">Weekly Loan (WL)</option>
                      <option value="DC">Daily Contribution / Ajo (DC)</option>
                      <option value="PR">Prospect (PR)</option>
                    </select>
                  </div>

                  {/* Marital Status */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Marital Status
                    </label>
                    <select
                      value={formData.marital_status || ''}
                      onChange={e => handleChange('marital_status', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                    </select>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Date of Birth <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={e => handleChange('date_of_birth', e.target.value)}
                      required
                      max={new Date().toISOString().split('T')[0]}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* Nationality */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Nationality
                    </label>
                    <input
                      type="text"
                      value={(formData as any).nationality || 'Nigerian'}
                      onChange={e => handleChange('nationality' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* State of Origin */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      State of Origin
                    </label>
                    <input
                      type="text"
                      value={(formData as any).state_of_origin || ''}
                      onChange={e => handleChange('state_of_origin' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., Ogun"
                    />
                  </div>

                  {/* LGA */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Local Government Area
                    </label>
                    <input
                      type="text"
                      value={(formData as any).lga || ''}
                      onChange={e => handleChange('lga' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., Ijebu-Ode"
                    />
                  </div>

                  {/* ID Type */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      ID Type
                    </label>
                    <select
                      value={formData.id_type || ''}
                      onChange={e => handleChange('id_type', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="national_id">National ID (NIN)</option>
                      <option value="voters_card">Voter's Card</option>
                      <option value="drivers_licence">Driver's Licence</option>
                      <option value="passport">International Passport</option>
                    </select>
                  </div>

                  {/* ID Number */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      ID Number
                    </label>
                    <input
                      type="text"
                      value={formData.id_number || ''}
                      onChange={e => handleChange('id_number', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="ID card number"
                    />
                  </div>

                  {/* NIN */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      NIN (National Identification Number)
                    </label>
                    <input
                      type="text"
                      value={(formData as any).nin || ''}
                      onChange={e => handleNinChange(e.target.value)}
                      maxLength={11}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: ninWarning ? '1px solid #f59e0b' : '1px solid #d1d5db',
                      }}
                      placeholder="11-digit NIN"
                    />
                    {ninWarning && (
                      <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#b45309' }}>
                        ⚠ {ninWarning}
                      </p>
                    )}
                  </div>

                  {/* BVN */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Bank Verification Number (BVN)
                    </label>
                    <input
                      type="text"
                      value={formData.bank_verification_number || ''}
                      onChange={e => handleChange('bank_verification_number', e.target.value)}
                      maxLength={11}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="11-digit BVN"
                    />
                  </div>

                  {/* Bank Name */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={formData.bank_name || ''}
                      onChange={e => handleChange('bank_name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., First Bank"
                    />
                  </div>

                  {/* Bank Account Number */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={formData.bank_account_number || ''}
                      onChange={e => handleChange('bank_account_number', e.target.value)}
                      maxLength={10}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="10-digit NUBAN"
                    />
                  </div>

                  {/* Bank Account Name */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Bank Account Name
                    </label>
                    <input
                      type="text"
                      value={formData.bank_account_name || ''}
                      onChange={e => handleChange('bank_account_name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Account name as on bank records"
                    />
                  </div>

                  {/* Client Classification */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Classification / Group
                    </label>
                    <select
                      value={formData.classification || ''}
                      onChange={e =>
                        handleChange(
                          'classification',
                          e.target.value ? Number(e.target.value) : undefined
                        )
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select group...</option>
                      {classifications.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Referral Source */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      How did you hear about us?
                    </label>
                    <select
                      value={formData.referral_source || ''}
                      onChange={e => handleChange('referral_source', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="field_officer">Field Officer</option>
                      <option value="existing_client">Existing Client</option>
                      <option value="social_media">Social Media</option>
                      <option value="walk_in">Walk-in</option>
                      <option value="flyer">Flyer / Poster</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Account Manager (BM+ only) */}
                  {['branch_manager', 'supervisor', 'director', 'admin', 'operations'].includes(
                    selectedRole || ''
                  ) &&
                    staffList.length > 0 && (
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            marginBottom: '0.5rem',
                          }}
                        >
                          Account Manager
                        </label>
                        <select
                          value={(formData as any).account_manager || ''}
                          onChange={e =>
                            handleChange(
                              'account_manager' as any,
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                          }}
                        >
                          <option value="">— Unassigned —</option>
                          {staffList.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Next of Kin */}
            {activeSection === 'nok' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Next of Kin
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1.5rem',
                    marginBottom: '2rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Full Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.next_of_kin_name || ''}
                      onChange={e => handleChange('next_of_kin_name', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Relationship <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={formData.next_of_kin_relationship || ''}
                      onChange={e => handleChange('next_of_kin_relationship', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="spouse">Spouse</option>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="sibling">Sibling</option>
                      <option value="child">Child</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Phone Number <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.next_of_kin_phone || ''}
                      onChange={e => handleChange('next_of_kin_phone', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.next_of_kin_email || ''}
                      onChange={e => handleChange('next_of_kin_email', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Address
                    </label>
                    <input
                      type="text"
                      value={formData.next_of_kin_address || ''}
                      onChange={e => handleChange('next_of_kin_address', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Home address of next of kin"
                    />
                  </div>
                </div>

                {/* Guarantor */}
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginBottom: '1rem',
                    color: '#6b7280',
                  }}
                >
                  Guarantor (for Loan Applications)
                </h3>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={(formData as any).guarantor_name || ''}
                      onChange={e => handleChange('guarantor_name' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Relationship
                    </label>
                    <select
                      value={(formData as any).guarantor_relationship || ''}
                      onChange={e => handleChange('guarantor_relationship' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="family">Family Member</option>
                      <option value="colleague">Colleague</option>
                      <option value="employer">Employer</option>
                      <option value="friend">Friend</option>
                      <option value="community_leader">Community Leader</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={(formData as any).guarantor_phone || ''}
                      onChange={e => handleChange('guarantor_phone' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Occupation
                    </label>
                    <input
                      type="text"
                      value={(formData as any).guarantor_occupation || ''}
                      onChange={e => handleChange('guarantor_occupation' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Home Address
                    </label>
                    <input
                      type="text"
                      value={(formData as any).guarantor_home_address || ''}
                      onChange={e => handleChange('guarantor_home_address' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Guarantor's home address"
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Office / Business Address
                    </label>
                    <input
                      type="text"
                      value={(formData as any).guarantor_office_address || ''}
                      onChange={e =>
                        handleChange('guarantor_office_address' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Guarantor's office or business address"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Employment / Business */}
            {activeSection === 'employment' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Employment & Business Details
                </h2>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Employment Status <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      value={formData.employment_status || ''}
                      onChange={e => handleChange('employment_status', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="self_employed">Self-employed / Trader</option>
                      <option value="employed">Salaried (Employed)</option>
                      <option value="business_owner">Business Owner</option>
                      <option value="artisan">Artisan / Craftsman</option>
                      <option value="farmer">Farmer</option>
                      <option value="retired">Retired</option>
                      <option value="unemployed">Unemployed</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Occupation / Job Title
                    </label>
                    <input
                      type="text"
                      value={formData.occupation || ''}
                      onChange={e => handleChange('occupation', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., Trader, Teacher, Mechanic"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Employer / Business Name
                    </label>
                    <input
                      type="text"
                      value={formData.employer_name || ''}
                      onChange={e => handleChange('employer_name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Company or business name"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Monthly / Average Income (₦)
                    </label>
                    <input
                      type="number"
                      value={
                        formData.annual_income
                          ? String(Math.round(formData.annual_income / 12))
                          : ''
                      }
                      onChange={e =>
                        handleChange(
                          'annual_income',
                          e.target.value ? Number(e.target.value) * 12 : undefined
                        )
                      }
                      min={0}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Estimated monthly income"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Income Source
                    </label>
                    <select
                      value={formData.income_source || ''}
                      onChange={e => handleChange('income_source', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="salary">Salary</option>
                      <option value="business">Business Profit</option>
                      <option value="farming">Farming</option>
                      <option value="rental">Rental Income</option>
                      <option value="remittance">Remittance</option>
                      <option value="pension">Pension</option>
                      <option value="multiple">Multiple Sources</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Education Level
                    </label>
                    <select
                      value={formData.education_level || ''}
                      onChange={e => handleChange('education_level', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="none">No Formal Education</option>
                      <option value="primary">Primary School</option>
                      <option value="secondary">Secondary School (SSCE/WAEC)</option>
                      <option value="ond">OND / NCE</option>
                      <option value="hnd">HND</option>
                      <option value="bsc">Bachelor's Degree</option>
                      <option value="postgrad">Postgraduate</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Business / Employer Address
                    </label>
                    <input
                      type="text"
                      value={formData.employer_address || ''}
                      onChange={e => handleChange('employer_address', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Address of workplace or business"
                    />
                  </div>
                </div>
              </div>
            )}
            {activeSection === 'employment' && (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1.5rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Place of Birth
                    </label>
                    <input
                      type="text"
                      value={formData.place_of_birth}
                      onChange={e => handleChange('place_of_birth', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* Classification (moved from basic) */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Classification
                    </label>
                    <select
                      value={formData.classification || ''}
                      onChange={e =>
                        handleChange(
                          'classification',
                          e.target.value ? Number(e.target.value) : undefined
                        )
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select Class</option>
                      {classifications.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* [NEW] School House */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      School House{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <select
                      value={(formData as any).school_house || ''}
                      onChange={e => handleChange('school_house' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select House</option>
                      <option value="Blue">Blue</option>
                      <option value="Green">Green</option>
                      <option value="Red">Red</option>
                      <option value="Yellow">Yellow</option>
                      <option value="Purple">Purple</option>
                      <option value="Orange">Orange</option>
                    </select>
                  </div>

                  {/* [NEW] Nationality */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Nationality{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).nationality || 'Nigerian'}
                      onChange={e => handleChange('nationality' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* [NEW] State of Origin */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      State of Origin{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).state_of_origin || ''}
                      onChange={e => handleChange('state_of_origin' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* [NEW] Local Government Area */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Local Government Area{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).lga || ''}
                      onChange={e => handleChange('lga' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Admission Number
                    </label>
                    <input
                      type="text"
                      value={formData.admission_number || ''}
                      onChange={e => handleChange('admission_number' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., 2024/001"
                    />
                  </div>

                  {/* [NEW] Admission Date */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Admission Date{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="date"
                      value={formData.admission_date || ''}
                      onChange={e => handleChange('admission_date' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* [NEW] Proposed Month of Entry */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Proposed Month of Entry{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="month"
                      value={(formData as any).proposed_entry_month || ''}
                      onChange={e => handleChange('proposed_entry_month' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* Grade Level as Entry Level */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Entry Level (Grade) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.grade_level || ''}
                      onChange={e => handleChange('grade_level' as any, e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., Grade 1, JSS 1, Form 1"
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Class/Form
                    </label>
                    <input
                      type="text"
                      value={formData.class_name || ''}
                      onChange={e => handleChange('class_name' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., Grade 5, Form 2"
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Section
                    </label>
                    <input
                      type="text"
                      value={formData.section || ''}
                      onChange={e => handleChange('section' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., A, B, Blue"
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Academic Year
                    </label>
                    <input
                      type="text"
                      value={formData.academic_year || ''}
                      onChange={e => handleChange('academic_year' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., 2025/2026"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Parents/Guardians - MODIFIED with addresses */}
            {activeSection === 'guardians' && (
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  Parents/Guardians Information
                  <span
                    style={{
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      marginLeft: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    MODIFIED
                  </span>
                </h2>

                {/* Primary Guardian */}
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginBottom: '1rem',
                    color: '#3b82f6',
                  }}
                >
                  Primary Parent/Guardian
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1.5rem',
                    marginBottom: '2rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.primary_guardian_name || ''}
                      onChange={e => handleChange('primary_guardian_name' as any, e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Relationship *
                    </label>
                    <select
                      value={formData.primary_guardian_relationship || ''}
                      onChange={e =>
                        handleChange('primary_guardian_relationship' as any, e.target.value)
                      }
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="grandfather">Grandfather</option>
                      <option value="grandmother">Grandmother</option>
                      <option value="guardian">Legal Guardian</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      value={formData.primary_guardian_phone || ''}
                      onChange={e => handleChange('primary_guardian_phone' as any, e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.primary_guardian_email || ''}
                      onChange={e => handleChange('primary_guardian_email' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Occupation
                    </label>
                    <input
                      type="text"
                      value={formData.primary_guardian_occupation || ''}
                      onChange={e =>
                        handleChange('primary_guardian_occupation' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* [NEW] Primary Guardian Home Address */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Home Address{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).primary_guardian_home_address || ''}
                      onChange={e =>
                        handleChange('primary_guardian_home_address' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Home address"
                    />
                  </div>

                  {/* [NEW] Primary Guardian Office Address */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Office Address{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).primary_guardian_office_address || ''}
                      onChange={e =>
                        handleChange('primary_guardian_office_address' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Office address"
                    />
                  </div>

                  {/* [NEW] Who will pay School fees */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Who will pay School fees & Other Expenses{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).who_pays_fees || ''}
                      onChange={e => handleChange('who_pays_fees' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="e.g., Father, Mother, Sponsor"
                    />
                  </div>
                </div>

                {/* Secondary Guardian */}
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginBottom: '1rem',
                    color: '#6b7280',
                  }}
                >
                  Secondary Parent/Guardian (Optional)
                </h3>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.secondary_guardian_name || ''}
                      onChange={e => handleChange('secondary_guardian_name' as any, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Relationship
                    </label>
                    <select
                      value={formData.secondary_guardian_relationship || ''}
                      onChange={e =>
                        handleChange('secondary_guardian_relationship' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="grandfather">Grandfather</option>
                      <option value="grandmother">Grandmother</option>
                      <option value="guardian">Legal Guardian</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formData.secondary_guardian_phone || ''}
                      onChange={e =>
                        handleChange('secondary_guardian_phone' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.secondary_guardian_email || ''}
                      onChange={e =>
                        handleChange('secondary_guardian_email' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                      }}
                    >
                      Occupation
                    </label>
                    <input
                      type="text"
                      value={formData.secondary_guardian_occupation || ''}
                      onChange={e =>
                        handleChange('secondary_guardian_occupation' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                    />
                  </div>

                  {/* [NEW] Secondary Guardian Home Address */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Home Address{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).secondary_guardian_home_address || ''}
                      onChange={e =>
                        handleChange('secondary_guardian_home_address' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Home address"
                    />
                  </div>

                  {/* [NEW] Secondary Guardian Office Address */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        color: '#3b82f6',
                      }}
                    >
                      Office Address{' '}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          marginLeft: '0.5rem',
                        }}
                      >
                        NEW
                      </span>
                    </label>
                    <input
                      type="text"
                      value={(formData as any).secondary_guardian_office_address || ''}
                      onChange={e =>
                        handleChange('secondary_guardian_office_address' as any, e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                      }}
                      placeholder="Office address"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div
              style={{
                marginTop: '2rem',
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
                paddingTop: '2rem',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <button
                type="button"
                onClick={() => navigate('/clients')}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (!hasChanges && isEditMode)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: loading || (!hasChanges && isEditMode) ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: loading || (!hasChanges && isEditMode) ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: loading || (!hasChanges && isEditMode) ? 0.5 : 1,
                }}
              >
                <Save size={18} />
                {loading ? 'Saving...' : isEditMode ? 'Update Client' : 'Register Client'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientFormPage;
