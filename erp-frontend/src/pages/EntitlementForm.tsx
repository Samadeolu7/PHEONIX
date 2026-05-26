import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  GraduationCap,
  Save,
  User,
  DollarSign,
  ChevronDown,
  AlertCircle,
  X,
  Plus,
  Shield,
  Calendar,
} from 'lucide-react';
import { entitlementService, CreateEntitlementData } from '../services/entitlementService';
import { clientService } from '../services/clientService';
import { useToast } from '../hooks/useToast';
import { api } from '../services/api';

// Local interfaces
interface Client {
  id: number;
  full_name: string;
  email?: string;
  phone?: string;
}

interface FeeStructure {
  id: number;
  name: string;
  code: string;
  base_amount: string;
  category?: {
    id: number;
    name: string;
  };
}

const EntitlementForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Data states
  const [clients, setClients] = useState<Client[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedFeeStructure, setSelectedFeeStructure] = useState<FeeStructure | null>(null);

  // Loading states
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingFeeStructures, setLoadingFeeStructures] = useState(false);

  const [formData, setFormData] = useState<CreateEntitlementData>({
    client: 0,
    invoice: 0, // Will be auto-generated
    fee_structure: 0,
    payment_term_type: 'minimum_deposit',
    total_amount: '',
    minimum_required: '',
    academic_period: {
      year: new Date().getFullYear().toString(),
      term: '1',
    },
    access_rules: {
      requires_minimum: true,
      minimum_percent: 50,
      full_access_at_percent: 80,
      grace_period_days: 14,
      allowed_services: ['classes', 'library'],
      restricted_services: ['exams', 'graduation'],
    },
  });

  const { success, error: showError } = useToast();

  useEffect(() => {
    fetchClients();
    fetchFeeStructures();

    if (isEdit && id) {
      fetchEntitlement();
    }
  }, [isEdit, id]);

  // Fetch clients
  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      const clientsData = clientOptions.map(option => ({
        id: option.id,
        full_name: option.name,
        email: '',
        phone: '',
      }));
      setClients(clientsData);
    } catch (error: any) {
      console.error('Failed to fetch clients:', error);
      showError('Failed to load clients');
    } finally {
      setLoadingClients(false);
    }
  };

  // Fetch fee structures
  const fetchFeeStructures = async () => {
    try {
      setLoadingFeeStructures(true);
      const response = await api.get('/incomes/fee-structures/');
      setFeeStructures(response.results || response);
    } catch (error: any) {
      console.error('Failed to fetch fee structures:', error);
      showError('Failed to load fee structures');
    } finally {
      setLoadingFeeStructures(false);
    }
  };

  // Handle client selection
  const handleClientChange = (clientId: number) => {
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client || null);

    setFormData(prev => ({
      ...prev,
      client: clientId,
    }));
  };

  // Handle fee structure selection
  const handleFeeStructureChange = (feeStructureId: number) => {
    const feeStructure = feeStructures.find(fs => fs.id === feeStructureId);
    setSelectedFeeStructure(feeStructure || null);

    setFormData(prev => ({
      ...prev,
      fee_structure: feeStructureId,
      total_amount: feeStructure?.base_amount || prev.total_amount,
    }));
  };

  const fetchEntitlement = async () => {
    try {
      setLoading(true);
      const entitlement = await entitlementService.getEntitlement(Number(id));

      setFormData({
        client: entitlement.client.id,
        invoice: 0, // Will be auto-generated
        fee_structure: entitlement.fee_structure.id,
        payment_term_type: entitlement.payment_term_type,
        total_amount: entitlement.total_amount,
        minimum_required: entitlement.minimum_required || '',
        academic_period: {
          year: new Date().getFullYear().toString(),
          term: '1',
        },
        access_rules: {
          requires_minimum: true,
          minimum_percent: 50,
          full_access_at_percent: 80,
          grace_period_days: 14,
          allowed_services: ['classes', 'library'],
          restricted_services: ['exams', 'graduation'],
        },
      });
    } catch (error: any) {
      console.error('Failed to fetch entitlement:', error);
      showError('Failed to load entitlement details');
    } finally {
      setLoading(false);
    }
  };

  // Tag input states for services
  const [allowedServiceInput, setAllowedServiceInput] = useState('');
  const [restrictedServiceInput, setRestrictedServiceInput] = useState('');

  // Limited to the 4 default service options
  const defaultServices = ['classes', 'library', 'exams', 'graduation'];

  // Helper functions for managing service tags
  const addAllowedService = (service: string) => {
    if (service.trim() && !formData.access_rules?.allowed_services?.includes(service.trim())) {
      const updatedServices = [...(formData.access_rules?.allowed_services || []), service.trim()];
      handleArrayInputChange('access_rules', 'allowed_services', updatedServices);
      setAllowedServiceInput('');
    }
  };

  const removeAllowedService = (serviceToRemove: string) => {
    const updatedServices =
      formData.access_rules?.allowed_services?.filter(service => service !== serviceToRemove) || [];
    handleArrayInputChange('access_rules', 'allowed_services', updatedServices);
  };

  const addRestrictedService = (service: string) => {
    if (service.trim() && !formData.access_rules?.restricted_services?.includes(service.trim())) {
      const updatedServices = [
        ...(formData.access_rules?.restricted_services || []),
        service.trim(),
      ];
      handleArrayInputChange('access_rules', 'restricted_services', updatedServices);
      setRestrictedServiceInput('');
    }
  };

  const removeRestrictedService = (serviceToRemove: string) => {
    const updatedServices =
      formData.access_rules?.restricted_services?.filter(service => service !== serviceToRemove) ||
      [];
    handleArrayInputChange('access_rules', 'restricted_services', updatedServices);
  };

  const handleAllowedServiceKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAllowedService(allowedServiceInput);
    }
  };

  const handleRestrictedServiceKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRestrictedService(restrictedServiceInput);
    }
  };

  const handleArrayInputChange = (
    parent: keyof CreateEntitlementData,
    field: string,
    value: string[]
  ) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent] as any),
        [field]: value,
      },
    }));
  };

  const handleNestedInputChange = (
    parent: keyof CreateEntitlementData,
    field: string,
    value: any
  ) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent] as any),
        [field]: value,
      },
    }));
  };

  const handleInputChange = (field: keyof CreateEntitlementData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.client || formData.client === 0) {
      showError('Please select a client');
      return;
    }

    if (!formData.fee_structure || formData.fee_structure === 0) {
      showError('Please select a fee structure');
      return;
    }

    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      showError('Please enter a valid total amount');
      return;
    }

    try {
      setSaving(true);

      // Transform form data to match the new API format
      const enrollmentData = {
        client: formData.client,
        fee_structure: formData.fee_structure,
        academic_period: {
          year: formData.academic_period?.year || new Date().getFullYear().toString(),
          term: formData.academic_period?.term || '1',
          start_date: '2025-01-20', // You may want to make this configurable
          end_date: '2025-04-10', // You may want to make this configurable
        },
        payment_terms: {
          type: formData.payment_term_type,
          minimum_percent: formData.access_rules?.minimum_percent || 50,
          full_access_percent: formData.access_rules?.full_access_at_percent || 80,
          grace_period_days: formData.access_rules?.grace_period_days || 14,
        },
        access_rules: {
          allowed_services: formData.access_rules?.allowed_services || ['classes', 'library'],
          restricted_services: formData.access_rules?.restricted_services || [
            'exams',
            'graduation',
          ],
        },
      };

      if (isEdit && id) {
        // For edit, still use the old endpoint structure
        await entitlementService.updateEntitlement(Number(id), formData);
        success('Entitlement updated successfully');
      } else {
        // Use the new enrollment endpoint
        const response = await api.post('/incomes/entitlements/enroll/', enrollmentData);
        success('Entitlement enrolled successfully');
      }

      navigate('/incomes/entitlements');
    } catch (error: any) {
      console.error('Failed to save entitlement:', error);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Failed to save entitlement';
      showError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/incomes/entitlements')}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Entitlements
          </button>
          <div className="flex items-center">
            <GraduationCap className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEdit ? 'Edit Entitlement' : 'Create New Entitlement'}
              </h1>
              <p className="text-gray-600">
                {isEdit
                  ? 'Update entitlement details'
                  : 'Set up a new fee entitlement for a student'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
            <User className="mr-2 h-5 w-5" />
            Basic Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Client <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.client || ''}
                  onChange={e => handleClientChange(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  required
                  disabled={loadingClients}
                >
                  <option value="">
                    {loadingClients ? 'Loading clients...' : 'Select a client'}
                  </option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.full_name} (ID: {client.id})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
              {selectedClient && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                  <p>
                    <strong>Selected:</strong> {selectedClient.full_name}
                  </p>
                </div>
              )}
            </div>

            {/* Fee Structure Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Fee Structure <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.fee_structure || ''}
                  onChange={e => handleFeeStructureChange(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                  required
                  disabled={loadingFeeStructures}
                >
                  <option value="">
                    {loadingFeeStructures ? 'Loading fee structures...' : 'Select a fee structure'}
                  </option>
                  {feeStructures.map(feeStructure => (
                    <option key={feeStructure.id} value={feeStructure.id}>
                      {feeStructure.name} ({feeStructure.code}) -{' '}
                      {new Intl.NumberFormat('en-NG', {
                        style: 'currency',
                        currency: 'NGN',
                        minimumFractionDigits: 0,
                      }).format(parseFloat(feeStructure.base_amount))}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Total Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.total_amount}
                onChange={e => handleInputChange('total_amount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
                required
              />
            </div>

            {/* Payment Term Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Term Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.payment_term_type}
                onChange={e => handleInputChange('payment_term_type', e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="full_upfront">Full Upfront</option>
                <option value="minimum_deposit">Minimum Deposit</option>
                <option value="installments">Installments</option>
                <option value="prepaid_allocation">Prepaid Allocation</option>
              </select>
            </div>
          </div>
        </div>

        {/* Financial Information */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
            <DollarSign className="mr-2 h-5 w-5" />
            Financial Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Required
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.minimum_required || ''}
                onChange={e => handleInputChange('minimum_required', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum amount required for partial access
              </p>
            </div>
          </div>
        </div>

        {/* Academic Period */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
            <Calendar className="mr-2 h-5 w-5" />
            Academic Period
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
              <input
                type="text"
                value={formData.academic_period?.year || ''}
                onChange={e => handleNestedInputChange('academic_period', 'year', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="2026"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Term</label>
              <select
                value={formData.academic_period?.term || '1'}
                onChange={e => handleNestedInputChange('academic_period', 'term', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>
          </div>
        </div>

        {/* Access Rules Configuration */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Access Rules Configuration
          </h3>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Percent
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.access_rules?.minimum_percent || 50}
                  onChange={e =>
                    handleNestedInputChange(
                      'access_rules',
                      'minimum_percent',
                      parseInt(e.target.value) || 50
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum payment percentage for partial access
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Access Percent
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.access_rules?.full_access_at_percent || 80}
                  onChange={e =>
                    handleNestedInputChange(
                      'access_rules',
                      'full_access_at_percent',
                      parseInt(e.target.value) || 80
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Payment percentage required for full access
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.access_rules?.grace_period_days || 14}
                  onChange={e =>
                    handleNestedInputChange(
                      'access_rules',
                      'grace_period_days',
                      parseInt(e.target.value) || 14
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Grace period before access restrictions apply
                </p>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="requires_minimum"
                checked={formData.access_rules?.requires_minimum || false}
                onChange={e =>
                  handleNestedInputChange('access_rules', 'requires_minimum', e.target.checked)
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="requires_minimum" className="ml-2 block text-sm text-gray-900">
                Requires minimum payment for access
              </label>
            </div>
          </div>
        </div>

        {/* Access Services */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Access Services
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Allowed Services */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allowed Services
              </label>

              {/* Current Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {formData.access_rules?.allowed_services?.map((service, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                  >
                    {service}
                    <button
                      type="button"
                      onClick={() => removeAllowedService(service)}
                      className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-green-600 hover:bg-green-200 hover:text-green-800"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              {/* Input for new service */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={allowedServiceInput}
                  onChange={e => setAllowedServiceInput(e.target.value)}
                  onKeyPress={handleAllowedServiceKeyPress}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Type service name and press Enter or comma"
                />
                <button
                  type="button"
                  onClick={() => addAllowedService(allowedServiceInput)}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Quick Add Buttons - Limited to 4 default options */}
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">Quick add services:</p>
                <div className="flex flex-wrap gap-1">
                  {defaultServices
                    .filter(service => !formData.access_rules?.allowed_services?.includes(service))
                    .map(service => (
                      <button
                        key={service}
                        type="button"
                        onClick={() => addAllowedService(service)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        + {service}
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* Restricted Services */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Restricted Services
              </label>

              {/* Current Tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {formData.access_rules?.restricted_services?.map((service, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
                  >
                    {service}
                    <button
                      type="button"
                      onClick={() => removeRestrictedService(service)}
                      className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-red-600 hover:bg-red-200 hover:text-red-800"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              {/* Input for new service */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={restrictedServiceInput}
                  onChange={e => setRestrictedServiceInput(e.target.value)}
                  onKeyPress={handleRestrictedServiceKeyPress}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Type service name and press Enter or comma"
                />
                <button
                  type="button"
                  onClick={() => addRestrictedService(restrictedServiceInput)}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:ring-2 focus:ring-red-500"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Quick Add Buttons - Limited to 4 default options */}
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">Quick add services:</p>
                <div className="flex flex-wrap gap-1">
                  {defaultServices
                    .filter(
                      service => !formData.access_rules?.restricted_services?.includes(service)
                    )
                    .map(service => (
                      <button
                        key={service}
                        type="button"
                        onClick={() => addRestrictedService(service)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        + {service}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate('/incomes/entitlements')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-6 py-2 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEdit ? 'Update Entitlement' : 'Create Entitlement'}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Creating Entitlements</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Entitlements link clients to fee structures and define their payment terms. An
                invoice will be automatically created when you save this entitlement.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntitlementForm;
