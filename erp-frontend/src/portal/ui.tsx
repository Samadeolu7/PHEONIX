import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BRAND } from '../constants/brand';
import { usePortalAuth } from './PortalAuth';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { customer, info, logout } = usePortalAuth();
  const navigate = useNavigate();
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
    }`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BRAND.colors.offWhite }}>
      <header style={{ background: BRAND.colors.navyPrimary }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/portal" className="flex items-center gap-3 min-w-0">
            <img src={BRAND.logoUrl} alt="" className="h-9 w-9 rounded bg-white p-1" />
            <span className="text-white font-semibold truncate">
              {info?.organisation || BRAND.companyName}
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {customer ? (
              <>
                <NavLink to="/portal/accounts" className={navCls}>
                  My accounts
                </NavLink>
                <NavLink to="/portal/dashboard" className={navCls}>
                  My applications
                </NavLink>
                <NavLink to="/portal/account" className={navCls}>
                  Account
                </NavLink>
                <button
                  className="px-3 py-2 text-sm text-white/80 hover:text-white"
                  onClick={async () => {
                    await logout();
                    navigate('/portal/login');
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/portal/login" className={navCls}>
                  Sign in
                </NavLink>
                {info?.allow_registration !== false && (
                  <NavLink to="/portal/register" className={navCls}>
                    Create account
                  </NavLink>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">{children}</main>
      <footer className="border-t text-xs text-gray-500" style={{ borderColor: '#e5e1d6' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            © {new Date().getFullYear()} {info?.organisation || BRAND.companyName}
          </span>
          {info?.support_phone && <span>Support: {info.support_phone}</span>}
          {info?.support_email && <span>{info.support_email}</span>}
          {info?.terms_url && (
            <a
              href={info.terms_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Terms
            </a>
          )}
          {info?.privacy_url && (
            <a
              href={info.privacy_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Privacy
            </a>
          )}
          <span>We will never ask for your password or PIN by phone, SMS or email.</span>
        </div>
      </footer>
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border p-6 ${className}`}
      style={{ borderColor: '#ebe5d6' }}
    >
      {children}
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-md mx-auto">
      <Card>
        <h1 className="text-2xl font-semibold mb-1" style={{ color: BRAND.colors.textPrimary }}>
          {title}
        </h1>
        {subtitle && <p className="text-sm text-gray-600 mb-6">{subtitle}</p>}
        {!subtitle && <div className="mb-4" />}
        {children}
      </Card>
    </div>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, id, ...rest }: FieldProps) {
  const fid = id || rest.name;
  return (
    <div className="mb-4">
      <label htmlFor={fid} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={fid}
        {...rest}
        aria-invalid={!!error}
        aria-describedby={error ? `${fid}-err` : undefined}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
          error ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'
        }`}
      />
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {error && (
        <p id={`${fid}-err`} className="text-xs text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

export function SelectField({ label, error, options, placeholder, id, ...rest }: SelectProps) {
  const fid = id || rest.name;
  return (
    <div className="mb-4">
      <label htmlFor={fid} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <select
        id={fid}
        {...rest}
        aria-invalid={!!error}
        className={`w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 ${
          error ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'
        }`}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  loading,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: BRAND.colors.navyPrimary, color: '#fff' },
    secondary: { background: '#fff', color: BRAND.colors.navyPrimary, border: '1px solid #d1d5db' },
    danger: { background: '#fff', color: '#b91c1c', border: '1px solid #fca5a5' },
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      style={styles[variant]}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${className}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: React.ReactNode;
}) {
  const cls = {
    info: 'bg-blue-50 text-blue-900 border-blue-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-green-50 text-green-800 border-green-200',
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`border rounded-md px-4 py-3 text-sm mb-4 ${cls}`}
    >
      {children}
    </div>
  );
}

export function PasswordHint() {
  return (
    <p className="text-xs text-gray-500 -mt-2 mb-4">
      At least 8 characters. Avoid common passwords, all-number passwords, or anything close to your
      name or email. A short phrase works well.
    </p>
  );
}

/** Read a one-time token from the URL, then strip it so it can't leak via history/Referer. */
export function useUrlToken(): string {
  const [token] = React.useState(
    () => new URLSearchParams(window.location.search).get('token') || ''
  );
  React.useEffect(() => {
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);
  return token;
}

export const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-amber-100 text-amber-800',
  converted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-700',
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100'}`}
    >
      {label}
    </span>
  );
}
