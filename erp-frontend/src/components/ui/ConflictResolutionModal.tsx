import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  User,
  Server,
  GitMerge,
  X,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface ConflictResolutionModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  localData: T;
  serverData: T;
  onResolve: (resolution: 'use_local' | 'use_server' | 'merge', mergedData?: T) => void;
  title?: string;
  description?: string;
  renderDiff?: (local: T, server: T) => React.ReactNode;
  conflictFields?: string[];
  autoResolveTimeout?: number;
  onAutoResolve?: () => void;
}

interface FieldDiff {
  field: string;
  localValue: any;
  serverValue: any;
  isDifferent: boolean;
  canAutoMerge: boolean;
}

function ConflictResolutionModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  localData,
  serverData,
  onResolve,
  title = 'Data Conflict Detected',
  description = 'The data has been modified by another user. Please choose how to resolve this conflict.',
  renderDiff,
  conflictFields,
  autoResolveTimeout = 30,
  onAutoResolve,
}: ConflictResolutionModalProps<T>) {
  const [selectedResolution, setSelectedResolution] = useState<
    'use_local' | 'use_server' | 'merge'
  >('use_server');
  const [mergedData, setMergedData] = useState<T>(serverData);
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, 'local' | 'server'>>({});
  const [timeLeft, setTimeLeft] = useState(autoResolveTimeout);
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-resolve countdown
  useEffect(() => {
    if (!isOpen || !onAutoResolve) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onAutoResolve();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onAutoResolve]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedResolution('use_server');
      setMergedData(serverData);
      setFieldResolutions({});
      setTimeLeft(autoResolveTimeout);
      setIsJsonValid(true);
      setShowAdvanced(false);
    }
  }, [isOpen, serverData, autoResolveTimeout]);

  if (!isOpen) return null;

  // Analyze differences between local and server data
  const analyzeDifferences = (): FieldDiff[] => {
    const fields = conflictFields || [
      ...new Set([...Object.keys(localData), ...Object.keys(serverData)]),
    ];

    return fields.map(field => {
      const localValue = localData[field];
      const serverValue = serverData[field];
      const isDifferent = JSON.stringify(localValue) !== JSON.stringify(serverValue);

      // Simple auto-merge logic for non-conflicting changes
      const canAutoMerge =
        isDifferent &&
        (localValue === null ||
          localValue === undefined ||
          serverValue === null ||
          serverValue === undefined ||
          (typeof localValue === 'string' && localValue === '') ||
          (typeof serverValue === 'string' && serverValue === ''));

      return {
        field,
        localValue,
        serverValue,
        isDifferent,
        canAutoMerge,
      };
    });
  };

  const differences = analyzeDifferences();
  const conflictCount = differences.filter(d => d.isDifferent).length;
  const autoMergeableCount = differences.filter(d => d.canAutoMerge).length;

  const handleResolve = () => {
    if (selectedResolution === 'merge') {
      if (showAdvanced) {
        // Use JSON editor result
        if (!isJsonValid) return;
        onResolve(selectedResolution, mergedData);
      } else {
        // Use field-by-field resolution
        const resolved = { ...serverData };
        Object.entries(fieldResolutions).forEach(([field, resolution]) => {
          if (resolution === 'local') {
            resolved[field] = localData[field];
          }
        });
        onResolve(selectedResolution, resolved);
      }
    } else {
      onResolve(selectedResolution);
    }
    onClose();
  };

  const handleFieldResolution = (field: string, resolution: 'local' | 'server') => {
    setFieldResolutions(prev => ({
      ...prev,
      [field]: resolution,
    }));
  };

  const handleAutoMerge = () => {
    const autoResolved: Record<string, 'local' | 'server'> = {};
    differences.forEach(diff => {
      if (diff.canAutoMerge) {
        // Choose the non-empty value
        if (diff.localValue && !diff.serverValue) {
          autoResolved[diff.field] = 'local';
        } else if (diff.serverValue && !diff.localValue) {
          autoResolved[diff.field] = 'server';
        }
      }
    });
    setFieldResolutions(prev => ({ ...prev, ...autoResolved }));
  };

  const renderFieldByFieldMerge = () => (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
          Field-by-Field Resolution
        </h4>
        {autoMergeableCount > 0 && (
          <button
            onClick={handleAutoMerge}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            Auto-merge {autoMergeableCount} fields
          </button>
        )}
      </div>

      <div
        style={{
          maxHeight: '300px',
          overflow: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
        }}
      >
        {differences
          .filter(d => d.isDifferent)
          .map(diff => (
            <div
              key={diff.field}
              style={{
                padding: '12px',
                borderBottom: '1px solid #f3f4f6',
                background:
                  fieldResolutions[diff.field] === 'local'
                    ? '#fef3c7'
                    : fieldResolutions[diff.field] === 'server'
                      ? '#dbeafe'
                      : 'white',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                  {diff.field}
                </span>
                {diff.canAutoMerge && (
                  <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 500 }}>
                    Auto-mergeable
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '8px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                    Your Version
                  </div>
                  <div
                    style={{
                      padding: '8px',
                      background: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#92400e',
                      wordBreak: 'break-word',
                    }}
                  >
                    {typeof diff.localValue === 'object'
                      ? JSON.stringify(diff.localValue, null, 2)
                      : String(diff.localValue || '(empty)')}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                    Server Version
                  </div>
                  <div
                    style={{
                      padding: '8px',
                      background: '#dbeafe',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#1e40af',
                      wordBreak: 'break-word',
                    }}
                  >
                    {typeof diff.serverValue === 'object'
                      ? JSON.stringify(diff.serverValue, null, 2)
                      : String(diff.serverValue || '(empty)')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name={`field-${diff.field}`}
                    checked={fieldResolutions[diff.field] === 'local'}
                    onChange={() => handleFieldResolution(diff.field, 'local')}
                  />
                  <span style={{ fontSize: '12px', color: '#374151' }}>Use my version</span>
                </label>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name={`field-${diff.field}`}
                    checked={
                      fieldResolutions[diff.field] === 'server' || !fieldResolutions[diff.field]
                    }
                    onChange={() => handleFieldResolution(diff.field, 'server')}
                  />
                  <span style={{ fontSize: '12px', color: '#374151' }}>Use server version</span>
                </label>
              </div>
            </div>
          ))}
      </div>
    </div>
  );

  const renderDataComparison = () => {
    if (renderDiff) {
      return renderDiff(localData, serverData);
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
            Your Changes
          </h4>
          <div
            style={{
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            {differences.map(diff => (
              <div key={diff.field} style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
                  {diff.field}:
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: diff.isDifferent ? '#dc2626' : '#374151',
                    fontWeight: diff.isDifferent ? 600 : 400,
                  }}
                >
                  {typeof diff.localValue === 'object'
                    ? JSON.stringify(diff.localValue)
                    : String(diff.localValue)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
            Server Version
          </h4>
          <div
            style={{
              background: '#dbeafe',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            {differences.map(diff => (
              <div key={diff.field} style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>
                  {diff.field}:
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: diff.isDifferent ? '#dc2626' : '#374151',
                    fontWeight: diff.isDifferent ? 600 : 400,
                  }}
                >
                  {typeof diff.serverValue === 'object'
                    ? JSON.stringify(diff.serverValue)
                    : String(diff.serverValue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: '#fef2f2',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} style={{ color: '#ef4444' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
                {title}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
                {description}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Auto-resolve countdown */}
            {onAutoResolve && timeLeft > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#92400e',
                }}
              >
                <Clock size={14} />
                Auto-resolve in {timeLeft}s
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '8px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderRadius: '6px',
              }}
            >
              <X size={20} style={{ color: '#6b7280' }} />
            </button>
          </div>
        </div>

        {/* Conflict Summary */}
        {conflictCount > 0 && (
          <div
            style={{
              marginBottom: '20px',
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <AlertCircle size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#991b1b' }}>
                {conflictCount} field{conflictCount > 1 ? 's' : ''} in conflict
              </span>
            </div>
            {autoMergeableCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} style={{ color: '#10b981' }} />
                <span style={{ fontSize: '12px', color: '#059669' }}>
                  {autoMergeableCount} field{autoMergeableCount > 1 ? 's' : ''} can be auto-merged
                </span>
              </div>
            )}
          </div>
        )}

        {/* Data Comparison */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
            Data Comparison
          </h4>
          {renderDataComparison()}
        </div>

        {/* Resolution Options */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
            Choose Resolution
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Use Local */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                border:
                  selectedResolution === 'use_local' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: selectedResolution === 'use_local' ? '#eff6ff' : 'white',
              }}
            >
              <input
                type="radio"
                name="resolution"
                value="use_local"
                checked={selectedResolution === 'use_local'}
                onChange={e => setSelectedResolution(e.target.value as any)}
                style={{ margin: 0 }}
              />
              <User size={20} style={{ color: '#f59e0b' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                  Keep My Changes
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Overwrite the server version with your local changes
                </div>
              </div>
            </label>

            {/* Use Server */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                border:
                  selectedResolution === 'use_server' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: selectedResolution === 'use_server' ? '#eff6ff' : 'white',
              }}
            >
              <input
                type="radio"
                name="resolution"
                value="use_server"
                checked={selectedResolution === 'use_server'}
                onChange={e => setSelectedResolution(e.target.value as any)}
                style={{ margin: 0 }}
              />
              <Server size={20} style={{ color: '#3b82f6' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                  Use Server Version
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Discard your changes and use the server version (recommended)
                </div>
              </div>
            </label>

            {/* Merge */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                border: selectedResolution === 'merge' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: selectedResolution === 'merge' ? '#eff6ff' : 'white',
              }}
            >
              <input
                type="radio"
                name="resolution"
                value="merge"
                checked={selectedResolution === 'merge'}
                onChange={e => setSelectedResolution(e.target.value as any)}
                style={{ margin: 0 }}
              />
              <GitMerge size={20} style={{ color: '#10b981' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                  Merge Changes
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Manually combine both versions (advanced)
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Merge Options (if merge is selected) */}
        {selectedResolution === 'merge' && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={() => setShowAdvanced(false)}
                style={{
                  padding: '8px 16px',
                  border: showAdvanced ? '1px solid #d1d5db' : 'none',
                  borderRadius: '6px',
                  background: showAdvanced ? 'white' : '#3b82f6',
                  color: showAdvanced ? '#374151' : 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Field-by-Field
              </button>
              <button
                onClick={() => setShowAdvanced(true)}
                style={{
                  padding: '8px 16px',
                  border: !showAdvanced ? '1px solid #d1d5db' : 'none',
                  borderRadius: '6px',
                  background: !showAdvanced ? 'white' : '#3b82f6',
                  color: !showAdvanced ? '#374151' : 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                JSON Editor
              </button>
            </div>

            {showAdvanced ? (
              <div>
                <h4
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#1f2937',
                  }}
                >
                  Merged Data (JSON)
                </h4>
                <textarea
                  value={JSON.stringify(mergedData, null, 2)}
                  onChange={e => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setMergedData(parsed);
                      setIsJsonValid(true);
                    } catch (error) {
                      setIsJsonValid(false);
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '200px',
                    padding: '12px',
                    border: `2px solid ${isJsonValid ? '#e5e7eb' : '#ef4444'}`,
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                  }}
                />
                <div
                  style={{
                    fontSize: '12px',
                    color: isJsonValid ? '#6b7280' : '#ef4444',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {!isJsonValid && <AlertCircle size={12} />}
                  {isJsonValid
                    ? 'Edit the JSON above to create your merged version'
                    : 'Invalid JSON format. Please fix the syntax errors.'}
                </div>
              </div>
            ) : (
              renderFieldByFieldMerge()
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleResolve}
            disabled={selectedResolution === 'merge' && showAdvanced && !isJsonValid}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background:
                selectedResolution === 'merge' && showAdvanced && !isJsonValid
                  ? '#9ca3af'
                  : '#3b82f6',
              color: 'white',
              cursor:
                selectedResolution === 'merge' && showAdvanced && !isJsonValid
                  ? 'not-allowed'
                  : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Resolve Conflict
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictResolutionModal;
