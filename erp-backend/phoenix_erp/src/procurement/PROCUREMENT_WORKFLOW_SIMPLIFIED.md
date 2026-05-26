# Procurement Workflow Automation - SIMPLIFIED APPROACH ✅

## Overview

**Smart Decision**: Instead of creating a separate complex configuration system, we **leverage your existing workflow infrastructure**!

## What We Built

### 1. Simple Branch Configuration
**File**: `procurement/config_models.py`

```python
class ProcurementConfig(BranchScopedModel):
    # Just business rules, not workflow logic!
    enable_three_way_matching = BooleanField(default=True)
    matching_tolerance_percentage = DecimalField(default=5.00)
    
    # Link to existing WorkflowTemplates
    default_pr_workflow = ForeignKey(WorkflowTemplate)
    default_po_workflow = ForeignKey(WorkflowTemplate)
    high_value_po_workflow = ForeignKey(WorkflowTemplate)
```

**Why**: Minimal config model - just links to workflows you define!

### 2. Custom Step Handlers
**File**: `procurement/workflow_step_handlers.py`

Two new step types that plug into your existing `WorkflowExecutor`:

```python
# Register in automations/workflow_executor.py
self.step_handlers = {
    ...
    'three_way_matching': ThreeWayMatchingStepHandler(),  # NEW!
    'create_grn': GRNCreationStepHandler(),  # NEW!
}
```

### 3. Example Workflow Templates
**File**: `procurement/workflow_examples.py`

Four ready-to-use workflow definitions:
- **Standard PR Approval** - Department manager → CFO for high values
- **PO with 3-Way Matching** - Full lifecycle with GRN matching
- **Invoice Matching** - Auto-approve or escalate based on variances
- **Emergency Purchase** - Fast-track for urgent needs

### 4. Easy Setup Command
```bash
python manage.py setup_procurement_workflows \
    --branch-id 1 \
    --owner-email admin@company.com
```

## How It Works

### Configure Once, Use Everywhere

```python
# 1. Create workflow templates (using existing WorkflowTemplate model)
pr_workflow = WorkflowTemplate.objects.create(
    name="Standard PR Approval",
    workflow_definition={
        "steps": [
            {"type": "validation", ...},
            {"type": "approval", "config": {"roles": ["Manager"]}},
            {"type": "three_way_matching", ...},  # Your new step!
        ]
    }
)

# 2. Link form to workflow (using existing WorkflowBinding)
WorkflowBinding.objects.create(
    form_schema=pr_form,
    workflow_template=pr_workflow,
    parameters={"min_amount": 0}
)

# 3. That's it! Forms automatically trigger workflows
```

### User-Friendly Configuration

Users configure their procurement process by:

1. **Creating Forms** (existing FormSchema)
   - PR form, PO form, GRN form, Invoice form

2. **Choosing Workflows** (existing WorkflowTemplate)
   - "Use standard PR workflow" vs "Use emergency workflow"
   
3. **Setting Rules** (ProcurementConfig)
   - "Require 3-way matching: Yes/No"
   - "Tolerance: 5%"
   - "High value threshold: $100,000"

4. **Defining Approvers** (in workflow steps)
   - "Manager approval" → roles: ["Department Manager"]
   - "CFO approval for >$100k" → roles: ["CFO"]

## Example: Standard Purchase Flow

```mermaid
PR Submitted
    ↓
[Validate] - Check amount, items, etc.
    ↓
[Condition] - Amount > $100k?
    ├─ Yes → [CFO Approval]
    └─ No  → [Manager Approval]
    ↓
[Update] - Mark PR as approved
    ↓
[Notify] - Email requester
```

All configured with **existing WorkflowTemplate** - no new models needed!

## Example: 3-Way Matching Flow

```mermaid
Invoice Received
    ↓
[3-Way Match] - Compare PO → GRN → Invoice
    ├─ Passed → [Auto-Approve]
    ├─ Warning → [Finance Review]
    └─ Failed → [Manager Escalation]
    ↓
[Schedule Payment]
```

The `three_way_matching` step is just a new step handler!

## Key Benefits

✅ **No Duplicate Systems** - Uses your existing workflow infrastructure  
✅ **Flexible** - Any approval logic, any routing, any conditions  
✅ **Simple to Configure** - IT creates templates, users pick them  
✅ **Reusable** - Same workflow engine for procurement, expenses, HR, etc.  
✅ **Testable** - Use existing workflow testing tools  
✅ **Auditable** - Use existing workflow execution logs  

## Configuration Examples

### Example 1: Simple PR Approval

**User wants**: "Manager approves all PRs"

**Solution**: Use existing approval step:
```json
{
  "id": "manager_approval",
  "type": "approval",
  "config": {
    "approvers": {"type": "role", "roles": ["Manager"]}
  }
}
```

### Example 2: Amount-Based Routing

