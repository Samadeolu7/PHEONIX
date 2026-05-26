import React, { useState, useEffect } from 'react';
import { UserRole, AVAILABLE_ROLES } from '../../types/roles';
import { roleService } from '../../services/roleService';
import { useToast } from '../../hooks/useToast';
import { Settings, ChevronDown, Check } from 'lucide-react';

interface RoleSwitcherProps {
  currentRole?: UserRole | null;
  onRoleChange?: (role: UserRole) => void;
  showLabel?: boolean;
  compact?: boolean;
}

const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  currentRole,
  onRoleChange,
  showLabel = true,
  compact = false,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(currentRole || null);
  const [isOpen, setIsOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    // Load current role from service if not provided
    if (!currentRole) {
      const storedRole = roleService.getSelectedRole();
      setSelectedRole(storedRole);
    } else {
      setSelectedRole(currentRole);
    }
  }, [currentRole]);

  const handleRoleSwitch = (newRole: UserRole) => {
    if (newRole === selectedRole) {
      setIsOpen(false);
      return;
    }

    // Update role in service
    roleService.switchRole(newRole);
    setSelectedRole(newRole);
    setIsOpen(false);

    // Call callback if provided
    if (onRoleChange) {
      onRoleChange(newRole);
    }

    // Show success toast
    toast.success(`Switched to ${newRole} role`, {
      title: 'Role Changed',
      duration: 2000,
    });

    // Reload page to apply new role permissions
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  if (compact) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            color: '#374151',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
          }}
          title={`Current role: ${selectedRole || 'None'}`}
        >
          <Settings style={{ height: '1rem', width: '1rem', marginRight: '0.25rem' }} />
          {selectedRole}
          <ChevronDown style={{ height: '1rem', width: '1rem', marginLeft: '0.25rem' }} />
        </button>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.25rem',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              zIndex: 50,
              minWidth: '12rem',
            }}
          >
            {AVAILABLE_ROLES.map(role => (
              <button
                key={role.value}
                onClick={() => handleRoleSwitch(role.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  color: selectedRole === role.value ? '#1f2937' : '#6b7280',
                  backgroundColor: selectedRole === role.value ? '#f3f4f6' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                onMouseEnter={e => {
                  if (selectedRole !== role.value) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={e => {
                  if (selectedRole !== role.value) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: selectedRole === role.value ? '500' : '400' }}>
                    {role.label}
                  </div>
                </div>
                {selectedRole === role.value && (
                  <Check style={{ height: '1rem', width: '1rem', color: '#059669' }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Overlay to close dropdown */}
        {isOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 40,
            }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {showLabel && (
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '0.5rem',
          }}
        >
          Switch Role (Testing)
        </label>
      )}

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '0.75rem 1rem',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            color: '#374151',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = '#667eea')}
          onBlur={e => (e.target.style.borderColor = '#d1d5db')}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Settings
              style={{
                height: '1.25rem',
                width: '1.25rem',
                marginRight: '0.75rem',
                color: '#9ca3af',
              }}
            />
            <span>{selectedRole ? `Current: ${selectedRole}` : 'Select Role'}</span>
          </div>
          <ChevronDown style={{ height: '1.25rem', width: '1.25rem', color: '#9ca3af' }} />
        </button>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.25rem',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              zIndex: 50,
            }}
          >
            {AVAILABLE_ROLES.map(role => (
              <button
                key={role.value}
                onClick={() => handleRoleSwitch(role.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  color: selectedRole === role.value ? '#1f2937' : '#6b7280',
                  backgroundColor: selectedRole === role.value ? '#f3f4f6' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                onMouseEnter={e => {
                  if (selectedRole !== role.value) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={e => {
                  if (selectedRole !== role.value) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: selectedRole === role.value ? '500' : '400' }}>
                    {role.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                    {role.description}
                  </div>
                </div>
                {selectedRole === role.value && (
                  <Check style={{ height: '1rem', width: '1rem', color: '#059669' }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Overlay to close dropdown */}
        {isOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 40,
            }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>

      {selectedRole && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            backgroundColor: '#ecfdf5',
            border: '1px solid #d1fae5',
            borderRadius: '0.375rem',
          }}
        >
          <p
            style={{
              fontSize: '0.875rem',
              color: '#065f46',
              margin: 0,
              fontWeight: '500',
            }}
          >
            Active Role: {selectedRole}
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              color: '#047857',
              margin: '0.25rem 0 0 0',
            }}
          >
            {AVAILABLE_ROLES.find(role => role.value === selectedRole)?.description}
          </p>
        </div>
      )}
    </div>
  );
};

export default RoleSwitcher;
