/**
 * Approval Queue Component
 *
 * Displays pending approvals for the current user across all workflow types.
 * Allows approvers to review details and approve/reject requests.
 */

import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Package,
  Receipt,
  AlertCircle,
  RefreshCw,
  Eye,
  ChevronRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import apiClient, { Approval } from '@/services/apiClient';

interface ApprovalItem extends Approval {
  // Extended properties for UI display
  amount?: number;
  type?: string;
  reference_number?: string;
  submitted_by?: {
    id: number;
    name: string;
    email: string;
  };
  department?: string;
  purpose?: string;
  description?: string;
  items_count?: number;
}

interface ApprovalAction {
  approval_id: number;
  action: 'approve' | 'reject';
  comments: string;
}

export const ApprovalQueue: React.FC = () => {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [comments, setComments] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pr' | 'expense' | 'urgent'>('all');

  useEffect(() => {
    loadApprovals();

    // Refresh every 30 seconds
    const interval = setInterval(loadApprovals, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadApprovals = async () => {
    try {
      setError(null);

      // Use real API
      const response = await apiClient.getPendingApprovals();

      // Transform API response to match UI expectations
      const transformedApprovals: ApprovalItem[] = response.approvals.map(approval => ({
        ...approval,
        amount: approval.context_data?.amount || approval.workflow_run.context?.amount,
        type: approval.workflow_run.context?.model_type || 'unknown',
        reference_number:
          approval.workflow_run.context?.reference_number || approval.workflow_run.run_reference,
        submitted_by: {
          id: approval.workflow_run.context?.created_by?.id || 0,
          name: approval.workflow_run.context?.created_by?.name || 'Unknown',
          email: approval.workflow_run.context?.created_by?.email || '',
        },
        department: approval.context_data?.department || approval.workflow_run.context?.department,
        purpose: approval.context_data?.purpose || approval.workflow_run.context?.purpose,
        description: approval.context_data?.description,
        items_count: approval.context_data?.items_count,
      }));

      setApprovals(transformedApprovals);
    } catch (err: any) {
      console.error('Error loading approvals:', err);
      setError(err.message || 'Failed to load approvals');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (approval: ApprovalItem, action: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setActionType(action);
    setComments('');
    setShowDialog(true);
  };

  const handleSubmitAction = async () => {
    if (!selectedApproval) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Use real API
      if (actionType === 'approve') {
        await apiClient.approveItem(selectedApproval.id, comments);
      } else {
        if (!comments.trim()) {
          setError('Rejection reason is required');
          setIsProcessing(false);
          return;
        }
        await apiClient.rejectItem(selectedApproval.id, comments);
      }

      // Update local state
      setApprovals(prev => prev.filter(a => a.id !== selectedApproval.id));

      setSuccessMessage(
        `${selectedApproval.reference_number || selectedApproval.workflow_run.run_reference} ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`
      );

      setTimeout(() => setSuccessMessage(null), 5000);

      setShowDialog(false);
      setSelectedApproval(null);
    } catch (err: any) {
      console.error('Error processing approval:', err);
      setError(err.message || `Failed to ${actionType} request`);
    } finally {
      setIsProcessing(false);
    }
  };

  const getTimeRemaining = (timeoutAt: string): { text: string; urgent: boolean } => {
    const remaining = new Date(timeoutAt).getTime() - Date.now();
    const hours = Math.floor(remaining / (1000 * 60 * 60));

    if (hours < 2) {
      return { text: `${Math.floor(remaining / (1000 * 60))} minutes remaining`, urgent: true };
    } else if (hours < 24) {
      return { text: `${hours} hours remaining`, urgent: hours < 6 };
    } else {
      return { text: `${Math.floor(hours / 24)} days remaining`, urgent: false };
    }
  };

  const renderApprovalCard = (approval: ApprovalItem) => {
    const timeRemaining = getTimeRemaining(approval.timeout_at);
    const isPR = approval.type === 'purchase_requisition';

    return (
      <Card key={approval.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            {/* Left side - Details */}
            <div className="flex-1 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isPR ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                  }`}
                >
                  {isPR ? <Package className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{approval.reference_number}</h3>
                    <Badge variant={isPR ? 'default' : 'secondary'}>
                      {isPR ? 'Purchase Req' : 'Expense'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Submitted by {approval.submitted_by?.name || 'Unknown'} •{' '}
                    {formatDistanceToNow(new Date(approval.created_at))} ago
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="pl-13 space-y-2">
                {approval.department && (
                  <div className="text-sm">
                    <span className="font-medium">Department:</span> {approval.department}
                  </div>
                )}

                <div className="text-sm">
                  <span className="font-medium">Description:</span>{' '}
                  {approval.purpose || approval.description || 'N/A'}
                </div>

                {approval.items_count && (
                  <div className="text-sm text-muted-foreground">
                    {approval.items_count} item(s)
                  </div>
                )}

                {/* Amount */}
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span>
                    ${approval.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Time Remaining */}
                <div
                  className={`flex items-center gap-2 text-sm ${
                    timeRemaining.urgent ? 'text-red-600 font-medium' : 'text-muted-foreground'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  {timeRemaining.text}
                  {timeRemaining.urgent && <AlertCircle className="w-4 h-4 ml-1" />}
                </div>
              </div>
            </div>

            {/* Right side - Actions */}
            <div className="flex flex-col gap-2 ml-4">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleOpenDialog(approval, 'approve')}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleOpenDialog(approval, 'reject')}
                className="gap-2"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // TODO: Navigate to detail page
                  window.open(
                    `/${isPR ? 'procurement/requisitions' : 'expenses'}/${approval.id}`,
                    '_blank'
                  );
                }}
                className="gap-2"
              >
                <Eye className="w-4 h-4" />
                Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const prApprovals = approvals.filter(a => a.type === 'purchase_requisition');
  const expenseApprovals = approvals.filter(a => a.type === 'expense');
  const urgentApprovals = approvals.filter(a => {
    const remaining = new Date(a.timeout_at).getTime() - Date.now();
    return remaining < 6 * 60 * 60 * 1000; // Less than 6 hours
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Queue</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve pending purchase requisitions and expense requests
          </p>
        </div>

        <Button variant="outline" onClick={loadApprovals} className="gap-2" disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-500 bg-green-50 text-green-900">
          <CheckCircle2 className="w-4 h-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Pending</CardDescription>
            <CardTitle className="text-3xl">{approvals.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Urgent (6h)</CardDescription>
            <CardTitle className="text-3xl text-red-600">{urgentApprovals.length}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Value</CardDescription>
            <CardTitle className="text-3xl">
              ${approvals.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Approvals List */}
      {approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
            <p className="text-muted-foreground">You have no pending approvals at this time.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="w-full space-y-4">
          {/* Custom Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'all', label: `All (${approvals.length})` },
                { id: 'pr', label: `Purchase Reqs (${prApprovals.length})` },
                { id: 'expense', label: `Expenses (${expenseApprovals.length})` },
                { id: 'urgent', label: `Urgent (${urgentApprovals.length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'all' | 'pr' | 'expense' | 'urgent')}
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
            {/* All Approvals */}
            {activeTab === 'all' && (
              <div className="space-y-4">{approvals.map(renderApprovalCard)}</div>
            )}

            {/* Purchase Requisitions */}
            {activeTab === 'pr' && (
              <div className="space-y-4">
                {prApprovals.length > 0 ? (
                  prApprovals.map(renderApprovalCard)
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No pending purchase requisitions
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Expense Requests */}
            {activeTab === 'expense' && (
              <div className="space-y-4">
                {expenseApprovals.length > 0 ? (
                  expenseApprovals.map(renderApprovalCard)
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No pending expense requests
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Urgent Approvals */}
            {activeTab === 'urgent' && (
              <div className="space-y-4">
                {urgentApprovals.length > 0 ? (
                  urgentApprovals.map(renderApprovalCard)
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No urgent approvals
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} {selectedApproval?.reference_number}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? 'This will approve the request and allow it to proceed to the next step.'
                : 'This will reject the request and notify the requester.'}
            </DialogDescription>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-4 py-4">
              {/* Summary */}
              <div className="space-y-2 p-4 bg-muted/50 rounded-md">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Amount:</span>
                  <span className="text-sm font-semibold">
                    ${selectedApproval.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Submitted by:</span>
                  <span className="text-sm">{selectedApproval.submitted_by.name}</span>
                </div>
                {selectedApproval.department && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Department:</span>
                    <span className="text-sm">{selectedApproval.department}</span>
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="space-y-2">
                <Label htmlFor="comments">
                  Comments {actionType === 'reject' && <span className="text-red-500">*</span>}
                </Label>
                <Textarea
                  id="comments"
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder={
                    actionType === 'approve'
                      ? 'Optional: Add any comments or notes...'
                      : 'Please provide a reason for rejection...'
                  }
                  rows={4}
                  required={actionType === 'reject'}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAction}
              disabled={isProcessing || (actionType === 'reject' && !comments.trim())}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={actionType === 'approve' ? 'default' : 'destructive'}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {actionType === 'approve' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Confirm Approval
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Confirm Rejection
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApprovalQueue;
