# Procurement Workflow Frontend Integration Guide

## Overview

This guide shows frontend developers how to integrate with the **simplified** procurement workflow system that leverages the existing workflow infrastructure.

## Architecture Understanding

```
FormSchema → WorkflowBinding → WorkflowTemplate → WorkflowExecutor
     ↓              ↓                  ↓                ↓
   (UI Form)  (Configuration)   (Workflow Logic)  (Execution Engine)
```

### Key Concept: Configuration via Workflow Templates

Instead of complex config screens, users configure procurement by:
1. **Creating/selecting workflow templates** (JSON definitions)
2. **Linking forms to workflows** (WorkflowBinding)
3. **Setting business rules** (ProcurementConfig)

## API Endpoints

### 1. Procurement Configuration

```typescript
// GET /api/procurement/config/?branch_id=1
interface ProcurementConfig {
  id: number;
  branch: number;
  owner: number;
  
  // 3-Way Matching
  enable_three_way_matching: boolean;
  matching_tolerance_percentage: string; // Decimal as string
  auto_approve_within_tolerance: boolean;
  
  // Document Numbering
  pr_prefix: string;
  po_prefix: string;
  grn_prefix: string;
  pr_next_number: number;
  po_next_number: number;
  grn_next_number: number;
  
  // Workflow Links
  default_pr_workflow: number | null;  // WorkflowTemplate ID
  default_po_workflow: number | null;
  default_grn_workflow: number | null;
  
  // Amount-based routing
  high_value_threshold: string | null;
  high_value_po_workflow: number | null;
}

// POST/PUT /api/procurement/config/
// PATCH /api/procurement/config/{id}/
```

### 2. Workflow Templates (Existing API)

```typescript
// GET /api/automations/workflows/
interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
  run_sequence: string; // e.g., "PR_STANDARD", "PO_3WAY_MATCH"
  workflow_definition: {
    steps: WorkflowStep[];
  };
  is_active: boolean;
  category: string;
}

interface WorkflowStep {
  id: string;
  type: string; // 'approval', 'condition', 'validation', 'three_way_matching', etc.
  name: string;
  config: Record<string, any>;
  next?: string;
  on_approve?: string;
  on_reject?: string;
  transitions?: Array<{
    condition_result: boolean;
    next: string;
  }>;
}

// POST /api/automations/workflows/
// GET /api/automations/workflows/{id}/
// PUT /api/automations/workflows/{id}/
```

### 3. Workflow Bindings (Existing API)

```typescript
// GET /api/automations/workflow-bindings/
interface WorkflowBinding {
  id: number;
  form_schema: number;  // FormSchema ID
  workflow_template: number;  // WorkflowTemplate ID
  parameters: Record<string, any>;
  priority: number;
  is_active: boolean;
}

// POST /api/automations/workflow-bindings/
```

### 4. Purchase Requisitions

```typescript
// GET /api/procurement/purchase-requisitions/
// POST /api/procurement/purchase-requisitions/
interface PurchaseRequisition {
  id: number;
  pr_number: string;
  requested_by: number;
  department: string;
  request_date: string;
  required_by_date: string;
  purpose: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'po_created' | 'cancelled';
  estimated_total: string;
  workflow_run: number | null;
  approval_chain: ApprovalRecord[];
  items: PRItem[];
}

interface PRItem {
  id: number;
  item: number | null;
  description: string;
  quantity: string;
  estimated_unit_price: string;
}

interface ApprovalRecord {
  step_id: string;
  approver: number;
  action: 'approved' | 'rejected';
  timestamp: string;
  comments: string;
}
```

### 5. Purchase Orders

