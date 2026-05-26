// src/pages/clients/ClientListPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clientService, Client, ClientFilters } from '../../services/clientService';
import { triggerDownload } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { useDomainLabels } from '../../contexts/DomainLabelContext';
import { academicSessionService } from '../../services/academicSessionService';
import {
  GraduationCap,
  Users,
  BookOpen,
  Calendar,
  UserCheck,
  Download,
  Settings,
} from 'lucide-react';

const ClientListPage: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ClientFilters>({});
  const [classifications, setClassifications] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const { success, error: showError } = useToast();
  const { selectedRole } = useAuth();
  const { getLabel, isSchool } = useDomainLabels();

  // Check if current user role can create clients
  const canCreateClients = selectedRole && selectedRole !== 'Principal';

  const { data: currentAcademicYear } = useQuery({
    queryKey: ['academic-years', 'current'],
    queryFn: () => academicSessionService.getCurrent(),
    retry: false,
  });

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load classifications
      const classData = await clientService.getClassifications();
      setClassifications(classData);

      // Load clients
      const response = await clientService.getClients(filters);
      setClients(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    } catch (error) {
      console.error('Error loading data:', error);
      showError('Failed to load student data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (clientId: number, clientName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${clientName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await clientService.deleteClient(clientId);
      success('Student deleted successfully');
      loadData(); // Reload the list
    } catch (error: any) {
      console.error('Error deleting student:', error);
      showError(error.message || 'Failed to delete student');
    }
  };

  const handleFilterChange = (key: keyof ClientFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleExportCSV = async () => {
    try {
      setExportLoading(true);
      // Strip the page param — the backend returns ALL matching rows in one streamed CSV
      const { page: _page, ...exportFilters } = filters as any;
      const blob = await clientService.exportCsv(exportFilters);
      triggerDownload(blob, `students_export_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      console.error('CSV export failed:', err);
      showError('Failed to export students');
    } finally {
      setExportLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getStatusBadge = (status: Client['status']) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800', label: 'Enrolled' },
      inactive: {
        color: 'bg-gray-100 text-gray-800',
        label: 'Graduated/Left',
      },
      suspended: { color: 'bg-yellow-100 text-yellow-800', label: 'Suspended' },
      blacklisted: {
        color: 'bg-red-100 text-red-800',
        label: 'Expelled',
      },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getUsageContextBadge = (context: Client['usage_context']) => {
    const contextConfig = {
      financial: { color: 'bg-blue-100 text-blue-800', label: 'Financial' },
      student: { color: 'bg-purple-100 text-purple-800', label: 'Student' },
      patient: { color: 'bg-pink-100 text-pink-800', label: 'Patient' },
      customer: { color: 'bg-indigo-100 text-indigo-800', label: 'Customer' },
    };

    const config = contextConfig[context];
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getGenderIcon = (gender: Client['gender']) => {
    const genderConfig = {
      male: '👨',
      female: '👩',
      other: '👤',
    };
    return genderConfig[gender];
  };

  const getGradeLevel = (classificationName: string) => {
    const gradeMap: { [key: string]: string } = {
      Freshman: 'Grade 9',
      Sophomore: 'Grade 10',
      Junior: 'Grade 11',
      Senior: 'Grade 12',
    };
    return gradeMap[classificationName] || classificationName;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
            </div>
            <p className="text-gray-600">
              Manage all students, track enrollment, and view academic classifications
            </p>
          </div>
          {canCreateClients && (
            <button
              onClick={() => navigate('/clients/create')}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center gap-2"
            >
              <Users size={18} />
              Add New Student
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Students</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.count}</p>
            </div>
            <Users className="w-8 h-8 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Currently Enrolled</p>
              <p className="text-2xl font-bold text-green-600">
                {clients.filter(c => c.status === 'active').length}
              </p>
            </div>
            <UserCheck className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Graduated/Left</p>
              <p className="text-2xl font-bold text-purple-600">
                {clients.filter(c => c.status === 'inactive').length}
              </p>
            </div>
            <BookOpen className="w-8 h-8 text-purple-500" />
          </div>
        </div>
        <button
          onClick={() => navigate('/incomes/academic-sessions')}
          className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500 text-left hover:shadow-md transition-shadow"
          title="Manage Academic Sessions"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Academic Year</p>
              <p className="text-2xl font-bold text-blue-600">{currentAcademicYear?.name ?? '—'}</p>
            </div>
            <div className="relative">
              <Calendar className="w-8 h-8 text-blue-500" />
              <Settings className="w-3 h-3 text-blue-400 absolute -bottom-0.5 -right-0.5" />
            </div>
          </div>
          <p className="text-xs text-blue-400 mt-1">Click to manage sessions</p>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Users size={20} className="text-indigo-500" />
          Filter Students
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Status Filter */}
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enrollment Status</label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Enrolled</option>
              <option value="inactive">Graduated/Left</option>
              <option value="suspended">Suspended</option>
              <option value="blacklisted">Expelled</option>
            </select>
          </div> */}

          {/* Usage Context Filter */}
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Student Type</label>
            <select
              value={filters.usage_context || ''}
              onChange={e => handleFilterChange('usage_context', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="student">Regular Student</option>
              <option value="financial">Scholarship Student</option>
              <option value="patient">Special Needs</option>
            </select>
          </div> */}

          {/* Classification Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
            <select
              value={filters.classification || ''}
              onChange={e =>
                handleFilterChange(
                  'classification',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Grades</option>
              {classifications.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{' '}
                  {c.name === 'Freshman'
                    ? '(Grade 9)'
                    : c.name === 'Sophomore'
                      ? '(Grade 10)'
                      : c.name === 'Junior'
                        ? '(Grade 11)'
                        : c.name === 'Senior'
                          ? '(Grade 12)'
                          : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Student name, ID, or email..."
              value={filters.search || ''}
              onChange={e => handleFilterChange('search', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => setFilters({})}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Users size={20} className="text-indigo-500" />
                  Student Directory ({pagination.count} students)
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={handleExportCSV}
                    disabled={exportLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={16} />
                    {exportLoading ? 'Exporting...' : 'Download CSV'}
                  </button>
                  <button
                    onClick={() => navigate('/clients/import')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    Import Students
                  </button>
                  <button
                    onClick={() => navigate('/clients/classifications')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 text-indigo-700"
                  >
                    Manage Grade Levels
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student Information
                    </th>
                    {isSchool && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class/Grade
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Information
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Age/Gender
                    </th>
                    {!isSchool && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student Type
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Grade Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Enrollment Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map(client => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {(client as any).image ? (
                              <img
                                className="h-10 w-10 rounded-full object-cover"
                                src={(client as any).image}
                                alt={client.full_name}
                              />
                            ) : (
                              <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                <span className="text-indigo-700 font-medium text-lg">
                                  {client.full_name.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {client.full_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Student ID:{' '}
                              {isSchool && (client as any).admission_number
                                ? (client as any).admission_number
                                : client.client_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      {isSchool && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {(client as any).class_name || 'Not assigned'}
                          </div>
                          <div className="text-sm text-gray-500">
                            Homeroom: {(client as any).homeroom || 'TBD'}
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.phone_primary}</div>
                        <div className="text-sm text-gray-500">{client.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.age} years</div>
                        <div className="text-sm text-gray-500 capitalize flex items-center gap-1">
                          {getGenderIcon(client.gender)} {client.gender}
                        </div>
                      </td>
                      {!isSchool && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getUsageContextBadge(client.usage_context)}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {client.classification_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {getGradeLevel(client.classification_name)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(client.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(client.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => navigate(`/clients/${client.id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View Profile
                          </button>
                          <button
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClient(client.id, client.full_name)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.count > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.currentPage} of {Math.ceil(pagination.count / 20)} (
                    {pagination.count} total students)
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm font-medium text-gray-900 bg-indigo-50 border border-indigo-200 rounded-md">
                      Page {pagination.currentPage}
                    </span>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {clients.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <GraduationCap className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
                  <p className="text-gray-600 mb-4">
                    {canCreateClients
                      ? 'Try adjusting your filters or add a new student to get started.'
                      : 'No students match your current filters.'}
                  </p>
                  {canCreateClients && (
                    <button
                      onClick={() => navigate('/clients/create')}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 inline-flex items-center gap-2"
                    >
                      <Users size={18} />
                      Add First Student
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ClientListPage;
