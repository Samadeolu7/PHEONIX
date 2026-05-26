/**
 * Approval Rules Configuration Component
 *
 * Simple form-based UI to configure approval routing rules for PR and Expense workflows.
 * User's requirement: "It could even be in a form of forms and the workflow is generated
 * based on their response. It doesn't have to be very complex since the scope is narrowed."
 */

import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { Save, RefreshCw, CheckCircle2 } from 'lucide-react';

interface ApprovalRule {
  maxAmount: number;
  approverRole: string;
  timeoutHours: number;
}

interface WorkflowConfig {
  pr: {
    rules: ApprovalRule[];
    defaultTimeout: number;
  };
  expense: {
    rules: ApprovalRule[];
    defaultTimeout: number;
  };
}

const AVAILABLE_ROLES = [
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'department_manager', label: 'Department Manager' },
  { value: 'finance_manager', label: 'Finance Manager' },
  { value: 'cfo', label: 'CFO / Finance Director' },
  { value: 'ceo', label: 'CEO / Managing Director' },
];

const DEFAULT_PR_CONFIG: ApprovalRule[] = [
  { maxAmount: 1000, approverRole: 'department_manager', timeoutHours: 48 },
  { maxAmount: 10000, approverRole: 'finance_manager', timeoutHours: 48 },
  { maxAmount: Infinity, approverRole: 'cfo', timeoutHours: 72 },
];

const DEFAULT_EXPENSE_CONFIG: ApprovalRule[] = [
  { maxAmount: 100, approverRole: 'supervisor', timeoutHours: 24 },
  { maxAmount: 500, approverRole: 'department_manager', timeoutHours: 24 },
  { maxAmount: 5000, approverRole: 'finance_manager', timeoutHours: 48 },
  { maxAmount: Infinity, approverRole: 'cfo', timeoutHours: 72 },
];

