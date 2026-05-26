// src/components/navigation/MainNavigation.tsx
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import QuickActionsList from './QuickActionsList';

interface Module {
  id: string;
  code: string;
  name: string;
  icon: string;
  color: string;
  pages: ModulePage[];
}

interface ModulePage {
  id: string;
  code: string;
  title: string;
  url_path: string;
  show_in_menu: boolean;
  sub_pages?: ModulePage[];
}

export const MainNavigation: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    fetchNavigation();
  }, []);

  const fetchNavigation = async () => {
    try {
      const response = await api.get('/pages/modules/navigation/');
      // Backend returns { success: true, data: [...] }
      const data = response.data?.data || response.data;
      setModules(data);
    } catch (err: unknown) {
      console.error('Failed to load navigation:', err);
      setModules([]);
    }
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="main-navigation">
      <div className="nav-header">
        <h1>Your ERP</h1>
      </div>

      <ul className="nav-modules">
        {modules.map(module => (
          <li key={module.id} className="nav-module">
            <button
              className={`module-toggle ${isActive(`/${module.code}`) ? 'active' : ''}`}
              onClick={() => setExpandedModule(expandedModule === module.code ? null : module.code)}
              style={{ color: module.color }}
            >
              <i className={`icon-${module.icon}`} />
              <span>{module.name}</span>
              <i className={`chevron ${expandedModule === module.code ? 'open' : ''}`} />
            </button>

            {expandedModule === module.code && (
              <ul className="nav-pages">
                {module.pages
                  .filter(page => page.show_in_menu)
                  .map(page => (
                    <li key={page.id}>
                      <Link to={page.url_path} className={isActive(page.url_path) ? 'active' : ''}>
                        {page.title}
                      </Link>

                      {page.sub_pages && page.sub_pages.length > 0 && (
                        <ul className="nav-sub-pages">
                          {page.sub_pages.map(subPage => (
                            <li key={subPage.id}>
                              <Link
                                to={subPage.url_path}
                                className={isActive(subPage.url_path) ? 'active' : ''}
                              >
                                {subPage.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {/* Quick Actions Section */}
      <div className="nav-quick-actions">
        <h3>Quick Actions</h3>
        <QuickActionsList context="global" />
      </div>
    </nav>
  );
};
