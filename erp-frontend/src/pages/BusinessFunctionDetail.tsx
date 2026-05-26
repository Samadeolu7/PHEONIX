import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { BusinessFunction } from '../types/automation';
import { Button, Card } from '../components/ui';

export const BusinessFunctionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getBusinessFunction, updateBusinessFunction, loading, error } = useAutomationManagement();
  const [businessFunction, setBusinessFunction] = React.useState<BusinessFunction | null>(null);

  React.useEffect(() => {
    const loadFunction = async () => {
      if (!id) return;
      if (!getBusinessFunction) return;
      const data = await getBusinessFunction(parseInt(id, 10));
      setBusinessFunction(data);
    };
    loadFunction();
  }, [id, getBusinessFunction]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!businessFunction) return <div>Business function not found</div>;

  return (
    <div className="business-function-detail">
      <div className="header">
        <h1>{businessFunction.friendly_name}</h1>
        <Button onClick={() => navigate('/automations/functions')}>Back to Functions</Button>
      </div>

      <Card>
        <div className="details">
          <div className="detail-row">
            <span className="label">Type:</span>
            <span className="value">{businessFunction.function_type}</span>
          </div>
          <div className="detail-row">
            <span className="label">Configuration:</span>
            <pre className="config">{JSON.stringify(businessFunction.config, null, 2)}</pre>
          </div>
        </div>
      </Card>

      <style jsx>{`
        .business-function-detail {
          padding: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .details {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .detail-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .label {
          font-weight: bold;
          color: #666;
        }

        .value {
          font-size: 16px;
        }

        .config {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          font-family: monospace;
          white-space: pre-wrap;
          margin: 0;
        }
      `}</style>
    </div>
  );
};
