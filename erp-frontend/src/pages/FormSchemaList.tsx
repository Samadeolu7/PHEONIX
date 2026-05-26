import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { FormSchema } from '../types/automation';
import { Button, Card, Tag } from '../components/ui';

export const FormSchemaList: React.FC = () => {
  const navigate = useNavigate();
  const { getFormSchemas, loading, error } = useAutomationManagement();
  const [schemas, setSchemas] = React.useState<FormSchema[]>([]);

  React.useEffect(() => {
    const loadSchemas = async () => {
      const data = await getFormSchemas();
      setSchemas(data);
    };
    loadSchemas();
  }, [getFormSchemas]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="form-schemas">
      <div className="header">
        <h1>Form Schemas</h1>
        <Button onClick={() => navigate('/automations/forms/new')}>Create New Form</Button>
      </div>

      {schemas.map(schema => (
        <Card key={schema.id} className="schema-card">
          <div className="title">
            <h2>{schema.name}</h2>
            <Tag color="blue">{schema.fields.length} Fields</Tag>
          </div>

          <Button onClick={() => navigate(`/automations/forms/${schema.id}`)}>View Details</Button>
        </Card>
      ))}

      <style jsx>{`
        .form-schemas {
          padding: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .schema-card {
          margin-bottom: 16px;
        }

        .title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        h2 {
          margin: 0;
        }
      `}</style>
    </div>
  );
};
