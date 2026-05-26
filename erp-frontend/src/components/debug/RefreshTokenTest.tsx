// src/components/debug/RefreshTokenTest.tsx
import React, { useState } from 'react';
import { authService } from '../../services/authService';
import { api } from '../../services/api';

const RefreshTokenTest: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const testRefreshToken = async () => {
    setLoading(true);
    setLogs([]);

    try {
      addLog('🔍 Starting refresh token test...');

      // Check current tokens
      const currentToken = authService.getStoredToken();
      const refreshToken = authService.getRefreshToken();

      addLog(
        `📋 Current access token: ${currentToken ? currentToken.substring(0, 20) + '...' : 'MISSING'}`
      );
      addLog(
        `📋 Current refresh token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : 'MISSING'}`
      );

      if (!refreshToken) {
        addLog('❌ No refresh token found! Please login first.');
        return;
      }

      // Store original refresh token for comparison
      const originalRefreshToken = refreshToken;

      // Manually expire the access token
      addLog('⏰ Manually expiring access token...');
      localStorage.removeItem('accessToken');
      sessionStorage.removeItem('accessToken');

      // Try to make an API call that should trigger refresh
      addLog('🔄 Attempting API call that should trigger token refresh...');

      try {
        const result = await authService.refreshToken();
        addLog('✅ Token refresh successful!');
        addLog(
          `📋 New access token: ${result.access ? result.access.substring(0, 20) + '...' : 'MISSING'}`
        );
        addLog(
          `📋 New refresh token: ${result.refresh ? result.refresh.substring(0, 20) + '...' : 'MISSING'}`
        );

        // Check if refresh token was rotated
        const tokenRotated = result.refresh !== originalRefreshToken;
        addLog(`🔄 Refresh token rotated: ${tokenRotated ? 'YES' : 'NO'}`);

        if (tokenRotated) {
          addLog('✅ Backend is rotating refresh tokens (good security practice)');
        }

        // Test the new token with an API call
        addLog('🧪 Testing new token with API call...');
        const testResult = await api.get('/users/auth/me/');
        addLog('✅ API call with new token successful!');
        addLog(`👤 User data received: ${testResult.username || testResult.email || 'Unknown'}`);

        // Show final token state
        const finalAccessToken = authService.getStoredToken();
        const finalRefreshToken = authService.getRefreshToken();
        addLog(
          `📋 Final access token: ${finalAccessToken ? finalAccessToken.substring(0, 20) + '...' : 'MISSING'}`
        );
        addLog(
          `📋 Final refresh token: ${finalRefreshToken ? finalRefreshToken.substring(0, 20) + '...' : 'MISSING'}`
        );
      } catch (refreshError: any) {
        addLog(`❌ Token refresh failed: ${refreshError.message}`);
      }
    } catch (error: any) {
      addLog(`❌ Test failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testStorageTypes = () => {
    setLogs([]);
    addLog('🔍 Checking token storage locations...');

    const localToken = localStorage.getItem('accessToken');
    const sessionToken = sessionStorage.getItem('accessToken');
    const localRefresh = localStorage.getItem('refreshToken');
    const sessionRefresh = sessionStorage.getItem('refreshToken');
    const rememberMe = localStorage.getItem('rememberMe');

    addLog(`📦 localStorage accessToken: ${localToken ? 'EXISTS' : 'MISSING'}`);
    addLog(`📦 sessionStorage accessToken: ${sessionToken ? 'EXISTS' : 'MISSING'}`);
    addLog(`📦 localStorage refreshToken: ${localRefresh ? 'EXISTS' : 'MISSING'}`);
    addLog(`📦 sessionStorage refreshToken: ${sessionRefresh ? 'EXISTS' : 'MISSING'}`);
    addLog(`📦 Remember Me preference: ${rememberMe || 'NOT SET'}`);
  };

  const clearLogs = () => setLogs([]);

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        fontFamily: 'monospace',
      }}
    >
      <h2 style={{ marginBottom: '1rem', color: '#333' }}>🧪 Refresh Token Test</h2>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={testRefreshToken}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '🔄 Testing...' : '🧪 Test Refresh Token'}
        </button>

        <button
          onClick={testStorageTypes}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          📦 Check Storage
        </button>

        <button
          onClick={clearLogs}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          🗑️ Clear Logs
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          padding: '1rem',
          minHeight: '300px',
          maxHeight: '500px',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', color: '#495057' }}>📋 Test Logs:</h3>
        {logs.length === 0 ? (
          <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
            No logs yet. Click a test button to start.
          </p>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              style={{
                marginBottom: '0.5rem',
                padding: '0.25rem',
                backgroundColor: log.includes('❌')
                  ? '#f8d7da'
                  : log.includes('✅')
                    ? '#d4edda'
                    : log.includes('🔄')
                      ? '#fff3cd'
                      : 'transparent',
                borderRadius: '2px',
              }}
            >
              {log}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6c757d' }}>
        <p>
          <strong>How to use:</strong>
        </p>
        <ul>
          <li>
            <strong>Check Storage:</strong> See where your tokens are stored (localStorage vs
            sessionStorage)
          </li>
          <li>
            <strong>Test Refresh Token:</strong> Manually expire access token and test refresh
            functionality
          </li>
          <li>Make sure you're logged in before testing!</li>
        </ul>
      </div>
    </div>
  );
};

export default RefreshTokenTest;
