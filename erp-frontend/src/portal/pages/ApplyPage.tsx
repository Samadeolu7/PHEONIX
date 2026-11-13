import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from '../../constants/brand';
import { Branch, FieldErrors, Offering, naira, portalApi, toApiError } from '../api';
import { usePortalAuth } from '../PortalAuth';
import { Button, Card, Field, Notice, SelectField } from '../ui';
import { feeText } from './CustomerPages';

const NG_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
].map(s => ({ value: s, label: s }));

const STEPS = [
  'Loan',
  'About you',
  'Identity',
  'Work & income',
  'Next of kin & bank',
  'Review',
] as const;

// Which form fields live on which step (used to jump to the step with a server error).
const STEP_FIELDS: string[][] = [
  ['offering', 'branch', 'requested_amount', 'term', 'repayment_frequency', 'loan_purpose'],
  [
    'title',
    'first_name',
    'middle_name',
    'last_name',
    'gender',
    'date_of_birth',
    'marital_status',
    'phone_primary',
    'phone_secondary',
    'address_street',
    'address_city',
    'address_state',
  ],
  ['nin', 'bvn'],
  ['employment_status', 'occupation', 'employer_name', 'employer_address', 'monthly_income'],
  [
    'next_of_kin_name',
    'next_of_kin_relationship',
    'next_of_kin_phone',
    'bank_name',
    'bank_account_name',
    'bank_account_number',
  ],
  ['consent_credit_check', 'consent_data_processing'],
];

type Form = Record<string, string>;

const initial: Form = {
  offering: '',
  branch: '',
  requested_amount: '',
  term: '',
  repayment_frequency: '',
  loan_purpose: '',
  title: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: '',
  date_of_birth: '',
  marital_status: '',
  phone_primary: '',
  phone_secondary: '',
  address_street: '',
  address_city: '',
  address_state: '',
  nin: '',
  bvn: '',
  employment_status: '',
  occupation: '',
  employer_name: '',
  employer_address: '',
  monthly_income: '',
  next_of_kin_name: '',
  next_of_kin_relationship: '',
  next_of_kin_phone: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
};

const PHONE_RE = /^(\+234|234|0)[789][01]\d{8}$/;
const digits = (v: string) => v.replace(/\D/g, '');

/** Quick client-side checks for a nicer UX. The server re-validates everything. */
function validateStep(step: number, f: Form, offering?: Offering): FieldErrors {
  const e: FieldErrors = {};
  const req = (k: string, label = 'This field is required.') => {
    if (!f[k]?.trim()) e[k] = label;
  };
  if (step === 0) {
    req('offering', 'Choose a loan.');
    req('branch', 'Choose the branch nearest to you.');
    req('requested_amount');
    req('term');
    req('repayment_frequency');
    req('loan_purpose', 'Tell us briefly what the loan is for.');
    if (offering && f.requested_amount) {
      const amt = Number(f.requested_amount);
      if (!(amt >= offering.min_amount && amt <= offering.max_amount))
        e.requested_amount = `Enter between ${naira(offering.min_amount)} and ${naira(offering.max_amount)}.`;
    }
    if (offering && f.term) {
      const t = Number(f.term);
      if (!(t >= offering.min_term && t <= offering.max_term))
        e.term = `Enter between ${offering.min_term} and ${offering.max_term} ${offering.term_unit}.`;
    }
  }
  if (step === 1) {
    [
      'first_name',
      'last_name',
      'gender',
      'date_of_birth',
      'phone_primary',
      'address_street',
      'address_city',
      'address_state',
    ].forEach(k => req(k));
    if (f.phone_primary && !PHONE_RE.test(f.phone_primary.replace(/[\s\-()]/g, '')))
      e.phone_primary = 'Enter a valid Nigerian phone number.';
    if (f.phone_secondary && !PHONE_RE.test(f.phone_secondary.replace(/[\s\-()]/g, '')))
      e.phone_secondary = 'Enter a valid Nigerian phone number.';
  }
  if (step === 2) {
    if (!/^\d{11}$/.test(f.nin)) e.nin = 'NIN must be exactly 11 digits.';
    if (!/^\d{11}$/.test(f.bvn)) e.bvn = 'BVN must be exactly 11 digits.';
    if (f.nin && f.nin === f.bvn) e.bvn = 'BVN and NIN cannot be the same number.';
  }
  if (step === 3) {
    req('employment_status');
    req('monthly_income');
  }
  if (step === 4) {
    ['next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone'].forEach(k => req(k));
    if (f.next_of_kin_phone && !PHONE_RE.test(f.next_of_kin_phone.replace(/[\s\-()]/g, '')))
      e.next_of_kin_phone = 'Enter a valid Nigerian phone number.';
    if (f.bank_account_number && !/^\d{10}$/.test(f.bank_account_number))
      e.bank_account_number = 'Account number must be 10 digits.';
  }
  return e;
}

