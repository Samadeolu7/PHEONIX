import React, { useState, useEffect } from 'react';
import {
  EmailNotificationConfig,
  EmailRecipient,
  EmailNotificationStatus,
  NotificationPriority,
} from '../../types/procurementWorkflow';
import {
  useSendNotification,
  useNotificationStatus,
  useNotificationTemplates,
} from '../../hooks/useProcurement';
import { useToast } from '../../contexts/ToastContext';

interface NotificationManagerProps {
  entityType: 'requisition' | 'grn' | 'return';
  entityId: number;
  entityData?: any;
  trigger?: string;
  onNotificationSent?: (notificationId: string) => void;
  className?: string;
}

interface NotificationFormProps {
  entityType: string;
  entityData: any;
  templates: any[];
  onSend: (config: EmailNotificationConfig) => void;
  onCancel: () => void;
}

const NotificationForm: React.FC<NotificationFormProps> = ({
  entityType,
  entityData,
  templates,
  onSend,
  onCancel,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('normal');
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [customVariables, setCustomVariables] = useState<Record<string, any>>({});

  const addRecipient = () => {
    setRecipients([...recipients, { type: 'email', identifier: '', name: '' }]);
  };

  const updateRecipient = (index: number, field: keyof EmailRecipient, value: string) => {
    const updated = [...recipients];
    updated[index] = { ...updated[index], [field]: value };
    setRecipients(updated);
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const handleTemplateChange = (templateName: string) => {
    setSelectedTemplate(templateName);
    const template = templates.find(t => t.name === templateName);
    if (template) {
      setSubject(template.default_subject || '');
      // Pre-populate variables based on entity data
      const variables = {
        entity_type: entityType,
        entity_id: entityData?.id,
        entity_number: entityData?.pr_number || entityData?.grn_number || entityData?.return_number,
        requester_name: entityData?.requester?.first_name + ' ' + entityData?.requester?.last_name,
        department: entityData?.department?.name,
        total_amount: entityData?.total_amount || entityData?.total_estimated_cost,
        status: entityData?.status,
        created_date: entityData?.created_at
          ? new Date(entityData.created_at).toLocaleDateString()
          : '',
        ...customVariables,
      };
      setCustomVariables(variables);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate || recipients.length === 0) {
      return;
    }

    const config: EmailNotificationConfig = {
      template_name: selectedTemplate,
      recipients: recipients.filter(r => r.identifier.trim() !== ''),
      subject,
      variables: customVariables,
      priority,
      send_immediately: sendImmediately,
      scheduled_at: sendImmediately ? undefined : scheduledAt,
    };

    onSend(config);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">Send Notification</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notification Template
          </label>
          <select
            value={selectedTemplate}
            onChange={e => handleTemplateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a template...</option>
            {templates.map(template => (
              <option key={template.name} value={template.name}>
                {template.display_name || template.name}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Recipients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Recipients</label>
            <button
              type="button"
              onClick={addRecipient}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add Recipient
            </button>
          </div>
          <div className="space-y-2">
            {recipients.map((recipient, index) => (
              <div key={index} className="flex items-center space-x-2">
                <select
                  value={recipient.type}
                  onChange={e => updateRecipient(index, 'type', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="email">Email</option>
                  <option value="user">User</option>
                  <option value="role">Role</option>
                </select>
                <input
                  type="text"
                  placeholder={
                    recipient.type === 'email'
                      ? 'email@example.com'
                      : recipient.type === 'user'
                        ? 'User ID'
                        : 'Role Name'
                  }
                  value={recipient.identifier}
                  onChange={e => updateRecipient(index, 'identifier', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Display Name (optional)"
                  value={recipient.name || ''}
                  onChange={e => updateRecipient(index, 'name', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeRecipient(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Priority and Scheduling */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as NotificationPriority)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={sendImmediately}
                  onChange={() => setSendImmediately(true)}
                  className="mr-2"
                />
                Send Immediately
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!sendImmediately}
                  onChange={() => setSendImmediately(false)}
                  className="mr-2"
                />
                Schedule for Later
              </label>
              {!sendImmediately && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
          >
            Send Notification
          </button>
        </div>
      </form>
    </div>
  );
};

const NotificationManager: React.FC<NotificationManagerProps> = ({
  entityType,
  entityId,
  entityData,
  trigger,
  onNotificationSent,
  className = '',
}) => {
  const [showForm, setShowForm] = useState(false);
  const [sentNotifications, setSentNotifications] = useState<string[]>([]);

  const { data: templates = [] } = useNotificationTemplates(entityType);
  const sendNotificationMutation = useSendNotification();
  const { success, error } = useToast();

  // Auto-trigger notifications based on trigger prop
  useEffect(() => {
    if (trigger && entityData && templates.length > 0) {
      const triggerTemplate = templates.find(t => t.triggers?.includes(trigger));
      if (triggerTemplate) {
        handleAutoNotification(triggerTemplate);
      }
    }
  }, [trigger, entityData, templates]);

  const handleAutoNotification = async (template: any) => {
    try {
      const config: EmailNotificationConfig = {
        template_name: template.name,
        recipients: template.default_recipients || [],
        subject: template.default_subject || `${entityType} Update`,
        variables: {
          entity_type: entityType,
          entity_id: entityId,
          entity_number:
            entityData?.pr_number || entityData?.grn_number || entityData?.return_number,
          trigger: trigger,
          ...entityData,
        },
        priority: template.default_priority || 'normal',
        send_immediately: true,
      };

      const result = await sendNotificationMutation.mutateAsync(config);
      setSentNotifications(prev => [...prev, result.id]);
      onNotificationSent?.(result.id);

      success(`Notification sent successfully`);
    } catch (err) {
      error(`Failed to send automatic notification: ${err}`);
    }
  };

  const handleManualSend = async (config: EmailNotificationConfig) => {
    try {
      const result = await sendNotificationMutation.mutateAsync(config);
      setSentNotifications(prev => [...prev, result.id]);
      setShowForm(false);
      onNotificationSent?.(result.id);

      success(`Notification sent successfully to ${config.recipients.length} recipient(s)`);
    } catch (err) {
      error(`Failed to send notification: ${err}`);
    }
  };

  if (showForm) {
    return (
      <div className={className}>
        <NotificationForm
          entityType={entityType}
          entityData={entityData}
          templates={templates}
          onSend={handleManualSend}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
        >
          Send Notification
        </button>
      </div>

      {/* Sent Notifications List */}
      {sentNotifications.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Recent Notifications</h4>
          {sentNotifications.map(notificationId => (
            <NotificationStatusCard key={notificationId} notificationId={notificationId} />
          ))}
        </div>
      )}

      {sentNotifications.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No notifications sent yet</p>
      )}
    </div>
  );
};

interface NotificationStatusCardProps {
  notificationId: string;
}

const NotificationStatusCard: React.FC<NotificationStatusCardProps> = ({ notificationId }) => {
  const { data: status, isLoading } = useNotificationStatus(notificationId);

  if (isLoading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded p-3">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  if (!status) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'text-green-600 bg-green-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="border border-gray-200 rounded p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{status.config.subject}</p>
          <p className="text-xs text-gray-500">
            To: {status.config.recipients.length} recipient(s)
          </p>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status.status)}`}
        >
          {status.status.toUpperCase()}
        </span>
      </div>

      {status.sent_at && (
        <p className="text-xs text-gray-500 mt-2">
          Sent: {new Date(status.sent_at).toLocaleString()}
        </p>
      )}

      {status.error_message && <p className="text-xs text-red-600 mt-2">{status.error_message}</p>}
    </div>
  );
};

export default NotificationManager;
