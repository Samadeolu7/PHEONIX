import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, ChevronDown, ChevronUp, Loader2, Save } from 'lucide-react';
import { api } from '../../api/axios';
import { userManagementService } from '../../services/userManagementService';
import { useToast } from '../../hooks/useToast';

interface ModulePage {
  id: number;
  code: string;
  title: string;
  description?: string;
  page_type: string;
  is_threadable: boolean;
  page_config: Record<string, any>;
}

interface Module {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  pages: ModulePage[];
}

interface Role {
  id: number;
  name: string;
  description?: string;
}

interface ThreadConfig {
  who_can_initiate: string[];
  auto_include_roles: string[];
  max_open_threads: number;
  require_reason: boolean;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const discussionKeys = {
  all: ['pageDiscussions'] as const,
  modules: () => [...discussionKeys.all, 'modules'] as const,
  roles: () => [...discussionKeys.all, 'roles'] as const,
};

export default function PageDiscussionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [configs, setConfigs] = useState<Record<number, ThreadConfig>>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  const { data: modules = [], isLoading: modsLoading } = useQuery<Module[]>({
    queryKey: discussionKeys.modules(),
    queryFn: async () => {
      const res = await api.get('/pages/modules/admin-all/');
      return Array.isArray(res.data) ? res.data : res.data?.results || [];
    },
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: discussionKeys.roles(),
    queryFn: async () => {
      const res = await userManagementService.getRoles();
      const raw = (res as any)?.data ?? res;
      return Array.isArray(raw) ? raw : raw?.results || [];
    },
  });

  useEffect(() => {
    if (modules.length > 0) {
      const initialConfigs: Record<number, ThreadConfig> = {};
      for (const mod of modules) {
        for (const page of mod.pages || []) {
          const tc = page.page_config?.thread || {};
          initialConfigs[page.id] = {
            who_can_initiate: tc.who_can_initiate || [],
            auto_include_roles: tc.auto_include_roles || [],
            max_open_threads: tc.max_open_threads ?? 0,
            require_reason: tc.require_reason ?? false,
          };
        }
      }
      setConfigs(initialConfigs);
    }
  }, [modules]);

