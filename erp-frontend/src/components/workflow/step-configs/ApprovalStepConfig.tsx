import React, { useState } from 'react';
import { AlertCircle, Clock, User, Users, Database } from 'lucide-react';
import { Variable } from '../../../types/workflow';

interface ApprovalStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

const ApprovalStepConfig: React.FC<ApprovalStepConfigProps> = ({ config, variables, onChange }) => {
  const [approverType, setApproverType] = useState(config.approver_type || 'user');
  const [approverId, setApproverId] = useState(config.approver_id || '');
  const [approverRole, setApproverRole] = useState(config.approver_role || '');
  const [approverField, setApproverField] = useState(config.approver_field || '');
  const [message, setMessage] = useState(config.approval_message || '');
  const [timeoutHours, setTimeoutHours] = useState(config.timeout_hours || 24);
  const [channels, setChannels] = useState<string[]>(
    config.notification_channels || ['email', 'in_app']
  );

  const handleUpdate = (updates: any) => {
    const newConfig = {
      approver_type: approverType,
      approver_id: approverId,
      approver_role: approverRole,
      approver_field: approverField,
      approval_message: message,
      timeout_hours: timeoutHours,
      notification_channels: channels,
      ...updates,
    };
    onChange(newConfig);
  };

  const handleApproverTypeChange = (type: string) => {
    setApproverType(type);
    handleUpdate({ approver_type: type });
  };

  const handleChannelToggle = (channel: string) => {
    const newChannels = channels.includes(channel)
      ? channels.filter(c => c !== channel)
      : [...channels, channel];
    setChannels(newChannels);
    handleUpdate({ notification_channels: newChannels });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Info Banner */}
      <div
        style={{
          padding: '0.75rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '0.375rem',
          fontSize: '0.75rem',
          color: '#1e40af',
          display: 'flex',
          alignItems: 'start',
          gap: '0.5rem',
        }}
      >
        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
        <div>
          <strong>Approval Step:</strong> Workflow will pause until approved or rejected. The
          approver will be notified via selected channels.
        </div>
      </div>

      {/* Approver Selection */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Who Should Approve?
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Specific User */}
          <button
            onClick={() => handleApproverTypeChange('user')}
            style={{
              padding: '0.75rem',
              border: `2px solid ${approverType === 'user' ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '0.375rem',
              background: approverType === 'user' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
            type="button"
          >
            <User size={20} color={approverType === 'user' ? '#3b82f6' : '#6b7280'} />
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>Specific User</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Always same person approves
              </div>
            </div>
          </button>

          {approverType === 'user' && (
            <div style={{ marginLeft: '2.5rem', marginTop: '0.25rem' }}>
              <input
                type="number"
                value={approverId}
                onChange={e => {
                  setApproverId(e.target.value);
                  handleUpdate({ approver_id: e.target.value });
                }}
                placeholder="User ID"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.875rem',
                }}
              />
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Enter the user ID of the approver
              </div>
            </div>
          )}

          {/* Role-based */}
          <button
            onClick={() => handleApproverTypeChange('role')}
            style={{
              padding: '0.75rem',
              border: `2px solid ${approverType === 'role' ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '0.375rem',
              background: approverType === 'role' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
            type="button"
          >
            <Users size={20} color={approverType === 'role' ? '#3b82f6' : '#6b7280'} />
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>By Role</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>User with specific role</div>
            </div>
          </button>

          {approverType === 'role' && (
            <div style={{ marginLeft: '2.5rem', marginTop: '0.25rem' }}>
              <select
                value={approverRole}
                onChange={e => {
                  setApproverRole(e.target.value);
                  handleUpdate({ approver_role: e.target.value });
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Select role...</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}

          {/* Dynamic (from form) */}
          <button
            onClick={() => handleApproverTypeChange('dynamic')}
            style={{
              padding: '0.75rem',
              border: `2px solid ${approverType === 'dynamic' ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '0.375rem',
              background: approverType === 'dynamic' ? '#eff6ff' : 'white',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
            type="button"
          >
            <Database size={20} color={approverType === 'dynamic' ? '#3b82f6' : '#6b7280'} />
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>Dynamic (from data)</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Approver specified in form
              </div>
            </div>
          </button>

          {approverType === 'dynamic' && (
            <div style={{ marginLeft: '2.5rem', marginTop: '0.25rem' }}>
              <select
                value={approverField}
                onChange={e => {
                  setApproverField(e.target.value);
                  handleUpdate({ approver_field: e.target.value });
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Select field...</option>
                {variables
                  .filter(
                    v =>
                      v.name.toLowerCase().includes('manager') ||
                      v.name.toLowerCase().includes('approver')
                  )
                  .map(v => (
                    <option key={v.id} value={v.path}>
                      {v.name}
                    </option>
                  ))}
              </select>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Field containing approver's user ID
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approval Message */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Approval Message
        </label>
        <textarea
          value={message}
          onChange={e => {
            setMessage(e.target.value);
            handleUpdate({ approval_message: e.target.value });
          }}
          placeholder="This transaction requires your approval..."
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        />
      </div>

      {/* Timeout */}
      <div>
        <label
          style={{
            display: 'flex',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Clock size={16} />
          Timeout (hours)
        </label>
        <input
          type="number"
          value={timeoutHours}
          onChange={e => {
            setTimeoutHours(Number(e.target.value));
            handleUpdate({ timeout_hours: Number(e.target.value) });
          }}
          min="1"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        />
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
          Approval request will timeout after this many hours
        </div>
      </div>

      {/* Notification Channels */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
          }}
        >
          Notification Channels
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { value: 'email', label: '📧 Email' },
            { value: 'in_app', label: '🔔 In-App' },
            { value: 'sms', label: '📱 SMS' },
          ].map(channel => (
            <label
              key={channel.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                background: channels.includes(channel.value) ? '#f0fdf4' : 'white',
              }}
            >
              <input
                type="checkbox"
                checked={channels.includes(channel.value)}
                onChange={() => handleChannelToggle(channel.value)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.875rem' }}>{channel.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ApprovalStepConfig;
