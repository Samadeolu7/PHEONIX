import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Zap, GitBranch, BarChart3, ChevronRight } from 'lucide-react';
import { getContextualNavigation, ContextualLink } from '../../data/contextualNavigation';

interface ContextualNavigationProps {
  className?: string;
  showWorkflow?: boolean;
  showShortcuts?: boolean;
  showRelated?: boolean;
}

const ContextualNavigation: React.FC<ContextualNavigationProps> = ({
  className = '',
  showWorkflow = true,
  showShortcuts = true,
  showRelated = true,
}) => {
  const location = useLocation();
  const contextualNav = getContextualNavigation(location.pathname);

  if (!contextualNav) {
    return null;
  }

  const renderLinkSection = (
    title: string,
    links: ContextualLink[],
    icon: React.ComponentType<any>,
    colorClass: string
  ) => {
    if (links.length === 0) return null;

    const IconComponent = icon;

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <IconComponent className={`h-4 w-4 ${colorClass}`} />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <div className="space-y-2">
          {links.map(link => (
            <Link
              key={link.id}
              to={link.path}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {link.title}
                  </span>
                  {link.type === 'shortcut' && (
                    <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                      Quick
                    </span>
                  )}
                  {link.type === 'workflow' && (
                    <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full">
                      Step
                    </span>
                  )}
                  {link.type === 'report' && (
                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                      Report
                    </span>
                  )}
                </div>
                {link.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {link.description}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Related Actions</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Quick access to related functions and workflows
        </p>
      </div>

      {showShortcuts &&
        renderLinkSection('Quick Actions', contextualNav.shortcuts, Zap, 'text-blue-500')}

      {showRelated &&
        renderLinkSection(
          'Related Functions',
          contextualNav.relatedLinks,
          ArrowRight,
          'text-green-500'
        )}

      {showWorkflow &&
        contextualNav.workflowSteps &&
        renderLinkSection(
          'Workflow Steps',
          contextualNav.workflowSteps,
          GitBranch,
          'text-purple-500'
        )}
    </div>
  );
};

export default ContextualNavigation;
