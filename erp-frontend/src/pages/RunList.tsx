import * as React from 'react';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { AutomationRun } from '../types/automation';
// Card is not exported from '../components/ui'; we'll use a plain div with run-card styling instead
import { Link } from 'react-router-dom';

export const RunList = (): JSX.Element => {
  const { getRuns, loading, error } = useAutomationManagement();
  const [runs, setRuns] = React.useState<AutomationRun[]>([]);

  React.useEffect(() => {
    const loadRuns = async () => {
      if (getRuns) {
        const data = await getRuns();
        setRuns(data);
      }
    };
    loadRuns();
  }, [getRuns]);

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

  return (
    <div className="run-list">
      <h1>Automation Runs</h1>

      {runs.map(run => (
        <div key={run.id} className="run-card">
          <div className="header">
            <h2>{run.template.name}</h2>
            <span
              className="status-tag"
              style={{
                backgroundColor: getStatusColor(run.status),
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {run.status}
            </span>
          </div>

          <div className="details">
            <div className="detail">
              <span className="label">Started:</span>
              <span className="value">{new Date(run.startedAt).toLocaleString()}</span>
            </div>
            <div className="detail">
              <span className="label">Duration:</span>
              <span className="value">
                {run.endedAt
                  ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime() + ' ms'
                  : 'In Progress'}
              </span>
            </div>
            <div className="detail">
              <span className="label">Current Step:</span>
              <span className="value">{run.current_step.label}</span>
            </div>
            {run.error && (
              <div className="detail error">
                <span className="label">Error:</span>
                <span className="value">{run.error}</span>
              </div>
            )}
          </div>

          <Link to={`/automations/runs/${run.id}`} className="view-link">
            View Details
          </Link>
        </div>
      ))}

      <style jsx>{`
        .run-list {
          padding: 20px;
        }

        .run-card {
          margin-bottom: 16px;
          padding: 16px;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          background: #fff;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        h2 {
          margin: 0;
        }

        .details {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
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

        .error .value {
          color: #dc3545;
          font-size: 14px;
          padding: 4px 8px;
          background-color: #fff1f0;
          border-radius: 4px;
          border: 1px solid #ffa39e;
        }

        .view-link {
          color: #0066cc;
          text-decoration: none;
          font-weight: 500;
          margin-top: 16px;
          display: inline-block;
        }

        .view-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};
