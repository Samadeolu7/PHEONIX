import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Plus, ArrowLeft } from 'lucide-react';
import DashboardCreateModal from '../components/dashboard/DashboardCreateModal';

const DashboardCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(true);

  // Show modal immediately when page loads
  useEffect(() => {
    setShowModal(true);
  }, []);

  const handleModalClose = () => {
    setShowModal(false);
    // Navigate back to dashboard selection when modal is closed
    navigate('/dashboard/select');
  };

  const handleDashboardCreated = (dashboardId: number) => {
    // Navigate to the edit page for the newly created dashboard
    navigate(`/dashboard/${dashboardId}/edit`);
  };

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
      {/* Background Content */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '3rem',
          maxWidth: '500px',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          opacity: showModal ? 0.3 : 1,
          transition: 'opacity 0.3s',
        }}
      >
        <LayoutDashboard size={64} color="#3b82f6" style={{ marginBottom: '1.5rem' }} />

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#111827',
            marginBottom: '1rem',
          }}
        >
          Create Your Dashboard
        </h1>

        <p
          style={{
            color: '#6b7280',
            marginBottom: '2rem',
            lineHeight: '1.6',
          }}
        >
          Build a custom dashboard with widgets, charts, and navigation. Perfect for monitoring your
          ERP system.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
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
            Create Dashboard
          </button>

          <button
            onClick={() => navigate('/dashboard/select')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
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
            <ArrowLeft size={16} />
            Back to Dashboards
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
              fontWeight: '600',
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

      {/* Dashboard Create Modal */}
      <DashboardCreateModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSuccess={handleDashboardCreated}
      />
    </div>
  );
};

export default DashboardCreatePage;
