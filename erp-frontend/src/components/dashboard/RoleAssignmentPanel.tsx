// Role Assignment Panel - Interface for assigning dashboards to specific roles
import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Monitor,
  Settings,
  Check,
  X,
  AlertCircle,
  Info,
  Star,
  Clock,
  Calendar,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserRole } from '../../types/roles';
import { DashboardTemplate } from '../../types/dashboardTemplates';
import {
  DashboardAssignment,
  DashboardVersion,
  RoleAssignmentPanelProps,
} from '../../types/dashboardAssignment';
import {
  dashboardAssignmentService,
  dashboardVersionService,
} from '../../services/dashboardAssignmentService';
import { dashboardTemplates } from '../../data/dashboardTemplates';

interface AssignmentFormData {
  roleId: UserRole;
  templateId: string;
  templateVersion: number;
  isActive: boolean;
  isDefault: boolean;
  description: string;
  tags: string[];
  effectiveFrom?: Date;
  effectiveUntil?: Date;
}

export const RoleAssignmentPanel: React.FC<RoleAssignmentPanelProps> = ({
  roleId: initialRoleId,
  className = '',
  onAssignmentUpdate,
}) => {
  const [formData, setFormData] = useState<AssignmentFormData>({
    roleId: initialRoleId,
    templateId: '',
    templateVersion: 1,
    isActive: false,
    isDefault: false,
    description: '',
    tags: [],
    effectiveFrom: new Date(),
    effectiveUntil: undefined,
  });

  const [availableTemplates, setAvailableTemplates] = useState<DashboardTemplate[]>([]);
  const [availableVersions, setAvailableVersions] = useState<DashboardVersion[]>([]);
  const [existingAssignments, setExistingAssignments] = useState<DashboardAssignment[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

  // Load initial data
  useEffect(() => {
    loadData();
  }, [formData.roleId]);

  // Load versions when template changes
  useEffect(() => {
    if (formData.templateId) {
      loadVersions(formData.templateId);
    }
  }, [formData.templateId]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load available templates
      const templates = Object.values(dashboardTemplates);
      setAvailableTemplates(templates);

      // Load existing assignments for the role
      const assignments = await dashboardAssignmentService.getAssignmentsForRole(formData.roleId);
      setExistingAssignments(assignments);

      // Set default template if none selected
      if (!formData.templateId && templates.length > 0) {
        const roleTemplate = templates.find(t => t.role === formData.roleId);
        if (roleTemplate) {
          setFormData(prev => ({
            ...prev,
            templateId: roleTemplate.id,
            description: `Dashboard assignment for ${formData.roleId}`,
          }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [formData.roleId, formData.templateId]);

  const loadVersions = useCallback(
    async (templateId: string) => {
      try {
        const versions = await dashboardVersionService.getVersions(templateId);
        setAvailableVersions(versions);

        // Set latest version as default
        if (versions.length > 0) {
          const latestVersion = Math.max(...versions.map(v => v.version));
          setFormData(prev => ({ ...prev, templateVersion: latestVersion }));
        }

        // Set selected template for preview
        const template = availableTemplates.find(t => t.id === templateId);
        setSelectedTemplate(template || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      }
    },
    [availableTemplates]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);

      try {
        // Create the assignment
        const assignment = await dashboardAssignmentService.assignDashboardToRole(
          formData.roleId,
          formData.templateId,
          formData.templateVersion,
          'current-admin' // In real app, this would be the current user ID
        );

        // Update assignment properties
        if (formData.isActive) {
          await dashboardAssignmentService.activateAssignment(assignment.id, 'current-admin');
        }

        if (formData.isDefault) {
          await dashboardAssignmentService.setDefaultAssignment(assignment.id);
        }

        // Update metadata (in a real implementation, this would be a separate API call)
        assignment.metadata = {
          description: formData.description,
          tags: formData.tags,
        };

        onAssignmentUpdate?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create assignment');
      } finally {
        setIsLoading(false);
      }
    },
    [formData, onAssignmentUpdate]
  );

  const handleTagAdd = useCallback(
    (tag: string) => {
      if (tag.trim() && !formData.tags.includes(tag.trim())) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, tag.trim()],
        }));
      }
    },
    [formData.tags]
  );

  const handleTagRemove = useCallback((tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  }, []);

  const existingAssignment = existingAssignments.find(a => a.templateId === formData.templateId);
  const hasConflict = existingAssignment && existingAssignment.isActive && formData.isActive;

  return (
    <div className={cn('bg-white', className)}>
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Dashboard Assignment</h3>
            <p className="text-sm text-gray-600 mt-1">Assign a dashboard template to a user role</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={cn(
                'flex items-center space-x-2 px-3 py-2 rounded-md text-sm transition-colors',
                previewMode
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <Monitor className="h-4 w-4" />
              <span>Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="ml-3 text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Conflict Warning */}
      {hasConflict && (
        <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <p className="text-sm text-yellow-700 font-medium">Assignment Conflict</p>
              <p className="text-sm text-yellow-600 mt-1">
                This role already has an active assignment for this template. Activating this
                assignment will deactivate the existing one.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {previewMode && selectedTemplate ? (
          /* Template Preview */
          <div className="space-y-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Template Preview</h4>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Template Info */}
                <div className="space-y-4">
                  <div>
                    <h5 className="font-medium text-gray-900">{selectedTemplate.name}</h5>
                    <p className="text-sm text-gray-600">{selectedTemplate.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Role:</span>
                      <span className="ml-2 text-gray-600">{selectedTemplate.role}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Layout:</span>
                      <span className="ml-2 text-gray-600 capitalize">
                        {selectedTemplate.layout}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Modules:</span>
                      <span className="ml-2 text-gray-600">
                        {selectedTemplate.primaryModules.length}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Widgets:</span>
                      <span className="ml-2 text-gray-600">{selectedTemplate.widgets.length}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <div>
                    <h6 className="font-medium text-gray-700 mb-2">Features</h6>
                    <div className="space-y-1 text-sm">
                      {selectedTemplate.showWelcomeBanner && (
                        <div className="flex items-center text-green-600">
                          <Check className="h-4 w-4 mr-2" />
                          Welcome Banner
                        </div>
                      )}
                      {selectedTemplate.showQuickStats && (
                        <div className="flex items-center text-green-600">
                          <Check className="h-4 w-4 mr-2" />
                          Quick Stats
                        </div>
                      )}
                      {selectedTemplate.showModuleCards && (
                        <div className="flex items-center text-green-600">
                          <Check className="h-4 w-4 mr-2" />
                          Module Cards
                        </div>
                      )}
                      {selectedTemplate.showActivityFeed && (
                        <div className="flex items-center text-green-600">
                          <Check className="h-4 w-4 mr-2" />
                          Activity Feed
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Cards Preview */}
                <div>
                  <h6 className="font-medium text-gray-700 mb-3">
                    Stats Cards ({selectedTemplate.statsCards.length})
                  </h6>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedTemplate.statsCards.slice(0, 6).map((card, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div className="flex items-center">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full mr-2',
                              card.color === 'blue' && 'bg-blue-500',
                              card.color === 'green' && 'bg-green-500',
                              card.color === 'yellow' && 'bg-yellow-500',
                              card.color === 'red' && 'bg-red-500',
                              card.color === 'purple' && 'bg-purple-500',
                              card.color === 'gray' && 'bg-gray-500'
                            )}
                          />
                          <span className="text-sm font-medium">{card.title}</span>
                        </div>
                        <span className="text-sm text-gray-600">{card.value}</span>
                      </div>
                    ))}
                    {selectedTemplate.statsCards.length > 6 && (
                      <div className="text-xs text-gray-500 text-center py-1">
                        +{selectedTemplate.statsCards.length - 6} more cards
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewMode(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Back to Form
              </button>
            </div>
          </div>
        ) : (
          /* Assignment Form */
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Role</label>
              <select
                value={formData.roleId}
                onChange={e =>
                  setFormData(prev => ({ ...prev, roleId: e.target.value as UserRole }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {roles.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select the user role that will receive this dashboard assignment
              </p>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dashboard Template
              </label>
              <select
                value={formData.templateId}
                onChange={e => setFormData(prev => ({ ...prev, templateId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a template...</option>
                {availableTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Version Selection */}
            {availableVersions.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Version
                </label>
                <select
                  value={formData.templateVersion}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, templateVersion: parseInt(e.target.value) }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {availableVersions
                    .filter(v => v.isPublished)
                    .sort((a, b) => b.version - a.version)
                    .map(version => (
                      <option key={version.version} value={version.version}>
                        Version {version.version} - {version.changelog}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Only published versions are available for assignment
                </p>
              </div>
            )}

            {/* Assignment Options */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Assignment Options</h4>

              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Activate immediately</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={e => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Set as default for role</span>
                </label>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description for this assignment..."
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleTagRemove(tag)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="Add tags (press Enter)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTagAdd(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            {/* Existing Assignments Info */}
            {existingAssignments.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-start">
                  <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div className="ml-3">
                    <h5 className="text-sm font-medium text-blue-800">Existing Assignments</h5>
                    <div className="mt-2 space-y-1">
                      {existingAssignments.map(assignment => (
                        <div key={assignment.id} className="text-sm text-blue-700">
                          {assignment.templateId} v{assignment.templateVersion} -
                          <span
                            className={cn(
                              'ml-1',
                              assignment.isActive ? 'text-green-600' : 'text-gray-600'
                            )}
                          >
                            {assignment.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {assignment.isDefault && (
                            <span className="ml-1 text-blue-600">(Default)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-3">
              <button
                type="submit"
                disabled={isLoading || !formData.templateId}
                className={cn(
                  'flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  isLoading || !formData.templateId
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Create Assignment</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default RoleAssignmentPanel;
