// Dashboard Version Manager - Manage dashboard template versions and rollbacks
import React, { useState, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Eye,
  Edit,
  Trash2,
  Upload,
  Download,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Tag,
  Calendar,
  User,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  DashboardVersion,
  DashboardRollbackPoint,
  DashboardVersionManagerProps,
} from '../../types/dashboardAssignment';
import { DashboardTemplate } from '../../types/dashboardTemplates';
import { dashboardVersionService } from '../../services/dashboardAssignmentService';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface VersionFormData {
  changelog: string;
  description: string;
  tags: string[];
  breaking_changes: boolean;
}

export const DashboardVersionManager: React.FC<DashboardVersionManagerProps> = ({
  templateId,
  className = '',
  onVersionChange,
}) => {
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<DashboardVersion | null>(null);
  const [activeTab, setActiveTab] = useState<'versions' | 'rollbacks' | 'create'>('versions');

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<VersionFormData>({
    changelog: '',
    description: '',
    tags: [],
    breaking_changes: false,
  });
  const [rollbackReason, setRollbackReason] = useState('');
  const [showRollbackConfirm, setShowRollbackConfirm] = useState<DashboardVersion | null>(null);

  const { data: versions = [], isLoading, error: queryError } = useQuery({
    queryKey: ['dashboard', 'versions', templateId],
    queryFn: async () => {
      const versionList = await dashboardVersionService.getVersions(templateId);
      return versionList.sort((a, b) => b.version - a.version);
    },
  });

  const { data: rollbackHistory = [] } = useQuery({
    queryKey: ['dashboard', 'versions', 'rollbacks', templateId],
    queryFn: async () => {
      return dashboardVersionService.getRollbackHistory(templateId);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      const latestVersion = await dashboardVersionService.getLatestVersion(templateId);
      if (!latestVersion) {
        throw new Error('No base template found');
      }

      const newTemplate: DashboardTemplate = {
        ...latestVersion.template,
      };

      const newVersion = await dashboardVersionService.createVersion(
        templateId,
        newTemplate,
        'current-admin',
        formData.changelog
      );

      if (newVersion.metadata) {
        newVersion.metadata.description = formData.description;
        newVersion.metadata.tags = formData.tags;
        newVersion.metadata.breaking_changes = formData.breaking_changes;
      }

      return newVersion;
    },
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'versions', templateId] });
      setShowCreateForm(false);
      setFormData({ changelog: '', description: '', tags: [], breaking_changes: false });
      onVersionChange?.(newVersion);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (version: DashboardVersion) =>
      dashboardVersionService.publishVersion(templateId, version.version, 'current-admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'versions', templateId] });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: (version: DashboardVersion) =>
      dashboardVersionService.unpublishVersion(templateId, version.version, 'current-admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'versions', templateId] });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (targetVersion: DashboardVersion) =>
      dashboardVersionService.rollbackToVersion(
        templateId,
        targetVersion.version,
        'current-admin',
        rollbackReason
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'versions', templateId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'versions', 'rollbacks', templateId] });
      setShowRollbackConfirm(null);
      setRollbackReason('');
    },
  });

  const handleCreateVersion = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await createVersionMutation.mutateAsync();
      } catch (err) {
        // Error handled by mutation error state
      }
    },
    [createVersionMutation]
  );

  const handlePublishVersion = useCallback(
    async (version: DashboardVersion) => {
      await publishMutation.mutateAsync(version);
    },
    [publishMutation]
  );

  const handleUnpublishVersion = useCallback(
    async (version: DashboardVersion) => {
      await unpublishMutation.mutateAsync(version);
    },
    [unpublishMutation]
  );

  const handleRollback = useCallback(
    async (targetVersion: DashboardVersion) => {
      if (!rollbackReason.trim()) {
        return;
      }
      try {
        await rollbackMutation.mutateAsync(targetVersion);
        alert(`Successfully rolled back to version ${targetVersion.version}`);
      } catch (err) {
        // Error handled by mutation error state
      }
    },
    [rollbackMutation, rollbackReason]
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

  const error = queryError?.message || createVersionMutation.error?.message || null;
  const latestVersion = versions.length > 0 ? versions[0] : null;
  const publishedVersions = versions.filter(v => v.isPublished);

  return (
    <div className={cn('bg-white rounded-lg border border-gray-200', className)}>
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Version Manager</h3>
            <p className="text-sm text-gray-600 mt-1">
              Manage versions and rollbacks for template: {templateId}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Version</span>
            </button>
          </div>
        </div>

        {/* Version Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center">
              <GitBranch className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-blue-900">Total Versions</p>
                <p className="text-2xl font-bold text-blue-600">{versions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-green-900">Published</p>
                <p className="text-2xl font-bold text-green-600">{publishedVersions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-purple-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-purple-900">Latest Version</p>
                <p className="text-2xl font-bold text-purple-600">
                  {latestVersion ? `v${latestVersion.version}` : 'None'}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center">
              <RotateCcw className="h-8 w-8 text-orange-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-orange-900">Rollbacks</p>
                <p className="text-2xl font-bold text-orange-600">{rollbackHistory.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { id: 'versions', label: 'Versions', icon: GitBranch },
            { id: 'rollbacks', label: 'Rollback History', icon: RotateCcw },
            { id: 'create', label: 'Create Version', icon: Plus },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={cn(
                'flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <p className="ml-3 text-sm text-red-600">{error}</p>
          </div>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard', 'versions', templateId] })} className="text-sm text-red-600 underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'versions' && (
          <div className="space-y-4">
            {versions.length === 0 ? (
              <div className="text-center py-12">
                <GitBranch className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No versions found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create your first version to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map(version => (
                  <div
                    key={version.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            v{version.version}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">{version.changelog}</h4>
                          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                            <span className="flex items-center">
                              <User className="h-3 w-3 mr-1" />
                              {version.createdBy}
                            </span>
                            <span className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {version.createdAt.toLocaleDateString()}
                            </span>
                            {version.metadata?.tags && version.metadata.tags.length > 0 && (
                              <div className="flex items-center space-x-1">
                                <Tag className="h-3 w-3" />
                                {version.metadata.tags.slice(0, 2).map(tag => (
                                  <span
                                    key={tag}
                                    className="px-1.5 py-0.5 bg-gray-100 rounded text-xs"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {version.metadata.tags.length > 2 && (
                                  <span className="text-xs">
                                    +{version.metadata.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {version.metadata?.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {version.metadata.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Status Badge */}
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            version.isPublished
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {version.isPublished ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Published
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Draft
                            </>
                          )}
                        </span>

                        {/* Breaking Changes Badge */}
                        {version.metadata?.breaking_changes && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Breaking
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => setSelectedVersion(version)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {version.isPublished ? (
                            <button
                              onClick={() => handleUnpublishVersion(version)}
                              className="p-1 text-orange-400 hover:text-orange-600"
                              title="Unpublish"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePublishVersion(version)}
                              className="p-1 text-green-400 hover:text-green-600"
                              title="Publish"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}

                          {version.version !== latestVersion?.version && (
                            <button
                              onClick={() => setShowRollbackConfirm(version)}
                              className="p-1 text-blue-400 hover:text-blue-600"
                              title="Rollback to this version"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'rollbacks' && (
          <div className="space-y-4">
            {rollbackHistory.length === 0 ? (
              <div className="text-center py-12">
                <RotateCcw className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No rollbacks performed</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Rollback history will appear here when versions are rolled back.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rollbackHistory.map(rollback => (
                  <div key={rollback.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          Rolled back from v{rollback.fromVersion} to v{rollback.toVersion}
                        </h4>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {rollback.rolledBackBy}
                          </span>
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {rollback.rolledBackAt.toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">{rollback.reason}</p>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Rollback
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <form onSubmit={handleCreateVersion} className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Changelog *</label>
              <input
                type="text"
                value={formData.changelog}
                onChange={e => setFormData(prev => ({ ...prev, changelog: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of changes..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Detailed description of changes and improvements..."
              />
            </div>

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
                      ×
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

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.breaking_changes}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, breaking_changes: e.target.checked }))
                  }
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  This version contains breaking changes
                </span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Check this if the changes might affect existing assignments or user experience
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createVersionMutation.isPending || !formData.changelog.trim()}
                className={cn(
                  'flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  createVersionMutation.isPending || !formData.changelog.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {createVersionMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Create Version</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Rollback Confirmation Modal */}
      {showRollbackConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-orange-500 mr-3" />
                <h3 className="text-lg font-medium text-gray-900">Confirm Rollback</h3>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to rollback to version {showRollbackConfirm.version}? This
                action will affect all active assignments using this template.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rollback Reason *
                </label>
                <textarea
                  value={rollbackReason}
                  onChange={e => setRollbackReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain why this rollback is necessary..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowRollbackConfirm(null);
                    setRollbackReason('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRollback(showRollbackConfirm)}
                  disabled={!rollbackReason.trim() || rollbackMutation.isPending}
                  className={cn(
                    'flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    !rollbackReason.trim() || rollbackMutation.isPending
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Rollback</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version Details Modal */}
      {selectedVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Version {selectedVersion.version} Details
                </h3>
                <button
                  onClick={() => setSelectedVersion(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <VersionHistoryPanel
                templateId={templateId}
                onVersionSelect={version => {
                  setSelectedVersion(version);
                  onVersionChange?.(version);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardVersionManager;
