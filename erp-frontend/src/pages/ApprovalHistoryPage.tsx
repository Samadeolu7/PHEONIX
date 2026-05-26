import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { ArrowLeft, CheckCircle, XCircle, Clock, Filter, Search } from 'lucide-react';
import { useMyApprovals } from '../hooks/useAutomation';

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

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: var(--text-primary-color, #2c3e50);
  cursor: pointer;
  margin-bottom: 1rem;
  transition: all 0.2s;

  &:hover {
    background-color: #f7fafc;
  }
`;

const Title = styled.h1`
  font-size: 2rem;
  color: var(--text-primary-color, #2c3e50);
  margin: 0;
`;

const Filters = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
`;

const Select = styled.select`
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  background: white;
`;

const Table = styled.table`
  width: 100%;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-collapse: collapse;
  overflow: hidden;
`;

const Thead = styled.thead`
  background: #f7fafc;
`;

const Th = styled.th`
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary-color, #4a5568);
  border-bottom: 2px solid #e2e8f0;
`;

const Tbody = styled.tbody``;

const Tr = styled.tr`
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f7fafc;
  }

  &:not(:last-child) {
    border-bottom: 1px solid #e2e8f0;
  }
`;

const Td = styled.td`
  padding: 1rem;
  color: var(--text-primary-color, #2c3e50);
`;

const StatusBadge = styled.span<{ status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;

  ${props => {
    switch (props.status) {
      case 'approved':
        return `background-color: #d1fae5; color: #065f46;`;
      case 'rejected':
        return `background-color: #fee2e2; color: #991b1b;`;
      case 'pending':
        return `background-color: #fef3c7; color: #78350f;`;
      case 'expired':
        return `background-color: #f1f5f9; color: #475569;`;
      default:
        return `background-color: #e2e8f0; color: #4a5568;`;
    }
  }}
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

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved':
      return <CheckCircle size={12} />;
    case 'rejected':
      return <XCircle size={12} />;
    case 'pending':
      return <Clock size={12} />;
    default:
      return <Clock size={12} />;
  }
};

const ApprovalHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Get all approvals (not just pending)
  const { data: allApprovals = [], isLoading, error, refetch } = useMyApprovals();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const filteredApprovals = allApprovals.filter(approval => {
    const matchesStatus = statusFilter === 'all' || approval.status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      approval.template_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      approval.run?.run_reference?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const handleRowClick = (approval: any) => {
    navigate(`/automations/approvals/${approval.id}`);
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingContainer>Loading approval history...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Approval History</h2>
          <p>{error instanceof Error ? error.message : 'Failed to load approval history'}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <BackButton onClick={() => navigate('/approvals')}>
        <ArrowLeft size={16} />
        Back to Approvals
      </BackButton>

      <Header>
        <Title>Approval History</Title>
      </Header>

      <Filters>
        <SearchInput
          type="text"
          placeholder="Search by template name or run reference..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />

        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </Select>
      </Filters>

      {filteredApprovals.length === 0 ? (
        <EmptyState>
          <h2>No Approval History</h2>
          <p>
            {searchTerm || statusFilter !== 'all'
              ? 'No approvals found matching your filters.'
              : 'You have no approval history yet.'}
          </p>
        </EmptyState>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Run Reference</Th>
              <Th>Template</Th>
              <Th>Step</Th>
              <Th>Status</Th>
              <Th>Requested</Th>
              <Th>Responded</Th>
              <Th>Response Time</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredApprovals.map(approval => {
              const responseTime =
                approval.requested_at && approval.responded_at
                  ? (() => {
                      const requested = new Date(approval.requested_at);
                      const responded = new Date(approval.responded_at);
                      const diffMs = responded.getTime() - requested.getTime();
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                      if (diffHours > 0) {
                        return `${diffHours}h ${diffMinutes}m`;
                      } else {
                        return `${diffMinutes}m`;
                      }
                    })()
                  : '-';

              return (
                <Tr key={approval.id} onClick={() => handleRowClick(approval)}>
                  <Td>
                    <strong>{approval.run?.run_reference || 'Unknown'}</strong>
                  </Td>
                  <Td>{approval.template_name || 'Unknown'}</Td>
                  <Td>
                    <code
                      style={{
                        fontSize: '0.75rem',
                        background: '#f1f5f9',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        color: '#475569',
                      }}
                    >
                      {approval.step_id}
                    </code>
                  </Td>
                  <Td>
                    <StatusBadge status={approval.status}>
                      {getStatusIcon(approval.status)}
                      {approval.status}
                    </StatusBadge>
                  </Td>
                  <Td>{formatDate(approval.requested_at)}</Td>
                  <Td>
                    {approval.responded_at ? (
                      <div>
                        <div>{formatDate(approval.responded_at)}</div>
                        {approval.responded_by && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary-color, #718096)',
                            }}
                          >
                            by {approval.responded_by.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary-color, #718096)' }}>-</span>
                    )}
                  </Td>
                  <Td>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        color:
                          responseTime === '-'
                            ? 'var(--text-secondary-color, #718096)'
                            : 'var(--text-primary-color, #2c3e50)',
                        fontWeight: responseTime === '-' ? 'normal' : '500',
                      }}
                    >
                      {responseTime}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </Container>
  );
};

export default ApprovalHistoryPage;
