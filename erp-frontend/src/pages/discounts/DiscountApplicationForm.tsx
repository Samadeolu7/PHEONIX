import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  User,
  FileText,
  DollarSign,
  Upload,
  AlertCircle,
  Info,
  Send,
} from 'lucide-react';
import {
  discountService,
  DiscountApplicationCreateData,
  DiscountProgram,
} from '../../services/discountService';
import { clientService, ClientOption } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';

const DiscountApplicationForm: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [programs, setPrograms] = useState<DiscountProgram[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<DiscountProgram | null>(null);

  const [formData, setFormData] = useState<DiscountApplicationCreateData>({
    program: 0,
    client: 0,
    application_date: new Date().toISOString().split('T')[0],
    reason: '',
    supporting_documents: [],
    custom_discount_value: '',
  });

  useEffect(() => {
    fetchPrograms();
    fetchClients();
  }, []);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const response = await discountService.getDiscountPrograms({ is_active: true });
      setPrograms(response.results);
    } catch (error) {
      toast.error('Failed to fetch discount programs');
      console.error('Error fetching programs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch (error) {
      toast.error('Failed to fetch clients');
      console.error('Error fetching clients:', error);
    }
  };

  const handleInputChange = (field: keyof DiscountApplicationCreateData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Update selected program when program changes
    if (field === 'program') {
      const program = programs.find(p => p.id === parseInt(value));
      setSelectedProgram(program || null);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.program) {
      newErrors.program = 'Please select a discount program';
    }

    if (!formData.client) {
      newErrors.client = 'Please select a client/applicant';
    }

    if (!formData.reason.trim()) {
      newErrors.reason = 'Please provide a reason for this application';
    } else if (formData.reason.trim().length < 10) {
      newErrors.reason = 'Reason must be at least 10 characters long';
    }

    if (!formData.application_date) {
      newErrors.application_date = 'Application date is required';
    }

    if (formData.custom_discount_value) {
      const value = parseFloat(formData.custom_discount_value);
      if (isNaN(value) || value < 0) {
        newErrors.custom_discount_value = 'Custom discount value must be a positive number';
      }
      if (selectedProgram?.discount_type === 'percentage' && value > 100) {
        newErrors.custom_discount_value = 'Percentage cannot exceed 100%';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.program || !formData.client) {
      toast.error('Please select a program and client before saving');
      return;
    }

    try {
      setSaving(true);

      const submitData = {
        ...formData,
        custom_discount_value: formData.custom_discount_value || undefined,
      };

      const response = await discountService.createDiscountApplication(submitData);
      toast.success('Application saved as draft');
      navigate(`/discounts/applications/${response.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save application');
      console.error('Error saving application:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    try {
      setSubmitting(true);

      const submitData = {
        ...formData,
        custom_discount_value: formData.custom_discount_value || undefined,
      };

      // First create the application
      const response = await discountService.createDiscountApplication(submitData);

      // Then submit it for approval
      await discountService.submitDiscountApplication(response.id, submitData);

      toast.success('Application submitted for review');
      navigate(`/discounts/applications/${response.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to submit application');
      console.error('Error submitting application:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const getProgramTypeLabel = (type: string) => {
    const labels = {
      scholarship: 'Scholarship/Grant',
      staff_benefit: 'Staff Benefit',
      discount: 'Customer Discount',
      waiver: 'Fee Waiver',
      insurance: 'Insurance Coverage',
      promotion: 'Promotional Discount',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getDiscountDisplay = (program: DiscountProgram) => {
    if (program.discount_type === 'full_waiver') {
      return 'Full Waiver (100%)';
    }
    return `${program.discount_value}${program.discount_type === 'percentage' ? '%' : ''}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/discounts/applications')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Discount Application</h1>
            <p className="text-gray-600">Apply for a discount or scholarship program</p>
          </div>
        </div>
      </div>

      <form className="space-y-6">
        {/* Program Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Program Selection
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discount Program *
              </label>
              <select
                value={formData.program}
                onChange={e => handleInputChange('program', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.program ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value={0}>Select a program</option>
                {programs.map(program => (
                  <option key={program.id} value={program.id}>
                    {program.name} - {getProgramTypeLabel(program.program_type)} (
                    {getDiscountDisplay(program)})
                  </option>
                ))}
              </select>
              {errors.program && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.program}
                </p>
              )}
            </div>

            {selectedProgram && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Program Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Type:</span>{' '}
                    {getProgramTypeLabel(selectedProgram.program_type)}
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Discount:</span>{' '}
                    {getDiscountDisplay(selectedProgram)}
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Valid From:</span>{' '}
                    {new Date(selectedProgram.start_date).toLocaleDateString()}
                  </div>
                  {selectedProgram.end_date && (
                    <div>
                      <span className="text-blue-700 font-medium">Valid Until:</span>{' '}
                      {new Date(selectedProgram.end_date).toLocaleDateString()}
                    </div>
                  )}
                  {selectedProgram.requires_approval && (
                    <div className="md:col-span-2">
                      <span className="text-blue-700 font-medium">Note:</span> This program requires
                      approval
                    </div>
                  )}
                </div>
                {selectedProgram.description && (
                  <div className="mt-2">
                    <span className="text-blue-700 font-medium">Description:</span>
                    <p className="text-blue-800 mt-1">{selectedProgram.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Applicant Information */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            Applicant Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client/Applicant *
              </label>
              <select
                value={formData.client}
                onChange={e => handleInputChange('client', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.client ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value={0}>Select a client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.client_id})
                  </option>
                ))}
              </select>
              {errors.client && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.client}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Application Date *
              </label>
              <input
                type="date"
                value={formData.application_date}
                onChange={e => handleInputChange('application_date', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.application_date ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.application_date && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.application_date}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Application Details */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Info className="h-5 w-5" />
            Application Details
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Application *
              </label>
              <textarea
                value={formData.reason}
                onChange={e => handleInputChange('reason', e.target.value)}
                rows={4}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.reason ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Please explain why you are applying for this discount/scholarship. Include relevant details about your situation, achievements, or financial need..."
              />
              {errors.reason && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.reason}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Minimum 10 characters. Be specific about your circumstances and qualifications.
              </p>
            </div>

            {selectedProgram && selectedProgram.discount_type !== 'full_waiver' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Discount Value (Optional)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={selectedProgram.discount_type === 'percentage' ? '100' : undefined}
                    value={formData.custom_discount_value}
                    onChange={e => handleInputChange('custom_discount_value', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.custom_discount_value ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder={`Default: ${getDiscountDisplay(selectedProgram)}`}
                  />
                  {selectedProgram.discount_type === 'percentage' && (
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      %
                    </span>
                  )}
                </div>
                {errors.custom_discount_value && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errors.custom_discount_value}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty to use the program's default discount value. Custom values may require
                  additional approval.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Supporting Documents */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Supporting Documents
          </h2>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              Upload supporting documents (transcripts, financial statements, etc.)
            </p>
            <button type="button" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              Choose files or drag and drop
            </button>
            <p className="text-xs text-gray-500 mt-1">PDF, DOC, DOCX, JPG, PNG up to 10MB each</p>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-4 pt-6 border-t">
          <button
            type="button"
            onClick={() => navigate('/discounts/applications')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={handleSubmitApplication}
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DiscountApplicationForm;
