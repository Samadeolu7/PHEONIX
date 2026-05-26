import React from 'react';
import { useParams } from 'react-router-dom';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { AutomationRun } from '../types/automation';
import { Card, Tag } from '../components/ui';

export const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { getRun, loading, error } = useAutomationManagement();
  const [run, setRun] = React.useState<AutomationRun | null>(null);

  React.useEffect(() => {
    const loadRun = async () => {
      if (!id) return;
      const data = await getRun(parseInt(id, 10));
      setRun(data);
    };
    loadRun();
  }, [id, getRun]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      case 'running':
        return 'blue';
      default:
        return 'gray';
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!run) return <div>Run not found</div>;

  return (
    <div className="run-detail">
      <h1>Run Details</h1>

      <Card className="info-card">
        <div className="header">
          <h2>{run.template.name}</h2>
          <Tag color={getStatusColor(run.status)}>{run.status}</Tag>
        </div>

        <div className="details">
          <div className="detail">
            <span className="label">Started:</span>
            <span className="value">{new Date(run.created_at).toLocaleString()}</span>
          </div>
          <div className="detail">
            <span className="label">Last Updated:</span>
            <span className="value">{new Date(run.updated_at).toLocaleString()}</span>
          </div>
          <div className="detail">
            <span className="label">Current Step:</span>
            <span className="value">{run.current_step.label}</span>
          </div>
        </div>

        {run.error_message && (
          <div className="error-section">
            <h3>Error</h3>
            <pre className="error-message">{run.error_message}</pre>
          </div>
        )}

        {run.parameters && Object.keys(run.parameters).length > 0 && (
          <div className="parameters-section">
            <h3>Parameters</h3>
            <pre className="parameters">{JSON.stringify(run.parameters, null, 2)}</pre>
          </div>
        )}
      </Card>

      <style jsx>{`
        .run-detail {
          padding: 20px;
        }

        .info-card {
          margin-bottom: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        h2 {
          margin: 0;
        }

        .details {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .detail {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .label {
          font-size: 14px;
          color: #666;
        }

        .value {
          font-size: 16px;
        }

        .error-section {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }

        .error-message {
          background: #fff0f0;
          color: #d32f2f;
          padding: 12px;
          border-radius: 4px;
          margin: 0;
          white-space: pre-wrap;
          font-family: monospace;
        }

        .parameters-section {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }

        .parameters {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          margin: 0;
          white-space: pre-wrap;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
};
