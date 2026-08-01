// src/components/auth/LoginPageStyled.tsx
//  Master Moulders International Academy  Branded Login
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/authService';
import { useToast } from '../../hooks/useToast';
import {
  Lock,
  User as UserIcon,
  AlertCircle,
  Loader,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { BRAND } from '../../constants/brand';
import { getRedirectPathForUser } from '../../utils/roleBasedRedirect';

//  Style helpers
const C = BRAND.colors;

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'row', overflow: 'hidden' },
  heroPanel: {
    flex: '0 0 58%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: C.navyPrimary,
  },
  heroBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${BRAND.buildingImageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center top',
    opacity: 0.3,
  },
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    background: `linear-gradient(160deg,${C.navyDark} 0%,${C.navyPrimary} 55%,${C.navyLight} 100%)`,
    opacity: 0.88,
  },
  heroBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '5px',
    background: `linear-gradient(90deg,${C.gold} 0%,#fff6b0 50%,${C.gold} 100%)`,
  },
  heroBarB: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: `linear-gradient(90deg,${C.gold} 0%,#fff6b0 50%,${C.gold} 100%)`,
  },
  heroContent: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '3rem 2.5rem',
    textAlign: 'center',
    maxWidth: '480px',
  },
  logoRing: {
    width: '130px',
    height: '130px',
    borderRadius: '50%',
    border: `4px solid ${C.gold}`,
    padding: '6px',
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(4px)',
    marginBottom: '1.5rem',
    boxShadow: `0 0 40px rgba(232,184,0,0.30),0 8px 32px rgba(0,0,0,0.4)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' },
  schoolName: {
    fontSize: '1.55rem',
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '0.02em',
    lineHeight: 1.2,
    marginBottom: '0.5rem',
    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  highlight: { color: C.gold },
  divider: {
    width: '60px',
    height: '3px',
    borderRadius: '2px',
    background: `linear-gradient(90deg,${C.gold},#fff)`,
    margin: '1rem auto',
  },
  motto: {
    fontSize: '1.05rem',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.90)',
    letterSpacing: '0.06em',
    marginBottom: '0.75rem',
  },
  tagline: {
    fontSize: '0.78rem',
    color: C.gold,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: '2rem',
  },
  bannerWrap: {
    width: '100%',
    borderRadius: '12px',
    overflow: 'hidden',
    marginTop: '0.5rem',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    border: `2px solid rgba(232,184,0,0.40)`,
    maxHeight: '120px',
  },
  bannerImg: {
    width: '100%',
    height: '120px',
    objectFit: 'cover',
    objectPosition: 'center',
    display: 'block',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginTop: '1.5rem',
    padding: '0.35rem 1rem',
    borderRadius: '999px',
    background: 'rgba(232,184,0,0.15)',
    border: `1px solid ${C.gold}`,
    color: C.gold,
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  formPanel: {
    flex: '0 0 42%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: C.offWhite,
    padding: '2rem 2.5rem',
    overflowY: 'auto',
  },
  formCard: { width: '100%', maxWidth: '360px' },
  logoRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' },
  logoThumb: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: `2px solid ${C.gold}`,
    objectFit: 'contain',
    background: C.navyPrimary,
    padding: '2px',
  },
  brandText: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 },
  brandName: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: C.navyPrimary,
    letterSpacing: '0.04em',
  },
  brandSub: {
    fontSize: '0.68rem',
    color: C.gold,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  heading: { fontSize: '1.55rem', fontWeight: 700, color: C.navyPrimary, marginBottom: '0.25rem' },
  subheading: { fontSize: '0.85rem', color: C.textSecondary, marginBottom: '1.75rem' },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderLeft: `4px solid ${C.red}`,
    borderRadius: '0.5rem',
    padding: '0.875rem 1rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: C.navyPrimary,
    marginBottom: '0.4rem',
    letterSpacing: '0.03em',
  },
  inputWrap: { position: 'relative', marginBottom: '1.25rem' },
  inputIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  input: {
    display: 'block',
    width: '100%',
    paddingLeft: '2.6rem',
    paddingRight: '0.875rem',
    paddingTop: '0.7rem',
    paddingBottom: '0.7rem',
    border: `1.5px solid ${C.border}`,
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    background: '#fff',
    color: C.textPrimary,
    outline: 'none',
    transition: 'border-color 0.2s,box-shadow 0.2s',
  },
  eyeBtn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  rememberRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
  },
  forgotLink: {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: C.navyPrimary,
    textDecoration: 'none',
  },
  submitBtn: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.8rem 1rem',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#fff',
    background: `linear-gradient(135deg,${C.navyLight} 0%,${C.navyPrimary} 100%)`,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 14px rgba(26,40,82,0.35)',
    letterSpacing: '0.04em',
  },
  submitDis: { background: '#9ca3af', cursor: 'not-allowed', boxShadow: 'none' },
  divRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0 0.5rem' },
  divLine: { flex: 1, height: '1px', background: C.border },
  divTxt: { fontSize: '0.72rem', color: C.textSecondary, whiteSpace: 'nowrap' },
  footer: {
    marginTop: '2rem',
    textAlign: 'center',
    fontSize: '0.72rem',
    color: '#adb5bd',
    lineHeight: 1.6,
  },
  footerHL: { color: C.goldDark, fontWeight: 600 },
};

