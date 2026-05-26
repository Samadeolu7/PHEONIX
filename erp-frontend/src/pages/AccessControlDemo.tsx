// src/pages/AccessControlDemo.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccessControlChecker from '../components/access/AccessControlChecker';
import {
  Shield,
  ArrowLeft,
  User,
  Settings,
  BookOpen,
  GraduationCap,
  Users,
  Calendar,
  CreditCard,
  FileText,
} from 'lucide-react';

const AccessControlDemo: React.FC = () => {
  const navigate = useNavigate();
  const [selectedClient, setSelectedClient] = useState(1);
  const [selectedService, setSelectedService] = useState('classes');
  const [showModal, setShowModal] = useState(false);

  // Mock client data
  const mockClients = [
    { id: 1, name: 'John Doe', status: 'Active', balance: '125000' },
    { id: 2, name: 'Jane Smith', status: 'Partial Payment', balance: '75000' },
    { id: 3, name: 'Mike Johnson', status: 'Overdue', balance: '250000' },
    { id: 4, name: 'Sarah Wilson', status: 'Paid', balance: '0' },
  ];

  // Mock services
  const mockServices = [
    {
      code: 'classes',
      name: 'Attend Classes',
      icon: BookOpen,
      description: 'Regular classroom attendance',
    },
    {
      code: 'library',
      name: 'Library Access',
      icon: FileText,
      description: 'Access to library resources',
    },
    {
      code: 'sports',
      name: 'Sports Facilities',
      icon: Users,
      description: 'Use of sports facilities',
    },
    {
      code: 'exams',
      name: 'Examinations',
      icon: GraduationCap,
      description: 'Participate in examinations',
    },
    {
      code: 'graduation',
      name: 'Graduation',
      icon: Calendar,
      description: 'Graduation ceremony participation',
    },
    {
      code: 'transcript',
      name: 'Transcript Request',
      icon: FileText,
      description: 'Request official transcripts',
    },
  ];

  const selectedClientData = mockClients.find(c => c.id === selectedClient);
  const selectedServiceData = mockServices.find(s => s.code === selectedService);

  const handleAccessGranted = () => {
    console.log('Access granted for service:', selectedService);
  };

  const handleAccessDenied = (reason: string) => {
    console.log('Access denied:', reason);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Access Control Demo</h1>
                <p className="text-gray-600">
                  Test service access validation based on payment status
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Client Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="h-5 w-5" />
                Select Client
              </h3>
              <div className="space-y-3">
                {mockClients.map(client => (
                  <div
                    key={client.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedClient === client.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedClient(client.id)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">{client.name}</p>
                        <p className="text-sm text-gray-500">ID: {client.id}</p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-medium ${
                            client.status === 'Paid'
                              ? 'text-green-600'
                              : client.status === 'Active'
                                ? 'text-blue-600'
                                : client.status === 'Partial Payment'
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                          }`}
                        >
                          {client.status}
                        </p>
                        <p className="text-xs text-gray-500">
                          Balance: ₦{parseInt(client.balance).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Service Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Select Service
              </h3>
              <div className="space-y-2">
                {mockServices.map(service => {
                  const Icon = service.icon;
                  return (
                    <div
                      key={service.code}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedService === service.code
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedService(service.code)}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-gray-600" />
                        <div>
                          <p className="font-medium text-gray-900">{service.name}</p>
                          <p className="text-xs text-gray-500">{service.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Test Controls */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Controls</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Shield className="h-4 w-4" />
                  Test Modal Version
                </button>
                <div className="text-xs text-gray-500 text-center">
                  The inline version is shown on the right →
                </div>
              </div>
            </div>
          </div>

          {/* Access Control Display */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                Access Control Check: {selectedClientData?.name} → {selectedServiceData?.name}
              </h3>

              {/* Inline Access Control Checker */}
              <AccessControlChecker
                clientId={selectedClient}
                serviceCode={selectedService}
                serviceName={selectedServiceData?.name || selectedService}
                onAccessGranted={handleAccessGranted}
                onAccessDenied={handleAccessDenied}
                className="mb-6"
              />

              {/* Information Panel */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">How It Works</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>• The AccessControlChecker validates service access in real-time</p>
                  <p>• It checks the client's entitlement payment status and access rules</p>
                  <p>• Different services may have different payment requirements</p>
                  <p>
                    • Access is granted/denied based on payment percentage and service restrictions
                  </p>
                  <p>• The component provides payment options when access is denied</p>
                </div>
              </div>

              {/* Usage Examples */}
              <div className="mt-6 bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-3">Integration Examples</h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <p>
                    <strong>Before Exam Registration:</strong> Check if student has paid required
                    percentage
                  </p>
                  <p>
                    <strong>Library Access:</strong> Validate access level before allowing entry
                  </p>
                  <p>
                    <strong>Graduation Eligibility:</strong> Ensure all fees are paid before
                    ceremony
                  </p>
                  <p>
                    <strong>Service Gates:</strong> Real-time validation at service entry points
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Version */}
        {showModal && (
          <AccessControlChecker
            clientId={selectedClient}
            serviceCode={selectedService}
            serviceName={selectedServiceData?.name || selectedService}
            onAccessGranted={handleAccessGranted}
            onAccessDenied={handleAccessDenied}
            showModal={true}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default AccessControlDemo;
