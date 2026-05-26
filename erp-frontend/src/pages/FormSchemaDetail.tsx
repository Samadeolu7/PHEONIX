import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { FormSchema } from '../types/automation';
import { Button, Card } from '../components/ui';
import { DynamicForm } from '../components/DynamicForm';

export const FormSchemaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getFormSchema, updateFormSchema, loading, error } = useAutomationManagement();
  const [schema, setSchema] = React.useState<FormSchema | null>(null);

  React.useEffect(() => {
    const loadSchema = async () => {
      if (!id) return;
      if (!getFormSchema) return;
      const data = await getFormSchema(parseInt(id, 10));
      setSchema(data);
    };
    loadSchema();
  }, [id, getFormSchema]);

  const handleSave = async (updatedSchema: FormSchema) => {
    if (!id) return;
    if (!updateFormSchema) return;
    await updateFormSchema(parseInt(id, 10), updatedSchema);
    navigate('/automations/forms');
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!schema) return <div>Form schema not found</div>;

  return (
    <div className="form-schema-detail">
      <div className="header">
        <h1>{schema.name}</h1>
        <Button onClick={() => navigate('/automations/forms')}>Back to Forms</Button>
      </div>

      <Card>
        <h2>Form Fields</h2>
        <div className="fields">
          {schema.fields.map(field => (
            <div key={field.id} className="field">
              <h3>{field.label}</h3>
              <p>Type: {field.type}</p>
              {field.required && <p>Required</p>}
              {field.options && (
                <div>
                  <p>Options:</p>
                  <ul>
                    {field.options.map(option => (
                      <li key={option}>{option}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <style jsx>{`
        .form-schema-detail {
          padding: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .fields {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }

        .field {
          padding: 16px;
          border: 1px solid #eee;
          border-radius: 4px;
        }

        h3 {
          margin: 0 0 8px 0;
        }

        p {
          margin: 4px 0;
        }

        ul {
          margin: 4px 0;
          padding-left: 20px;
        }
      `}</style>
    </div>
  );
};
