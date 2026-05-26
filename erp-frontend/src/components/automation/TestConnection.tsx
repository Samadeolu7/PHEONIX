import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { automationService } from '../../services/automationService';

export const TestConnection: React.FC = () => {
  const [testResult, setTestResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const testConnection = async () => {
    setIsLoading(true);
    setTestResult('');

    try {
      const templates = await automationService.getAutomationTemplates();
      setTestResult(`✅ Connection successful! Found ${templates.length} automation templates.`);
    } catch (error: any) {
      setTestResult(`❌ Connection failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="test-connection">
        <p>Authenticating...</p>
      </div>
    );
  }

  return (
    <div className="test-connection">
      <div className="connection-status">
        <h3>Backend Connection Test</h3>
        <p>
          Authentication Status: {isAuthenticated ? '✅ Authenticated' : '❌ Not Authenticated'}
        </p>

        <button onClick={testConnection} disabled={isLoading} className="test-btn">
          {isLoading ? 'Testing...' : 'Test API Connection'}
        </button>

        {testResult && (
          <div className={`test-result ${testResult.includes('✅') ? 'success' : 'error'}`}>
            {testResult}
          </div>
        )}
      </div>

      <style jsx>{`
        .test-connection {
          max-width: 500px;
          margin: 20px auto;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .connection-status h3 {
          margin: 0 0 15px 0;
          color: #333;
        }

        .connection-status p {
          margin: 0 0 15px 0;
          color: #666;
        }

        .test-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s;
        }

        .test-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .test-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .test-result {
          margin-top: 15px;
          padding: 12px;
          border-radius: 6px;
          font-weight: 500;
        }

        .test-result.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .test-result.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      `}</style>
    </div>
  );
};
