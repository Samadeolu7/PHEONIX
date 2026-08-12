import React, { useState, useEffect, useCallback } from 'react';
import {
  clientService,
  ClientGroup,
  ClientGroupPayload,
  ClientOption,
  Client,
} from '../../services/clientService';
import { hrService } from '../../services/hrService';
import { api } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { getRoleRank } from '../../types/roles';
import { Users, X, ChevronRight, UserCog, Search, UserPlus } from 'lucide-react';

const MEETING_DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const emptyForm = (): Partial<ClientGroupPayload> => ({
  name: '',
  code: '',
  meeting_day: null,
  leader: null,
  description: '',
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
  const [assignMemberIds, setAssignMemberIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [reassigningClientId, setReassigningClientId] = useState<number | null>(null);

  // ── Individual / ungrouped client assignment ──────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [bulkOfficerId, setBulkOfficerId] = useState<string>('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

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
      code: group.code,
      meeting_day: group.meeting_day,
      leader: group.leader,
      description: group.description ?? '',
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
    setAssignMemberIds(new Set(group.member_officers ?? []));
  };

  const toggleAssignMember = (staffId: number) => {
    setAssignMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId); else next.add(staffId);
      return next;
    });
  };

  const handleAssignOfficer = async () => {
    if (!assignModal) return;
    try {
      setAssigning(true);
      const officerId = assignOfficerId ? Number(assignOfficerId) : null;
      // The primary is always a member too — the backend also enforces this,
      // but keep the request consistent with what the user sees checked.
      const memberIds = new Set(assignMemberIds);
      if (officerId !== null) memberIds.add(officerId);
      const result = await clientService.assignOfficerToGroup(
        assignModal.id,
        officerId,
        Array.from(memberIds),
      );
      success(`${result.detail}`);
      setAssignModal(null);
      loadGroups();
    } catch (e: any) {
      showError(e?.message || 'Failed to assign officer');
    } finally {
      setAssigning(false);
    }
  };

  // ── Per-client officer override (drill-down from a group's member list) ──
  const handleReassignClient = async (clientId: number, officerId: number | null) => {
    try {
      setReassigningClientId(clientId);
      await clientService.updateClient(clientId, { assigned_officer: officerId } as Partial<Client>);
      setSlideOver((prev) => {
        if (!prev) return prev;
        const officer = staffOptions.find((s) => s.id === officerId);
        return {
          ...prev,
          members: prev.members.map((m: any) =>
            m.id === clientId
              ? { ...m, assigned_officer: officerId, assigned_officer_name: officer?.name ?? null }
              : m
          ),
        };
      });
      success('Client reassigned.');
    } catch (e: any) {
      showError(e?.message || 'Failed to reassign client');
    } finally {
      setReassigningClientId(null);
    }
  };

  // ── Individual / ungrouped client assignment ──────────────────────────
  const searchClients = useCallback(async () => {
    if (!clientSearch.trim()) {
      setClientResults([]);
      return;
    }
    setClientSearchLoading(true);
    try {
      const res = await clientService.getClients({ search: clientSearch, status: 'active' });
      const results: Client[] = Array.isArray(res) ? res : ((res as any)?.results ?? []);
      setClientResults(results);
    } catch {
      setClientResults([]);
    } finally {
      setClientSearchLoading(false);
    }
  }, [clientSearch]);

  useEffect(() => {
    const t = setTimeout(searchClients, 350);
    return () => clearTimeout(t);
  }, [searchClients]);

  const toggleSelectedClient = (id: number) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (selectedClientIds.size === 0) return;
    try {
      setBulkAssigning(true);
      const officerId = bulkOfficerId ? Number(bulkOfficerId) : null;
      const result = await clientService.bulkAssignOfficer(Array.from(selectedClientIds), officerId);
      success(result.detail);
      setSelectedClientIds(new Set());
      setClientResults([]);
      setClientSearch('');
    } catch (e: any) {
      showError(e?.message || 'Failed to bulk-assign clients');
    } finally {
      setBulkAssigning(false);
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
                {groups.reduce((s, g) => s + (g.member_count ?? 0), 0)}
              </p>
            </div>
            <Users className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Individual / ungrouped client assignment */}
      {canManageOfficers && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-medium text-gray-900">Assign Individual Clients</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Search for any clients — regardless of group — select as many as you need, and assign them
            to an officer in one go. For assigning a whole group at once, use the &quot;Assign&quot;
            action in the table below instead.
          </p>
          <div className="flex gap-4 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search clients by name, ID, or phone..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          {clientSearchLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : clientResults.length > 0 ? (
            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100 mb-4">
              {clientResults.map(c => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedClientIds.has(c.id)}
                    onChange={() => toggleSelectedClient(c.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="flex-1 text-gray-900">
                    {c.first_name} {c.last_name}
                    <span className="ml-2 text-xs text-gray-400">{c.client_id}</span>
                  </span>
                  {(c as any).assigned_officer_name && (
                    <span className="text-xs text-gray-400">currently: {(c as any).assigned_officer_name}</span>
                  )}
                </label>
              ))}
            </div>
          ) : clientSearch.trim() ? (
            <p className="text-sm text-gray-400 mb-4">No clients match &quot;{clientSearch}&quot;.</p>
          ) : null}

          {selectedClientIds.size > 0 && (
            <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
              <span className="text-sm text-gray-600">{selectedClientIds.size} client(s) selected</span>
              <select
                value={bulkOfficerId}
                onChange={e => setBulkOfficerId(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">— Unassign —</option>
                {staffOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleBulkAssign}
                disabled={bulkAssigning}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkAssigning ? 'Assigning...' : 'Assign Selected'}
              </button>
              <button
                onClick={() => setSelectedClientIds(new Set())}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}

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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {group.meeting_day || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {group.leader_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {group.assigned_officer_name ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            title={group.member_officer_names?.length > 1 ? group.member_officer_names.join(', ') : undefined}
                          >
                            <UserCog size={11} />
                            {group.assigned_officer_name}
                            {group.member_officer_names?.length > 1 && (
                              <span className="ml-0.5 text-blue-500">+{group.member_officer_names.length - 1}</span>
                            )}
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
                The <strong>primary officer</strong> cascades to every client in this group (their
                individual assigned officer changes to match). Additional <strong>member officers</strong>{' '}
                gain visibility into this group and its clients, but client records themselves are
                unchanged.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Officer</label>
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

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member Officers <span className="text-gray-400 font-normal">(optional — a group can have more than one)</span>
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                  {staffOptions.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignMemberIds.has(s.id) || String(s.id) === assignOfficerId}
                        disabled={String(s.id) === assignOfficerId}
                        onChange={() => toggleAssignMember(s.id)}
                        className="rounded border-gray-300"
                      />
                      {s.name}
                      {String(s.id) === assignOfficerId && (
                        <span className="text-xs text-gray-400">(primary)</span>
                      )}
                    </label>
                  ))}
                </div>
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
                    value={formData.code || ''}
                    onChange={e => setField('code', e.target.value)}
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
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leader</label>
                  <select
                    value={formData.leader ?? ''}
                    onChange={e =>
                      setField('leader', e.target.value ? Number(e.target.value) : null)
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
                    value={formData.description || ''}
                    onChange={e => setField('description', e.target.value)}
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {m.full_name || m.name || `Member ${i + 1}`}
                        </p>
                        <p className="text-xs text-gray-500">{m.client_id || m.phone_primary || ''}</p>
                      </div>
                      {canManageOfficers && (
                        <select
                          value={m.assigned_officer ?? ''}
                          disabled={reassigningClientId === m.id}
                          onChange={e =>
                            handleReassignClient(m.id, e.target.value ? Number(e.target.value) : null)
                          }
                          className="border border-gray-300 rounded-md px-2 py-1 text-xs max-w-[9rem]"
                          title="Override this client's individual officer, without changing the rest of the group"
                        >
                          <option value="">— Unassigned —</option>
                          {staffOptions.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
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