```typescript
// GET /api/procurement/purchase-orders/
// POST /api/procurement/purchase-orders/
interface PurchaseOrder {
  id: number;
  po_number: string;
  requisition: number | null;
  supplier: number;
  order_date: string;
  expected_delivery_date: string | null;
  delivery_location: number;
  status: 'draft' | 'submitted' | 'approved' | 'sent' | 'acknowledged' | 'partially_received' | 'received' | 'cancelled';
  total_amount: string;
  workflow_run: number | null;
  items: POItem[];
}

interface POItem {
  id: number;
  item: number;
  description: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  quantity_received: string;
}
```

## Frontend Screens

### 1. Procurement Configuration Screen

**Purpose**: Set up branch-level procurement rules and default workflows

**UI Components**:

```typescript
// ProcurementConfigForm.tsx
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';

interface ConfigFormData {
  enable_three_way_matching: boolean;
  matching_tolerance_percentage: number;
  auto_approve_within_tolerance: boolean;
  pr_prefix: string;
  po_prefix: string;
  grn_prefix: string;
  default_pr_workflow: number | null;
  default_po_workflow: number | null;
  high_value_threshold: number | null;
  high_value_po_workflow: number | null;
}

export const ProcurementConfigForm = () => {
  const branchId = useCurrentBranch();
  
  // Fetch existing config
  const { data: config } = useQuery({
    queryKey: ['procurement-config', branchId],
    queryFn: () => api.get(`/procurement/config/?branch_id=${branchId}`)
  });
  
  // Fetch available workflow templates
  const { data: workflows } = useQuery({
    queryKey: ['workflows', 'procurement'],
    queryFn: () => api.get('/automations/workflows/?category=procurement')
  });
  
  const { register, handleSubmit } = useForm<ConfigFormData>({
    defaultValues: config
  });
  
  const saveMutation = useMutation({
    mutationFn: (data: ConfigFormData) => 
      config?.id 
        ? api.put(`/procurement/config/${config.id}/`, data)
        : api.post('/procurement/config/', { ...data, branch: branchId })
  });
  
  return (
    <form onSubmit={handleSubmit(data => saveMutation.mutate(data))}>
      {/* 3-Way Matching Section */}
      <section>
        <h3>3-Way Matching</h3>
        <label>
          <input type="checkbox" {...register('enable_three_way_matching')} />
          Enable 3-way matching (PO → GRN → Invoice)
        </label>
        
        <label>
          Tolerance Percentage
          <input type="number" step="0.01" {...register('matching_tolerance_percentage')} />
        </label>
        
        <label>
          <input type="checkbox" {...register('auto_approve_within_tolerance')} />
          Auto-approve if variance within tolerance
        </label>
      </section>
      
      {/* Document Numbering */}
      <section>
        <h3>Document Prefixes</h3>
        <label>
          PR Prefix
          <input {...register('pr_prefix')} placeholder="PR" />
        </label>
        <label>
          PO Prefix
          <input {...register('po_prefix')} placeholder="PO" />
        </label>
        <label>
          GRN Prefix
          <input {...register('grn_prefix')} placeholder="GRN" />
        </label>
      </section>
      
      {/* Workflow Selection */}
      <section>
        <h3>Default Workflows</h3>
        
        <label>
          Purchase Requisition Workflow
          <select {...register('default_pr_workflow')}>
            <option value="">-- Select Workflow --</option>
            {workflows?.results
              .filter(w => w.run_sequence.startsWith('PR_'))
              .map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))
            }
          </select>
        </label>
        
        <label>
          Purchase Order Workflow
          <select {...register('default_po_workflow')}>
            <option value="">-- Select Workflow --</option>
            {workflows?.results
              .filter(w => w.run_sequence.startsWith('PO_'))
              .map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))
            }
          </select>
        </label>
        
        <label>
          High Value Threshold ($)
          <input type="number" step="0.01" {...register('high_value_threshold')} />
        </label>
        
        <label>
          High Value PO Workflow (Optional)
          <select {...register('high_value_po_workflow')}>
            <option value="">-- Use Default --</option>
            {workflows?.results
              .filter(w => w.run_sequence.startsWith('PO_'))
              .map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))
            }
          </select>
        </label>
      </section>
      
      <button type="submit">Save Configuration</button>
    </form>
  );
};
```

