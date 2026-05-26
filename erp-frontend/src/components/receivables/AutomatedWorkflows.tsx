// src/components/receivables/AutomatedWorkflows.tsx
import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  receivablesWorkflowService,
  CollectionStage,
  EscalationRule,
  WorkflowTrigger,
  CollectionWorkflowRun,
} from '../../services/receivablesWorkflowService';

interface AutomatedWorkflowsProps {
  className?: string;
}

export const AutomatedWorkflows: React.FC<AutomatedWorkflowsProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<'stages' | 'rules' | 'triggers' | 'runs'>('stages');
  const [collectionStages, setCollectionStages] = useState<CollectionStage[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([]);
  const [workflowTriggers, setWorkflowTriggers] = useState<WorkflowTrigger[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<CollectionWorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      switch (activeTab) {
        case 'stages':
          const stages = await receivablesWorkflowService.getCollectionStages();
          setCollectionStages(stages);
          break;
        case 'rules':
          const rules = await receivablesWorkflowService.getEscalationRules();
          setEscalationRules(rules);
          break;
        case 'triggers':
          const triggers = await receivablesWorkflowService.getWorkflowTriggers();
          setWorkflowTriggers(triggers);
          break;
        case 'runs':
          const runs = await receivablesWorkflowService.getCollectionWorkflowRuns();
          setWorkflowRuns(runs);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerAgingWorkflows = async () => {
    try {
      setLoading(true);
      const result = await receivablesWorkflowService.triggerAgingWorkflows();
      alert(`Triggered ${result.triggered_count} workflows successfully`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger workflows');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessOverdue = async () => {
    try {
      setLoading(true);
      const result = await receivablesWorkflowService.processOverdueReceivables();
      alert(`Processed ${result.processed_count} overdue receivables`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process overdue receivables');
    } finally {
      setLoading(false);
    }
  };

  const renderCollectionStages = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Collection Stages</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Stage
        </button>
      </div>

      <div className="grid gap-4">
        {collectionStages.map((stage, index) => (
          <div key={stage.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">{stage.name}</h4>
                <p className="text-sm text-gray-600">
                  Threshold: {stage.days_overdue_threshold} days overdue
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    stage.auto_progress
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {stage.auto_progress ? 'Auto' : 'Manual'}
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                  Level {stage.escalation_level}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-700">Actions:</h5>
              {stage.actions.map(action => (
                <div
                  key={action.id}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded"
                >
                  <span className="text-sm">{action.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        action.auto_execute
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {action.auto_execute ? 'Auto' : 'Manual'}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">{action.type}</span>
                  </div>
                </div>
              ))}
            </div>

            {index < collectionStages.length - 1 && (
              <div className="flex justify-center mt-4">
                <div className="w-px h-6 bg-gray-300"></div>
                <TrendingUp className="w-4 h-4 text-gray-400 -mt-2" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderEscalationRules = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Escalation Rules</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      <div className="grid gap-4">
        {escalationRules.map(rule => (
          <div key={rule.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">{rule.name}</h4>
                <div className="text-sm text-gray-600 mt-1">
                  <div>Triggers when:</div>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    {rule.trigger_conditions.days_overdue && (
                      <li>Days overdue ≥ {rule.trigger_conditions.days_overdue}</li>
                    )}
                    {rule.trigger_conditions.amount_threshold && (
                      <li>Amount ≥ ${rule.trigger_conditions.amount_threshold}</li>
                    )}
                    {rule.trigger_conditions.aging_bucket && (
                      <li>Aging bucket: {rule.trigger_conditions.aging_bucket}</li>
                    )}
                    {rule.trigger_conditions.failed_contact_attempts && (
                      <li>Failed contacts ≥ {rule.trigger_conditions.failed_contact_attempts}</li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    rule.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {rule.is_active ? 'Active' : 'Inactive'}
                </span>
                <button className="text-gray-400 hover:text-gray-600">
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-700">Actions:</h5>
              {rule.actions.map(action => (
                <div
                  key={action.id}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded"
                >
                  <span className="text-sm">{action.name}</span>
                  <span className="text-xs text-gray-500 capitalize">{action.type}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderWorkflowTriggers = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Workflow Triggers</h3>
        <div className="flex gap-2">
          <button
            onClick={handleTriggerAgingWorkflows}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Trigger Aging Workflows
          </button>
          <button
            onClick={handleProcessOverdue}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Process Overdue
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Trigger
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {workflowTriggers.map(trigger => (
          <div key={trigger.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">{trigger.name}</h4>
                <p className="text-sm text-gray-600 capitalize">
                  Event: {trigger.event_type.replace('_', ' ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    trigger.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {trigger.is_active ? 'Active' : 'Inactive'}
                </span>
                <button className="text-gray-400 hover:text-gray-600">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-3 rounded">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Conditions:</h5>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {JSON.stringify(trigger.conditions, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderWorkflowRuns = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Active Workflow Runs</h3>
        <button
          onClick={loadData}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4">
        {workflowRuns.map(run => (
          <div key={run.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">Receivable #{run.receivable_id}</h4>
                <p className="text-sm text-gray-600">Current Stage: {run.current_stage}</p>
                <p className="text-sm text-gray-500">
                  Started: {new Date(run.started_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    run.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : run.status === 'completed'
                        ? 'bg-blue-100 text-blue-800'
                        : run.status === 'paused'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                  }`}
                >
                  {run.status}
                </span>
                {run.status === 'active' && (
                  <button className="text-yellow-600 hover:text-yellow-700">
                    <Pause className="w-4 h-4" />
                  </button>
                )}
                {run.status === 'paused' && (
                  <button className="text-green-600 hover:text-green-700">
                    <Play className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {run.next_action_date && (
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <Clock className="w-4 h-4" />
                Next action: {new Date(run.next_action_date).toLocaleDateString()}
              </div>
            )}

            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-700">Recent Activity:</h5>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {run.execution_log.slice(-3).map((log, index) => (
                  <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                    <div className="flex justify-between">
                      <span className="font-medium">{log.action}</span>
                      <span className="text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-600">{log.result}</div>
                    {log.notes && <div className="text-gray-500 italic">{log.notes}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {workflowRuns.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">No active workflow runs found</div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading workflows...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">Automated Workflows</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage collection stages, escalation rules, and workflow automation
          </p>
        </div>

        <div className="px-6">
          <nav className="flex space-x-8">
            {[
              { key: 'stages', label: 'Collection Stages', icon: TrendingUp },
              { key: 'rules', label: 'Escalation Rules', icon: AlertTriangle },
              { key: 'triggers', label: 'Workflow Triggers', icon: Settings },
              { key: 'runs', label: 'Active Runs', icon: Play },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stages' && renderCollectionStages()}
        {activeTab === 'rules' && renderEscalationRules()}
        {activeTab === 'triggers' && renderWorkflowTriggers()}
        {activeTab === 'runs' && renderWorkflowRuns()}
      </div>
    </div>
  );
};

export default AutomatedWorkflows;
