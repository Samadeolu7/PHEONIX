import React, { useState } from 'react';
import { api } from '../services/api';
import { AlertCircle, CheckCircle, Loader, Bug } from 'lucide-react';
import ToastIntegrationTest from '../components/debug/ToastIntegrationTest';

const DashboardDebugTest: React.FC = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testDashboardCreation = async () => {
    setTesting(true);
    setResult(null);
    setError(null);

    try {
      // Test with minimal payload first
      const minimalPayload = {
        name: 'Test Dashboard',
        slug: 'test-dashboard',
        widgets: [],
      };

      console.log('Testing dashboard creation with minimal payload:', minimalPayload);

      const response = await api.post('/dashboards/', minimalPayload);

      console.log('Success! Response:', response);
      setResult(response);
    } catch (err: any) {
      console.error('Dashboard creation failed:', err);

      let errorDetails = {
        message: err.message || 'Unknown error',
        status: err.response?.status || 'No status',
        statusText: err.response?.statusText || 'No status text',
        data: err.response?.data || 'No response data',
        headers: err.response?.headers || 'No headers',
      };

      console.log('Error details:', errorDetails);
      setError(JSON.stringify(errorDetails, null, 2));
    } finally {
      setTesting(false);
    }
  };

  const testWithDifferentPayloads = async () => {
    setTesting(true);
    setResult(null);
    setError(null);

    const testPayloads = [
      {
        name: 'Minimal Test',
        payload: {
          name: 'Test Dashboard 1',
          slug: 'test-dashboard-1',
        },
      },
      {
        name: 'With Empty Widgets',
        payload: {
          name: 'Test Dashboard 2',
          slug: 'test-dashboard-2',
          widgets: [],
        },
      },
      {
        name: 'With Description',
        payload: {
          name: 'Test Dashboard 3',
          slug: 'test-dashboard-3',
          description: 'Test description',
          widgets: [],
        },
      },
    ];

    const results = [];

    for (const test of testPayloads) {
      try {
        console.log(`Testing: ${test.name}`, test.payload);
        const response = await api.post('/dashboards/', test.payload);
        results.push({
          test: test.name,
          success: true,
          response: response,
        });
      } catch (err: any) {
        results.push({
          test: test.name,
          success: false,
          error: {
            message: err.message,
            status: err.response?.status,
            data: err.response?.data,
          },
        });
      }
    }

    setResult(results);
    setTesting(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          <Bug size={32} color="#3b82f6" />
          <div>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#111827',
                margin: 0,
              }}
            >
              Dashboard Creation Debug Tool
            </h1>
            <p
              style={{
                color: '#6b7280',
                margin: '0.25rem 0 0 0',
              }}
            >
              Test dashboard creation with different payloads to identify the 500 error
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          <button
            onClick={testDashboardCreation}
            disabled={testing}
            style={{
              padding: '0.75rem 1.5rem',
              background: testing ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: testing ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {testing ? <Loader size={16} className="animate-spin" /> : <Bug size={16} />}
            Test Minimal Payload
          </button>

          <button
            onClick={testWithDifferentPayloads}
            disabled={testing}
            style={{
              padding: '0.75rem 1.5rem',
              background: testing ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: testing ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {testing ? <Loader size={16} className="animate-spin" /> : <Bug size={16} />}
            Test Multiple Payloads
          </button>
        </div>

        {/* Results */}
        {result && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
              }}
            >
              <CheckCircle size={20} color="#16a34a" />
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#16a34a',
                  margin: 0,
                }}
              >
                Test Results
              </h3>
            </div>
            <pre
              style={{
                background: '#f9fafb',
                padding: '1rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                overflow: 'auto',
                maxHeight: '400px',
                border: '1px solid #e5e7eb',
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
              }}
            >
              <AlertCircle size={20} color="#dc2626" />
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#dc2626',
                  margin: 0,
                }}
              >
                Error Details
              </h3>
            </div>
            <pre
              style={{
                background: '#f9fafb',
                padding: '1rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                overflow: 'auto',
                maxHeight: '400px',
                border: '1px solid #e5e7eb',
                color: '#dc2626',
              }}
            >
              {error}
            </pre>
          </div>
        )}

        {/* Instructions */}
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#1e40af',
              margin: '0 0 0.5rem 0',
            }}
          >
            Debug Instructions:
          </h3>
          <ul
            style={{
              fontSize: '0.75rem',
              color: '#1e40af',
              margin: 0,
              paddingLeft: '1rem',
            }}
          >
            <li>Click "Test Minimal Payload" to test with the simplest possible data</li>
            <li>Click "Test Multiple Payloads" to test different combinations</li>
            <li>Check the browser console for detailed error logs</li>
            <li>Look at the error response to identify what the backend expects</li>
            <li>Common issues: missing required fields, invalid data types, authentication</li>
          </ul>
        </div>

        {/* Current API Info */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem',
          }}
        >
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#374151',
              margin: '0 0 0.5rem 0',
            }}
          >
            API Configuration:
          </h3>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            <div>
              <strong>Endpoint:</strong> POST /api/dashboards/
            </div>
            <div>
              <strong>Base URL:</strong> {import.meta.env.VITE_API_URL || '/api'}
            </div>
            <div>
              <strong>Auth Token:</strong>{' '}
              {localStorage.getItem('accessToken') ? 'Present' : 'Missing'}
            </div>
          </div>
        </div>

        {/* Toast Integration Test */}
        <ToastIntegrationTest />
      </div>

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DashboardDebugTest;
