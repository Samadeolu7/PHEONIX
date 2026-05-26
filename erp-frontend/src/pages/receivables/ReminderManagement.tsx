// src/pages/receivables/ReminderManagement.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receivablesService, CustomerReceivable } from '../../services/receivablesService';
import { useToast } from '../../hooks/useToast';
import {
  Mail,
  Clock,
  Settings,
  Send,
  History,
  Plus,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  Calendar,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Filter,
  Search,
  Download,
  Play,
  Pause,
  Save,
  X,
} from 'lucide-react';

interface ReminderTemplate {
  id: number;
  name: string;
  subject: string;
  message: string;
  reminder_type:
    | 'first_reminder'
    | 'second_reminder'
    | 'final_notice'
    | 'collection_notice'
    | 'custom';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ReminderSettings {
  id: number;
  name: string;
  description: string;
  trigger_days: number;
  aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+' | 'all';
  template: ReminderTemplate;
  is_active: boolean;
  send_method: 'email' | 'sms' | 'both';
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
  max_reminders: number;
  created_at: string;
  updated_at: string;
}

interface ReminderHistory {
  id: number;
  receivable: {
    id: number;
    reference_number: string;
    client_name: string;
    balance: string;
  };
  template: ReminderTemplate;
  sent_at: string;
  sent_to: string;
  status: 'sent' | 'failed' | 'bounced' | 'opened' | 'clicked';
  error_message?: string;
  sent_by: {
    id: number;
    full_name: string;
  };
}

interface ReminderFilters {
  aging_bucket?: string;
  status?: string;
  template?: number;
  sent_date_from?: string;
  sent_date_to?: string;
  search?: string;
}

const ReminderManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'settings' | 'templates' | 'history' | 'send'>(
    'settings'
  );
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings[]>([]);
  const [reminderTemplates, setReminderTemplates] = useState<ReminderTemplate[]>([]);
  const [reminderHistory, setReminderHistory] = useState<ReminderHistory[]>([]);
  const [overdueReceivables, setOverdueReceivables] = useState<CustomerReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReminderFilters>({});

  // Form states
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [editingSettings, setEditingSettings] = useState<ReminderSettings | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [selectedReceivables, setSelectedReceivables] = useState<number[]>([]);

  const navigate = useNavigate();
  const { error: showError, success: showSuccess } = useToast();

  useEffect(() => {
    loadReminderData();
  }, [activeTab, filters]);

  const loadReminderData = async () => {
    try {
      setLoading(true);

      // TODO: Replace with real API calls when endpoints are available
      // For now, we'll show a message that these features need API implementation
      if (activeTab === 'settings') {
        // await loadReminderSettings();
        setReminderSettings([]);
      } else if (activeTab === 'templates') {
        // await loadReminderTemplates();
        setReminderTemplates([]);
      } else if (activeTab === 'history') {
        // await loadReminderHistory();
        setReminderHistory([]);
      }

      if (activeTab === 'send') {
        await loadOverdueReceivables();
      }
    } catch (error) {
      console.error('Error loading reminder data:', error);
      showError('Failed to load reminder data');
    } finally {
      setLoading(false);
    }
  };

  // TODO: Implement these API calls when backend endpoints are available
  const loadReminderSettings = async () => {
    // const response = await api.get('/api/reminders/settings/');
    // setReminderSettings(response.data);
  };

  const loadReminderTemplates = async () => {
    // const response = await api.get('/api/reminders/templates/');
    // setReminderTemplates(response.data);
  };

  const loadReminderHistory = async () => {
    // const response = await api.get('/api/reminders/history/', { params: filters });
    // setReminderHistory(response.data.results || []);
  };

  const loadOverdueReceivables = async () => {
    try {
      const response = await receivablesService.getReceivables({
        status: 'overdue',
        ordering: '-days_overdue,-balance',
      });
      setOverdueReceivables(response.results || []);
    } catch (error) {
      console.error('Error loading overdue receivables:', error);
      setOverdueReceivables([]);
    }
  };

  const handleSendReminder = async (receivableId: number, templateId: number) => {
    try {
      const template = reminderTemplates.find(t => t.id === templateId);
      if (!template) {
        showError('Template not found');
        return;
      }

      await receivablesService.sendReminder(receivableId, {
        reminder_type: 'email',
        template: template.reminder_type,
        custom_message: template.message,
      });

      showSuccess('Reminder sent successfully');
      loadReminderData();
    } catch (error) {
      console.error('Error sending reminder:', error);
      showError('Failed to send reminder');
    }
  };

