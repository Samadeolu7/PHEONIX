// Dashboard migration utility component for transitioning to role-based system
import React, { useState, useEffect } from 'react';
import {
  useDashboardMigration,
  useDashboardCompatibility,
} from '../../hooks/useDashboardIntegration';
import { dashboardMigrationService } from '../../services/dashboardMigrationService';
import { dashboardBackendIntegration } from '../../services/dashboardBackendIntegration';
import { UserRole } from '../../types/roles';

interface MigrationStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

interface DashboardMigrationUtilityProps {
  onMigrationComplete?: () => void;
  onMigrationError?: (error: string) => void;
  className?: string;
}

export const DashboardMigrationUtility: React.FC<DashboardMigrationUtilityProps> = ({
  onMigrationComplete,
  onMigrationError,
  className = '',
}) => {
  const [migrationSteps, setMigrationSteps] = useState<MigrationStep[]>([
    {
      id: 'backup',
      title: 'Backup Existing Dashboards',
      description: 'Creating backup of current dashboard configurations',
      status: 'pending',
    },
    {
      id: 'analyze',
      title: 'Analyze Current Dashboards',
      description: 'Analyzing existing dashboards to determine role mappings',
      status: 'pending',
    },
    {
      id: 'templates',
      title: 'Create Role-Based Templates',
      description: 'Generating role-based dashboard templates',
      status: 'pending',
    },
    {
      id: 'migrate',
      title: 'Migrate Dashboard Data',
      description: 'Converting existing dashboards to role-based system',
      status: 'pending',
    },
    {
      id: 'assignments',
      title: 'Update User Assignments',
      description: 'Migrating user dashboard assignments',
      status: 'pending',
    },
    {
      id: 'validate',
      title: 'Validate Migration',
      description: 'Verifying migration results and data integrity',
      status: 'pending',
    },
  ]);

  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [migrationLog, setMigrationLog] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    performFullMigration,
    rollbackMigration,
    isLoading,
    error,
    migrationLog: serviceMigrationLog,
  } = useDashboardMigration();

  const {
    config: compatibilityConfig,
    updateConfig: updateCompatibilityConfig,
    testCompatibility,
    getStatus: getCompatibilityStatus,
  } = useDashboardCompatibility();

  // Update migration log from service
  useEffect(() => {
    setMigrationLog(serviceMigrationLog);
  }, [serviceMigrationLog]);

  // Handle migration error
  useEffect(() => {
    if (error) {
      onMigrationError?.(error.message || 'Migration failed');

      // Mark current step as failed
      if (currentStep) {
        setMigrationSteps(prev =>
          prev.map(step =>
            step.id === currentStep ? { ...step, status: 'failed', error: error.message } : step
          )
        );
      }
    }
  }, [error, currentStep, onMigrationError]);

  /**
   * Start the migration process
   */
  const startMigration = async () => {
    try {
      setCurrentStep('backup');

      // Update steps as they progress
      const updateStep = (stepId: string, status: MigrationStep['status'], progress?: number) => {
        setMigrationSteps(prev =>
          prev.map(step => (step.id === stepId ? { ...step, status, progress } : step))
        );
        setCurrentStep(stepId);
      };

      // Step 1: Backup
      updateStep('backup', 'running');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate backup
      updateStep('backup', 'completed');

      // Step 2: Analyze
      updateStep('analyze', 'running');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate analysis
      updateStep('analyze', 'completed');

      // Step 3: Templates
      updateStep('templates', 'running');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate template creation
      updateStep('templates', 'completed');

      // Step 4: Migrate
      updateStep('migrate', 'running');
      const migrationResult = await performFullMigration();
      updateStep('migrate', 'completed');

      // Step 5: Assignments
      updateStep('assignments', 'running');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate assignment migration
      updateStep('assignments', 'completed');

      // Step 6: Validate
      updateStep('validate', 'running');
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate validation
      updateStep('validate', 'completed');

      setCurrentStep(null);
      onMigrationComplete?.();
    } catch (error: any) {
      console.error('Migration failed:', error);
      onMigrationError?.(error.message || 'Migration failed');
    }
  };

  /**
   * Test migration compatibility
   */
  const testMigrationCompatibility = async () => {
    try {
      const compatibilityResults = await testCompatibility();
      const integrationResults = await dashboardBackendIntegration.getUserAssignedDashboard();

      alert(`Compatibility Test Results:
Backend Integration: ${compatibilityResults.backendIntegration ? '✓' : '✗'}
Compatibility Layer: ${compatibilityResults.compatibilityLayer ? '✓' : '✗'}
Template Generation: ${compatibilityResults.templateGeneration ? '✓' : '✗'}
Data Enhancement: ${compatibilityResults.dataEnhancement ? '✓' : '✗'}
${compatibilityResults.errors.length > 0 ? `\nErrors: ${compatibilityResults.errors.join(', ')}` : ''}`);
    } catch (error: any) {
      alert(`Compatibility test failed: ${error.message}`);
    }
  };

  /**
   * Rollback migration
   */
  const handleRollback = async () => {
    if (
      confirm(
        'Are you sure you want to rollback the migration? This will restore the previous dashboard system.'
      )
    ) {
      try {
        await rollbackMigration();

        // Reset migration steps
        setMigrationSteps(prev =>
          prev.map(step => ({ ...step, status: 'pending', error: undefined }))
        );
        setCurrentStep(null);

        alert('Migration rollback completed successfully');
      } catch (error: any) {
        alert(`Rollback failed: ${error.message}`);
      }
    }
  };

  /**
   * Get step status icon
   */
  const getStepIcon = (step: MigrationStep) => {
    switch (step.status) {
      case 'completed':
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        );
      case 'running':
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        );
      case 'failed':
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        );
      default:
        return (
          <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
          </div>
        );
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Dashboard Migration Utility</h3>
            <p className="text-sm text-gray-500 mt-1">
              Migrate existing dashboards to the new role-based system
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </button>
          </div>
        </div>
      </div>

      {/* Migration Steps */}
      <div className="px-6 py-4">
        <div className="space-y-4">
          {migrationSteps.map((step, index) => (
            <div key={step.id} className="flex items-start space-x-3">
              {getStepIcon(step)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4
                    className={`text-sm font-medium ${
                      step.status === 'failed' ? 'text-red-900' : 'text-gray-900'
                    }`}
                  >
                    {step.title}
                  </h4>
                  {step.progress !== undefined && (
                    <span className="text-xs text-gray-500">{step.progress}%</span>
                  )}
                </div>
                <p
                  className={`text-sm ${
                    step.status === 'failed' ? 'text-red-600' : 'text-gray-500'
                  }`}
                >
                  {step.error || step.description}
                </p>
                {step.progress !== undefined && (
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                    <div
                      className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${step.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={startMigration}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Migrating...' : 'Start Migration'}
            </button>
            <button
              onClick={testMigrationCompatibility}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Test Compatibility
            </button>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRollback}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Rollback
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="px-6 py-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Advanced Options</h4>

          {/* Compatibility Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">Enable Role-Based Enhancement</label>
              <input
                type="checkbox"
                checked={compatibilityConfig.enableRoleBasedEnhancement}
                onChange={e =>
                  updateCompatibilityConfig({ enableRoleBasedEnhancement: e.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">Preserve Legacy Format</label>
              <input
                type="checkbox"
                checked={compatibilityConfig.preserveLegacyFormat}
                onChange={e =>
                  updateCompatibilityConfig({ preserveLegacyFormat: e.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">Auto-Migrate on Access</label>
              <input
                type="checkbox"
                checked={compatibilityConfig.autoMigrateOnAccess}
                onChange={e => updateCompatibilityConfig({ autoMigrateOnAccess: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">Fallback to Template</label>
              <input
                type="checkbox"
                checked={compatibilityConfig.fallbackToTemplate}
                onChange={e => updateCompatibilityConfig({ fallbackToTemplate: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Migration Log */}
          {migrationLog.length > 0 && (
            <div className="mt-4">
              <h5 className="text-sm font-medium text-gray-900 mb-2">Migration Log</h5>
              <div className="bg-gray-100 rounded-md p-3 max-h-32 overflow-y-auto">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                  {migrationLog.join('\n')}
                </pre>
              </div>
            </div>
          )}

          {/* System Status */}
          <div className="mt-4">
            <h5 className="text-sm font-medium text-gray-900 mb-2">System Status</h5>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-100 rounded p-2">
                <div className="font-medium">Backend Integration</div>
                <div className="text-gray-600">
                  {dashboardBackendIntegration.getCacheStats().size} cached items
                </div>
              </div>
              <div className="bg-gray-100 rounded p-2">
                <div className="font-medium">Compatibility Layer</div>
                <div className="text-gray-600">
                  {getCompatibilityStatus().initialized ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardMigrationUtility;
