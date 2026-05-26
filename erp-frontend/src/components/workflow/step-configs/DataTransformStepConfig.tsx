import React, { useState } from 'react';
import { Variable } from '../../../types/workflow';

// ============================================================================
// DATA TRANSFORM STEP CONFIG
// ============================================================================

interface DataTransformStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

export const DataTransformStepConfig: React.FC<DataTransformStepConfigProps> = ({
  config,
  variables,
  onChange,
}) => {
  const [operation, setOperation] = useState(config.operation || 'map');
  const [sourceData, setSourceData] = useState(config.source_data || '');
  const [resultName, setResultName] = useState(config.result_name || 'transformed_data');

  const handleUpdate = (updates: any) => {
    onChange({ operation, source_data: sourceData, result_name: resultName, ...updates });
  };

  const handleOperationChange = (op: string) => {
    setOperation(op);
    handleUpdate({ operation: op });
  };

  const renderOperationConfig = () => {
    switch (operation) {
      case 'map':
        return (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
              }}
            >
              Map Expression
            </label>
            <input
              value={config.map_expression || ''}
              onChange={e => handleUpdate({ map_expression: e.target.value })}
              placeholder="item.amount * 1.1"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
              }}
            />
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Transform each item. Use 'item.field' to access fields.
            </div>
          </div>
        );

      case 'filter':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Field
              </label>
              <input
                value={config.filter_condition?.field || ''}
                onChange={e =>
                  handleUpdate({
                    filter_condition: { ...config.filter_condition, field: e.target.value },
                  })
                }
                placeholder="amount"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
              <select
                value={config.filter_condition?.operator || '>'}
                onChange={e =>
                  handleUpdate({
                    filter_condition: { ...config.filter_condition, operator: e.target.value },
                  })
                }
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="==">=</option>
                <option value="!=">≠</option>
                <option value=">">{'>'}</option>
                <option value=">=">=</option>
                <option value="<">{'<'}</option>
                <option value="<=">=</option>
                <option value="contains">contains</option>
              </select>
              <input
                value={config.filter_condition?.value || ''}
                onChange={e =>
                  handleUpdate({
                    filter_condition: { ...config.filter_condition, value: e.target.value },
                  })
                }
                placeholder="1000"
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
        );

      case 'reduce':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Operation
              </label>
              <select
                value={config.reduce_operation || 'sum'}
                onChange={e => handleUpdate({ reduce_operation: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
                <option value="count">Count</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Field
              </label>
              <input
                value={config.reduce_field || ''}
                onChange={e => handleUpdate({ reduce_field: e.target.value })}
                placeholder="amount"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>
        );

      case 'group_by':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Group By Field
              </label>
              <input
                value={config.group_by_field || ''}
                onChange={e => handleUpdate({ group_by_field: e.target.value })}
                placeholder="category"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Aggregate
              </label>
              <select
                value={config.aggregate?.operation || 'sum'}
                onChange={e =>
                  handleUpdate({ aggregate: { ...config.aggregate, operation: e.target.value } })
                }
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">No aggregation</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
              </select>
            </div>
          </div>
        );

      case 'sort':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Sort By
              </label>
              <input
                value={config.sort_field || ''}
                onChange={e => handleUpdate({ sort_field: e.target.value })}
                placeholder="amount"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}
              >
                Order
              </label>
              <select
                value={config.sort_order || 'asc'}
                onChange={e => handleUpdate({ sort_order: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Operation
        </label>
        <select
          value={operation}
          onChange={e => handleOperationChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="map">Map (transform items)</option>
          <option value="filter">Filter (keep matching)</option>
          <option value="reduce">Reduce (aggregate)</option>
          <option value="group_by">Group By</option>
          <option value="sort">Sort</option>
          <option value="unique">Unique (remove duplicates)</option>
        </select>
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Source Data
        </label>
        <select
          value={sourceData}
          onChange={e => {
            setSourceData(e.target.value);
            handleUpdate({ source_data: e.target.value });
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          <option value="">Select data source...</option>
          {variables.map(v => (
            <option key={v.id} value={`\${${v.path}}`}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {renderOperationConfig()}

      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Result Variable Name
        </label>
        <input
          value={resultName}
          onChange={e => {
            setResultName(e.target.value);
            handleUpdate({ result_name: e.target.value });
          }}
          placeholder="transformed_data"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// HTTP REQUEST STEP CONFIG
// ============================================================================

interface HttpRequestStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

export const HttpRequestStepConfig: React.FC<HttpRequestStepConfigProps> = ({
  config,
  variables,
  onChange,
}) => {
  const [method, setMethod] = useState(config.method || 'POST');
  const [url, setUrl] = useState(config.url || '');
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    config.headers
      ? Object.entries(config.headers).map(([k, v]) => ({ key: k, value: v as string }))
      : [{ key: 'Content-Type', value: 'application/json' }]
  );
  const [body, setBody] = useState(config.body ? JSON.stringify(config.body, null, 2) : '{}');
  const [timeout, setTimeout] = useState(config.timeout || 30);

  const handleUpdate = (updates: any) => {
    onChange({
      method,
      url,
      headers: Object.fromEntries(headers.map(h => [h.key, h.value])),
      body: method !== 'GET' ? (body ? JSON.parse(body) : {}) : undefined,
      timeout,
      body_type: 'json',
      parse_response: true,
      expected_status: [200, 201],
      max_retries: 3,
      ...updates,
    });
  };

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...headers];
    updated[index][field] = value;
    setHeaders(updated);
    handleUpdate({});
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
    handleUpdate({});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            Method
          </label>
          <select
            value={method}
            onChange={e => {
              setMethod(e.target.value);
              handleUpdate({ method: e.target.value });
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            URL
          </label>
          <input
            value={url}
            onChange={e => {
              setUrl(e.target.value);
              handleUpdate({ url: e.target.value });
            }}
            placeholder="https://api.example.com/endpoint"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Headers</label>
          <button
            onClick={addHeader}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>
        {headers.map((header, idx) => (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <input
              value={header.key}
              onChange={e => updateHeader(idx, 'key', e.target.value)}
              placeholder="Header-Name"
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            />
            <input
              value={header.value}
              onChange={e => updateHeader(idx, 'value', e.target.value)}
              placeholder="Value"
              style={{
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={() => removeHeader(idx)}
              style={{
                padding: '0.25rem',
                border: 'none',
                background: 'transparent',
                color: '#ef4444',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {method !== 'GET' && (
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            Request Body (JSON)
          </label>
          <textarea
            value={body}
            onChange={e => {
              setBody(e.target.value);
              handleUpdate({});
            }}
            rows={6}
            placeholder='{"key": "value"}'
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
            }}
          />
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Use ${'{variable}'} for dynamic values
          </div>
        </div>
      )}

      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Timeout (seconds)
        </label>
        <input
          type="number"
          value={timeout}
          onChange={e => {
            setTimeout(Number(e.target.value));
            handleUpdate({ timeout: Number(e.target.value) });
          }}
          min="1"
          max="300"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        />
      </div>
    </div>
  );
};
