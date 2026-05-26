import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutDashboard } from 'lucide-react';

const DashboardCreateTest: React.FC = () => {
  const navigate = useNavigate();

  const handleCreateDashboard = () => {
    navigate('/dashboard/create');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '48px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
          maxWidth: '400px',
        }}
      >
        <LayoutDashboard size={64} color="#3b82f6" style={{ marginBottom: '24px' }} />

        <h1
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#111827',
            marginBottom: '16px',
          }}
        >
          Create Your Dashboard
        </h1>

        <p
          style={{
            color: '#6b7280',
            marginBottom: '32px',
            lineHeight: '1.5',
          }}
        >
          Build a custom dashboard with widgets, charts, and navigation. Perfect for monitoring your
          ERP system.
        </p>

        <button
          onClick={handleCreateDashboard}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px 24px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#2563eb')}
          onMouseLeave={e => (e.currentTarget.style.background = '#3b82f6')}
        >
          <Plus size={20} />
          Create New Dashboard
        </button>

        <div
          style={{
            marginTop: '24px',
            padding: '16px',
            background: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe',
          }}
        >
          <h3
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1e40af',
              marginBottom: '8px',
            }}
          >
            What you can add:
          </h3>
          <ul
            style={{
              fontSize: '12px',
              color: '#1e40af',
              textAlign: 'left',
              margin: 0,
              paddingLeft: '16px',
            }}
          >
            <li>Sidebar Navigation</li>
            <li>KPI Cards & Metrics</li>
            <li>Quick Action Links</li>
            <li>Charts & Graphs</li>
            <li>Custom Themes</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DashboardCreateTest;
