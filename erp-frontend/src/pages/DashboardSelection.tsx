// src/pages/DashboardSelection.tsx - Dashboard Selection/Preview Page
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeft,
  Eye,
  Lock,
  Users,
  Star,
  StarOff,
  Plus,
  Trash2,
  Edit,
  Settings,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Dashboard {
  id: number;
  name: string;
  slug: string;
  description: string;
  is_default: boolean;
  is_public: boolean;
  theme?: {
    primary_color: string;
    background_color: string;
  };
  widgets?: any[];
  created_at: string;
  updated_at: string;
}

const DashboardSelection: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null);

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!user) {
      navigate('/login');
      return;
    }

    fetchDashboards();
  }, [user, navigate]);

  const fetchDashboards = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboards/');

      console.log('Dashboard selection response:', response);

      // Handle different API response formats
      const dashboardList =
        response.results || response.data?.results || response.data || response || [];

      if (Array.isArray(dashboardList)) {
        setDashboards(dashboardList);

        // If only one dashboard is available, go there directly
        if (dashboardList.length === 1) {
          navigate(`/dashboard/${dashboardList[0].id}`);
          return;
        }
      } else {
        console.error('Dashboard data is not an array:', dashboardList);
        setDashboards([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch dashboards:', error);
      setError(error.message || 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDashboard = (dashboard: Dashboard) => {
    navigate(`/dashboard/${dashboard.id}`);
  };

  const handleCreateDashboard = () => {
    navigate('/dashboard/create');
  };

  const handleSetDefault = async (dashboard: Dashboard) => {
    if (settingDefaultId) return;
    setSettingDefaultId(dashboard.id);
    try {
      if (dashboard.is_default) {
        await api.post('/dashboards/clear_default/');
        setDashboards(prev => prev.map(d => ({ ...d, is_default: false })));
      } else {
        await api.post(`/dashboards/${dashboard.id}/set_default/`);
        setDashboards(prev => prev.map(d => ({ ...d, is_default: d.id === dashboard.id })));
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err.message ?? 'Failed to update default.');
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDeleteDashboard = async (dashboardId: number) => {
    try {
      setDeletingId(dashboardId);
      await api.delete(`/dashboards/${dashboardId}/`);

      // Remove the deleted dashboard from the list
      setDashboards(dashboards.filter(d => d.id !== dashboardId));
      setShowDeleteConfirm(null);
    } catch (error: any) {
      console.error('Failed to delete dashboard:', error);
      setError(error.message || 'Failed to delete dashboard');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '1.5rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <LayoutDashboard size={48} style={{ marginBottom: '1rem' }} />
          <div>Loading dashboards...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Error</h2>
          <p style={{ color: '#718096', marginBottom: '2rem' }}>{error}</p>
          <button
            onClick={() => navigate('/home')}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (dashboards.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          paddingBottom: '2rem',
        }}
      >
        {/* Header - Same as when dashboards exist */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '1rem 2rem',
          }}
        >
          <div
            style={{
              maxWidth: '1400px',
              margin: '0 auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => navigate('/home')}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ArrowLeft size={20} />
              </button>
              <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                Select Dashboard
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.875rem' }}>
                No dashboards available
              </span>
              <button
                onClick={handleCreateDashboard}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  backdropFilter: 'blur(10px)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Plus size={16} />
                Create Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* No Dashboards Content */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            minHeight: 'calc(100vh - 100px)',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '3rem',
              maxWidth: '500px',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <LayoutDashboard size={64} color="#cbd5e1" style={{ marginBottom: '1.5rem' }} />
            <h2
              style={{
                color: '#2c3e50',
                marginBottom: '1rem',
                fontSize: '1.5rem',
                fontWeight: 600,
              }}
            >
              No Dashboards Available
            </h2>
            <p style={{ color: '#718096', marginBottom: '2rem', lineHeight: '1.6' }}>
              Get started by creating your first dashboard. You can add widgets, customize themes,
              and organize your workspace exactly how you want it.
            </p>

            <div
              style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}
            >
              <button
                onClick={handleCreateDashboard}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#3b82f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Plus size={16} />
                Create Your First Dashboard
              </button>

              <button
                onClick={() => navigate('/home')}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#f9fafb';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                Back to Home
              </button>
            </div>

            {/* Feature Preview */}
            <div
              style={{
                marginTop: '2rem',
                padding: '1.5rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <h3
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: '1rem',
                }}
              >
                What you can create:
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  textAlign: 'left',
                }}
              >
                <div>• Sidebar Navigation</div>
                <div>• KPI Cards & Metrics</div>
                <div>• Quick Action Links</div>
                <div>• Charts & Graphs</div>
                <div>• Custom Themes</div>
                <div>• Widget Layouts</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        paddingBottom: '2rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          padding: '1rem 2rem',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => navigate('/home')}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '6px',
                padding: '0.5rem',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
              Select Dashboard
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.875rem' }}>
              {dashboards.length} dashboard{dashboards.length !== 1 ? 's' : ''} available
            </span>
            <button
              onClick={() => navigate('/dashboard/settings')}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              <Settings size={16} />
              Settings
            </button>
            <button
              onClick={handleCreateDashboard}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Plus size={16} />
              Create Dashboard
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 2rem' }}>
        {/* Dashboards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '2rem',
          }}
        >
          {dashboards.map(dashboard => (
            <div
              key={dashboard.id}
              style={{
                background: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.3s',
                cursor: 'pointer',
                position: 'relative',
              }}
              onClick={() => handleSelectDashboard(dashboard)}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-8px)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.1)';
              }}
            >
              {/* Preview Header with Widget Count Visualization */}
              <div
                style={{
                  background: dashboard.theme?.primary_color || '#3b82f6',
                  padding: '2rem',
                  position: 'relative',
                  minHeight: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  {dashboard.is_default && (
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Star size={12} />
                      Default
                    </div>
                  )}
                  {dashboard.is_public ? (
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Users size={12} />
                      Public
                    </div>
                  ) : (
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Lock size={12} />
                      Private
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <LayoutDashboard size={40} color="rgba(255, 255, 255, 0.9)" />
                  <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                    <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>Preview</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                      {dashboard.widgets?.length || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>widgets</div>
                  </div>
                </div>

                {/* Widget Preview Grid */}
                {dashboard.widgets && dashboard.widgets.length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.25rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    {dashboard.widgets.slice(0, 6).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          borderRadius: '2px',
                          height: '16px',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Dashboard Info */}
              <div style={{ padding: '1.5rem' }}>
                <h3
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: '#2c3e50',
                    margin: '0 0 0.5rem 0',
                  }}
                >
                  {dashboard.name}
                </h3>

                {dashboard.description && (
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: '#718096',
                      margin: '0 0 1rem 0',
                      lineHeight: '1.5',
                    }}
                  >
                    {dashboard.description}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                    }}
                  >
                    {dashboard.widgets?.length || 0} widgets
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/dashboard/${dashboard.id}/edit`);
                      }}
                      style={{
                        padding: '0.5rem',
                        background: '#f3f4f6',
                        color: '#6b7280',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#e5e7eb';
                        e.currentTarget.style.color = '#374151';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#f3f4f6';
                        e.currentTarget.style.color = '#6b7280';
                      }}
                      title="Edit Dashboard"
                    >
                      <Edit size={16} />
                    </button>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleSetDefault(dashboard);
                      }}
                      disabled={settingDefaultId === dashboard.id}
                      style={{
                        padding: '0.5rem',
                        background: dashboard.is_default ? '#fef3c7' : '#f3f4f6',
                        color: dashboard.is_default ? '#d97706' : '#6b7280',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: settingDefaultId === dashboard.id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        opacity: settingDefaultId === dashboard.id ? 0.5 : 1,
                      }}
                      title={dashboard.is_default ? 'Remove default' : 'Set as default dashboard'}
                    >
                      {dashboard.is_default ? <Star size={16} fill="currentColor" /> : <Star size={16} />}
                    </button>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setShowDeleteConfirm(dashboard.id);
                      }}
                      disabled={deletingId === dashboard.id}
                      style={{
                        padding: '0.5rem',
                        background: deletingId === dashboard.id ? '#f3f4f6' : '#fef2f2',
                        color: deletingId === dashboard.id ? '#9ca3af' : '#dc2626',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: deletingId === dashboard.id ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        opacity: deletingId === dashboard.id ? 0.5 : 1,
                      }}
                      onMouseEnter={e => {
                        if (deletingId !== dashboard.id) {
                          e.currentTarget.style.background = '#fee2e2';
                          e.currentTarget.style.color = '#b91c1c';
                        }
                      }}
                      onMouseLeave={e => {
                        if (deletingId !== dashboard.id) {
                          e.currentTarget.style.background = '#fef2f2';
                          e.currentTarget.style.color = '#dc2626';
                        }
                      }}
                      title="Delete Dashboard"
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/dashboard/${dashboard.id}`);
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: dashboard.theme?.primary_color || '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.opacity = '0.9';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      <Eye size={16} />
                      Open
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem',
          }}
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  background: '#fef2f2',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                }}
              >
                <Trash2 size={24} color="#dc2626" />
              </div>
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: '#111827',
                  margin: '0 0 0.5rem 0',
                }}
              >
                Delete Dashboard
              </h3>
              <p style={{ color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
                Are you sure you want to delete "
                {dashboards.find(d => d.id === showDeleteConfirm)?.name}"? This action cannot be
                undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deletingId === showDeleteConfirm}
                style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: deletingId === showDeleteConfirm ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  opacity: deletingId === showDeleteConfirm ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDashboard(showDeleteConfirm)}
                disabled={deletingId === showDeleteConfirm}
                style={{
                  padding: '0.75rem 1rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: deletingId === showDeleteConfirm ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  cursor: deletingId === showDeleteConfirm ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {deletingId === showDeleteConfirm ? (
                  <>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '2px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DashboardSelection;