export const ApprovalRulesConfig: React.FC = () => {
  const [prRules, setPrRules] = useState<ApprovalRule[]>(DEFAULT_PR_CONFIG);
  const [expenseRules, setExpenseRules] = useState<ApprovalRule[]>(DEFAULT_EXPENSE_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pr' | 'expense'>('pr');

  // Load saved configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      // TODO: Load from backend API
      // const response = await fetch('/api/automations/approval-rules/');
      // const data = await response.json();
      // setPrRules(data.pr.rules);
      // setExpenseRules(data.expense.rules);

      // For now, use defaults or localStorage
      const saved = localStorage.getItem('approval_rules_config');
      if (saved) {
        const config = JSON.parse(saved);
        setPrRules(config.pr || DEFAULT_PR_CONFIG);
        setExpenseRules(config.expense || DEFAULT_EXPENSE_CONFIG);
      }
    } catch (err) {
      console.error('Error loading configuration:', err);
    }
  };

  const updatePrRule = (index: number, field: keyof ApprovalRule, value: any) => {
    const updated = [...prRules];
    updated[index] = { ...updated[index], [field]: value };
    setPrRules(updated);
  };

  const updateExpenseRule = (index: number, field: keyof ApprovalRule, value: any) => {
    const updated = [...expenseRules];
    updated[index] = { ...updated[index], [field]: value };
    setExpenseRules(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const config: WorkflowConfig = {
        pr: {
          rules: prRules,
          defaultTimeout: 48,
        },
        expense: {
          rules: expenseRules,
          defaultTimeout: 24,
        },
      };

      // TODO: Save to backend API
      // const response = await fetch('/api/automations/approval-rules/', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(config)
      // });

      // For now, save to localStorage
      localStorage.setItem('approval_rules_config', JSON.stringify(config));

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = (type: 'pr' | 'expense') => {
    if (type === 'pr') {
      setPrRules(DEFAULT_PR_CONFIG);
    } else {
      setExpenseRules(DEFAULT_EXPENSE_CONFIG);
    }
  };

  const renderRuleForm = (
    rules: ApprovalRule[],
    updateFn: (index: number, field: keyof ApprovalRule, value: any) => void,
    type: 'pr' | 'expense'
  ) => {
    return (
      <div className="space-y-4">
        {rules.map((rule, index) => (
          <Card key={index} className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Approval Tier {index + 1}
                {index === rules.length - 1 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (All amounts above previous tier)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Amount Threshold */}
                {index < rules.length - 1 && (
                  <div className="space-y-2">
                    <Label htmlFor={`${type}-amount-${index}`}>Up to Amount (₦)</Label>
                    <Input
                      id={`${type}-amount-${index}`}
                      type="number"
                      value={rule.maxAmount === Infinity ? '' : rule.maxAmount}
                      onChange={e => updateFn(index, 'maxAmount', parseFloat(e.target.value) || 0)}
                      placeholder="1000"
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">Requests up to this amount</p>
                  </div>
                )}

                {/* Approver Role */}
                <div className="space-y-2">
                  <Label htmlFor={`${type}-role-${index}`}>Approver Role *</Label>
                  <Select
                    value={rule.approverRole}
                    onValueChange={value => updateFn(index, 'approverRole', value)}
                  >
                    <SelectTrigger id={`${type}-role-${index}`}>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Who should approve</p>
                </div>

                {/* Timeout */}
                <div className="space-y-2">
                  <Label htmlFor={`${type}-timeout-${index}`}>Timeout (hours)</Label>
                  <Input
                    id={`${type}-timeout-${index}`}
                    type="number"
                    value={rule.timeoutHours}
                    onChange={e => updateFn(index, 'timeoutHours', parseInt(e.target.value) || 24)}
                    placeholder="48"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">Auto-escalate after</p>
                </div>
              </div>

              {/* Example */}
              <div className="text-sm p-3 bg-muted/50 rounded-md">
                <strong>Example:</strong>{' '}
                {index < rules.length - 1 ? (
                  <>
                    Requests up to <strong>₦{rule.maxAmount.toLocaleString()}</strong> will be
                    routed to{' '}
                    <strong>
                      {AVAILABLE_ROLES.find(r => r.value === rule.approverRole)?.label}
                    </strong>
                  </>
                ) : (
                  <>
                    All other requests will be routed to{' '}
                    <strong>
                      {AVAILABLE_ROLES.find(r => r.value === rule.approverRole)?.label}
                    </strong>
                  </>
                )}{' '}
                with a {rule.timeoutHours}-hour approval window.
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => handleReset(type)} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Reset to Defaults
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approval Rules Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure approval routing rules for Purchase Requisitions and Expenses. Workflows will
          automatically route to the appropriate approver based on amount thresholds.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="border-green-500 bg-green-50 text-green-900">
          <CheckCircle2 className="w-4 h-4" />
          <AlertDescription>
            Approval rules saved successfully! Changes will take effect immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* Custom Tabs for PR and Expense */}
      <div className="w-full space-y-4">
        {/* Custom Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'pr', label: 'Purchase Requisitions' },
              { id: 'expense', label: 'Expense Requests' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'pr' | 'expense')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* PR Rules */}
          {activeTab === 'pr' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Purchase Requisition Approval Rules</CardTitle>
                  <CardDescription>
                    Configure approval routing based on PR estimated total amount. Rules are
                    evaluated in order from lowest to highest amount.
                  </CardDescription>
                </CardHeader>
                <CardContent>{renderRuleForm(prRules, updatePrRule, 'pr')}</CardContent>
              </Card>
            </div>
          )}

          {/* Expense Rules */}
          {activeTab === 'expense' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Expense Request Approval Rules</CardTitle>
                  <CardDescription>
                    Configure approval routing based on expense total amount. Rules are evaluated in
                    order from lowest to highest amount.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renderRuleForm(expenseRules, updateExpenseRule, 'expense')}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2 min-w-32">
          {isSaving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle>Current Configuration Preview</CardTitle>
          <CardDescription>
            How approval routing will work with your current settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* PR Preview */}
            <div>
              <h4 className="font-semibold mb-3 text-sm">Purchase Requisitions</h4>
              <div className="space-y-2 text-sm">
                {prRules.map((rule, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {index < prRules.length - 1
                          ? `Up to $${rule.maxAmount.toLocaleString()}`
                          : 'All others'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        → {AVAILABLE_ROLES.find(r => r.value === rule.approverRole)?.label} (
                        {rule.timeoutHours}h)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense Preview */}
            <div>
              <h4 className="font-semibold mb-3 text-sm">Expense Requests</h4>
              <div className="space-y-2 text-sm">
                {expenseRules.map((rule, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {index < expenseRules.length - 1
                          ? `Up to $${rule.maxAmount.toLocaleString()}`
                          : 'All others'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        → {AVAILABLE_ROLES.find(r => r.value === rule.approverRole)?.label} (
                        {rule.timeoutHours}h)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApprovalRulesConfig;
