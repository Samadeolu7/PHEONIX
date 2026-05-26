// src/pages/SimpleDynamicPage.tsx
/**
 * Alternative simpler URL structure: /page/:pageId
 * Instead of: /accounts/101_001_report/
 * Use: /page/4
 *
 * This hides implementation details and uses clean numeric IDs
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

import ListPageRenderer from '../components/pages/ListPageRenderer';
import DetailPageRenderer from '../components/pages/DetailPageRenderer';
import DashboardPageRenderer from '../components/pages/DashboardPageRenderer';
import FormPageRenderer from '../components/pages/FormPageRenderer';
import ReportPageRenderer from '@/components/pages/ReportPageRenderer';

export const SimpleDynamicPage: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const [pageConfig, setPageConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pageId) {
      fetchPageConfig();
    }
  }, [pageId]);

  const fetchPageConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch by page ID instead of path - cleaner URL
      const response = await api.get(`/pages/module-pages/${pageId}/`);

      const config = response.data;
      setPageConfig(config);
    } catch (err: any) {
      setError(err.message || 'Failed to load page configuration');
      console.error('SimpleDynamicPage error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              animation: 'spin 1s linear infinite',
              borderRadius: '50%',
              height: '64px',
              width: '64px',
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
              margin: '0 auto 16px',
            }}
          ></div>
          <p style={{ color: '#4b5563' }}>Loading page...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '896px', margin: '0 auto', marginTop: '32px', padding: '24px' }}>
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#7f1d1d',
              marginBottom: '8px',
            }}
          >
            Error Loading Page
          </h2>
          <p style={{ color: '#b91c1c' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!pageConfig) {
    return (
      <div style={{ maxWidth: '896px', margin: '0 auto', marginTop: '32px', padding: '24px' }}>
        <div
          style={{
            backgroundColor: '#fefce8',
            border: '1px solid #fef08a',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <p style={{ color: '#854d0e' }}>Page not found</p>
        </div>
      </div>
    );
  }

  // Render based on page_type
  switch (pageConfig.page_type) {
    case 'dashboard':
      return <DashboardPageRenderer config={pageConfig.page_config} />;

    case 'list':
      return <ListPageRenderer config={pageConfig.page_config} />;

    case 'detail':
      return <DetailPageRenderer config={pageConfig.page_config} />;

    case 'form':
      return <FormPageRenderer config={pageConfig.page_config} />;

    case 'report':
      return <ReportPageRenderer config={pageConfig.page_config} />;

    default:
      return (
        <div style={{ maxWidth: '896px', margin: '0 auto', marginTop: '32px', padding: '24px' }}>
          <div
            style={{
              backgroundColor: '#fefce8',
              border: '1px solid #fef08a',
              borderRadius: '8px',
              padding: '24px',
            }}
          >
            <p style={{ color: '#854d0e' }}>
              Unknown page type: <code>{pageConfig.page_type}</code>
            </p>
          </div>
        </div>
      );
  }
};

export default SimpleDynamicPage;