  const handleBulkSendReminders = async () => {
    if (selectedReceivables.length === 0) {
      showError('Please select receivables to send reminders');
      return;
    }

    try {
      const promises = selectedReceivables.map(receivableId =>
        receivablesService.sendReminder(receivableId, {
          reminder_type: 'email',
          template: 'collection_reminder',
          custom_message:
            'This is a reminder regarding your outstanding balance. Please contact us to arrange payment.',
        })
      );

      await Promise.all(promises);
      showSuccess(`Sent ${selectedReceivables.length} reminders successfully`);
      setSelectedReceivables([]);
      loadReminderData();
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      showError('Failed to send some reminders');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'opened':
        return 'bg-green-100 text-green-800';
      case 'clicked':
        return 'bg-purple-100 text-purple-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'bounced':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const renderSettingsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Automated Reminder Settings</h3>
          <p className="text-gray-600">Configure when and how reminders are automatically sent</p>
        </div>
        <button
          onClick={() => setShowSettingsForm(true)}
          disabled={true}
          className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Add Setting
        </button>
      </div>

      {reminderSettings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">API Implementation Required</h3>
          <p className="text-gray-600 mb-4">
            Reminder settings functionality requires the following API endpoints to be implemented:
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-sm font-mono text-gray-700 mb-2">GET /api/reminders/settings/</p>
            <p className="text-sm font-mono text-gray-700 mb-2">POST /api/reminders/settings/</p>
            <p className="text-sm font-mono text-gray-700 mb-2">
              PUT /api/reminders/settings/&#123;id&#125;/
            </p>
            <p className="text-sm font-mono text-gray-700">
              DELETE /api/reminders/settings/&#123;id&#125;/
            </p>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Contact your backend developer to implement these endpoints.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reminderSettings.map(setting => (
            <div key={setting.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-lg font-medium text-gray-900">{setting.name}</h4>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        setting.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {setting.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-4">{setting.description}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Trigger:</span>
                      <p className="font-medium">{setting.trigger_days} days overdue</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Aging Bucket:</span>
                      <p className="font-medium">{setting.aging_bucket}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Method:</span>
                      <p className="font-medium capitalize">{setting.send_method}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Frequency:</span>
                      <p className="font-medium capitalize">{setting.frequency}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => {
                      setEditingSettings(setting);
                      setShowSettingsForm(true);
                    }}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Reminder Templates</h3>
          <p className="text-gray-600">Manage email templates for different reminder types</p>
        </div>
        <button
          onClick={() => setShowTemplateForm(true)}
          disabled={true}
          className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Add Template
        </button>
      </div>

      {reminderTemplates.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">API Implementation Required</h3>
          <p className="text-gray-600 mb-4">
            Reminder templates functionality requires the following API endpoints to be implemented:
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-sm font-mono text-gray-700 mb-2">GET /api/reminders/templates/</p>
            <p className="text-sm font-mono text-gray-700 mb-2">POST /api/reminders/templates/</p>
            <p className="text-sm font-mono text-gray-700 mb-2">
              PUT /api/reminders/templates/&#123;id&#125;/
            </p>
            <p className="text-sm font-mono text-gray-700">
              DELETE /api/reminders/templates/&#123;id&#125;/
            </p>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Contact your backend developer to implement these endpoints.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reminderTemplates.map(template => (
            <div key={template.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-lg font-medium text-gray-900">{template.name}</h4>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        template.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {template.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                      {template.reminder_type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-1">Subject:</p>
                    <p className="font-medium text-gray-900">{template.subject}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500 mb-1">Message Preview:</p>
                    <p className="text-gray-700 text-sm line-clamp-3">{template.message}</p>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingTemplate(template);
                      setShowTemplateForm(true);
                    }}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Reminder History</h3>
          <p className="text-gray-600">Track all sent reminders and their delivery status</p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={true}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 border border-gray-300 rounded-lg cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => loadReminderData()}
            disabled={true}
            className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {reminderHistory.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">API Implementation Required</h3>
          <p className="text-gray-600 mb-4">
            Reminder history functionality requires the following API endpoints to be implemented:
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
            <p className="text-sm font-mono text-gray-700 mb-2">GET /api/reminders/history/</p>
            <p className="text-sm font-mono text-gray-700 mb-2">
              GET /api/reminders/history/&#123;id&#125;/
            </p>
            <p className="text-sm font-mono text-gray-700">GET /api/reminders/statistics/</p>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Contact your backend developer to implement these endpoints.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by client or invoice..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={filters.search || ''}
                  onChange={e => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <select
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filters.status || ''}
                onChange={e => setFilters({ ...filters, status: e.target.value || undefined })}
              >
                <option value="">All Status</option>
                <option value="sent">Sent</option>
                <option value="opened">Opened</option>
                <option value="clicked">Clicked</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
              </select>
              <input
                type="date"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filters.sent_date_from || ''}
                onChange={e =>
                  setFilters({ ...filters, sent_date_from: e.target.value || undefined })
                }
              />
              <input
                type="date"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filters.sent_date_to || ''}
                onChange={e =>
                  setFilters({ ...filters, sent_date_to: e.target.value || undefined })
                }
              />
            </div>
          </div>

          {/* History Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Receivable
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent By
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reminderHistory.map(history => (
                    <tr key={history.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="font-medium text-gray-900">
                            {history.receivable.client_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {history.receivable.reference_number}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatCurrency(parseFloat(history.receivable.balance))}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-medium text-gray-900">{history.template.name}</p>
                        <p className="text-sm text-gray-500 capitalize">
                          {history.template.reminder_type.replace('_', ' ')}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-gray-900">{history.sent_to}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-gray-900">{formatDateTime(history.sent_at)}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(history.status)}`}
                        >
                          {history.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-gray-900">{history.sent_by.full_name}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderSendTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Manual Reminder Sending</h3>
          <p className="text-gray-600">Send reminders manually to selected overdue receivables</p>
        </div>
        <div className="flex gap-2">
          {selectedReceivables.length > 0 && (
            <button
              onClick={handleBulkSendReminders}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              <Send className="h-4 w-4" />
              Send {selectedReceivables.length} Reminders
            </button>
          )}
          <button
            onClick={() => loadOverdueReceivables()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Overdue Receivables */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Overdue Receivables</h4>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  selectedReceivables.length === overdueReceivables.length &&
                  overdueReceivables.length > 0
                }
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedReceivables(overdueReceivables.map(r => r.id));
                  } else {
                    setSelectedReceivables([]);
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">Select All</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedReceivables.length === overdueReceivables.length &&
                      overdueReceivables.length > 0
                    }
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedReceivables(overdueReceivables.map(r => r.id));
                      } else {
                        setSelectedReceivables([]);
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Overdue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Reminder
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {overdueReceivables.map(receivable => (
                <tr key={receivable.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedReceivables.includes(receivable.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedReceivables([...selectedReceivables, receivable.id]);
                        } else {
                          setSelectedReceivables(
                            selectedReceivables.filter(id => id !== receivable.id)
                          );
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">{receivable.client_name}</p>
                      <p className="text-sm text-gray-500">{receivable.reference_number}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-medium text-red-600">
                      {formatCurrency(parseFloat(receivable.balance))}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        receivable.days_overdue > 90
                          ? 'bg-red-100 text-red-800'
                          : receivable.days_overdue > 60
                            ? 'bg-orange-100 text-orange-800'
                            : receivable.days_overdue > 30
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {receivable.days_overdue} days
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {receivable.last_reminder_sent ? (
                      <p className="text-sm text-gray-900">
                        {formatDate(receivable.last_reminder_sent)}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Never</p>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSendReminder(receivable.id, 1)}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                      >
                        <Send className="h-3 w-3" />
                        Send
                      </button>
                      <button
                        onClick={() => navigate(`/receivables/${receivable.id}/view`)}
                        className="flex items-center gap-1 px-3 py-1 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"
          data-testid="loading-spinner"
        ></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reminder Management</h1>
              <p className="text-gray-600">
                Configure automated reminders and manage reminder templates
              </p>
            </div>
            <button
              onClick={() => navigate('/receivables')}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Receivables
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <nav className="flex space-x-8">
            {[
              { key: 'settings', label: 'Settings', icon: Settings },
              { key: 'templates', label: 'Templates', icon: MessageSquare },
              { key: 'history', label: 'History', icon: History },
              { key: 'send', label: 'Send Reminders', icon: Send },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'settings' && renderSettingsTab()}
        {activeTab === 'templates' && renderTemplatesTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'send' && renderSendTab()}
      </div>
    </div>
  );
};

export default ReminderManagement;