### 2. Purchase Requisition Form

**Purpose**: Create PR and automatically trigger workflow

```typescript
// PurchaseRequisitionForm.tsx
export const PurchaseRequisitionForm = () => {
  const { register, handleSubmit, watch } = useForm<PRFormData>();
  
  const submitPR = useMutation({
    mutationFn: async (data: PRFormData) => {
      // Step 1: Create PR
      const pr = await api.post('/procurement/purchase-requisitions/', {
        ...data,
        status: 'submitted'  // Triggers workflow
      });
      
      // Step 2: Workflow automatically starts via WorkflowBinding
      // Backend creates WorkflowRun and links it to PR
      
      return pr;
    }
  });
  
  return (
    <form onSubmit={handleSubmit(data => submitPR.mutate(data))}>
      <input {...register('requested_by')} type="hidden" value={currentUser.id} />
      <input {...register('department')} placeholder="Department" />
      <textarea {...register('purpose')} placeholder="Purpose/Justification" />
      <input {...register('required_by_date')} type="date" />
      
      {/* PR Items */}
      <PRItemsTable register={register} />
      
      <button type="submit">Submit for Approval</button>
    </form>
  );
};
```

### 3. Approval Interface

**Purpose**: Approve/reject workflow steps

```typescript
// ApprovalPanel.tsx
interface PendingApproval {
  workflow_run: number;
  step_id: string;
  step_name: string;
  entity_type: 'purchase_requisition' | 'purchase_order';
  entity_id: number;
  entity_details: PurchaseRequisition | PurchaseOrder;
  submitted_at: string;
}

export const ApprovalPanel = () => {
  // Fetch pending approvals for current user
  const { data: pending } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => api.get('/automations/pending-approvals/')
  });
  
  const approveMutation = useMutation({
    mutationFn: ({ workflowRunId, stepId, action, comments }: {
      workflowRunId: number;
      stepId: string;
      action: 'approve' | 'reject';
      comments: string;
    }) => api.post(`/automations/workflow-runs/${workflowRunId}/approve/`, {
      step_id: stepId,
      action,
      comments
    })
  });
  
  return (
    <div>
      <h2>Pending Approvals ({pending?.count})</h2>
      
      {pending?.results.map(approval => (
        <ApprovalCard
          key={approval.workflow_run}
          approval={approval}
          onApprove={(comments) => approveMutation.mutate({
            workflowRunId: approval.workflow_run,
            stepId: approval.step_id,
            action: 'approve',
            comments
          })}
          onReject={(comments) => approveMutation.mutate({
            workflowRunId: approval.workflow_run,
            stepId: approval.step_id,
            action: 'reject',
            comments
          })}
        />
      ))}
    </div>
  );
};

const ApprovalCard = ({ approval, onApprove, onReject }) => {
  const [comments, setComments] = useState('');
  
  return (
    <div className="approval-card">
      <h3>{approval.step_name}</h3>
      <p>{approval.entity_type}: {approval.entity_details.pr_number || approval.entity_details.po_number}</p>
      
      {/* Show entity details */}
      {approval.entity_type === 'purchase_requisition' && (
        <PRSummary pr={approval.entity_details} />
      )}
      
      {approval.entity_type === 'purchase_order' && (
        <POSummary po={approval.entity_details} />
      )}
      
      <textarea 
        placeholder="Comments (optional)" 
        value={comments}
        onChange={e => setComments(e.target.value)}
      />
      
      <div className="actions">
        <button onClick={() => onApprove(comments)} className="approve">
          ✓ Approve
        </button>
        <button onClick={() => onReject(comments)} className="reject">
          ✗ Reject
        </button>
      </div>
    </div>
  );
};
```

