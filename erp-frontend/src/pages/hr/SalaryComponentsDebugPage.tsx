import React, { useState } from 'react';
import { apiClient } from '../../services/apiClient';

const SalaryComponentsDebugPage: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const testAPIConnection = async () => {
    setLoading(true);
    setDebugInfo({ status: 'Testing API connection...' });

    try {
      // Test basic API connection
      console.log('Testing API connection to:', 'http://localhost:8000/api');

      // Test if we can reach the API at all
      const response = await fetch('http://localhost:8000/api/hr/salary-components/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add auth header if available
          ...(localStorage.getItem('access_token')
            ? {
                Authorization: `Bearer ${localStorage.getItem('access_token')}`,
              }
            : {}),
        },
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (response.ok) {
        const data = await response.json();
        setDebugInfo({
          status: 'SUCCESS',
          statusCode: response.status,
          data: data,
          url: 'http://localhost:8000/api/hr/salary-components/',
          headers: Object.fromEntries(response.headers.entries()),
        });
      } else {
        const errorText = await response.text();
        setDebugInfo({
          status: 'ERROR',
          statusCode: response.status,
          error: errorText,
          url: 'http://localhost:8000/api/hr/salary-components/',
          headers: Object.fromEntries(response.headers.entries()),
        });
      }
    } catch (error: any) {
      console.error('API Test Error:', error);
      setDebugInfo({
        status: 'NETWORK_ERROR',
        error: error.message,
        stack: error.stack,
        url: 'http://localhost:8000/api/hr/salary-components/',
      });
    } finally {
      setLoading(false);
    }
  };

  const testWithApiClient = async () => {
    setLoading(true);
    setDebugInfo({ status: 'Testing with apiClient...' });

    try {
      const data = await apiClient.get('/hr/salary-components/');
      setDebugInfo({
        status: 'SUCCESS_API_CLIENT',
        data: data,
        method: 'apiClient.get',
      });
    } catch (error: any) {
      console.error('ApiClient Test Error:', error);
      setDebugInfo({
        status: 'ERROR_API_CLIENT',
        error: error.message,
        stack: error.stack,
        method: 'apiClient.get',
      });
    } finally {
      setLoading(false);
    }
  };

  const createTestComponent = async () => {
    setLoading(true);
    setDebugInfo({ status: 'Creating test component...' });

    try {
      const testData = {
        name: 'Test Component',
        component_type: 'EARNING',
        default_amount: '1000.00',
      };

      const data = await apiClient.post('/hr/salary-components/', testData);
      setDebugInfo({
        status: 'SUCCESS_CREATE',
        data: data,
        method: 'apiClient.post',
        payload: testData,
      });
    } catch (error: any) {
      console.error('Create Test Error:', error);
      setDebugInfo({
        status: 'ERROR_CREATE',
        error: error.message,
        stack: error.stack,
        method: 'apiClient.post',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkAuthStatus = () => {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');

    setDebugInfo({
      status: 'AUTH_CHECK',
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      accessTokenLength: accessToken?.length || 0,
      refreshTokenLength: refreshToken?.length || 0,
      accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : 'None',
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">HR API Debug Page</h1>

      <div className="space-y-4 mb-6">
        <button
          onClick={checkAuthStatus}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Check Auth Status
        </button>

        <button
          onClick={testAPIConnection}
          disabled={loading}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
        >
          Test Direct API Connection
        </button>

        <button
          onClick={testWithApiClient}
          disabled={loading}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
        >
          Test with ApiClient
        </button>

        <button
          onClick={createTestComponent}
          disabled={loading}
          className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
        >
          Create Test Component
        </button>
      </div>

      {loading && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          Loading...
        </div>
      )}

      <div className="bg-gray-100 p-4 rounded">
        <h2 className="text-lg font-semibold mb-2">Debug Information:</h2>
        <pre className="text-sm overflow-auto max-h-96">{JSON.stringify(debugInfo, null, 2)}</pre>
      </div>

      <div className="mt-6 bg-blue-50 p-4 rounded">
        <h3 className="font-semibold mb-2">Environment Info:</h3>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Current URL:</strong> {window.location.href}
          </li>
          <li>
            <strong>API Base URL:</strong> http://localhost:8000/api
          </li>
          <li>
            <strong>Expected Endpoint:</strong> http://localhost:8000/api/hr/salary-components/
          </li>
          <li>
            <strong>Has Access Token:</strong> {localStorage.getItem('access_token') ? 'Yes' : 'No'}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SalaryComponentsDebugPage;