**User wants**: "Manager for <$10k, CFO for >=$10k"

**Solution**: Use existing condition step:
```json
{
  "id": "check_amount",
  "type": "condition",
  "config": {
    "conditions": [{"field": "${form.amount}", "operator": ">=", "value": 10000}]
  },
  "transitions": [
    {"condition_result": true, "next": "cfo_approval"},
    {"condition_result": false, "next": "manager_approval"}
  ]
}
```

### Example 3: Require GRN

**User wants**: "Must create GRN before payment"

**Solution**: Add GRN step to workflow:
```json
{
  "id": "verify_grn",
  "type": "validation",
  "config": {
    "rules": [{"field": "grn_id", "operator": "not_empty"}]
  }
}
```

### Example 4: 3-Way Matching

**User wants**: "Match invoice to PO and GRN within 5% tolerance"

**Solution**: Use new three_way_matching step:
```json
{
  "id": "match_invoice",
  "type": "three_way_matching",
  "config": {
    "po_id": "${context.po_id}",
    "grn_id": "${context.grn_id}",
    "invoice_amount": "${form.invoice_amount}"
  },
  "on_passed": "approve_payment",
  "on_failed": "escalate_to_cfo"
}
```

## Migration from Complex to Simple

### ❌ OLD APPROACH (Too Complex)
```
ProcurementWorkflowConfig
    ├─ require_pr: true/false
    ├─ require_grn: true/false
    ├─ pr_approval_required: true/false
    └─ ProcurementApprovalStep[]
        ├─ step_number
        ├─ approval_type
        ├─ allowed_roles[]
        └─ amount_threshold_min/max
```
Problems: Duplicate workflow logic, parallel config system, hard to extend

### ✅ NEW APPROACH (Simple)
```
WorkflowTemplate (existing!)
    └─ workflow_definition
        └─ steps[]
            ├─ type: "validation"
            ├─ type: "condition"
            ├─ type: "approval"
            └─ type: "three_way_matching" (new!)
```
Benefits: One system, flexible, reusable, tested

## Files Created

1. **`procurement/config_models.py`** (120 lines)
   - Simple ProcurementConfig model
   - Links to existing WorkflowTemplates

2. **`procurement/workflow_step_handlers.py`** (250 lines)
   - ThreeWayMatchingStepHandler
   - GRNCreationStepHandler
   - Plugs into existing WorkflowExecutor

3. **`procurement/services/three_way_matching.py`** (450 lines - kept from before)
   - Business logic for matching
   - No workflow coupling

4. **`procurement/workflow_examples.py`** (350 lines)
   - 4 example workflow templates
   - Copy-paste ready

5. **`procurement/management/commands/setup_procurement_workflows.py`** (110 lines)
   - Easy setup command
   - Creates all example workflows

6. **`automations/workflow_executor.py`** (modified)
   - Registered new step handlers
   - 2 lines added to imports
   - 2 lines added to step_handlers dict

## Total Code: ~1,280 lines

Compare to separate config system: Would have been ~2,500+ lines!

## Next Steps

1. **Create Form Schemas** for PR, PO, GRN, Invoice
2. **Create WorkflowBindings** to link forms to workflows
3. **Test with sample data**
4. **Add serializers/views** for ProcurementConfig
5. **Write comprehensive tests**

## Usage Example

```python
# Step 1: Set up config (one-time per branch)
from procurement.config_models import ProcurementConfig

config = ProcurementConfig.objects.create(
    branch=branch,
    owner=owner,
    enable_three_way_matching=True,
    matching_tolerance_percentage=5.00,
    high_value_threshold=100000
)

# Step 2: Create workflows (using existing system!)
python manage.py setup_procurement_workflows \
    --branch-id 1 --owner-email admin@company.com

# Step 3: Link forms to workflows
from automations.models import WorkflowBinding, FormSchema, WorkflowTemplate

pr_form = FormSchema.objects.get(name="Purchase Requisition Form")
pr_workflow = WorkflowTemplate.objects.get(run_sequence="PR_STANDARD")

WorkflowBinding.objects.create(
    form_schema=pr_form,
    workflow_template=pr_workflow,
    is_active=True
)

# Done! PRs now automatically trigger workflow
```

## Summary

**We simplified by**:
- ✅ Using existing WorkflowTemplate instead of creating ProcurementWorkflowConfig
- ✅ Using existing approval steps instead of creating ProcurementApprovalStep
- ✅ Using existing condition routing instead of custom matching rules
- ✅ Adding just 2 new step handlers (not 4 new models)
- ✅ Reducing code by ~1,200 lines

**Result**: Powerful procurement workflows that leverage your proven automation system! 🚀

---

**Status**: Core implementation complete  
**Next**: Serializers, Views, Tests, Documentation  
**Estimated Time to Production**: 2-3 days  