//  Component
const LoginPageStyled: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await authService.login(formData);
      toast.success(`Welcome back, ${user.username || user.email}!`, {
        title: 'Login Successful',
        duration: 3000,
      });
      navigate(getRedirectPathForUser(user), { replace: true });
    } catch (err: any) {
      const msg = err.message || 'Login failed. Please check your credentials.';
      setError(msg);
      toast.error(msg, { title: 'Authentication Failed', duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes mmFadeUp{ from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .mm-hero { animation: mmFadeUp 0.7s ease both }
        .mm-form { animation: mmFadeUp 0.6s 0.15s ease both }
        .mm-input:focus {
          border-color: ${C.gold} !important;
          box-shadow: 0 0 0 3px ${C.goldLight} !important;
        }
        .mm-btn:hover:not(:disabled) {
          transform:translateY(-2px);
          box-shadow:0 8px 20px rgba(26,40,82,0.45) !important;
        }
        @media(max-width:768px){
          .mm-page      { flex-direction:column !important }
          .mm-hero-panel{ flex:0 0 auto !important; min-height:220px }
          .mm-form-panel{ flex:1 !important }
          .mm-school    { font-size:1.1rem !important }
          .mm-banner    { display:none !important }
        }
      `,
        }}
      />

      <div style={S.page} className="mm-page">
        {/*  LEFT hero  */}
        <div style={S.heroPanel} className="mm-hero-panel">
          <div style={S.heroBg} />
          <div style={S.heroOverlay} />
          <div style={S.heroBar} />
          <div style={S.heroBarB} />

          <div style={S.heroContent} className="mm-hero">
            <div style={S.logoRing}>
              <img
                src={BRAND.logoUrl}
                alt={`${BRAND.shortName} Logo`}
                style={S.logoImg}
                fetchpriority="high"
                onError={e => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>

            <h1 style={S.schoolName} className="mm-school">
              <span style={S.highlight}>{BRAND.companyName}</span>
            </h1>

            <div style={S.divider} />
            <p style={S.motto}>&#8220;{BRAND.motto}&#8221;</p>
            <p style={S.tagline}>{BRAND.tagline}</p>

            <span style={S.badge}>
              <ShieldCheck size={13} />
              &nbsp;{BRAND.govtApproved}
            </span>
          </div>
        </div>

        {/*  RIGHT form  */}
        <div style={S.formPanel} className="mm-form-panel">
          <div style={S.formCard} className="mm-form">
            <div style={S.logoRow}>
              <img
                src={BRAND.logoUrl}
                alt="logo"
                style={S.logoThumb}
                onError={e => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div style={S.brandText}>
                <span style={S.brandName}>{BRAND.shortName}</span>
                <span style={S.brandSub}>Microfinance ERP Platform</span>
              </div>
            </div>

            <h2 style={S.heading}>Welcome back</h2>
            <p style={S.subheading}>Sign in to your staff account to continue</p>

            {error && (
              <div style={S.errorBox}>
                <AlertCircle size={17} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#991b1b',
                      marginBottom: '0.2rem',
                    }}
                  >
                    Authentication Error
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#b91c1c' }}>{error}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="username" style={S.label}>
                Username or Email
              </label>
              <div style={S.inputWrap}>
                <div style={S.inputIcon}>
                  <UserIcon size={16} color={C.textSecondary} />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  disabled={loading}
                  style={S.input}
                  className="mm-input"
                  placeholder="Enter your username"
                />
              </div>

              <label htmlFor="password" style={S.label}>
                Password
              </label>
              <div style={{ ...S.inputWrap, marginBottom: '0.5rem' }}>
                <div style={S.inputIcon}>
                  <Lock size={16} color={C.textSecondary} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  disabled={loading}
                  style={{ ...S.input, paddingRight: '2.75rem' }}
                  className="mm-input"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  style={S.eyeBtn}
                  onClick={() => setShowPw(p => !p)}
                  disabled={loading}
                  aria-label="Toggle password visibility"
                >
                  {showPw ? (
                    <EyeOff size={16} color={C.textSecondary} />
                  ) : (
                    <Eye size={16} color={C.textSecondary} />
                  )}
                </button>
              </div>

              <div style={{ ...S.rememberRow, justifyContent: 'flex-end' }}>
                <Link to="/forgot-password" style={S.forgotLink}>
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={loading ? { ...S.submitBtn, ...S.submitDis } : S.submitBtn}
                className="mm-btn"
              >
                {loading ? (
                  <>
                    <Loader size={17} style={{ animation: 'spin 1s linear infinite' }} />
                    Signing in&hellip;
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div style={S.divRow}>
              <div style={S.divLine} />
              <span style={S.divTxt}>Secure Portal</span>
              <div style={S.divLine} />
            </div>

            <div style={S.footer}>
              <p>
                <span style={S.footerHL}>{BRAND.shortName}</span>
              </p>
              <p style={{ marginTop: '0.25rem' }}>
                &copy; {new Date().getFullYear()} {BRAND.systemLabel} &middot; All rights reserved
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPageStyled;
