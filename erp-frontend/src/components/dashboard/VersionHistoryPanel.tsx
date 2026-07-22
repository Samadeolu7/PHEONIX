// Version History Panel - Display version history and details
import React, { useState } from 'react';
import {
  GitBranch,
  Calendar,
  User,
  Tag,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardVersion, VersionHistoryPanelProps } from '../../types/dashboardAssignment';
import { dashboardVersionService } from '../../services/dashboardAssignmentService';
import { useQuery } from '@tanstack/react-query';

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  templateId,
  className = '',
  onVersionSelect,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<DashboardVersion | null>(null);

  const { data: versions = [], isLoading, error } = useQuery({
    queryKey: ['dashboard', 'versions', templateId],
    queryFn: async () => {
      const versionList = await dashboardVersionService.getVersions(templateId);
      return versionList.sort((a, b) => b.version - a.version);
    },
  });

  // Auto-select latest version
  React.useEffect(() => {
    if (versions.length > 0 && !selectedVersion) {
      const latest = versions.reduce((prev, current) =>
        current.version > prev.version ? current : prev
      );
      setSelectedVersion(latest);
    }
  }, [versions, selectedVersion]);

  const handleVersionSelect = (version: DashboardVersion) => {
    setSelectedVersion(version);
    onVersionSelect?.(version);
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-32', className)}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 bg-red-50 border border-red-200 rounded-md', className)}>
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <p className="ml-3 text-sm text-red-600">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('', className)}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Version List */}
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">Version History</h4>

          {versions.length === 0 ? (
            <div className="text-center py-8">
              <GitBranch className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No versions found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Version history will appear here once versions are created.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  onClick={() => handleVersionSelect(version)}
                  className={cn(
                    'border rounded-lg p-4 cursor-pointer transition-colors',
                    selectedVersion?.id === version.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          v{version.version}
                        </span>

                        {index === 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Latest
                          </span>
                        )}

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

                        {version.metadata?.breaking_changes && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Breaking
                          </span>
                        )}
                      </div>

                      <h5 className="text-sm font-medium text-gray-900 mb-1">
                        {version.changelog}
                      </h5>

                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {version.createdBy}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {version.createdAt.toLocaleDateString()}
                        </span>
                      </div>

                      {version.metadata?.tags && version.metadata.tags.length > 0 && (
                        <div className="flex items-center space-x-1 mt-2">
                          <Tag className="h-3 w-3 text-gray-400" />
                          {version.metadata.tags.slice(0, 3).map(tag => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600"
                            >
                              {tag}
                            </span>
                          ))}
                          {version.metadata.tags.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{version.metadata.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedVersion?.id === version.id && (
                      <Eye className="h-4 w-4 text-blue-600 ml-2" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Version Details */}
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">Version Details</h4>

          {selectedVersion ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-3">Basic Information</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Version:</span>
                    <span className="ml-2 text-gray-600">v{selectedVersion.version}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>
                    <span
                      className={cn(
                        'ml-2',
                        selectedVersion.isPublished ? 'text-green-600' : 'text-gray-600'
                      )}
                    >
                      {selectedVersion.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Created By:</span>
                    <span className="ml-2 text-gray-600">{selectedVersion.createdBy}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Created:</span>
                    <span className="ml-2 text-gray-600">
                      {selectedVersion.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Changelog */}
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Changelog</h5>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700">{selectedVersion.changelog}</p>
                </div>
              </div>

              {/* Description */}
              {selectedVersion.metadata?.description && (
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Description</h5>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700">{selectedVersion.metadata.description}</p>
                  </div>
                </div>
              )}

              {/* Tags */}
              {selectedVersion.metadata?.tags && selectedVersion.metadata.tags.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Tags</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedVersion.metadata.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Template Summary */}
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Template Summary</h5>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Role:</span>
                      <span className="ml-2 text-gray-600">{selectedVersion.template.role}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Layout:</span>
                      <span className="ml-2 text-gray-600 capitalize">
                        {selectedVersion.template.layout}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Stats Cards:</span>
                      <span className="ml-2 text-gray-600">
                        {selectedVersion.template.statsCards.length}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Quick Actions:</span>
                      <span className="ml-2 text-gray-600">
                        {selectedVersion.template.quickActions.length}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Widgets:</span>
                      <span className="ml-2 text-gray-600">
                        {selectedVersion.template.widgets.length}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Primary Modules:</span>
                      <span className="ml-2 text-gray-600">
                        {selectedVersion.template.primaryModules.length}
                      </span>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="mt-4">
                    <span className="font-medium text-gray-700 block mb-2">Features:</span>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { key: 'showWelcomeBanner', label: 'Welcome Banner' },
                        { key: 'showQuickStats', label: 'Quick Stats' },
                        { key: 'showModuleCards', label: 'Module Cards' },
                        { key: 'showActivityFeed', label: 'Activity Feed' },
                        { key: 'showAlerts', label: 'Alerts' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center">
                          {selectedVersion.template[
                            key as keyof typeof selectedVersion.template
                          ] ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <div className="h-4 w-4 border border-gray-300 rounded mr-2" />
                          )}
                          <span className="text-gray-600">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Parent Version */}
              {selectedVersion.parentVersion && (
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Version History</h5>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <span>Based on version {selectedVersion.parentVersion}</span>
                      <ArrowRight className="h-4 w-4 mx-2" />
                      <span>Version {selectedVersion.version}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Breaking Changes Warning */}
              {selectedVersion.metadata?.breaking_changes && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                    <div className="ml-3">
                      <h5 className="text-sm font-medium text-red-800">Breaking Changes</h5>
                      <p className="text-sm text-red-700 mt-1">
                        This version contains breaking changes that may affect existing assignments
                        or user experience. Review carefully before publishing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Select a version</h3>
              <p className="mt-1 text-sm text-gray-500">
                Choose a version from the list to view its details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryPanel;
