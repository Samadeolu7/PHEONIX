import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { ApprovalInterface } from '../components/automation/ApprovalInterface';
import { useMyApprovals, useApproveWorkflow, useRejectWorkflow } from '../hooks/useAutomation';
import { useToast } from '../hooks/useToast';
import { useApprovalGuard } from '../hooks/useApprovalGuard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoiceService } from '../services/invoiceService';
import { useAuth } from '../hooks/useAuth';
import { RotateCcw, CheckCircle, X, AlertTriangle, ExternalLink } from 'lucide-react';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  color: var(--text-primary-color, #2c3e50);
  margin: 0;
`;

const Tabs = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e2e8f0;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 1rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${props => (props.active ? 'var(--primary-color, #1a73e8)' : 'transparent')};
  color: ${props =>
    props.active ? 'var(--primary-color, #1a73e8)' : 'var(--text-secondary-color, #718096)'};
  font-weight: ${props => (props.active ? '600' : '400')};
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -2px;

  &:hover {
    color: var(--primary-color, #1a73e8);
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1.5rem;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 1.2rem;
  color: var(--text-secondary-color, #718096);
`;

const ErrorContainer = styled.div`
  padding: 2rem;
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  color: #c00;
  margin: 2rem 0;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary-color, #718096);
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  background: var(--primary-color, #1a73e8);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
  }
`;

const ApprovalsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [activeSection, setActiveSection] = useState<'workflow' | 'payment_reversals'>(
    'payment_reversals'
  );
  const toast = useToast();
  const queryClient = useQueryClient();
  const { selectedRole } = useAuth();

  const { canUserApprove } = useApprovalGuard();
  const canApproveReversals =
    selectedRole && ['Administrator', 'Finance Manager', 'Accountant'].includes(selectedRole);

  // ── Workflow approvals ──────────────────────────────────────────────────
  const { data: approvals = [], isLoading, error, refetch } = useMyApprovals(activeTab);
  const approveWorkflowMutation = useApproveWorkflow();
  const rejectWorkflowMutation = useRejectWorkflow();

  const handleApprove = async (request: any) => {
    try {
      await approveWorkflowMutation.mutateAsync({
        id: request.approval.id,
        comments: request.comments,
      });
      toast.success('Request approved successfully!');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to approve request';
      toast.error('Failed to approve request: ' + errorMsg);
    }
  };

  const handleReject = async (request: any) => {
    try {
      await rejectWorkflowMutation.mutateAsync({
        id: request.approval.id,
        comments: request.comments,
      });
      toast.success('Request rejected');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reject request';
      toast.error('Failed to reject request: ' + errorMsg);
    }
  };

  // ── Payment reversal requests ───────────────────────────────────────────
  const {
    data: reversalData,
    isLoading: reversalLoading,
    refetch: refetchReversals,
  } = useQuery({
    queryKey: ['payment-reversal-requests', activeTab],
    queryFn: () => invoiceService.listPaymentReversalRequests({ status: activeTab }),
  });
  const reversalRequests = reversalData?.results ?? [];

  const [approvalModal, setApprovalModal] = useState<{
    action: 'approve' | 'reject';
    requestId: number;
    invoiceId: number;
    rejectionReason: string;
    submitting: boolean;
  } | null>(null);

  const handleReversalAction = async () => {
    if (!approvalModal) return;
    try {
      setApprovalModal(m => m && { ...m, submitting: true });
      if (approvalModal.action === 'approve') {
        await invoiceService.approvePaymentReversal(approvalModal.invoiceId, {
          reversal_request_id: approvalModal.requestId,
        });
        toast.success('Payment reversal approved and executed.');
      } else {
        await invoiceService.rejectPaymentReversal(approvalModal.invoiceId, {
          reversal_request_id: approvalModal.requestId,
          rejection_reason: approvalModal.rejectionReason,
        });
        toast.success('Reversal request rejected.');
      }
      setApprovalModal(null);
      refetchReversals();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || `Failed to ${approvalModal.action} reversal`);
      setApprovalModal(m => m && { ...m, submitting: false });
    }
  };

  if (isLoading && activeSection === 'workflow') {
    return (
      <Container>
        <LoadingContainer>Loading approvals...</LoadingContainer>
      </Container>
    );
  }

  if (error && activeSection === 'workflow') {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Approvals</h2>
          <p>{error instanceof Error ? error.message : 'Failed to load approvals'}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Approval Requests</Title>
      </Header>

      {/* Section selector */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.5rem',
          borderBottom: '2px solid #e2e8f0',
        }}
      >
        <button
          onClick={() => setActiveSection('payment_reversals')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom:
              activeSection === 'payment_reversals' ? '2px solid #1a73e8' : '2px solid transparent',
            color: activeSection === 'payment_reversals' ? '#1a73e8' : '#718096',
            fontWeight: activeSection === 'payment_reversals' ? 600 : 400,
            cursor: 'pointer',
            marginBottom: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <RotateCcw size={15} />
          Payment Reversals
        </button>
        <button
          onClick={() => setActiveSection('workflow')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom:
              activeSection === 'workflow' ? '2px solid #1a73e8' : '2px solid transparent',
            color: activeSection === 'workflow' ? '#1a73e8' : '#718096',
            fontWeight: activeSection === 'workflow' ? 600 : 400,
            cursor: 'pointer',
            marginBottom: '-2px',
          }}
        >
          Workflow Approvals
        </button>
      </div>

      {/* Status tabs */}
      <Tabs>
        <Tab active={activeTab === 'pending'} onClick={() => setActiveTab('pending')}>
          Pending
        </Tab>
        <Tab active={activeTab === 'approved'} onClick={() => setActiveTab('approved')}>
          Approved
        </Tab>
        <Tab active={activeTab === 'rejected'} onClick={() => setActiveTab('rejected')}>
          Rejected
        </Tab>
      </Tabs>

      {/* ── Payment Reversals section ── */}
      {activeSection === 'payment_reversals' && (
        <>
          {reversalLoading ? (
            <LoadingContainer>Loading reversal requests…</LoadingContainer>
          ) : reversalRequests.length === 0 ? (
            <EmptyState>
              <h2>No {activeTab} reversal requests</h2>
              <p>There are no {activeTab} payment reversal requests at the moment.</p>
            </EmptyState>
          ) : (
            <div
              style={{
                background: 'white',
                borderRadius: 8,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {[
                      'Invoice',
                      'Client',
                      'Payment Ref',
                      'Amount',
                      'Reason',
                      'Requested By',
                      'Draft GL Ref',
                      'Date',
                      'Actions',
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#718096',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reversalRequests.map((rr, i) => (
                    <tr
                      key={rr.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: i % 2 === 0 ? 'white' : '#f7fafc',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                        <button
                          onClick={() => navigate(`/sales/invoices/${rr.invoice_id}`)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            color: '#1a73e8',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          {rr.invoice_number} <ExternalLink size={12} />
                        </button>
                      </td>
                      <td
                        style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#4a5568' }}
                      >
                        {rr.client_name ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          color: '#2d3748',
                        }}
                      >
                        {rr.payment_reference}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#2d3748',
                        }}
                      >
                        {new Intl.NumberFormat('en-NG', {
                          style: 'currency',
                          currency: 'NGN',
                        }).format(Number(rr.amount))}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.8rem',
                          color: '#4a5568',
                          maxWidth: 220,
                        }}
                      >
                        <span
                          title={rr.reason}
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {rr.reason}
                        </span>
                        {rr.rejection_reason && (
                          <p style={{ color: '#e53e3e', marginTop: 2, fontSize: '0.75rem' }}>
                            Rejection: {rr.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#4a5568' }}>
                        {rr.requested_by}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          color: '#718096',
                        }}
                      >
                        {rr.draft_journal_entry_ref ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.75rem',
                          color: '#718096',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {rr.created_at ? new Date(rr.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {rr.status === 'pending' && canApproveReversals ? (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              onClick={() =>
                                setApprovalModal({
                                  action: 'approve',
                                  requestId: rr.id,
                                  invoiceId: rr.invoice_id,
                                  rejectionReason: '',
                                  submitting: false,
                                })
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '0.3rem 0.7rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#276749',
                                background: '#f0fff4',
                                border: '1px solid #9ae6b4',
                                borderRadius: 6,
                                cursor: 'pointer',
                              }}
                            >
                              <CheckCircle size={12} /> Approve
                            </button>
                            <button
                              onClick={() =>
                                setApprovalModal({
                                  action: 'reject',
                                  requestId: rr.id,
                                  invoiceId: rr.invoice_id,
                                  rejectionReason: '',
                                  submitting: false,
                                })
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '0.3rem 0.7rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#c53030',
                                background: '#fff5f5',
                                border: '1px solid #feb2b2',
                                borderRadius: 6,
                                cursor: 'pointer',
                              }}
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        ) : rr.status === 'approved' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '0.2rem 0.6rem',
                              borderRadius: 12,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: '#f0fff4',
                              color: '#276749',
                            }}
                          >
                            <CheckCircle size={11} /> Approved
                          </span>
                        ) : rr.status === 'rejected' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '0.2rem 0.6rem',
                              borderRadius: 12,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: '#fff5f5',
                              color: '#c53030',
                            }}
                          >
                            <X size={11} /> Rejected
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '0.2rem 0.6rem',
                              borderRadius: 12,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: '#fffbeb',
                              color: '#b7791f',
                            }}
                          >
                            <AlertTriangle size={11} /> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Approve / Reject confirmation modal */}
          {approvalModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  background: 'white',
                  borderRadius: 10,
                  padding: '1.5rem',
                  width: 420,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}
                >
                  {approvalModal.action === 'approve' ? (
                    <CheckCircle size={20} color="#276749" />
                  ) : (
                    <AlertTriangle size={20} color="#c53030" />
                  )}
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                    {approvalModal.action === 'approve'
                      ? 'Approve Payment Reversal'
                      : 'Reject Payment Reversal'}
                  </h3>
                  <button
                    onClick={() => setApprovalModal(null)}
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#718096',
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {approvalModal.action === 'approve' ? (
                  <div
                    style={{
                      background: '#f0fff4',
                      border: '1px solid #9ae6b4',
                      borderRadius: 6,
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      fontSize: '0.85rem',
                      color: '#276749',
                    }}
                  >
                    <strong>Irreversible action.</strong> Approving will post the draft GL entry,
                    reverse the original payment, and reduce the invoice's paid balance.
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '0.875rem', color: '#4a5568', marginBottom: '0.75rem' }}>
                      The draft GL entry will be voided. The payment remains in effect.
                    </p>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.4rem',
                      }}
                    >
                      Rejection Reason <span style={{ color: '#e53e3e' }}>*</span>
                    </label>
                    <textarea
                      value={approvalModal.rejectionReason}
                      onChange={e =>
                        setApprovalModal(m => m && { ...m, rejectionReason: e.target.value })
                      }
                      rows={3}
                      placeholder="Minimum 10 characters"
                      style={{
                        width: '100%',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.875rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                    marginTop: '1rem',
                  }}
                >
                  <button
                    onClick={() => setApprovalModal(null)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#edf2f7',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReversalAction}
                    disabled={
                      approvalModal.submitting ||
                      (approvalModal.action === 'reject' &&
                        approvalModal.rejectionReason.trim().length < 10)
                    }
                    style={{
                      padding: '0.5rem 1.25rem',
                      background: approvalModal.action === 'approve' ? '#276749' : '#c53030',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      opacity:
                        approvalModal.submitting ||
                        (approvalModal.action === 'reject' &&
                          approvalModal.rejectionReason.trim().length < 10)
                          ? 0.5
                          : 1,
                    }}
                  >
                    {approvalModal.submitting
                      ? 'Processing…'
                      : approvalModal.action === 'approve'
                        ? 'Confirm Approval'
                        : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Workflow approvals section ── */}
      {activeSection === 'workflow' && (
        <>
          {approvals.length === 0 ? (
            <EmptyState>
              <h2>No {activeTab} Approvals</h2>
              <p>You have no {activeTab} approval requests at the moment.</p>
            </EmptyState>
          ) : (
            <Grid>
              {approvals.map(({ approval, run }) => (
                <ApprovalInterface
                  key={approval.id}
                  approval={approval}
                  run={run}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  readonly={activeTab !== 'pending' || !canUserApprove}
                />
              ))}
            </Grid>
          )}
        </>
      )}
    </Container>
  );
};

export default ApprovalsPage;
