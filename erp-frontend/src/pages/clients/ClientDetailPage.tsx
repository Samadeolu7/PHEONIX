// src/pages/clients/ClientDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  FileText,
  Heart,
  Building,
  Calendar,
  Users,
  AlertCircle,
  Globe,
  Home,
  Clock,
  GitBranch,
  Wallet,
  TrendingUp,
  PlusCircle,
  ChevronRight,
  Landmark,
} from 'lucide-react';
import { clientService, Client } from '../../services/clientService';
import { loanService, LoanTransactionRow } from '../../services/loanService';
import { getSavingsAccounts, getSavingsTransactions, SavingsTransactionRow } from '../../services/savingsService';
import { useDomainLabels } from '../../contexts/DomainLabelContext';
import { useAuth } from '../../contexts/AuthContext';

const ClientDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isSchool } = useDomainLabels();
  const { selectedRole } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'loans' | 'savings' | 'audit' | 'cross_branch'>('overview');
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [crossBranchHistory, setCrossBranchHistory] = useState<any[]>([]);
  const [crossBranchLoading, setCrossBranchLoading] = useState(false);
  const [loans, setLoans] = useState<any[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [savings, setSavings] = useState<any[]>([]);
  const [savingsLoading, setSavingsLoading] = useState(false);
  const [expandedLoanId, setExpandedLoanId] = useState<number | null>(null);
  const [loanLedgers, setLoanLedgers] = useState<Record<number, LoanTransactionRow[]>>({});
  const [loanLedgerLoading, setLoanLedgerLoading] = useState<number | null>(null);
  const [expandedSavingsId, setExpandedSavingsId] = useState<number | null>(null);
  const [savingsLedgers, setSavingsLedgers] = useState<Record<number, SavingsTransactionRow[]>>({});
  const [savingsLedgerLoading, setSavingsLedgerLoading] = useState<number | null>(null);

  const isBmPlus = ['branch_manager', 'supervisor', 'director', 'admin', 'operations'].includes(selectedRole || '');

  const loadAuditLog = async () => {
    if (!id) return;
    setAuditLoading(true);
    try {
      const data = await clientService.getAuditLog(Number(id));
      setAuditLog(data);
    } catch {
      setAuditLog([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadCrossBranchHistory = async () => {
    if (!id) return;
    setCrossBranchLoading(true);
    try {
      const data = await clientService.getCrossBranchHistory(Number(id));
      setCrossBranchHistory(data);
    } catch {
      setCrossBranchHistory([]);
    } finally {
      setCrossBranchLoading(false);
    }
  };

  const loadLoans = async () => {
    if (!id) return;
    setLoansLoading(true);
    try {
      const data = await loanService.listLoans({ client: Number(id), page_size: 100 });
      setLoans(data.results ?? []);
    } catch {
      setLoans([]);
    } finally {
      setLoansLoading(false);
    }
  };

  const loadSavings = async () => {
    if (!id) return;
    setSavingsLoading(true);
    try {
      const raw = await getSavingsAccounts({ client: Number(id) }) as unknown;
      const list = Array.isArray(raw) ? raw : ((raw as any)?.results ?? []);
      setSavings(list);
    } catch {
      setSavings([]);
    } finally {
      setSavingsLoading(false);
    }
  };

  async function toggleLoanLedger(loanId: number) {
    if (expandedLoanId === loanId) {
      setExpandedLoanId(null);
      return;
    }
    setExpandedLoanId(loanId);
    if (loanLedgers[loanId]) return;
    setLoanLedgerLoading(loanId);
    try {
      const data = await loanService.getLoanTransactions(loanId, 1, 50);
      setLoanLedgers(prev => ({ ...prev, [loanId]: data.results }));
    } catch {
      setLoanLedgers(prev => ({ ...prev, [loanId]: [] }));
    } finally {
      setLoanLedgerLoading(null);
    }
  }

  async function toggleSavingsLedger(accountId: number) {
    if (expandedSavingsId === accountId) {
      setExpandedSavingsId(null);
      return;
    }
    setExpandedSavingsId(accountId);
    if (savingsLedgers[accountId]) return;
    setSavingsLedgerLoading(accountId);
    try {
      const data = await getSavingsTransactions(accountId, 1, 50);
      setSavingsLedgers(prev => ({ ...prev, [accountId]: data.results }));
    } catch {
      setSavingsLedgers(prev => ({ ...prev, [accountId]: [] }));
    } finally {
      setSavingsLedgerLoading(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    loadClientData();
    loadLoans();
    loadSavings();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'audit' && auditLog.length === 0 && !auditLoading) {
      loadAuditLog();
    }
    if (activeTab === 'cross_branch' && crossBranchHistory.length === 0 && !crossBranchLoading) {
      loadCrossBranchHistory();
    }
  }, [activeTab]);

  const loadClientData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const clientData = await clientService.getClient(Number(id));
      setClient(clientData);
    } catch (err: any) {
      setError(err.message || 'Failed to load client details');
      console.error('Error loading client:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Not provided';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatMonth = (monthString?: string | null) => {
    if (!monthString) return 'Not provided';
    try {
      const [year, month] = monthString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    } catch {
      return monthString;
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '1.125rem',
          color: '#4b5563',
        }}
      >
        Loading client details...
      </div>
    );
  }

  if (error || !client) {
    return (
      <div
        style={{
          padding: '2rem',
          color: '#dc2626',
          textAlign: 'center',
          fontSize: '1.125rem',
        }}
      >
        Error: {error || 'Client not found'}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div
        style={{
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'white',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/clients')}
            style={{
              padding: '0.5rem',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
            onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
          >
            <ArrowLeft size={20} />
          </button>
          {/* Profile Image */}
          <div style={{ flexShrink: 0 }}>
            {client.image ? (
              <img
                src={client.image}
                alt={client.full_name || `${client.first_name} ${client.last_name}`}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #e5e7eb',
                }}
              />
            ) : (
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #bfdbfe',
                }}
              >
                <User size={28} color="#3b82f6" />
              </div>
            )}
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {client.full_name ||
                `${client.first_name} ${client.middle_name || ''} ${client.last_name}`.trim()}
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                fontSize: '0.875rem',
                color: '#6b7280',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  background: '#f3f4f6',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  fontWeight: 500,
                }}
              >
                ID: {client.client_id || `STU-${String(client.id).padStart(5, '0')}`}
              </span>
              <span
                style={{
                  background: '#f3f4f6',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  textTransform: 'capitalize',
                }}
              >
                {client.usage_context || 'client'}
              </span>
              <span
                style={{
                  background: client.status === 'active' ? '#d1fae5' : '#fee2e2',
                  color: client.status === 'active' ? '#065f46' : '#991b1b',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              >
                {client.status || 'active'}
              </span>
              {client.classification_name && (
                <span
                  style={{
                    background: '#dbeafe',
                    color: '#1e40af',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '1rem',
                    fontWeight: 500,
                  }}
                >
                  {client.classification_name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(`/clients/${id}/edit`)}
            style={{
              padding: '0.75rem 1.25rem',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
            onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
          >
            <Edit size={16} />
            Edit
          </button>
          <button
            onClick={() => navigate(`/loans/accounts/create?client=${client.id}`)}
            style={{
              padding: '0.75rem 1.25rem',
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
            onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
          >
            <TrendingUp size={16} />
            Apply for Loan
          </button>
          <button
            onClick={() => navigate(`/savings/accounts/create?client=${client.id}`)}
            style={{
              padding: '0.75rem 1.25rem',
              background: '#0891b2',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#0e7490')}
            onMouseLeave={e => (e.currentTarget.style.background = '#0891b2')}
          >
            <Wallet size={16} />
            Open Savings
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem', background: 'white', borderRadius: '0.5rem 0.5rem 0 0', padding: '0 1rem' }}>
        {[
          { key: 'overview', label: 'Overview', icon: <User size={16} /> },
          { key: 'loans', label: 'Loans', icon: <TrendingUp size={16} /> },
          { key: 'savings', label: 'Savings', icon: <Wallet size={16} /> },
          { key: 'audit', label: 'Audit Log', icon: <Clock size={16} /> },
          ...(isBmPlus ? [{ key: 'cross_branch', label: 'Cross-Branch History', icon: <GitBranch size={16} /> }] : []),
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '1rem 1.25rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: '-2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#3b82f6' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeTab === 'overview' && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {/* Basic Information Card */}
        <SectionCard title="Basic Information" icon={<User size={20} color="#3b82f6" />}>
          <InfoGrid>
            <InfoItem label="Title" value={client.title || 'Not provided'} capitalize />
            <InfoItem label="First Name" value={client.first_name} />
            <InfoItem label="Middle Name" value={client.middle_name || 'Not provided'} />
            <InfoItem label="Last Name" value={client.last_name} />
            <InfoItem label="Gender" value={client.gender || 'Not specified'} capitalize />
            <InfoItem label="Date of Birth" value={formatDate(client.date_of_birth)} />
            {client.age && <InfoItem label="Age" value={`${client.age} years`} />}
            <InfoItem label="Place of Birth" value={client.place_of_birth || 'Not provided'} />
            <InfoItem label="Nationality" value={(client as any).nationality || 'Nigerian'} />
            <InfoItem
              label="State of Origin"
              value={(client as any).state_of_origin || 'Not provided'}
            />
            <InfoItem label="LGA" value={(client as any).lga || 'Not provided'} />
            <InfoItem
              label="Marital Status"
              value={client.marital_status || 'Not provided'}
              capitalize
            />
            <InfoItem
              label="Education Level"
              value={client.education_level || 'Not provided'}
              capitalize
            />
            <InfoItem label="Risk Level" value={<RiskBadge level={client.risk_level || 'low'} />} />
          </InfoGrid>
        </SectionCard>

        {/* Contact Information Card */}
        <SectionCard title="Contact Information" icon={<Phone size={20} color="#10b981" />}>
          <InfoGrid>
            <InfoItem label="Primary Phone" value={client.phone_primary} />
            <InfoItem label="Secondary Phone" value={client.phone_secondary || 'Not provided'} />
            <InfoItem label="Email" value={client.email || 'Not provided'} />
            <InfoItem
              label="Address"
              value={
                [
                  client.address_street,
                  client.address_city,
                  client.address_state,
                  client.address_postal_code,
                  client.address_country,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Not provided'
              }
            />
            <InfoItem label="Preferred Language" value={client.preferred_language || 'English'} />
            <InfoItem
              label="Communication Preference"
              value={client.communication_preference || 'sms'}
              capitalize
            />
            <InfoItem label="Marketing Consent" value={client.marketing_consent ? 'Yes' : 'No'} />
          </InfoGrid>
        </SectionCard>

        {/* Financial Profile */}
        <SectionCard title="Financial Profile" icon={<Briefcase size={20} color="#8b5cf6" />}>
          <InfoGrid>
            <InfoItem label="Client Type" value={(client as any).client_type || 'Not assigned'} />
            <InfoItem label="Admission Number" value={client.admission_number || 'Not assigned'} />
            <InfoItem label="Admission Date" value={formatDate(client.admission_date)} />
            <InfoItem label="Classification" value={client.classification_name || 'Not assigned'} />
            <InfoItem label="NIN" value={client.nin || 'Not provided'} />
            <InfoItem label="BVN" value={(client as any).bank_verification_number ? `****${((client as any).bank_verification_number as string).slice(-4)}` : 'Not provided'} />
            <InfoItem label="Bank Name" value={(client as any).bank_name || 'Not provided'} />
            <InfoItem label="Account Number" value={(client as any).bank_account_number ? `****${((client as any).bank_account_number as string).slice(-4)}` : 'Not provided'} />
            <InfoItem label="Account Name" value={(client as any).bank_account_name || 'Not provided'} />
            <InfoItem label="Income Source" value={(client as any).income_source || 'Not provided'} capitalize />
            <InfoItem label="Referral Source" value={client.referral_source || 'Not provided'} />
          </InfoGrid>
        </SectionCard>

        {/* Next of Kin Information */}
        <SectionCard title="Next of Kin" icon={<Users size={20} color="#3b82f6" />}>
          <InfoGrid>
            <InfoItem
              label="Name"
              value={client.next_of_kin_name || 'Not provided'}
            />
            <InfoItem
              label="Relationship"
              value={client.next_of_kin_relationship || 'Not specified'}
              capitalize
            />
            <InfoItem
              label="Phone"
              value={client.next_of_kin_phone || 'Not provided'}
            />
            <InfoItem
              label="Email"
              value={client.next_of_kin_email || 'Not provided'}
            />
            <InfoItem
              label="Address"
              value={client.next_of_kin_address || 'Not provided'}
            />
          </InfoGrid>
        </SectionCard>

        {/* Employment / Business Information */}
        <SectionCard title="Employment / Business" icon={<Building size={20} color="#06b6d4" />}>
          <InfoGrid>
            <InfoItem
              label="Employment Status"
              value={(client as any).employment_status || 'Not provided'}
              capitalize
            />
            <InfoItem
              label="Occupation"
              value={(client as any).occupation || 'Not provided'}
            />
            <InfoItem
              label="Employer / Business"
              value={(client as any).employer_name || 'Not provided'}
            />
            <InfoItem
              label="Annual Income"
              value={(client as any).annual_income ? `₦${parseFloat((client as any).annual_income).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : 'Not provided'}
            />
          </InfoGrid>
        </SectionCard>

        {/* Medical & Emergency Card (if exists) */}
        {(client.blood_group ||
          client.allergies ||
          client.medical_conditions ||
          client.emergency_contact_name ||
          client.emergency_contact_phone) && (
          <SectionCard title="Medical & Emergency" icon={<Heart size={20} color="#dc2626" />}>
            <InfoGrid>
              <InfoItem label="Blood Group" value={client.blood_group || 'Not provided'} />
              <InfoItem label="Allergies" value={client.allergies || 'None recorded'} />
              <InfoItem
                label="Medical Conditions"
                value={client.medical_conditions || 'None recorded'}
              />
              <InfoItem
                label="Emergency Contact"
                value={client.emergency_contact_name || 'Not provided'}
              />
              <InfoItem
                label="Emergency Phone"
                value={client.emergency_contact_phone || 'Not provided'}
              />
              <InfoItem
                label="Emergency Relationship"
                value={client.emergency_contact_relationship || 'Not specified'}
                capitalize
              />
            </InfoGrid>
          </SectionCard>
        )}

        {/* Employment Card (if exists) */}
        {(client.occupation || client.employer_name || client.employment_status) && (
          <SectionCard title="Employment" icon={<Briefcase size={20} color="#8b5cf6" />}>
            <InfoGrid>
              <InfoItem
                label="Employment Status"
                value={client.employment_status || 'Not provided'}
                capitalize
              />
              <InfoItem label="Occupation" value={client.occupation || 'Not provided'} />
              <InfoItem label="Employer Name" value={client.employer_name || 'Not provided'} />
              <InfoItem
                label="Employer Address"
                value={client.employer_address || 'Not provided'}
              />
              {client.annual_income && (
                <InfoItem
                  label="Annual Income"
                  value={`₦${client.annual_income.toLocaleString()}`}
                />
              )}
              <InfoItem label="Income Source" value={client.income_source || 'Not provided'} />
            </InfoGrid>
          </SectionCard>
        )}

        {/* Banking Information Card (if exists) */}
        {(client.bank_name || client.bank_account_number) && (
          <SectionCard title="Banking Information" icon={<Building size={20} color="#06b6d4" />}>
            <InfoGrid>
              <InfoItem label="Bank Name" value={client.bank_name || 'Not provided'} />
              <InfoItem label="Account Name" value={client.bank_account_name || 'Not provided'} />
              <InfoItem
                label="Account Number"
                value={client.bank_account_number || 'Not provided'}
              />
              <InfoItem label="BVN" value={client.bank_verification_number || 'Not provided'} />
              <InfoItem label="NIN" value={client.nin || 'Not provided'} />
            </InfoGrid>
          </SectionCard>
        )}

        {/* Next of Kin Card (if exists) */}
        {client.next_of_kin_name && (
          <SectionCard title="Next of Kin" icon={<Heart size={20} color="#ef4444" />}>
            <InfoGrid>
              <InfoItem label="Name" value={client.next_of_kin_name} />
              <InfoItem
                label="Relationship"
                value={client.next_of_kin_relationship || 'Not provided'}
                capitalize
              />
              <InfoItem label="Phone" value={client.next_of_kin_phone || 'Not provided'} />
              <InfoItem label="Email" value={client.next_of_kin_email || 'Not provided'} />
              <InfoItem label="Address" value={client.next_of_kin_address || 'Not provided'} />
            </InfoGrid>
          </SectionCard>
        )}
      </div>
      )}

      {/* Loans Tab */}
      {activeTab === 'loans' && (
        <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <TrendingUp size={20} color="#7c3aed" />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Loan Accounts</h3>
            </div>
            <button
              onClick={() => navigate(`/loans/accounts/create?client=${client.id}`)}
              style={{
                padding: '0.625rem 1.25rem',
                background: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
              onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
            >
              <PlusCircle size={16} />
              Apply for Loan
            </button>
          </div>
          {loansLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading loans…</div>
          ) : loans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <TrendingUp size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af', display: 'block' }} />
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>No Loan Accounts</h4>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                This client doesn't have any loan accounts yet.
              </p>
              <button
                onClick={() => navigate(`/loans/accounts/create?client=${client.id}`)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                }}
              >
                <PlusCircle size={16} />
                Apply for First Loan
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {['Loan #', 'Product', 'Applied', 'Approved', 'Outstanding', 'Status', 'Disbursed', '', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: h === 'Applied' || h === 'Approved' || h === 'Outstanding' ? 'right' : 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan: any, idx: number) => (
                    <React.Fragment key={loan.id}>
                      <tr
                        style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : undefined, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#7c3aed' }}>{loan.loan_number || loan.account_number || `LN-${loan.id}`}</td>
                        <td style={{ padding: '0.875rem 1rem', color: '#374151' }}>{loan.product_name || loan.product || '—'}</td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#374151' }}>{loan.requested_amount ? `₦${Number(loan.requested_amount).toLocaleString()}` : '—'}</td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#374151' }}>{loan.approved_amount ? `₦${Number(loan.approved_amount).toLocaleString()}` : '—'}</td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: Number(loan.total_outstanding ?? loan.outstanding_principal ?? loan.outstanding_balance ?? 0) > 0 ? '#dc2626' : '#10b981' }}>
                          {loan.total_outstanding != null || loan.outstanding_principal != null || loan.outstanding_balance != null
                            ? `₦${Number(loan.total_outstanding ?? loan.outstanding_principal ?? loan.outstanding_balance).toLocaleString()}`
                            : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600,
                            background: loan.status === 'active' ? '#d1fae5' : loan.status === 'overdue' ? '#fee2e2' : loan.status === 'paid_off' ? '#dbeafe' : '#f3f4f6',
                            color: loan.status === 'active' ? '#065f46' : loan.status === 'overdue' ? '#991b1b' : loan.status === 'paid_off' ? '#1e40af' : '#4b5563',
                            textTransform: 'capitalize',
                          }}>
                            {(loan.status || '—').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', color: '#6b7280' }}>{loan.disbursement_date ? new Date(loan.disbursement_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/loans/accounts/${loan.id}`); }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.375rem', cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
                          >
                            View
                          </button>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLoanLedger(loan.id); }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: expandedLoanId === loan.id ? '#ede9fe' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.375rem', cursor: 'pointer', color: expandedLoanId === loan.id ? '#6d28d9' : '#374151', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
                            onMouseLeave={e => (e.currentTarget.style.background = expandedLoanId === loan.id ? '#ede9fe' : '#f3f4f6')}
                          >
                            {expandedLoanId === loan.id ? 'Hide Ledger' : 'Ledger'}
                          </button>
                        </td>
                      </tr>
                      {expandedLoanId === loan.id && (
                        <tr>
                          <td colSpan={9} style={{ padding: 0, background: '#fafafa' }}>
                            {loanLedgerLoading === loan.id ? (
                              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>Loading ledger…</div>
                            ) : !loanLedgers[loan.id] || loanLedgers[loan.id].length === 0 ? (
                              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>No transactions found</div>
                            ) : (
                              <div style={{ padding: '0 1rem 1rem' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Date</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Reference</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Description</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>Debit</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>Credit</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {loanLedgers[loan.id].map((tx: LoanTransactionRow) => (
                                      <tr key={tx.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{tx.date ? new Date(tx.date).toLocaleDateString() : '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{tx.reference || '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{tx.description || '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: '#dc2626' }}>{tx.debit ? `₦${Number(tx.debit).toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: '#10b981' }}>{tx.credit ? `₦${Number(tx.credit).toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#374151' }}>₦{Number(tx.balance).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Savings Tab */}
      {activeTab === 'savings' && (
        <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Wallet size={20} color="#0891b2" />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Savings Accounts</h3>
            </div>
            <button
              onClick={() => navigate(`/savings/accounts/create?client=${client.id}`)}
              style={{
                padding: '0.625rem 1.25rem',
                background: '#0891b2',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0e7490')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0891b2')}
            >
              <PlusCircle size={16} />
              Open Savings Account
            </button>
          </div>
          {savingsLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading savings…</div>
          ) : savings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <Landmark size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af', display: 'block' }} />
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>No Savings Accounts</h4>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                This client doesn't have any savings accounts yet.
              </p>
              <button
                onClick={() => navigate(`/savings/accounts/create?client=${client.id}`)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#0891b2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                }}
              >
                <PlusCircle size={16} />
                Open First Savings Account
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {['Account #', 'Product', 'Balance', 'Status', 'Opened', '', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: h === 'Balance' ? 'right' : 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {savings.map((acct: any, idx: number) => (
                    <React.Fragment key={acct.id}>
                      <tr
                        style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : undefined, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#0891b2' }}>{acct.account_number || `SAV-${acct.id}`}</td>
                        <td style={{ padding: '0.875rem 1rem', color: '#374151' }}>{acct.product_name || acct.product || '—'}</td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                          {acct.current_balance != null ? `₦${Number(acct.current_balance).toLocaleString()}` : acct.balance != null ? `₦${Number(acct.balance).toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600,
                            background: acct.status === 'active' ? '#d1fae5' : acct.status === 'dormant' ? '#fef3c7' : '#f3f4f6',
                            color: acct.status === 'active' ? '#065f46' : acct.status === 'dormant' ? '#92400e' : '#4b5563',
                            textTransform: 'capitalize',
                          }}>
                            {acct.status || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', color: '#6b7280' }}>{acct.opened_on ? new Date(acct.opened_on).toLocaleDateString() : acct.created_at ? new Date(acct.created_at).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/savings/accounts/${acct.id}`); }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.375rem', cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
                          >
                            View
                          </button>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSavingsLedger(acct.id); }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: expandedSavingsId === acct.id ? '#ccfbf1' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.375rem', cursor: 'pointer', color: expandedSavingsId === acct.id ? '#0f766e' : '#374151', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
                            onMouseLeave={e => (e.currentTarget.style.background = expandedSavingsId === acct.id ? '#ccfbf1' : '#f3f4f6')}
                          >
                            {expandedSavingsId === acct.id ? 'Hide Ledger' : 'Ledger'}
                          </button>
                        </td>
                      </tr>
                      {expandedSavingsId === acct.id && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0, background: '#fafafa' }}>
                            {savingsLedgerLoading === acct.id ? (
                              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>Loading ledger…</div>
                            ) : !savingsLedgers[acct.id] || savingsLedgers[acct.id].length === 0 ? (
                              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>No transactions found</div>
                            ) : (
                              <div style={{ padding: '0 1rem 1rem' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Date</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Reference</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Description</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>Debit</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>Credit</th>
                                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {savingsLedgers[acct.id].map((tx: SavingsTransactionRow) => (
                                      <tr key={tx.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{tx.date ? new Date(tx.date).toLocaleDateString() : '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{tx.reference || '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{tx.description || '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: '#dc2626' }}>{tx.debit ? `₦${Number(tx.debit).toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: '#10b981' }}>{tx.credit ? `₦${Number(tx.credit).toLocaleString()}` : '—'}</td>
                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#374151' }}>₦{Number(tx.balance).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <Clock size={20} color="#3b82f6" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Audit Log</h3>
          </div>
          {auditLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading audit trail…</div>
          ) : auditLog.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No audit entries found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {auditLog.map((entry: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', paddingBottom: '1.25rem', position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px' }} />
                    {idx < auditLog.length - 1 && <div style={{ width: '2px', flex: 1, background: '#e5e7eb', marginTop: '4px' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', textTransform: 'capitalize' }}>
                        {(entry.action || entry.event_type || 'update').replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                      </span>
                    </div>
                    {entry.actor_name && (
                      <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
                        By: {entry.actor_name}
                      </p>
                    )}
                    {entry.description && (
                      <p style={{ fontSize: '0.8125rem', color: '#374151', marginTop: '0.25rem' }}>
                        {entry.description}
                      </p>
                    )}
                    {entry.changes && Object.keys(entry.changes).length > 0 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280', background: '#f9fafb', borderRadius: '0.25rem', padding: '0.5rem' }}>
                        {Object.entries(entry.changes).map(([field, val]: any) => (
                          <div key={field}>
                            <span style={{ fontWeight: 600 }}>{field}</span>: {String(val?.before ?? '—')} → {String(val?.after ?? val ?? '—')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cross-Branch History Tab (BM+ only) */}
      {activeTab === 'cross_branch' && isBmPlus && (
        <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <GitBranch size={20} color="#7c3aed" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Cross-Branch NIN History</h3>
            {client?.nin && (
              <span style={{ fontSize: '0.8125rem', color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.75rem', borderRadius: '1rem' }}>
                NIN: {client.nin}
              </span>
            )}
          </div>
          {!client?.nin ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              This client has no NIN recorded. Add a NIN to enable cross-branch lookup.
            </div>
          ) : crossBranchLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading cross-branch data…</div>
          ) : crossBranchHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>No cross-branch loan records found for this NIN.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {['Branch', 'Loan Ref', 'Amount', 'Status', 'Disbursed', 'Outstanding', 'Default Rate'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crossBranchHistory.map((row: any, idx: number) => (
                    <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{row.branch_name || row.branch || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#3b82f6' }}>{row.loan_ref || row.loan_account_number || '—'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{row.principal_amount ? `₦${Number(row.principal_amount).toLocaleString()}` : '—'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600,
                          background: row.status === 'active' ? '#d1fae5' : row.status === 'defaulted' ? '#fee2e2' : '#f3f4f6',
                          color: row.status === 'active' ? '#065f46' : row.status === 'defaulted' ? '#991b1b' : '#4b5563',
                          textTransform: 'capitalize',
                        }}>{row.status || '—'}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{row.disbursement_date ? new Date(row.disbursement_date).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: Number(row.outstanding_balance || 0) > 0 ? '#dc2626' : '#10b981' }}>
                        {row.outstanding_balance != null ? `₦${Number(row.outstanding_balance).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{row.default_rate != null ? `${row.default_rate}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper Components (keep these the same)
const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <div
    style={{
      background: 'white',
      padding: '1.5rem',
      borderRadius: '0.75rem',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      {icon}
      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>{title}</h3>
    </div>
    {children}
  </div>
);

const InfoGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{children}</div>
);

const InfoItem: React.FC<{ label: string; value: React.ReactNode; capitalize?: boolean }> = ({
  label,
  value,
  capitalize = false,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '0.9375rem',
      borderBottom: '1px dashed #e5e7eb',
      paddingBottom: '0.5rem',
    }}
  >
    <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}:</span>
    <span
      style={{
        color: '#111827',
        textAlign: 'right',
        flex: 1,
        marginLeft: '1rem',
        fontWeight: 500,
        textTransform: capitalize ? 'capitalize' : 'none',
      }}
    >
      {value}
    </span>
  </div>
);

const RiskBadge: React.FC<{ level: string }> = ({ level }) => {
  const colors = {
    low: { bg: '#d1fae5', text: '#065f46' },
    medium: { bg: '#fef3c7', text: '#92400e' },
    high: { bg: '#fee2e2', text: '#991b1b' },
  };

  const color = colors[level as keyof typeof colors] || { bg: '#f3f4f6', text: '#4b5563' };

  return (
    <span
      style={{
        padding: '0.25rem 0.75rem',
        background: color.bg,
        color: color.text,
        borderRadius: '1rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        textTransform: 'capitalize',
        display: 'inline-block',
      }}
    >
      {level}
    </span>
  );
};

export default ClientDetailPage;
