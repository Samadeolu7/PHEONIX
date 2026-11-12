import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FieldErrors, portalApi, toApiError } from '../api';
import { usePortalAuth } from '../PortalAuth';
import { AuthCard, Button, Field, Notice, PasswordHint, useUrlToken } from '../ui';

export function RegisterPage() {
  const { info } = usePortalAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (info && !info.allow_registration) {
    return (
      <AuthCard title="Registration closed">
        <Notice>
          Online registration is not open right now. Please visit any of our branches.
        </Notice>
      </AuthCard>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setMessage('');
    if (form.password !== form.confirm) {
      setErrors({ confirm: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      const { first_name, last_name, email, phone, password } = form;
      const res = await portalApi.register({
        first_name,
        last_name,
        email,
        phone,
        password,
        accept_terms: accept,
      });
      setDone(res.detail);
    } catch (err) {
      const e2 = toApiError(err);
      setErrors(e2.fields);
      setMessage(e2.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Check your email">
        <Notice kind="success">{done}</Notice>
        <p className="text-sm text-gray-600 mb-4">
          Open the link we sent to <strong>{form.email}</strong> to verify your address. You can
          sign in now, but you&apos;ll need a verified email before you can apply.
        </p>
        <Link to="/portal/login" className="text-sm font-medium underline">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Apply for a loan online and track your application."
    >
      {message && <Notice kind="error">{message}</Notice>}
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field
            label="First name"
            name="first_name"
            autoComplete="given-name"
            value={form.first_name}
            onChange={set('first_name')}
            error={errors.first_name}
            required
          />
          <Field
            label="Last name"
            name="last_name"
            autoComplete="family-name"
            value={form.last_name}
            onChange={set('last_name')}
            error={errors.last_name}
            required
          />
        </div>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          required
        />
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="08031234567"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          required
        />
        <PasswordHint />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          required
        />
        <label className="flex items-start gap-2 text-sm text-gray-700 mb-1">
          <input
            type="checkbox"
            className="mt-1"
            checked={accept}
            onChange={e => setAccept(e.target.checked)}
          />
          <span>
            I agree to the{' '}
            {info?.terms_url ? (
              <a
                href={info.terms_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                terms of use
              </a>
            ) : (
              'terms of use'
            )}{' '}
            and{' '}
            {info?.privacy_url ? (
              <a
                href={info.privacy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                privacy policy
              </a>
            ) : (
              'privacy policy'
            )}
            .
          </span>
        </label>
        {errors.accept_terms && <p className="text-xs text-red-600 mb-2">{errors.accept_terms}</p>}
        <Button type="submit" className="w-full mt-4" loading={busy}>
          Create account
        </Button>
      </form>
      <p className="text-sm text-gray-600 mt-4 text-center">
        Already have an account?{' '}
        <Link to="/portal/login" className="underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export function LoginPage() {
  const { setCustomer } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const { customer } = await portalApi.login(email, password);
      setCustomer(customer);
      // Only ever redirect to an internal portal path.
      const from = location.state?.from;
      navigate(from && from.startsWith('/portal/') ? from : '/portal/dashboard', { replace: true });
    } catch (err) {
      setMessage(toApiError(err).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in">
      {message && <Notice kind="error">{message}</Notice>}
      <form onSubmit={submit}>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
      <div className="flex justify-between text-sm mt-4">
        <Link to="/portal/forgot-password" className="underline">
          Forgot password?
        </Link>
        <Link to="/portal/register" className="underline">
          Create account
        </Link>
      </div>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const token = useUrlToken();
  const { refresh } = usePortalAuth();
  const [state, setState] = useState<'working' | 'ok' | 'bad'>(token ? 'working' : 'bad');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // StrictMode would otherwise submit the single-use token twice
    portalApi
      .verifyEmail(token)
      .then(r => {
        setMessage(r.detail);
        setState('ok');
        refresh();
      })
      .catch(err => {
        setMessage(toApiError(err).fields.token || toApiError(err).message);
        setState('bad');
      });
  }, [token, refresh]);

  return (
    <AuthCard title="Verify your email">
      {state === 'working' && <p className="text-sm text-gray-600">Verifying…</p>}
      {state === 'ok' && (
        <>
          <Notice kind="success">{message}</Notice>
          <Link to="/portal/dashboard" className="underline text-sm">
            Continue
          </Link>
        </>
      )}
      {state === 'bad' && (
        <>
          <Notice kind="error">
            {message || 'This verification link is invalid or has expired.'}
          </Notice>
          {resent ? (
            <Notice kind="success">{resent}</Notice>
          ) : (
            <form
              onSubmit={async e => {
                e.preventDefault();
                try {
                  setResent((await portalApi.resendVerification(email)).detail);
                } catch (err) {
                  setResent(toApiError(err).message);
                }
              }}
            >
              <Field
                label="Send a new link to"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <Button type="submit">Send new link</Button>
            </form>
          )}
        </>
      )}
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password."
    >
      {done ? (
        <Notice kind="success">{done}</Notice>
      ) : (
        <form
          onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            try {
              setDone((await portalApi.requestReset(email)).detail);
            } catch (err) {
              setMessage(toApiError(err).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {message && <Notice kind="error">{message}</Notice>}
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="text-sm mt-4 text-center">
        <Link to="/portal/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const token = useUrlToken();
  const navigate = useNavigate();
  const { setCustomer } = usePortalAuth();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <Notice kind="error">This reset link is invalid or has expired.</Notice>
        <Link to="/portal/forgot-password" className="underline text-sm">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
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
            await portalApi.confirmReset(token, pw);
            setCustomer(null);
            navigate('/portal/login', { replace: true });
          } catch (err) {
            const e2 = toApiError(err);
            setErrors(e2.fields);
            setMessage(e2.fields.token || e2.message);
          } finally {
            setBusy(false);
          }
        }}
      >
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
        <Button type="submit" className="w-full" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
