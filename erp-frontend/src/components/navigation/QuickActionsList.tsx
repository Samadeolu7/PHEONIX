import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

interface QuickActionLink {
  id: string;
  title: string;
  url?: string;
  action_type?: string;
  action_config?: any;
}

const QuickActionsList: React.FC<{ context: string }> = ({ context }) => {
  const navigate = useNavigate();
  const [actions, setActions] = useState<QuickActionLink[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get(`/quick-actions/for-context/?context=${context}`);
        const data = response.data?.data || response.data || [];

        // Resolve page urls for page-based actions
        const resolved = await Promise.all(
          data.map(async (a: QuickActionLink) => {
            if (a.action_type === 'page' && a.action_config?.page_id) {
              try {
                const pageResp = await api.get(`/module-pages/${a.action_config.page_id}/`);
                const pageData = pageResp.data?.data || pageResp.data;
                return { ...a, url: pageData?.url_path || a.action_config?.page_url };
              } catch (err: unknown) {
                console.warn('Failed to resolve page for quick action', a, err);
                return { ...a, url: a.action_config?.page_url || '/' };
              }
            }
            return a;
          })
        );

        setActions(resolved);
      } catch (err: unknown) {
        console.error('Failed loading quick actions', err);
      }
    };
    load();
  }, [context]);

  return (
    <ul className="quick-actions-list">
      {actions.map(a => (
        <li key={a.id}>
          {a.url ? (
            <Link to={a.url}>{a.title}</Link>
          ) : a.action_type === 'page' && a.action_config?.page_id ? (
            <span>{a.title}</span>
          ) : (
            <button onClick={() => navigate(a.action_config?.url || '/')}>{a.title}</button>
          )}
        </li>
      ))}
    </ul>
  );
};

export default QuickActionsList;
