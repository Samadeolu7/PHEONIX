// src/pages/profile/UserProfilePage.tsx
import React, { useState } from 'react';
import { User, Lock, Save, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '@/services/authService';
import { useToast } from '@/hooks/useToast';
import { getRoleRank } from '@/types/roles';

const UserProfilePage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const userRoles: string[] = (user as any)?.roles || [];
  const isPrivileged = Math.max(0, ...userRoles.map(getRoleRank)) >= 3;

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await authService.updateProfile({
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        email: profileForm.email,
      });
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwordForm.new_password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPasswordSaving(true);
    try {
      await authService.changePassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      toast.success('Password changed successfully');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.375rem',
  };

  const fieldGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  };

  return (
    <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}
        >
          <div
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '50%',
              background: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User style={{ width: '1.5rem', height: '1.5rem', color: '#2563eb' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              My Profile
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              {user?.email} &nbsp;·&nbsp;
              {userRoles.length > 0 ? userRoles.join(', ') : 'No role assigned'}
            </p>
          </div>
          {isPrivileged && (
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.75rem',
                background: '#fef3c7',
                color: '#92400e',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <Shield style={{ width: '0.875rem', height: '0.875rem' }} />
              {userRoles[0]}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {(['profile', 'security'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.625rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === tab ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'color 0.15s',
              }}
            >
              {tab === 'profile' ? (
                <User style={{ width: '1rem', height: '1rem' }} />
              ) : (
                <Lock style={{ width: '1rem', height: '1rem' }} />
              )}
              {tab === 'profile' ? 'Personal Info' : 'Change Password'}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            padding: '1.5rem',
          }}
        >
          <h2
            style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '1.25rem' }}
          >
            Personal Information
          </h2>
          <form
            onSubmit={handleProfileSave}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {/* Read-only username */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                value={user?.username || ''}
                disabled
                style={{
                  ...inputStyle,
                  background: '#f9fafb',
                  color: '#9ca3af',
                  cursor: 'not-allowed',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                Username cannot be changed
              </span>
            </div>

            {/* First & Last name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>First Name</label>
                <input
                  type="text"
                  value={profileForm.first_name}
                  onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
                  style={inputStyle}
                  placeholder="First name"
                />
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Last Name</label>
                <input
                  type="text"
                  value={profileForm.last_name}
                  onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
                  style={inputStyle}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                style={inputStyle}
                placeholder="email@example.com"
              />
            </div>

            <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
              <button
                type="submit"
                disabled={profileSaving}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: profileSaving ? '#93c5fd' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  cursor: profileSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Save style={{ width: '1rem', height: '1rem' }} />
                {profileSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            padding: '1.5rem',
          }}
        >
          <h2
            style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}
          >
            Change Password
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Use a strong password with at least 8 characters.
          </p>
          <form
            onSubmit={handlePasswordSave}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {/* Old password */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Current Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={passwordForm.old_password}
                  onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                  style={{ ...inputStyle, paddingRight: '2.5rem' }}
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: 0,
                  }}
                >
                  {showOldPassword ? (
                    <EyeOff style={{ width: '1rem', height: '1rem' }} />
                  ) : (
                    <Eye style={{ width: '1rem', height: '1rem' }} />
                  )}
                </button>
              </div>
            </div>

            {/* New password */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordForm.new_password}
                  onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  style={{ ...inputStyle, paddingRight: '2.5rem' }}
                  placeholder="Enter new password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: 0,
                  }}
                >
                  {showNewPassword ? (
                    <EyeOff style={{ width: '1rem', height: '1rem' }} />
                  ) : (
                    <Eye style={{ width: '1rem', height: '1rem' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={passwordForm.confirm_password}
                  onChange={e =>
                    setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                  }
                  style={{
                    ...inputStyle,
                    paddingRight: '2.5rem',
                    borderColor:
                      passwordForm.confirm_password &&
                      passwordForm.new_password !== passwordForm.confirm_password
                        ? '#ef4444'
                        : '#d1d5db',
                  }}
                  placeholder="Re-enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: 0,
                  }}
                >
                  {showConfirmPassword ? (
                    <EyeOff style={{ width: '1rem', height: '1rem' }} />
                  ) : (
                    <Eye style={{ width: '1rem', height: '1rem' }} />
                  )}
                </button>
              </div>
              {passwordForm.confirm_password &&
                passwordForm.new_password !== passwordForm.confirm_password && (
                  <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                    Passwords do not match
                  </span>
                )}
            </div>

            <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
              <button
                type="submit"
                disabled={passwordSaving}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: passwordSaving ? '#93c5fd' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  cursor: passwordSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Lock style={{ width: '1rem', height: '1rem' }} />
                {passwordSaving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserProfilePage;
