// Test component to verify navigation infrastructure
import React from 'react';
import { ModuleCard } from './ModuleCard';
import { BreadcrumbNavigation } from './BreadcrumbNavigation';
import { navigationModules } from '../../data/navigationModules';
import { useNavigation } from '../../hooks/useNavigation';

export const NavigationTest: React.FC = () => {
  const { breadcrumbs, toggleSidebar, sidebarCollapsed } = useNavigation();

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">Navigation Infrastructure Test</h2>

        {/* Breadcrumb Test */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Breadcrumbs</h3>
          <BreadcrumbNavigation items={breadcrumbs} />
        </div>

        {/* Sidebar State Test */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Sidebar State</h3>
          <button
            onClick={toggleSidebar}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Sidebar: {sidebarCollapsed ? 'Collapsed' : 'Expanded'}
          </button>
        </div>

        {/* Module Cards Test */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Module Cards (Grid Layout)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {navigationModules.map(module => (
              <ModuleCard key={module.id} module={module} layout="grid" showStats={true} />
            ))}
          </div>

          <h3 className="text-lg font-semibold mb-4">Module Cards (List Layout)</h3>
          <div className="space-y-4">
            {navigationModules.slice(0, 2).map(module => (
              <ModuleCard key={module.id} module={module} layout="list" showStats={false} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
