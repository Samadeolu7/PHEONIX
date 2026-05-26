import React, { useEffect, useState } from 'react';
import { authService, UpdateProfileData, ChangePasswordData } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

const AccountSettingsPage: React.FC = () => {
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Password form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // prefer auth context user if available
        if (authUser) {
          setFirstName((authUser as any).first_name || (authUser as any).name || '');
          setLastName((authUser as any).last_name || '');
          setEmail((authUser as any).email || '');
        } else {
          const u = await authService.getCurrentUser();
          setFirstName((u as any).first_name || (u as any).name || '');
          setLastName((u as any).last_name || '');
          setEmail((u as any).email || '');
        }
      } catch (err) {
        console.error('Failed to load user for account settings', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authUser]);

  const handleProfileUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileMsg(null);
    // Basic validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!email || !emailRegex.test(email)) {
      setProfileMsg('Please enter a valid email');
      toast.error('Please enter a valid email');
      return;
    }

    const payload: UpdateProfileData = {
      first_name: firstName,
      last_name: lastName,
      email: email,
    };

    try {
      await authService.updateProfile(payload);
      setProfileMsg('Profile updated successfully');
      toast.success('Profile updated successfully');
    } catch (err: any) {
      console.error('Profile update failed', err);
      const msg = (err as any)?.message || 'Failed to update profile';
      setProfileMsg(msg);
      toast.error(msg);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg('New password and confirmation do not match');
      toast.error('New password and confirmation do not match');
      return;
    }

    if (!oldPassword) {
      setPasswordMsg('Current password is required');
      toast.error('Current password is required');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMsg('New password must be at least 8 characters');
      toast.error('New password must be at least 8 characters');
      return;
    }

    const payload: ChangePasswordData = {
      old_password: oldPassword,
      new_password: newPassword,
    };

    try {
      await authService.changePassword(payload);
      setPasswordMsg('Password changed successfully');
      toast.success('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Change password failed', err);
      const msg = err.message || 'Failed to change password';
      setPasswordMsg(msg);
      toast.error(msg);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading account settings...</div>;

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
        Account Settings
      </h2>

      <section
        style={{
          background: 'white',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          marginBottom: '1.5rem',
        }}
      >
        <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Profile</h3>
        <form onSubmit={handleProfileUpdate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
            <input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last name"
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
              }}
            >
              Save
            </button>
            <div style={{ alignSelf: 'center', color: '#6b7280' }}>{profileMsg}</div>
          </div>
        </form>
      </section>

      <section
        style={{
          background: 'white',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Change Password</h3>
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              placeholder="Current password"
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password"
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
              }}
            >
              Change Password
            </button>
            <div style={{ alignSelf: 'center', color: '#6b7280' }}>{passwordMsg}</div>
          </div>
        </form>
      </section>
    </div>
  );
};

export default AccountSettingsPage;