export function ApplyPage() {
  const { customer } = usePortalAuth();
  const navigate = useNavigate();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<Form>(() => ({
    ...initial,
    first_name: customer?.first_name || '',
    last_name: customer?.last_name || '',
    phone_primary: customer?.phone || '',
  }));
  const [consentCredit, setConsentCredit] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([portalApi.products(), portalApi.branches()])
      .then(([o, b]) => {
        setOfferings(o);
        setBranches(b);
        setLoaded(true);
      })
      .catch(e => setMessage(toApiError(e).message));
  }, []);

  const offering = useMemo(
    () => offerings.find(o => String(o.id) === form.offering),
    [offerings, form.offering]
  );

  const set =
    (k: string, transform?: (v: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const v = transform ? transform(e.target.value) : e.target.value;
      setForm(f => {
        const next = { ...f, [k]: v };
        if (k === 'offering') {
          const o = offerings.find(x => String(x.id) === v);
          next.repayment_frequency =
            o?.repayment_frequencies.length === 1 ? o.repayment_frequencies[0].value : '';
        }
        return next;
      });
    };

  if (customer && !customer.email_verified) {
    return (
      <Notice>
        Please verify your email address before applying.{' '}
        <Link to="/portal/dashboard" className="underline">
          Back
        </Link>
      </Notice>
    );
  }

  const next = () => {
    const e = validateStep(step, form, offering);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      setStep(s => s + 1);
      window.scrollTo(0, 0);
    }
  };

  const submit = async () => {
    if (!consentCredit || !consentData) {
      setErrors({ consent: 'Both consents are required to submit.' });
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        ...form,
        offering: Number(form.offering),
        branch: Number(form.branch),
        term: Number(form.term),
        phone_primary: form.phone_primary.replace(/[\s\-()]/g, ''),
        phone_secondary: form.phone_secondary.replace(/[\s\-()]/g, ''),
        next_of_kin_phone: form.next_of_kin_phone.replace(/[\s\-()]/g, ''),
        consent_credit_check: consentCredit,
        consent_data_processing: consentData,
      };
      const app = await portalApi.apply(body);
      navigate(`/portal/applications/${app.reference}`, { replace: true });
    } catch (err) {
      const e2 = toApiError(err);
      setErrors(e2.fields);
      setMessage(e2.message);
      const badStep = STEP_FIELDS.findIndex(fs => fs.some(k => e2.fields[k]));
      if (badStep >= 0) setStep(badStep);
    } finally {
      setBusy(false);
    }
  };

  const freqOptions = offering?.repayment_frequencies || [];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1" style={{ color: BRAND.colors.textPrimary }}>
        Loan application
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>
      <ol className="flex gap-1 mb-6" aria-hidden>
        {STEPS.map((s, i) => (
          <li
            key={s}
            className="flex-1 h-1.5 rounded"
            style={{ background: i <= step ? BRAND.colors.gold : '#e5e1d6' }}
          />
        ))}
      </ol>
      {message && <Notice kind="error">{message}</Notice>}
      {loaded && offerings.length === 0 && (
        <Notice>
          No loans are open for online applications right now. Please check back later or contact
          your branch.
        </Notice>
      )}

      <Card>
        {step === 0 && (
          <>
            <SelectField
              label="Loan"
              name="offering"
              value={form.offering}
              onChange={set('offering')}
              error={errors.offering}
              placeholder="Select a loan"
              options={offerings.map(o => ({ value: o.id, label: o.name }))}
            />
            {offering && (
              <p className="text-xs text-gray-600 -mt-2 mb-4">
                {naira(offering.min_amount)}–{naira(offering.max_amount)} · {offering.interest_rate}
                % interest ({offering.interest_method.toLowerCase()}) · {offering.min_term}–
                {offering.max_term} {offering.term_unit} · processing fee {feeText(offering)}
              </p>
            )}
            <SelectField
              label="Branch"
              name="branch"
              value={form.branch}
              onChange={set('branch')}
              error={errors.branch}
              placeholder="Select the branch nearest to you"
              options={branches.map(b => ({
                value: b.id,
                label: [b.name, b.city].filter(Boolean).join(' — '),
              }))}
            />
            <Field
              label="Amount (₦)"
              name="requested_amount"
              inputMode="numeric"
              value={form.requested_amount}
              onChange={set('requested_amount', v => v.replace(/[^\d.]/g, ''))}
              error={errors.requested_amount}
            />
            <div className="grid grid-cols-2 gap-x-4">
              <Field
                label={`Term${offering ? ` (${offering.term_unit})` : ''}`}
                name="term"
                inputMode="numeric"
                value={form.term}
                onChange={set('term', digits)}
                error={errors.term}
              />
              <SelectField
                label="Repayment"
                name="repayment_frequency"
                value={form.repayment_frequency}
                onChange={set('repayment_frequency')}
                error={errors.repayment_frequency}
                placeholder="Select"
                options={freqOptions}
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="loan_purpose"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                What is the loan for?
              </label>
              <textarea
                id="loan_purpose"
                maxLength={1000}
                rows={3}
                value={form.loan_purpose}
                onChange={set('loan_purpose')}
                className={`w-full rounded-md border px-3 py-2 text-sm ${errors.loan_purpose ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.loan_purpose && (
                <p className="text-xs text-red-600 mt-1">{errors.loan_purpose}</p>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
              <SelectField
                label="Title"
                name="title"
                value={form.title}
                onChange={set('title')}
                placeholder="—"
                options={[
                  { value: 'mr', label: 'Mr' },
                  { value: 'mrs', label: 'Mrs' },
                  { value: 'miss', label: 'Miss' },
                  { value: 'dr', label: 'Dr' },
                  { value: 'chief', label: 'Chief' },
                ]}
              />
              <Field
                label="First name"
                name="first_name"
                value={form.first_name}
                onChange={set('first_name')}
                error={errors.first_name}
              />
              <Field
                label="Middle name"
                name="middle_name"
                value={form.middle_name}
                onChange={set('middle_name')}
                error={errors.middle_name}
              />
            </div>
            <Field
              label="Last name"
              name="last_name"
              value={form.last_name}
              onChange={set('last_name')}
              error={errors.last_name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
              <SelectField
                label="Gender"
                name="gender"
                value={form.gender}
                onChange={set('gender')}
                error={errors.gender}
                placeholder="Select"
                options={[
                  { value: 'female', label: 'Female' },
                  { value: 'male', label: 'Male' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              <Field
                label="Date of birth"
                name="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={set('date_of_birth')}
                error={errors.date_of_birth}
              />
              <SelectField
                label="Marital status"
                name="marital_status"
                value={form.marital_status}
                onChange={set('marital_status')}
                placeholder="—"
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'married', label: 'Married' },
                  { value: 'divorced', label: 'Divorced' },
                  { value: 'widowed', label: 'Widowed' },
                ]}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field
                label="Phone number"
                name="phone_primary"
                type="tel"
                value={form.phone_primary}
                onChange={set('phone_primary')}
                error={errors.phone_primary}
              />
              <Field
                label="Other phone (optional)"
                name="phone_secondary"
                type="tel"
                value={form.phone_secondary}
                onChange={set('phone_secondary')}
                error={errors.phone_secondary}
              />
            </div>
            <Field
              label="Home address"
              name="address_street"
              autoComplete="street-address"
              value={form.address_street}
              onChange={set('address_street')}
              error={errors.address_street}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field
                label="Town / city"
                name="address_city"
                value={form.address_city}
                onChange={set('address_city')}
                error={errors.address_city}
              />
              <SelectField
                label="State"
                name="address_state"
                value={form.address_state}
                onChange={set('address_state')}
                error={errors.address_state}
                placeholder="Select"
                options={NG_STATES}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Notice>
              We use your NIN and BVN only to confirm your identity and check your credit history.
              They are encrypted, and after you submit we only ever show the last four digits.
            </Notice>
            <Field
              label="National Identification Number (NIN)"
              name="nin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={form.nin}
              onChange={set('nin', digits)}
              error={errors.nin}
            />
            <Field
              label="Bank Verification Number (BVN)"
              name="bvn"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={form.bvn}
              onChange={set('bvn', digits)}
              error={errors.bvn}
              hint="Dial *565*0# on the phone number linked to your bank account."
            />
          </>
        )}

        {step === 3 && (
          <>
            <SelectField
              label="Employment"
              name="employment_status"
              value={form.employment_status}
              onChange={set('employment_status')}
              error={errors.employment_status}
              placeholder="Select"
              options={[
                { value: 'employed', label: 'Employed' },
                { value: 'self_employed', label: 'Self-employed / Business owner' },
                { value: 'unemployed', label: 'Unemployed' },
                { value: 'retired', label: 'Retired' },
                { value: 'student', label: 'Student' },
              ]}
            />
            <Field
              label="Occupation / type of business"
              name="occupation"
              value={form.occupation}
              onChange={set('occupation')}
              error={errors.occupation}
            />
            <Field
              label="Employer or business name"
              name="employer_name"
              value={form.employer_name}
              onChange={set('employer_name')}
              error={errors.employer_name}
            />
            <Field
              label="Employer or business address"
              name="employer_address"
              value={form.employer_address}
              onChange={set('employer_address')}
              error={errors.employer_address}
            />
            <Field
              label="Average monthly income (₦)"
              name="monthly_income"
              inputMode="numeric"
              value={form.monthly_income}
              onChange={set('monthly_income', v => v.replace(/[^\d.]/g, ''))}
              error={errors.monthly_income}
            />
          </>
        )}

        {step === 4 && (
          <>
            <h3 className="font-medium mb-2">Next of kin</h3>
            <Field
              label="Full name"
              name="next_of_kin_name"
              value={form.next_of_kin_name}
              onChange={set('next_of_kin_name')}
              error={errors.next_of_kin_name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field
                label="Relationship"
                name="next_of_kin_relationship"
                value={form.next_of_kin_relationship}
                onChange={set('next_of_kin_relationship')}
                error={errors.next_of_kin_relationship}
              />
              <Field
                label="Phone number"
                name="next_of_kin_phone"
                type="tel"
                value={form.next_of_kin_phone}
                onChange={set('next_of_kin_phone')}
                error={errors.next_of_kin_phone}
              />
            </div>
            <h3 className="font-medium mb-2 mt-2">Bank account for disbursement (optional)</h3>
            <Field
              label="Bank name"
              name="bank_name"
              value={form.bank_name}
              onChange={set('bank_name')}
              error={errors.bank_name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field
                label="Account name"
                name="bank_account_name"
                value={form.bank_account_name}
                onChange={set('bank_account_name')}
                error={errors.bank_account_name}
              />
              <Field
                label="Account number"
                name="bank_account_number"
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                value={form.bank_account_number}
                onChange={set('bank_account_number', digits)}
                error={errors.bank_account_number}
              />
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <dl className="text-sm grid grid-cols-2 gap-y-2 mb-6">
              <dt className="text-gray-500">Loan</dt>
              <dd>{offering?.name}</dd>
              <dt className="text-gray-500">Amount</dt>
              <dd>{naira(form.requested_amount)}</dd>
              <dt className="text-gray-500">Term</dt>
              <dd>
                {form.term} {offering?.term_unit}
              </dd>
              <dt className="text-gray-500">Repayment</dt>
              <dd>{freqOptions.find(f => f.value === form.repayment_frequency)?.label}</dd>
              <dt className="text-gray-500">Branch</dt>
              <dd>{branches.find(b => String(b.id) === form.branch)?.name}</dd>
              <dt className="text-gray-500">Name</dt>
              <dd>
                {[form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ')}
              </dd>
              <dt className="text-gray-500">Phone</dt>
              <dd>{form.phone_primary}</dd>
              <dt className="text-gray-500">NIN / BVN</dt>
              <dd>
                •••••••{form.nin.slice(-4)} / •••••••{form.bvn.slice(-4)}
              </dd>
              <dt className="text-gray-500">Monthly income</dt>
              <dd>{naira(form.monthly_income)}</dd>
            </dl>
            <label className="flex items-start gap-2 text-sm mb-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentCredit}
                onChange={e => setConsentCredit(e.target.checked)}
              />
              <span>
                I authorise {BRAND.companyName} to verify my identity and check my credit history
                with licensed credit bureaus.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm mb-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentData}
                onChange={e => setConsentData(e.target.checked)}
              />
              <span>
                I confirm the information above is true and consent to it being processed to assess
                this application, in line with the privacy policy.
              </span>
            </label>
            {(errors.consent || errors.consent_credit_check || errors.consent_data_processing) && (
              <p className="text-xs text-red-600 mb-2">
                {errors.consent || errors.consent_credit_check || errors.consent_data_processing}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Submitting does not approve a loan. A loan officer will review your application and
              contact you. We will never ask you to pay a fee to a personal account to &quot;speed
              up&quot; approval.
            </p>
          </>
        )}

        <div className="flex justify-between mt-6">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={submit} loading={busy}>
              Submit application
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
