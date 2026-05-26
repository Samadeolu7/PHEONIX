/**
 * User selector component with search/filter functionality
 */

import React, { useState, useEffect } from 'react';
import { Input } from './Input';

interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

interface UserSelectProps {
  value: number | null;
  onChange: (userId: number | null) => void;
  className?: string;
  placeholder?: string;
  error?: string;
}

export const UserSelect: React.FC<UserSelectProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'Search users...',
  error,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Load users on focus (lazy loading)
  const loadUsers = async () => {
    if (users.length > 0) return; // Already loaded

    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const tenantSlug = localStorage.getItem('tenant_slug');

      if (!token || !tenantSlug) {
        console.error('[UserSelect] Missing authentication credentials');
        return;
      }

      const response = await fetch('/api/users/', {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant': tenantSlug,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const data = await response.json();
      const userList = Array.isArray(data) ? data : data.results || [];

      setUsers(userList);
      setFilteredUsers(userList);

      // Set selected user if value is provided
      if (value) {
        const selected = userList.find((u: User) => u.id === value);
        setSelectedUser(selected || null);
      }
    } catch (error) {
      console.error('[UserSelect] Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
    loadUsers();
  };

  const handleBlur = () => {
    // Delay closing to allow click on dropdown item
    setTimeout(() => setIsOpen(false), 200);
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);

    if (!term.trim()) {
      setFilteredUsers(users);
      return;
    }

    const filtered = users.filter(user => {
      const searchLower = term.toLowerCase();
      const username = user.username?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';
      const firstName = user.first_name?.toLowerCase() || '';
      const lastName = user.last_name?.toLowerCase() || '';
      const fullName = user.full_name?.toLowerCase() || '';

      return (
        username.includes(searchLower) ||
        email.includes(searchLower) ||
        firstName.includes(searchLower) ||
        lastName.includes(searchLower) ||
        fullName.includes(searchLower)
      );
    });

    setFilteredUsers(filtered);
  };

  const handleSelect = (user: User) => {
    setSelectedUser(user);
    onChange(user.id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    setSelectedUser(null);
    onChange(null);
    setSearchTerm('');
  };

  const getUserDisplayName = (user: User) => {
    if (user.full_name) return user.full_name;
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
    if (user.first_name) return user.first_name;
    return user.username;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Display selected user or search input */}
      {selectedUser ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {getUserDisplayName(selectedUser)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              @{selectedUser.username}
              {selectedUser.email && ` • ${selectedUser.email}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>
      ) : (
        <Input
          type="text"
          value={searchTerm}
          onChange={e => handleSearch(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full"
        />
      )}

      {/* Dropdown list */}
      {isOpen && !selectedUser && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {users.length === 0 ? 'No users found' : 'No matching users'}
            </div>
          ) : (
            filteredUsers.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {getUserDisplayName(user)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  @{user.username}
                  {user.email && ` • ${user.email}`}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default UserSelect;
