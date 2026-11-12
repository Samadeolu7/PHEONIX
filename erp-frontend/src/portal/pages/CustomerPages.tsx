import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BRAND } from '../../constants/brand';
import { Application, FieldErrors, Offering, naira, portalApi, toApiError } from '../api';
import { usePortalAuth } from '../PortalAuth';
import { Button, Card, Field, Notice, PasswordHint, StatusBadge } from '../ui';
import { DocumentsCard } from './DocumentsCard';

const FREQ_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

export function feeText(o: Offering) {
  if (o.processing_fee_type === 'fixed')
    return o.processing_fee_amount ? naira(o.processing_fee_amount) : 'None';
  return o.processing_fee_percentage ? `${o.processing_fee_percentage}% of amount` : 'None';
}

export function LandingPage() {
  const { customer, info } = usePortalAuth();
  const [products, setProducts] = useState<Offering[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi
      .products()
      .then(setProducts)
      .catch(e => setError(toApiError(e).message));
  }, []);

  return (
    <>
      <section className="mb-8">
        <h1 className="text-3xl font-semibold mb-2" style={{ color: BRAND.colors.textPrimary }}>
          Apply for a loan online
        </h1>
        <p className="text-gray-600 max-w-2xl">
          Create an account, fill in one application and track its progress here. A loan officer at
          the branch you choose will review it and contact you. Applying is free and does not commit
          you to anything.
        </p>
        <div className="mt-4 flex gap-3">
          {customer ? (
            <Link to="/portal/apply">
              <Button>Start an application</Button>
            </Link>
          ) : (
            <>
              {info?.allow_registration !== false && (
                <Link to="/portal/register">
                  <Button>Create account</Button>
                </Link>
              )}
              <Link to="/portal/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
            </>
          )}
        </div>
      </section>

      <h2 className="text-lg font-semibold mb-3" style={{ color: BRAND.colors.textPrimary }}>
        Available loans
      </h2>
      {error && <Notice kind="error">{error}</Notice>}
      {products && products.length === 0 && (
        <Notice>No loans are open for online applications right now.</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {products?.map(p => (
          <Card key={p.id}>
            <h3 className="font-semibold text-lg mb-1">{p.name}</h3>
            {p.public_description && (
              <p className="text-sm text-gray-600 mb-3 whitespace-pre-line">
                {p.public_description}
              </p>
            )}
            <dl className="text-sm grid grid-cols-2 gap-y-1">
              <dt className="text-gray-500">Amount</dt>
              <dd>
                {naira(p.min_amount)} – {naira(p.max_amount)}
              </dd>
              <dt className="text-gray-500">Interest</dt>
              <dd>
                {p.interest_rate}% ({p.interest_method.toLowerCase()})
              </dd>
              <dt className="text-gray-500">Term</dt>
              <dd>
                {p.min_term}–{p.max_term} {p.term_unit}
              </dd>
              <dt className="text-gray-500">Repayment</dt>
              <dd>{p.repayment_frequencies.map(f => f.label).join(', ')}</dd>
              <dt className="text-gray-500">Processing fee</dt>
              <dd>{feeText(p)}</dd>
              {p.insurance_rate > 0 && (
                <>
                  <dt className="text-gray-500">Insurance</dt>
                  <dd>{p.insurance_rate}%</dd>
                </>
              )}
            </dl>
            {(p.requires_guarantor || p.requires_collateral) && (
              <p className="text-xs text-gray-500 mt-3">
                Requires{' '}
                {[p.requires_guarantor && 'a guarantor', p.requires_collateral && 'collateral']
                  .filter(Boolean)
                  .join(' and ')}{' '}
                — the branch will discuss this with you.
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

export function DashboardPage() {
  const { customer } = usePortalAuth();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi
      .applications()
      .then(setApps)
      .catch(e => setError(toApiError(e).message));
  }, []);

  const hasOpen = apps?.some(a => a.status === 'submitted' || a.status === 'under_review');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: BRAND.colors.textPrimary }}>
          Hello, {customer?.first_name}
        </h1>
        {customer?.email_verified && !hasOpen && (
          <Link to="/portal/apply">
            <Button>New application</Button>
          </Link>
        )}
      </div>
      {customer && !customer.email_verified && (
        <Notice>
          Please verify your email address before applying — check your inbox for the link we sent
          to <strong>{customer.email}</strong>.{' '}
          <Link to="/portal/verify-email" className="underline">
            Need a new link?
          </Link>
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {apps && apps.length === 0 && (
        <Card>
          <p className="text-sm text-gray-600">You haven&apos;t applied yet.</p>
        </Card>
      )}
      <div className="space-y-3">
        {apps?.map(a => (
          <Link key={a.reference} to={`/portal/applications/${a.reference}`} className="block">
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {a.product_name} · {naira(a.requested_amount)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {a.reference} · {a.branch_name} · submitted{' '}
                    {new Date(a.submitted_at).toLocaleDateString('en-NG')}
                  </div>
                </div>
                <StatusBadge status={a.status} label={a.status_display} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

const STATUS_HELP: Record<string, string> = {
  submitted: 'We have your application. A loan officer will start reviewing it shortly.',
  under_review:
    'A loan officer is reviewing your application and may call you to confirm details or invite you to the branch.',
  converted:
    'Your application has been accepted for processing at the branch. A loan officer will contact you about the next steps, including documents and approval.',
  rejected: 'We are unable to proceed with this application.',
  withdrawn: 'You withdrew this application.',
};

export function ApplicationDetailPage() {
  const { reference = '' } = useParams();
  const [app, setApp] = useState<Application | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    portalApi
      .application(reference)
      .then(setApp)
      .catch(e => setError(toApiError(e).message));
  }, [reference]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!app) return null;

  return (
    <div className="max-w-2xl">
      <Link to="/portal/dashboard" className="text-sm underline">
        ← My applications
      </Link>
      <Card className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div>
            <h1 className="text-xl font-semibold">{app.product_name}</h1>
            <p className="text-xs text-gray-500">Reference {app.reference}</p>
          </div>
          <StatusBadge status={app.status} label={app.status_display} />
        </div>
        <p className="text-sm text-gray-700 mb-4">{STATUS_HELP[app.status]}</p>
        {app.customer_message && <Notice>{app.customer_message}</Notice>}
        <dl className="text-sm grid grid-cols-2 gap-y-2">
          <dt className="text-gray-500">Amount</dt>
          <dd>{naira(app.requested_amount)}</dd>
          <dt className="text-gray-500">Term</dt>
          <dd>
            {app.term} {app.term_unit}
          </dd>
          <dt className="text-gray-500">Repayment</dt>
          <dd>{FREQ_LABEL[app.repayment_frequency] || app.repayment_frequency}</dd>
          <dt className="text-gray-500">Branch</dt>
          <dd>{app.branch_name}</dd>
          <dt className="text-gray-500">Applicant</dt>
          <dd>{[app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')}</dd>
          <dt className="text-gray-500">NIN</dt>
          <dd>{app.nin_masked}</dd>
          <dt className="text-gray-500">BVN</dt>
          <dd>{app.bvn_masked}</dd>
          <dt className="text-gray-500">Submitted</dt>
          <dd>{new Date(app.submitted_at).toLocaleString('en-NG')}</dd>
        </dl>
        {app.can_withdraw && (
          <div className="mt-6">
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!window.confirm('Withdraw this application? You can apply again afterwards.'))
                  return;
                setBusy(true);
                try {
                  setApp(await portalApi.withdraw(app.reference));
                } catch (e) {
                  setError(toApiError(e).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Withdraw application
            </Button>
          </div>
        )}
      </Card>
      <DocumentsCard app={app} onChange={documents => setApp({ ...app, documents })} />
    </div>
  );
}

export function AccountPage() {
  const { customer, setCustomer } = usePortalAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-4" style={{ color: BRAND.colors.textPrimary }}>
        Account
      </h1>
      <Card className="mb-4">
        <dl className="text-sm grid grid-cols-3 gap-y-2">
          <dt className="text-gray-500">Name</dt>
          <dd className="col-span-2">
            {customer?.first_name} {customer?.last_name}
          </dd>
          <dt className="text-gray-500">Email</dt>
          <dd className="col-span-2">
            {customer?.email} {customer?.email_verified ? '✓' : '(not verified)'}
          </dd>
          <dt className="text-gray-500">Phone</dt>
          <dd className="col-span-2">{customer?.phone}</dd>
        </dl>
      </Card>
      <Card>
        <h2 className="font-semibold mb-3">Change password</h2>
        <p className="text-xs text-gray-500 mb-3">You will be signed out on all devices.</p>
        {message && <Notice kind="error">{message}</Notice>}
        <form
          onSubmit={async e => {
            e.preventDefault();
            setErrors({});
            setMessage('');
            if (pw !== confirm) {
              setErrors({ confirm: 'Passwords do not match.' });
              return;
            }
            setBusy(true);
            try {
              await portalApi.changePassword(current, pw);
              setCustomer(null);
              navigate('/portal/login', { replace: true });
            } catch (err) {
              const e2 = toApiError(err);
              setErrors(e2.fields);
              setMessage(e2.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Current password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            error={errors.current_password}
            required
          />
          <Field
            label="New password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            error={errors.new_password}
            required
          />
          <PasswordHint />
          <Field
            label="Confirm new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            error={errors.confirm}
            required
          />
          <Button type="submit" loading={busy}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
