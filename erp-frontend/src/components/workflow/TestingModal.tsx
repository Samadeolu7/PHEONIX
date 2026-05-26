import React, { useState } from 'react';
import { X, Play, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { Variable } from '../../types/workflow';

interface TestingModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: any;
  variables: Variable[];
}

interface TestResult {
  step: string;
  status: 'success' | 'error';
  output: string;
  timestamp: string;
}

const TestingModal: React.FC<TestingModalProps> = ({ isOpen, onClose, workflow, variables }) => {
  const [testData, setTestData] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setRunning(true);
    setResults([]);
    setCurrentStep(0);
    setError(null);

    try {
      // Validate test data
      const requiredVariables = variables.filter(v => v.source === 'form');
      const missingVariables = requiredVariables.filter(v => !testData[v.path]);

      if (missingVariables.length > 0) {
        throw new Error(`Missing test data for: ${missingVariables.map(v => v.name).join(', ')}`);
      }

      // Call real backend test endpoint
      const response = await fetch('/api/automations/workflows/test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            name: workflow.name,
            steps: workflow.steps,
            trigger: workflow.trigger,
          },
          test_data: testData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Test execution failed');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Test failed');
      }

      // Process results with smooth animation
      const stepResults = data.results || [];

      for (let i = 0; i < stepResults.length; i++) {
        setCurrentStep(i);
        await new Promise(resolve => setTimeout(resolve, 500));

        const stepResult = stepResults[i];
        const result: TestResult = {
          step: stepResult.step_name,
          status: stepResult.status === 'success' ? 'success' : 'error',
          output: stepResult.output?.message || JSON.stringify(stepResult.output, null, 2),
          timestamp: stepResult.timestamp,
        };

        setResults(prev => [...prev, result]);
      }

      setCurrentStep(stepResults.length);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const resetTest = () => {
    setTestData({});
    setResults([]);
    setCurrentStep(0);
    setError(null);
    setRunning(false);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          width: '800px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '0.5rem',
                background: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={20} color="#3b82f6" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Test Workflow</h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                {workflow.name || 'Unnamed Workflow'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Test Data Input */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Test Data</h3>
              <button
                onClick={resetTest}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  background: 'white',
                  cursor: 'pointer',
                }}
                type="button"
              >
                Reset
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {variables
                .filter(v => v.source === 'form')
                .map(v => (
                  <div key={v.id}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.25rem',
                      }}
                    >
                      {v.name} ({v.type})
                    </label>
                    <input
                      type={v.type === 'number' ? 'number' : 'text'}
                      value={testData[v.path] || ''}
                      onChange={e => setTestData({ ...testData, [v.path]: e.target.value })}
                      placeholder={`Enter ${v.name.toLowerCase()}`}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                      disabled={running}
                      aria-label={`Test data for ${v.name}`}
                    />
                  </div>
                ))}
            </div>
          </div>

          {/* Execution Progress */}
          {(running || results.length > 0) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>
                Execution Progress
              </h3>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {workflow.steps.map((step: any, idx: number) => {
                  const stepResult = results[idx];
                  const isCompleted = idx < currentStep;
                  const isCurrent = idx === currentStep && running;
                  const hasError = stepResult?.status === 'error';

                  return (
                    <div
                      key={step.id}
                      style={{
                        padding: '0.75rem',
                        border: `1px solid ${
                          hasError
                            ? '#ef4444'
                            : isCompleted
                              ? '#10b981'
                              : isCurrent
                                ? '#3b82f6'
                                : '#e5e7eb'
                        }`,
                        borderRadius: '0.375rem',
                        background: hasError
                          ? '#fef2f2'
                          : isCompleted
                            ? '#d1fae5'
                            : isCurrent
                              ? '#dbeafe'
                              : 'white',
                        display: 'flex',
                        alignItems: 'start',
                        gap: '0.75rem',
                      }}
                    >
                      {hasError ? (
                        <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
                      ) : isCompleted ? (
                        <CheckCircle size={20} color="#10b981" style={{ flexShrink: 0 }} />
                      ) : isCurrent ? (
                        <Loader
                          style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                          size={20}
                          color="#3b82f6"
                        />
                      ) : (
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: '2px solid #e5e7eb',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                          {idx + 1}. {step.name}
                        </div>
                        {stepResult && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: hasError ? '#dc2626' : '#6b7280',
                              marginTop: '0.25rem',
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {stepResult.output}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.375rem',
                display: 'flex',
                alignItems: 'start',
                gap: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
              <AlertCircle size={20} color="#ef4444" />
              <div>
                <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
                  Test Failed
                </div>
                <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>
              </div>
            </div>
          )}

          {/* Success */}
          {!running && results.length === workflow.steps.length && !error && (
            <div
              style={{
                padding: '1rem',
                background: '#d1fae5',
                border: '1px solid #10b981',
                borderRadius: '0.375rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
              <CheckCircle size={20} color="#10b981" />
              <div style={{ fontWeight: 600, color: '#065f46' }}>Test completed successfully!</div>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Close
          </button>
          <button
            onClick={runTest}
            disabled={
              running || variables.filter(v => v.source === 'form').some(v => !testData[v.path])
            }
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '0.375rem',
              background:
                running || variables.filter(v => v.source === 'form').some(v => !testData[v.path])
                  ? '#9ca3af'
                  : '#3b82f6',
              color: 'white',
              cursor:
                running || variables.filter(v => v.source === 'form').some(v => !testData[v.path])
                  ? 'not-allowed'
                  : 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            aria-label={running ? 'Running test' : 'Run test'}
          >
            {running ? (
              <>
                <Loader style={{ animation: 'spin 1s linear infinite' }} size={16} />
                Running Test...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Test
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestingModal;