### 4. Workflow Status Tracker

**Purpose**: Show workflow progress for a PR/PO

```typescript
// WorkflowStatusTracker.tsx
interface WorkflowRun {
  id: number;
  workflow_template: WorkflowTemplate;
  status: 'running' | 'completed' | 'failed' | 'waiting_approval';
  current_step: string | null;
  context: Record<string, any>;
  execution_log: ExecutionLogEntry[];
}

interface ExecutionLogEntry {
  step_id: string;
  step_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';
  started_at: string;
  completed_at: string | null;
  result: any;
}

export const WorkflowStatusTracker = ({ workflowRunId }: { workflowRunId: number }) => {
  const { data: workflowRun } = useQuery({
    queryKey: ['workflow-run', workflowRunId],
    queryFn: () => api.get(`/automations/workflow-runs/${workflowRunId}/`)
  });
  
  if (!workflowRun) return <div>Loading...</div>;
  
  const steps = workflowRun.workflow_template.workflow_definition.steps;
  
  return (
    <div className="workflow-tracker">
      <h3>Workflow: {workflowRun.workflow_template.name}</h3>
      <div className="status-badge">{workflowRun.status}</div>
      
      <div className="steps-timeline">
        {steps.map(step => {
          const execution = workflowRun.execution_log.find(e => e.step_id === step.id);
          const isActive = workflowRun.current_step === step.id;
          
          return (
            <div 
              key={step.id} 
              className={`step ${execution?.status || 'pending'} ${isActive ? 'active' : ''}`}
            >
              <div className="step-icon">
                {execution?.status === 'completed' && '✓'}
                {execution?.status === 'failed' && '✗'}
                {execution?.status === 'waiting_approval' && '⏸'}
                {!execution && '○'}
              </div>
              
              <div className="step-details">
                <h4>{step.name}</h4>
                <p className="step-type">{step.type}</p>
                
                {execution && (
                  <>
                    <p className="timestamp">
                      {execution.started_at && `Started: ${formatDate(execution.started_at)}`}
                    </p>
                    {execution.completed_at && (
                      <p className="timestamp">
                        Completed: {formatDate(execution.completed_at)}
                      </p>
                    )}
                    
                    {execution.result && (
                      <details>
                        <summary>Step Result</summary>
                        <pre>{JSON.stringify(execution.result, null, 2)}</pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

### 5. 3-Way Matching Review Screen

**Purpose**: Review matching results and approve/escalate

```typescript
// ThreeWayMatchingReview.tsx
interface MatchingResult {
  overall_status: 'passed' | 'warning' | 'failed';
  can_proceed: boolean;
  requires_approval: boolean;
  matching_results: {
    supplier_match: MatchDetail;
    items_match: MatchDetail;
    quantities_match: MatchDetail;
    totals_match: MatchDetail;
    invoice_match?: MatchDetail;
  };
  discrepancies: Discrepancy[];
}

interface MatchDetail {
  status: 'match' | 'partial_match' | 'mismatch';
  message: string;
  details?: any;
}

interface Discrepancy {
  type: 'quantity' | 'price' | 'total' | 'item';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  po_value: any;
  grn_value: any;
  variance: number;
  variance_percentage: number;
}

