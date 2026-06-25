import React, { useState, useEffect, useCallback } from 'react';
import {
  clientService,
  ClientGroup,
  ClientGroupPayload,
  ClientOption,
} from '../../services/clientService';
import { hrService } from '../../services/hrService';
import { api } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { getRoleRank } from '../../types/roles';
import { Users, X, ChevronRight, UserCog } from 'lucide-react';

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const emptyForm = (): Partial<ClientGroupPayload> => ({
  name: '',
  group_code: '',
  meeting_day: null,
  meeting_frequency: '',
  meeting_location: '',
  meeting_time: '',
  group_leader: null,
  contribution_amount: '',
  target_amount: '',
  is_active: true,
});

const ClientGroupsPage: React.FC = () => {
  const { selectedRole } = useAuth();
  const canManageOfficers = getRoleRank(selectedRole) >= 3;

  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: number; name: string }>>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClientGroup | null>(null);
  const [formData, setFormData] = useState<Partial<ClientGroupPayload>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [slideOver, setSlideOver] = useState<{ group: ClientGroup; members: any[] } | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const [assignModal, setAssignModal] = useState<ClientGroup | null>(null);
  const [assignOfficerId, setAssignOfficerId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const { success, error: showError } = useToast();

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await clientService.listClientGroups({ search: search || undefined });
      setGroups(data);
    } catch {
      showError('Failed to load client groups');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    clientService.getClientOptions({ status: 'active' }).then(setClientOptions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!canManageOfficers) return;
    hrService.getStaffForDropdown().then(setStaffOptions).catch(() => {});
  }, [canManageOfficers]);

  const openCreate = () => {
    setEditingGroup(null);
    setFormData(emptyForm());
    setShowModal(true);
  };

  const openEdit = (group: ClientGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      group_code: group.group_code,
      meeting_day: group.meeting_day,
      meeting_frequency: group.meeting_frequency,
      meeting_location: group.meeting_location ?? '',
      meeting_time: group.meeting_time ?? '',
      group_leader: group.group_leader,
      contribution_amount: group.contribution_amount,
      target_amount: group.target_amount,
      is_active: group.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      showError('Group name is required');
      return;
    }
    try {
      setSaving(true);
      if (editingGroup) {
        await clientService.updateClientGroup(editingGroup.id, formData);
        success('Group updated successfully');
      } else {
        await clientService.createClientGroup(formData as ClientGroupPayload);
        success('Group created successfully');
      }
      setShowModal(false);
      loadGroups();
    } catch (e: any) {
      showError(e?.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: ClientGroup) => {
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    try {
      await clientService.deleteClientGroup(group.id);
      success('Group deleted');
      loadGroups();
    } catch (e: any) {
      showError(e?.message || 'Failed to delete group');
    }
  };

  const openMembers = async (group: ClientGroup) => {
    setSlideOver({ group, members: [] });
    setMembersLoading(true);
    try {
      const res = await api.get(`/clients/groups/${group.id}/members/`);
      const members = Array.isArray(res) ? res : (res?.results ?? []);
      setSlideOver({ group, members });
    } catch {
      showError('Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const openAssignModal = (group: ClientGroup) => {
    setAssignModal(group);
    setAssignOfficerId(group.assigned_officer ? String(group.assigned_officer) : '');
  };

  const handleAssignOfficer = async () => {
    if (!assignModal) return;
    try {
      setAssigning(true);
      const officerId = assignOfficerId ? Number(assignOfficerId) : null;
      const result = await clientService.assignOfficerToGroup(assignModal.id, officerId);
      success(`${result.detail}`);
      setAssignModal(null);
      loadGroups();
    } catch (e: any) {
      showError(e?.message || 'Failed to assign officer');
    } finally {
      setAssigning(false);
    }
  };

  const setField = (key: keyof ClientGroupPayload, value: any) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Client Groups</h1>
            </div>
            <p className="text-gray-600">Manage Ajo / savings groups and their members</p>
          </div>
          {canManageOfficers && (
            <button
              onClick={openCreate}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center gap-2"
            >
              <Users size={18} />
              New Group
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Groups</p>
              <p className="text-2xl font-bold text-gray-900">{groups.length}</p>
            </div>
            <Users className="w-8 h-8 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {groups.filter(g => g.is_active).length}
              </p>
            </div>
            <Users className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Members</p>
              <p className="text-2xl font-bold text-gray-600">
                {groups.reduce((s, g) => s + (g.members_count ?? 0), 0)}
              </p>
            </div>
            <Users className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Group name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setSearch('')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-indigo-500" />
            Groups ({groups.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    'Name', 'Code', 'Meeting Day', 'Leader',
                    'Assigned Officer', 'Members', 'Status',
                    ...(canManageOfficers ? ['Actions'] : []),
                  ].map(col => (
                    <th
                      key={col}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groups.map(group => (
                    <tr key={group.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{group.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {group.code || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {group.meeting_day || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {group.group_leader_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {group.assigned_officer_name ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <UserCog size={11} />
                            {group.assigned_officer_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => openMembers(group)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200 cursor-pointer"
                        >
                          {group.member_count ?? 0}
                          <ChevronRight size={12} />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            group.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {group.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canManageOfficers && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openAssignModal(group)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Assign Officer"
                            >
                              Assign
                            </button>
                            <button
                              onClick={() => openEdit(group)}
                              className="text-green-600 hover:text-green-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(group)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                ))}
              </tbody>
            </table>

            {groups.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No groups found</h3>
                <p className="text-gray-600 mb-4">
                  {search
                    ? 'No groups match your search.'
                    : canManageOfficers
                    ? 'Create your first group to get started.'
                    : 'No groups have been assigned to you yet.'}
                </p>
                {!search && canManageOfficers && (
                  <button
                    onClick={openCreate}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 inline-flex items-center gap-2"
                  >
                    <Users size={18} />
                    New Group
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign Officer Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-40" onClick={() => setAssignModal(null)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Assign Officer</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{assignModal.name}</p>
                </div>
                <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Assigning an officer will also update <strong>all clients</strong> in this group to the
                same assigned officer.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Officer</label>
                <select
                  value={assignOfficerId}
                  onChange={e => setAssignOfficerId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">— Unassign —</option>
                  {staffOptions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setAssignModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignOfficer}
                  disabled={assigning}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {assigning ? 'Saving...' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-40" onClick={() => setShowModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingGroup ? 'Edit Group' : 'New Group'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setField('name', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Group name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input
                    type="text"
                    value={formData.group_code || ''}
                    onChange={e => setField('group_code', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. GRP-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Day</label>
                  <select
                    value={formData.meeting_day || ''}
                    onChange={e => setField('meeting_day', e.target.value || null)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">— None —</option>
                    {MEETING_DAYS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leader</label>
                  <select
                    value={formData.group_leader ?? ''}
                    onChange={e =>
                      setField('group_leader', e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">— None —</option>
                    {clientOptions.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.client_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description / Location</label>
                  <input
                    type="text"
                    value={formData.meeting_location || ''}
                    onChange={e => setField('meeting_location', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Meeting location or description"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Active</label>
                  <button
                    type="button"
                    onClick={() => setField('is_active', !formData.is_active)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.is_active ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingGroup ? 'Update Group' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members Slide-over */}
      {slideOver && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-40" onClick={() => setSlideOver(null)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{slideOver.group.name}</h2>
                <p className="text-sm text-gray-500">Group Members</p>
              </div>
              <button onClick={() => setSlideOver(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {membersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              ) : slideOver.members.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">No members in this group yet</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {slideOver.members.map((m: any, i: number) => (
                    <li key={m.id ?? i} className="py-3 flex items-center gap-3">
                      <div className="h-9 w-9 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-700 font-medium text-sm">
                          {(m.full_name || m.name || '?').charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {m.full_name || m.name || `Member ${i + 1}`}
                        </p>
                        <p className="text-xs text-gray-500">{m.client_id || m.phone_primary || ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientGroupsPage;
