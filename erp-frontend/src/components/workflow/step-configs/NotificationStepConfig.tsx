import React, { useState } from 'react';
import { Variable } from '../../../types/workflow';

interface NotificationStepConfigProps {
  config: any;
  variables: Variable[];
  onChange: (config: any) => void;
}

const NotificationStepConfig: React.FC<NotificationStepConfigProps> = ({
  config,
  variables,
  onChange,
}) => {
  const [type, setType] = useState(config.type || 'email');
  const [recipient, setRecipient] = useState(config.recipient || '');
  const [message, setMessage] = useState(config.message || '');

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setType(value);
    onChange({ type: value, recipient, message });
  };

  const handleRecipientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setRecipient(value);
    onChange({ type, recipient: value, message });
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    onChange({ type, recipient, message: value });
  };

  const recipientVariables = variables.filter(
    v =>
      v.name.toLowerCase().includes('email') ||
      v.name.toLowerCase().includes('user') ||
      v.name.toLowerCase().includes('phone')
  );

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
          Notification Type
        </label>
        <select
          value={type}
          onChange={handleTypeChange}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Notification type"
        >
          <option value="email">📧 Email</option>
          <option value="sms">📱 SMS</option>
          <option value="in_app">🔔 In-App</option>
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
          Recipient
        </label>
        <select
          value={recipient}
          onChange={handleRecipientChange}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Recipient"
        >
          <option value="">Select recipient...</option>
          {recipientVariables.map(v => (
            <option key={v.id} value={v.path}>
              {v.name}
            </option>
          ))}
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
          Message Template
        </label>
        <textarea
          value={message}
          onChange={handleMessageChange}
          placeholder="Your transaction of ${amount} was successful"
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
          aria-label="Message template"
        />
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
          Use ${`{variable_path}`} to insert variables
        </div>
      </div>
    </div>
  );
};

export default NotificationStepConfig;