  const toggleThreadableMutation = useMutation({
    mutationFn: async ({ pageId, isThreadable }: { pageId: number; isThreadable: boolean }) => {
      await api.patch(`/pages/module-pages/${pageId}/thread-config/`, {
        is_threadable: isThreadable,
      });
      return { pageId, isThreadable };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: discussionKeys.modules() });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async ({ pageId, config }: { pageId: number; config: ThreadConfig }) => {
      await api.patch(`/pages/module-pages/${pageId}/thread-config/`, config);
      return pageId;
    },
  });

  const toggleThreadable = async (page: ModulePage) => {
    setToggling(prev => new Set(prev).add(page.id));
    const next = !page.is_threadable;
    try {
      await toggleThreadableMutation.mutateAsync({ pageId: page.id, isThreadable: next });
      toast.success(
        `Discussions ${next ? 'enabled' : 'disabled'} for ${page.title}`
      );
    } catch {
      toast.error('Failed to update page');
    } finally {
      setToggling(prev => {
        const s = new Set(prev);
        s.delete(page.id);
        return s;
      });
    }
  };

  const saveConfig = async (pageId: number, pageTitle: string) => {
    setSaving(prev => new Set(prev).add(pageId));
    try {
      await saveConfigMutation.mutateAsync({ pageId, config: configs[pageId] });
      toast.success(`Configuration saved for ${pageTitle}`);
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(prev => {
        const s = new Set(prev);
        s.delete(pageId);
        return s;
      });
    }
  };

  const toggleRole = (
    pageId: number,
    field: 'who_can_initiate' | 'auto_include_roles',
    code: string
  ) => {
    setConfigs(prev => {
      const cfg = prev[pageId] ?? {
        who_can_initiate: [],
        auto_include_roles: [],
        max_open_threads: 0,
        require_reason: false,
      };
      const arr: string[] = cfg[field] ?? [];
      return {
        ...prev,
        [pageId]: {
          ...cfg,
          [field]: arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code],
        },
      };
    });
  };

  const updateConfig = (pageId: number, patch: Partial<ThreadConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [pageId]: { ...(prev[pageId] ?? { who_can_initiate: [], auto_include_roles: [], max_open_threads: 0, require_reason: false }), ...patch },
    }));
  };

  const activeMods = modules.filter(m => m.is_active && (m.pages || []).length > 0);
  const threadableCount = activeMods.reduce(
    (acc, m) => acc + (m.pages || []).filter(p => p.is_threadable).length,
    0
  );
  const totalPages = activeMods.reduce((acc, m) => acc + (m.pages || []).length, 0);

  const loading = modsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Page Discussions</h1>
            <p className="text-sm text-gray-500">
              {threadableCount} of {totalPages} pages have discussions enabled
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-600 max-w-2xl leading-relaxed">
          Enable contextual discussion threads on individual pages. When enabled, users
          can start threaded conversations attached to any record on that page. Configure
          who can initiate threads and which roles are auto-included.
        </p>
      </div>

      {/* Module sections */}
      <div className="space-y-3">
        {activeMods.map(mod => {
          const enabledCount = (mod.pages || []).filter(p => p.is_threadable).length;
          return (
            <div
              key={mod.id}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm"
            >
              {/* Module header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{mod.name}</span>
                <span className="text-xs text-gray-400">
                  {enabledCount}/{(mod.pages || []).length} enabled
                </span>
              </div>

              {/* Pages */}
              {(mod.pages || []).map((page, idx) => (
                <div
                  key={page.id}
                  className={idx < (mod.pages || []).length - 1 ? 'border-b border-gray-100' : ''}
                >
                  {/* Page row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{page.title}</span>
                        <span className="text-[10px] uppercase font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {page.page_type}
                        </span>
                      </div>
                      {page.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{page.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {page.is_threadable && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPages(prev => {
                              const s = new Set(prev);
                              s.has(page.id) ? s.delete(page.id) : s.add(page.id);
                              return s;
                            })
                          }
                          className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                        >
                          Configure
                          {expandedPages.has(page.id) ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>
                      )}
                      <Toggle
                        checked={page.is_threadable}
                        onChange={() => toggleThreadable(page)}
                        disabled={toggling.has(page.id)}
                      />
                    </div>
                  </div>

                  {/* Config panel */}
                  {expandedPages.has(page.id) && page.is_threadable && (
                    <div className="bg-indigo-50/40 border-t border-indigo-100 px-4 pb-4 pt-3">
                      <div className="grid sm:grid-cols-2 gap-5">
                        {/* who_can_initiate */}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            Who can start a thread
                          </p>
                          <p className="text-xs text-gray-400 mb-2">
                            Leave empty to allow all roles.
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {roles.map(role => {
                              const isSelected = (
                                configs[page.id]?.who_can_initiate ?? []
                              ).includes(role.name);
                              return (
                                <button
                                  key={role.id}
                                  type="button"
                                  onClick={() =>
                                    toggleRole(page.id, 'who_can_initiate', role.name)
                                  }
                                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                                  }`}
                                >
                                  {role.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* auto_include_roles */}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            Auto-include roles
                          </p>
                          <p className="text-xs text-gray-400 mb-2">
                            Added automatically when a thread is started.
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {roles.map(role => {
                              const isSelected = (
                                configs[page.id]?.auto_include_roles ?? []
                              ).includes(role.name);
                              return (
                                <button
                                  key={role.id}
                                  type="button"
                                  onClick={() =>
                                    toggleRole(page.id, 'auto_include_roles', role.name)
                                  }
                                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                    isSelected
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                                  }`}
                                >
                                  {role.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* max_open_threads */}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            Max open threads per record
                          </p>
                          <p className="text-xs text-gray-400 mb-2">
                            Set to 0 for no limit.
                          </p>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={configs[page.id]?.max_open_threads ?? 0}
                            onChange={e =>
                              updateConfig(page.id, {
                                max_open_threads: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none bg-white"
                          />
                        </div>

                        {/* require_reason */}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">
                            Require a reason
                          </p>
                          <p className="text-xs text-gray-400 mb-2">
                            Initiator must select a reason (e.g. Query, Dispute).
                          </p>
                          <Toggle
                            checked={configs[page.id]?.require_reason ?? false}
                            onChange={() =>
                              updateConfig(page.id, {
                                require_reason: !(configs[page.id]?.require_reason ?? false),
                              })
                            }
                          />
                        </div>
                      </div>

                      {/* Save */}
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => saveConfig(page.id, page.title)}
                          disabled={saving.has(page.id)}
                          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                        >
                          {saving.has(page.id) ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Save size={13} />
                          )}
                          {saving.has(page.id) ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {activeMods.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No modules found</p>
          </div>
        )}
      </div>
    </div>
  );
}
