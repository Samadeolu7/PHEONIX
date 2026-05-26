import React from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const features = [
    {
      icon: '📊',
      title: 'Dashboards',
      description: 'Create and customize your own dashboards with widgets',
      path: '/dashboard',
      color: '#3b82f6',
    },
    {
      icon: '💰',
      title: 'Accounts',
      description: 'Manage chart of accounts with auto-generated forms & reports',
      path: '/accounts',
      color: '#10b981',
    },
    {
      icon: '📋',
      title: 'Forms',
      description: 'Submit forms and trigger workflows',
      path: '/forms',
      color: '#f59e0b',
    },
    {
      icon: '⚡',
      title: 'Workflows',
      description: 'Browse and manage automation workflows',
      path: '/automations/templates',
      color: '#8b5cf6',
    },
    {
      icon: '🔄',
      title: 'Automation Runs',
      description: 'View and track your automation executions',
      path: '/automations/runs',
      color: '#ec4899',
    },
    {
      icon: '✅',
      title: 'Approvals',
      description: 'Manage pending approval requests',
      path: '/approvals/pending',
      color: '#06b6d4',
    },
  ];

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
      <div style={{ maxWidth: '1200px', width: '100%' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', color: 'white', marginBottom: '4rem' }}>
          <h1 style={{ fontSize: '4rem', margin: '0 0 1rem 0', fontWeight: 700 }}>Phoenix ERP</h1>
          <p style={{ fontSize: '1.5rem', margin: 0, opacity: 0.9 }}>
            Complete Business Automation & Management System
          </p>
        </div>

        {/* Feature Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem',
          }}
        >
          {features.map((feature, index) => (
            <div
              key={index}
              onClick={() => navigate(feature.path)}
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '2rem',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.3s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-8px)';
                e.currentTarget.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1)';
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '100px',
                  height: '100px',
                  background: feature.color,
                  opacity: 0.1,
                  borderRadius: '0 12px 0 100%',
                }}
              />

              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{feature.icon}</div>

              <h3
                style={{
                  fontSize: '1.5rem',
                  color: '#2c3e50',
                  margin: '0 0 0.5rem 0',
                }}
              >
                {feature.title}
              </h3>

              <p
                style={{
                  color: '#718096',
                  margin: 0,
                  fontSize: '0.875rem',
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div
          style={{
            marginTop: '3rem',
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => navigate('/accounts/new')}
            style={{
              padding: '14px 28px',
              border: 'none',
              borderRadius: '8px',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.3s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }}
          >
            + Create Account
          </button>

          <button
            onClick={() => navigate('/admin/workflows/new')}
            style={{
              padding: '14px 28px',
              border: 'none',
              borderRadius: '8px',
              background: '#8b5cf6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
              transition: 'all 0.3s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
            }}
          >
            + Create Workflow
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
