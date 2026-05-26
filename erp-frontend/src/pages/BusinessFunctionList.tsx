import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { BusinessFunction } from '../types/automation';
import { Button, Card, Tag } from '../components/ui';

export const BusinessFunctionList: React.FC = () => {
  const { loading, error, getBusinessFunctions, clearError } = useAutomationManagement();

  const [functions, setFunctions] = useState<BusinessFunction[]>([]);

  useEffect(() => {
    loadFunctions();
  }, []);

  const loadFunctions = async () => {
    try {
      const data = await getBusinessFunctions();
      setFunctions(data);
    } catch (err: unknown) {
      // Error handled by hook
    }
  };

  const getFunctionTypeTag = (type: string) => {
    const typeColors: Record<string, 'blue' | 'green' | 'yellow' | 'red'> = {
      api_call: 'blue',
      internal_process: 'green',
      notification: 'yellow',
      approval: 'red',
      condition: 'blue',
    };

    const typeLabels: Record<string, string> = {
      api_call: 'External Integration',
      internal_process: 'Internal Process',
      notification: 'Notification',
      approval: 'Approval',
      condition: 'Condition',
    };

    return <Tag color={typeColors[type] || 'blue'}>{typeLabels[type] || type}</Tag>;
  };

  return (
    <div className="business-functions">
      <div className="header">
        <h1>Business Functions</h1>
        <Link to="/functions/new">
          <Button variant="primary">Create Function</Button>
        </Link>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <Button variant="text" onClick={clearError}>
            ✕
          </Button>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="function-grid">
          {functions.map(func => (
            <Card key={func.id} className="function-card">
              <div className="function-header">
                <h3>{func.friendly_name}</h3>
                {getFunctionTypeTag(func.function_type)}
              </div>

              <div className="function-name">
                <span className="label">Internal Name:</span>
                <code>{func.name}</code>
              </div>

              <div className="function-config">
                <span className="label">Configuration:</span>
                <pre className="config-preview">{JSON.stringify(func.config, null, 2)}</pre>
              </div>

              <div className="function-actions">
                <Link to={`/functions/${func.id}`}>
                  <Button variant="primary">Edit</Button>
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Copy internal name to clipboard
                    navigator.clipboard.writeText(func.name);
                  }}
                >
                  Copy Name
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <style jsx>{`
        .business-functions {
          padding: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        .error-banner {
          background-color: #fff2f2;
          border: 1px solid #ffcdd2;
          color: #d32f2f;
          padding: 10px 20px;
          border-radius: 4px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .function-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }

        .function-card {
          padding: 20px;
        }

        .function-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .function-name {
          margin-bottom: 15px;
        }

        .function-name code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }

        .label {
          color: #666;
          font-size: 14px;
          margin-right: 8px;
        }

        .config-preview {
          background: #f8f9fa;
          padding: 10px;
          border-radius: 4px;
          font-size: 12px;
          overflow: auto;
          max-height: 150px;
          margin: 8px 0;
        }

        .function-actions {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }
      `}</style>
    </div>
  );
};
