import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { CheckCircle, XCircle, Clock, AlertCircle, ArrowLeft } from 'lucide-react';

interface StepProps {
  step: any;
  index: number;
}

function StepStatus({ step, index }: StepProps) {
  const getIcon = () => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle style={{ width: '20px', height: '20px', color: '#059669' }} />;
      case 'running':
        return (
          <div
            style={{
              animation: 'spin 1s linear infinite',
              borderRadius: '50%',
              height: '20px',
              width: '20px',
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
            }}
          />
        );
      case 'failed':
        return <XCircle style={{ width: '20px', height: '20px', color: '#dc2626' }} />;
      default:
        return <Clock style={{ width: '20px', height: '20px', color: '#9ca3af' }} />;
    }
  };

  const getBorderColor = () => {
    switch (step.status) {
      case 'completed':
        return '#10b981';
      case 'running':
        return '#3b82f6';
      case 'failed':
        return '#ef4444';
      default:
        return '#d1d5db';
    }
  };

  const getStatusBg = () => {
    switch (step.status) {
      case 'completed':
        return { bg: '#d1fae5', text: '#065f46' };
      case 'running':
        return { bg: '#dbeafe', text: '#1e40af' };
      case 'failed':
        return { bg: '#fee2e2', text: '#991b1b' };
      default:
        return { bg: '#f3f4f6', text: '#4b5563' };
    }
  };

  const statusColors = getStatusBg();

  return (
    <div
      style={{
        borderLeft: `4px solid ${getBorderColor()}`,
        paddingLeft: '16px',
        paddingTop: '12px',
        paddingBottom: '12px',
        marginBottom: '12px',
        backgroundColor: 'white',
        borderRadius: '0 8px 8px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flexShrink: 0 }}>{getIcon()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontWeight: 500, color: '#111827' }}>
              {index + 1}. {step.step_name}
            </h3>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: statusColors.bg,
                color: statusColors.text,
              }}
            >
              {step.status}
            </span>
          </div>
          {step.error && (
            <p style={{ marginTop: '4px', fontSize: '14px', color: '#dc2626' }}>{step.error}</p>
          )}
          {step.completed_at && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
              Completed at {new Date(step.completed_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowStatusPage({ workflowId = '789' }) {
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkflow();

    // Poll every second while running
    const interval = setInterval(() => {
      if (run && (run.status === 'running' || run.status === 'pending')) {
        fetchWorkflow();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [workflowId, run?.status]);

  const fetchWorkflow = async () => {
    try {
      const response = await api.get(`/workflow-runs/${workflowId}/`);
      const payload = response.data || response;
      setRun(payload.data || payload);
      setLoading(false);
    } catch (err: any) {
      setError((err as Error).message || 'Failed to load workflow status');
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
          <p style={{ color: '#4b5563' }}>Loading workflow status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '672px', margin: '0 auto', marginTop: '32px', padding: '24px' }}>
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <AlertCircle
            style={{
              width: '24px',
              height: '24px',
              color: '#dc2626',
              flexShrink: 0,
              marginTop: '2px',
            }}
          />
          <div>
            <h3 style={{ fontWeight: 600, color: '#7f1d1d' }}>Error Loading Workflow</h3>
            <p style={{ color: '#b91c1c', marginTop: '4px' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div style={{ maxWidth: '672px', margin: '0 auto', marginTop: '32px', padding: '24px' }}>
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Workflow not found</p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '768px',
        margin: '0 auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
              {run.workflow_template.name}
            </h1>
            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
              Workflow ID: {run.id}
            </p>
          </div>
          <div
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontWeight: 600,
              backgroundColor:
                run.status === 'completed'
                  ? '#d1fae5'
                  : run.status === 'running'
                    ? '#dbeafe'
                    : run.status === 'failed'
                      ? '#fee2e2'
                      : '#f3f4f6',
              color:
                run.status === 'completed'
                  ? '#065f46'
                  : run.status === 'running'
                    ? '#1e40af'
                    : run.status === 'failed'
                      ? '#991b1b'
                      : '#374151',
              animation:
                run.status === 'running'
                  ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                  : 'none',
            }}
          >
            {run.status === 'running' ? '⟳ Running' : run.status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Success Result */}
      {run.status === 'completed' && run.result_data && (
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '2px solid #10b981',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <CheckCircle style={{ width: '32px', height: '32px', color: '#059669' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#065f46' }}>
              Transaction Completed Successfully!
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#065f46' }}>
            {run.result_data.reference_number && (
              <p style={{ fontSize: '18px' }}>
                <span style={{ fontWeight: 600 }}>Reference:</span>{' '}
                <span style={{ fontFamily: 'monospace' }}>{run.result_data.reference_number}</span>
              </p>
            )}
            {run.result_data.new_balance !== undefined && (
              <p style={{ fontSize: '24px', fontWeight: 700 }}>
                New Balance: ₦{run.result_data.new_balance.toLocaleString()}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            {run.result_data.transaction_id && (
              <button
                onClick={() => navigate(`/transactions/${run.result_data.transaction_id}`)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: 'white',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = '#047857')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = '#059669')}
              >
                View Transaction
              </button>
            )}
            {run.result_data.account_id && (
              <button
                onClick={() => navigate(`/accounts/${run.result_data.account_id}`)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'white',
                  color: '#059669',
                  border: '2px solid #059669',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = '#f0fdf4')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = 'white')}
              >
                <ArrowLeft style={{ width: '16px', height: '16px' }} />
                <span>Back to Account</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Failure Result */}
      {run.status === 'failed' && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <XCircle style={{ width: '32px', height: '32px', color: '#dc2626' }} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#7f1d1d' }}>
              Transaction Failed
            </h2>
          </div>
          {run.error && <p style={{ color: '#991b1b', marginBottom: '16px' }}>{run.error}</p>}
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = '#b91c1c')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = '#dc2626')}
          >
            <ArrowLeft style={{ width: '16px', height: '16px' }} />
            <span>Go Back</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Example usage:
// <WorkflowStatusPage workflowId="789" />
