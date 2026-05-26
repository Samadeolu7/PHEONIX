import React from 'react';
import { UserRole, AVAILABLE_ROLES } from '../../types/roles';
import { ChevronDown, Users } from 'lucide-react';

interface RoleSelectorProps {
  selectedRole: UserRole | null;
  onRoleChange: (role: UserRole) => void;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}

const RoleSelector: React.FC<RoleSelectorProps> = ({
  selectedRole,
  onRoleChange,
  disabled = false,
  error,
  required = true,
}) => {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label
        htmlFor="role-select"
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '0.5rem',
        }}
      >
        Select Your Role {required && <span style={{ color: '#dc2626' }}>*</span>}
      </label>

      <div style={{ position: 'relative' }}>
        {/* Icon */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <Users style={{ height: '1.25rem', width: '1.25rem', color: '#9ca3af' }} />
        </div>

        {/* Select dropdown */}
        <select
          id="role-select"
          value={selectedRole || ''}
          onChange={e => onRoleChange(e.target.value as UserRole)}
          disabled={disabled}
          required={required}
          style={{
            display: 'block',
            width: '100%',
            paddingLeft: '2.5rem',
            paddingRight: '2.5rem',
            paddingTop: '0.75rem',
            paddingBottom: '0.75rem',
            border: error ? '1px solid #dc2626' : '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            backgroundColor: disabled ? '#f9fafb' : 'white',
            color: disabled ? '#9ca3af' : '#374151',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
            appearance: 'none',
          }}
          onFocus={e => !error && (e.target.style.borderColor = '#667eea')}
          onBlur={e => !error && (e.target.style.borderColor = '#d1d5db')}
        >
          <option value="" disabled>
            Choose your role...
          </option>
          {AVAILABLE_ROLES.map(role => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>

        {/* Dropdown arrow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <ChevronDown style={{ height: '1.25rem', width: '1.25rem', color: '#9ca3af' }} />
        </div>
      </div>

      {/* Role description */}
      {selectedRole && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            backgroundColor: '#f0f9ff',
            border: '1px solid #e0f2fe',
            borderRadius: '0.375rem',
          }}
        >
          <p
            style={{
              fontSize: '0.875rem',
              color: '#0369a1',
              margin: 0,
              fontWeight: '500',
            }}
          >
            {AVAILABLE_ROLES.find(role => role.value === selectedRole)?.description}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.375rem',
          }}
        >
          <p
            style={{
              fontSize: '0.875rem',
              color: '#dc2626',
              margin: 0,
            }}
          >
            {error}
          </p>
        </div>
      )}
    </div>
  );
};

export default RoleSelector;
