import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

// Import new renderers
import ListPageRenderer from '../components/pages/ListPageRenderer';
import DetailPageRenderer from '../components/pages/DetailPageRenderer';
import DashboardPageRenderer from '../components/pages/DashboardPageRenderer';
import FormPageRenderer from '../components/pages/FormPageRenderer';
import ReportPageRenderer from '@/components/pages/ReportPageRenderer';

export const DynamicModulePage: React.FC = () => {
  const { moduleCode, pageCode } = useParams();
  const [pageConfig, setPageConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip dynamic page loading for procurement module to avoid conflicts
    if (moduleCode === 'procurement') {
      setError('This page should be handled by specific procurement routes');
      setLoading(false);
      return;
    }

    fetchPageConfig();
    // console.log("from module page" , moduleCode, pageCode)
    // from module page accounts 100_299_transaction
  }, [moduleCode, pageCode]);

  const fetchPageConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch page configuration from backend
      const response = await api.get(
        `/pages/module-pages/by-path/?path=/${moduleCode}/${pageCode}/`
      );
      // Get page configuration by URL path

      // GET /api/module-pages/by-path/?path=/finance/cash-reconciliation/

      // Returns: { "success": true, "data": { "id": 1, "title": "Cash Reconciliation", "page_type": "form", "page_config": { "form_schema_id": "123", "success_url": "/finance/dashboard" } } }

      // Handle response format (with or without .data wrapper)
      const config = response.data?.data || response.data;
      setPageConfig(config);
    } catch (err: any) {
      setError(err.message || 'Failed to load page configuration');
      console.error('DynamicModulePage error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}
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
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#7f1d1d', marginBottom: '8px' }}>
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
          <p style={{ color: '#854d0e' }}>Page configuration not found</p>
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

export default DynamicModulePage;
