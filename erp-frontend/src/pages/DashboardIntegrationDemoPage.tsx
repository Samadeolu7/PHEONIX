// Demo page for dashboard integration with existing backend system
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types/roles';
import {
  useDashboardIntegration,
  useDashboardMigration,
  useDashboardCompatibility,
} from '../hooks/useDashboardIntegration';
import { OptimizedRoleBasedDashboard } from '../components/dashboard/OptimizedRoleBasedDashboard';
import { DashboardMigrationUtility } from '../components/dashboard/DashboardMigrationUtility';
import { dashboardBackendIntegration } from '../services/dashboardBackendIntegration';
import { dashboardCompatibilityLayer } from '../services/dashboardCompatibilityLayer';

interface DemoSection {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
}

const DashboardIntegrationDemoPage: React.FC = () => {
  const { user, selectedRole, setRole } = useAuth();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [testResults, setTestResults] = useState<any>(null);
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);

  // Dashboard integration hook
  const {
    state: dashboardState,
    actions: dashboardActions,
    stats,
    quickActions,
    isCompatibilityMode,
    migrationStatus,
  } = useDashboardIntegration({
    role: selectedRole || 'Officer',
    enableBackendIntegration: true,
    enableCompatibilityLayer: true,
    autoRefresh: true,
  });

  // Migration hook
  const {
    performFullMigration,
    rollbackMigration,
    isLoading: migrationLoading,
    error: migrationError,
    migrationLog,
  } = useDashboardMigration();

  // Compatibility hook
  const {
    config: compatibilityConfig,
    updateConfig: updateCompatibilityConfig,
    testCompatibility,
    getStatus: getCompatibilityStatus,
  } = useDashboardCompatibility();

  // Demo sections
  const demoSections: DemoSection[] = [
    {
      id: 'dashboard',
      title: 'Integrated Dashboard',
      description: 'Role-based dashboard with backend integration and real-time data',
      component: () => (
        <OptimizedRoleBasedDashboard
          role={selectedRole || 'Officer'}
          enablePerformanceMonitoring={true}
          enableProgressiveLoading={true}
          enableCaching={true}
          className="max-w-7xl mx-auto"
        />
      ),
    },
    {
      id: 'migration',
      title: 'Migration Utility',
      description: 'Tools for migrating existing dashboards to the new role-based system',
      component: () => (
        <DashboardMigrationUtility
          onMigrationComplete={() => {
            alert('Migration completed successfully!');
            dashboardActions.refreshDashboard();
          }}
          onMigrationError={error => {
            alert(`Migration failed: ${error}`);
          }}
          className="max-w-4xl mx-auto"
        />
      ),
    },
    {
      id: 'integration',
      title: 'Integration Status',
      description: 'Monitor backend integration and compatibility layer status',
      component: IntegrationStatusComponent,
    },
    {
      id: 'testing',
      title: 'Integration Testing',
      description: 'Test various aspects of the dashboard integration system',
      component: IntegrationTestingComponent,
    },
  ];

  // Load integration status on mount
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = {
          compatibility: getCompatibilityStatus(),
          backendCache: dashboardBackendIntegration.getCacheStats(),
          dashboardState: {
            isLoading: dashboardState.isLoading,
            isEnhanced: dashboardState.isEnhanced,
            lastUpdated: dashboardState.lastUpdated,
            error: dashboardState.error,
          },
          migrationStatus,
          isCompatibilityMode,
        };
        setIntegrationStatus(status);
      } catch (error) {
        console.error('Failed to load integration status:', error);
      }
    };

    loadStatus();
  }, [dashboardState, migrationStatus, isCompatibilityMode]);

  // Test integration functionality
  const runIntegrationTests = async () => {
    try {
      const results = await dashboardActions.testIntegration();
      const compatibilityResults = await testCompatibility();

      setTestResults({
        integration: results,
        compatibility: compatibilityResults,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      setTestResults({
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard Integration Demo</h1>
                <p className="text-gray-600 mt-1">
                  Demonstration of the new role-based dashboard system with backend integration
                </p>
              </div>
              <div className="flex items-center space-x-4">
                {/* Role Selector */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Role:</label>
                  <select
                    value={selectedRole || 'Officer'}
                    onChange={e => setRole(e.target.value as UserRole)}
                    className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Director">Director</option>
                    <option value="Principal">Principal</option>
                    <option value="Administrator">Administrator</option>
                    <option value="Registrar">Registrar</option>
                    <option value="Officer">Officer</option>
                  </select>
                </div>

                {/* Status Indicators */}
                <div className="flex items-center space-x-2 text-xs">
                  <div
                    className={`px-2 py-1 rounded-full ${
                      isCompatibilityMode
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {isCompatibilityMode ? 'Compatibility Mode' : 'Native Mode'}
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full ${
                      dashboardState.isEnhanced
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {dashboardState.isEnhanced ? 'Enhanced' : 'Template Only'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {demoSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeSection === section.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {demoSections.map(section => {
          if (section.id !== activeSection) return null;

          const Component = section.component;
          return (
            <div key={section.id}>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">{section.title}</h2>
                <p className="text-gray-600 mt-1">{section.description}</p>
              </div>
              <Component />
            </div>
          );
        })}
      </div>

      {/* Quick Actions Sidebar */}
      <div className="fixed right-4 top-1/2 transform -translate-y-1/2 space-y-2">
        <button
          onClick={() => dashboardActions.refreshDashboard()}
          disabled={dashboardState.isLoading}
          className="block w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          title="Refresh Dashboard"
        >
          <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        <button
          onClick={runIntegrationTests}
          className="block w-12 h-12 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 transition-colors"
          title="Run Integration Tests"
        >
          <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        <button
          onClick={() => dashboardActions.clearCache()}
          className="block w-12 h-12 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-colors"
          title="Clear Cache"
        >
          <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Integration Status Component
const IntegrationStatusComponent: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const compatibilityStatus = dashboardCompatibilityLayer.getStatus();
        const cacheStats = dashboardBackendIntegration.getCacheStats();

        setStatus({
          compatibility: compatibilityStatus,
          cache: cacheStats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to load status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Compatibility Layer Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Compatibility Layer</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Status</span>
            <span
              className={`text-sm font-medium ${
                status?.compatibility?.initialized ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {status?.compatibility?.initialized ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Current Role</span>
            <span className="text-sm font-medium text-gray-900">
              {status?.compatibility?.currentRole || 'None'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Version</span>
            <span className="text-sm font-medium text-gray-900">
              {status?.compatibility?.version || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Cache Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Backend Cache</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Cached Items</span>
            <span className="text-sm font-medium text-gray-900">{status?.cache?.size || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Cache Keys</span>
            <span className="text-sm font-medium text-gray-900">
              {status?.cache?.keys?.length || 0}
            </span>
          </div>
          {status?.cache?.keys && status.cache.keys.length > 0 && (
            <div className="mt-3">
              <span className="text-sm text-gray-600">Keys:</span>
              <div className="mt-1 text-xs text-gray-500 space-y-1">
                {status.cache.keys.map((key: string, index: number) => (
                  <div key={index} className="bg-gray-100 rounded px-2 py-1">
                    {key}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Integration Testing Component
const IntegrationTestingComponent: React.FC = () => {
  const [testResults, setTestResults] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const runTests = async () => {
    setTesting(true);
    try {
      const results = {
        backendIntegration: false,
        templateGeneration: false,
        dataEnhancement: false,
        compatibilityLayer: false,
        errors: [] as string[],
      };

      // Test backend integration
      try {
        const template = await dashboardBackendIntegration.getRoleBasedDashboard('Officer');
        results.backendIntegration = !!template;
        results.templateGeneration = !!template;
      } catch (error: any) {
        results.errors.push(`Backend integration: ${error.message}`);
      }

      // Test compatibility layer
      try {
        const compatibilityTest = await dashboardCompatibilityLayer.testCompatibility();
        results.compatibilityLayer = compatibilityTest.interceptorsInstalled;
      } catch (error: any) {
        results.errors.push(`Compatibility layer: ${error.message}`);
      }

      // Test data enhancement
      try {
        const backendData = await dashboardBackendIntegration.getUserAssignedDashboard();
        results.dataEnhancement = true; // If no error, enhancement is working
      } catch (error: any) {
        results.errors.push(`Data enhancement: ${error.message}`);
      }

      setTestResults({
        ...results,
        timestamp: new Date().toISOString(),
        success: results.errors.length === 0,
      });
    } catch (error: any) {
      setTestResults({
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">Integration Tests</h3>
        <button
          onClick={runTests}
          disabled={testing}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {testing ? 'Running Tests...' : 'Run Tests'}
        </button>
      </div>

      {testResults && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-md ${
              testResults.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center">
              <div
                className={`flex-shrink-0 ${
                  testResults.success ? 'text-green-400' : 'text-red-400'
                }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  {testResults.success ? (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
              </div>
              <div className="ml-3">
                <h4
                  className={`text-sm font-medium ${
                    testResults.success ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {testResults.success ? 'All Tests Passed' : 'Some Tests Failed'}
                </h4>
                <p className={`text-sm ${testResults.success ? 'text-green-700' : 'text-red-700'}`}>
                  Tested at {new Date(testResults.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-900">Test Results</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Backend Integration</span>
                  <span
                    className={testResults.backendIntegration ? 'text-green-600' : 'text-red-600'}
                  >
                    {testResults.backendIntegration ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Template Generation</span>
                  <span
                    className={testResults.templateGeneration ? 'text-green-600' : 'text-red-600'}
                  >
                    {testResults.templateGeneration ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Data Enhancement</span>
                  <span className={testResults.dataEnhancement ? 'text-green-600' : 'text-red-600'}>
                    {testResults.dataEnhancement ? '✓' : '✗'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Compatibility Layer</span>
                  <span
                    className={testResults.compatibilityLayer ? 'text-green-600' : 'text-red-600'}
                  >
                    {testResults.compatibilityLayer ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            </div>

            {testResults.errors && testResults.errors.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-gray-900">Errors</h5>
                <div className="space-y-1 text-sm text-red-600">
                  {testResults.errors.map((error: string, index: number) => (
                    <div key={index} className="bg-red-50 rounded px-2 py-1">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardIntegrationDemoPage;