export const ThreeWayMatchingReview = ({ 
  poId, 
  grnId, 
  invoiceAmount 
}: {
  poId: number;
  grnId: number;
  invoiceAmount: number;
}) => {
  // This would typically be called by the workflow step
  // But can also be triggered manually for review
  const { data: matchResult, isLoading } = useQuery({
    queryKey: ['three-way-match', poId, grnId, invoiceAmount],
    queryFn: () => api.post('/procurement/three-way-match/', {
      po_id: poId,
      grn_id: grnId,
      invoice_amount: invoiceAmount
    })
  });
  
  if (isLoading) return <div>Performing 3-way match...</div>;
  
  return (
    <div className="matching-review">
      <div className={`status-banner ${matchResult.overall_status}`}>
        <h2>
          {matchResult.overall_status === 'passed' && '✓ Match Passed'}
          {matchResult.overall_status === 'warning' && '⚠ Match Warning'}
          {matchResult.overall_status === 'failed' && '✗ Match Failed'}
        </h2>
        <p>
          {matchResult.can_proceed 
            ? 'Can proceed to payment approval'
            : 'Cannot proceed - requires review'
          }
        </p>
      </div>
      
      {/* Matching Details */}
      <section className="match-details">
        <h3>Matching Results</h3>
        
        <MatchItem 
          label="Supplier Match"
          result={matchResult.matching_results.supplier_match}
        />
        <MatchItem 
          label="Items Match"
          result={matchResult.matching_results.items_match}
        />
        <MatchItem 
          label="Quantities Match"
          result={matchResult.matching_results.quantities_match}
        />
        <MatchItem 
          label="Totals Match"
          result={matchResult.matching_results.totals_match}
        />
        {matchResult.matching_results.invoice_match && (
          <MatchItem 
            label="Invoice Amount Match"
            result={matchResult.matching_results.invoice_match}
          />
        )}
      </section>
      
      {/* Discrepancies */}
      {matchResult.discrepancies.length > 0 && (
        <section className="discrepancies">
          <h3>Discrepancies Found ({matchResult.discrepancies.length})</h3>
          
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Description</th>
                <th>PO Value</th>
                <th>GRN/Invoice Value</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {matchResult.discrepancies.map((disc, idx) => (
                <tr key={idx} className={`severity-${disc.severity}`}>
                  <td>{disc.type}</td>
                  <td>
                    <span className={`badge severity-${disc.severity}`}>
                      {disc.severity}
                    </span>
                  </td>
                  <td>{disc.description}</td>
                  <td>{disc.po_value}</td>
                  <td>{disc.grn_value}</td>
                  <td>
                    {disc.variance} ({disc.variance_percentage.toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      
      {/* Actions */}
      {matchResult.requires_approval && (
        <div className="actions">
          <button className="approve">Approve Despite Discrepancies</button>
          <button className="escalate">Escalate to Manager</button>
          <button className="reject">Reject Invoice</button>
        </div>
      )}
    </div>
  );
};

const MatchItem = ({ label, result }: { label: string; result: MatchDetail }) => (
  <div className={`match-item ${result.status}`}>
    <span className="icon">
      {result.status === 'match' && '✓'}
      {result.status === 'partial_match' && '⚠'}
      {result.status === 'mismatch' && '✗'}
    </span>
    <span className="label">{label}:</span>
    <span className="message">{result.message}</span>
    {result.details && (
      <details>
        <summary>Details</summary>
        <pre>{JSON.stringify(result.details, null, 2)}</pre>
      </details>
    )}
  </div>
);
```

## Workflow Configuration UI

### Workflow Template Builder (Optional Advanced Feature)

For advanced users who want to create custom workflows without writing JSON:

```typescript
// WorkflowTemplateBuilder.tsx
export const WorkflowTemplateBuilder = () => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  
  const addStep = (type: string) => {
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      type,
      name: `New ${type} step`,
      config: {},
    };
    setSteps([...steps, newStep]);
  };
  
  return (
    <div className="workflow-builder">
      <div className="steps-palette">
        <h3>Add Steps</h3>
        <button onClick={() => addStep('validation')}>Validation</button>
        <button onClick={() => addStep('approval')}>Approval</button>
        <button onClick={() => addStep('condition')}>Condition</button>
        <button onClick={() => addStep('three_way_matching')}>3-Way Match</button>
        <button onClick={() => addStep('notification')}>Notification</button>
      </div>
      
      <div className="workflow-canvas">
        {steps.map((step, idx) => (
          <StepEditor
            key={step.id}
            step={step}
            onChange={updated => {
              const newSteps = [...steps];
              newSteps[idx] = updated;
              setSteps(newSteps);
            }}
            onDelete={() => setSteps(steps.filter(s => s.id !== step.id))}
          />
        ))}
      </div>
      
      <button onClick={() => saveWorkflow({ steps })}>
        Save Workflow Template
      </button>
    </div>
  );
};
```

## Common Patterns

### Pattern 1: Submit Form and Start Workflow

```typescript
const submitWithWorkflow = async (formData) => {
  // 1. Create entity (PR, PO, etc.)
  const entity = await api.post('/procurement/purchase-requisitions/', {
    ...formData,
    status: 'submitted'  // Status change triggers workflow
  });
  
  // 2. Backend automatically:
  //    - Finds matching WorkflowBinding for the form
  //    - Creates WorkflowRun
  //    - Links WorkflowRun to entity
  //    - Starts execution
  
  // 3. Frontend polls or subscribes to workflow status
  const workflowRunId = entity.workflow_run;
  subscribeToWorkflowUpdates(workflowRunId);
  
  return entity;
};
```

### Pattern 2: Check Pending Approvals

```typescript
const usePendingApprovals = () => {
  return useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => api.get('/automations/pending-approvals/'),
    refetchInterval: 30000  // Poll every 30 seconds
  });
};

// Show badge with count
const { data } = usePendingApprovals();
<Badge count={data?.count} />
```

### Pattern 3: Real-time Workflow Updates (WebSocket)

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

const useWorkflowUpdates = (workflowRunId: number) => {
  const { lastMessage } = useWebSocket(`/ws/workflows/${workflowRunId}/`);
  
  useEffect(() => {
    if (lastMessage) {
      const update = JSON.parse(lastMessage.data);
      // Update UI based on workflow status change
      handleWorkflowUpdate(update);
    }
  }, [lastMessage]);
};
```

## Testing in Development

### 1. Setup Test Workflows

```bash
# Run the management command to create example workflows
python manage.py setup_procurement_workflows \
  --branch-id 1 \
  --owner-email admin@example.com
```

### 2. Create Test Data

```typescript
// Create test PR
const testPR = await api.post('/procurement/purchase-requisitions/', {
  requested_by: currentUser.id,
  department: 'IT',
  purpose: 'Test workflow execution',
  required_by_date: '2026-02-01',
  items: [
    {
      description: 'Laptop',
      quantity: '1',
      estimated_unit_price: '1200.00'
    }
  ],
  status: 'submitted'  // Triggers workflow
});

console.log('PR created:', testPR);
console.log('Workflow run:', testPR.workflow_run);
```

### 3. Monitor Execution

```typescript
// Get workflow run details
const workflowRun = await api.get(`/automations/workflow-runs/${testPR.workflow_run}/`);

console.log('Current step:', workflowRun.current_step);
console.log('Status:', workflowRun.status);
console.log('Execution log:', workflowRun.execution_log);
```

## Summary

The frontend integration is **simple** because:

1. ✅ **Use existing workflow APIs** - No custom endpoints for workflow config
2. ✅ **Use existing form system** - FormSchema + WorkflowBinding pattern
3. ✅ **Use existing approval UI** - Standard approval interface works
4. ✅ **Simple config screen** - Just ProcurementConfig with workflow dropdowns
5. ✅ **Flexible** - Users can create custom workflows via WorkflowTemplate

## Next Steps

1. **Implement ProcurementConfig API** (serializers + viewsets)
2. **Create procurement config screen** in frontend
3. **Add workflow selection dropdowns** to existing forms
4. **Test with example workflows** from management command
5. **Add 3-way matching review screen** (optional - can be backend-only initially)

---

**Key Takeaway**: The system is designed to be **configuration-driven**, not **code-driven**. Users configure workflows via UI (WorkflowTemplate), not by editing code or complex config tables!
