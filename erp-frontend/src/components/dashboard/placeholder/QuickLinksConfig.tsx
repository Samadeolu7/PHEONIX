// src/components/dashboard/QuickLinksConfig.tsx
import React, { useState } from 'react';
import { X, Plus, Save, Grip, Trash2, Link2, Grid as GridIcon, Menu } from 'lucide-react';
import { ModulePage } from '../../../types';
import IconSelector from '../IconSelector';

interface QuickLinksConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  pages: ModulePage[];
  initialConfig?: any;
}

const QuickLinksConfig: React.FC<QuickLinksConfigProps> = ({
  isOpen,
  onClose,
  onSave,
  pages,
  initialConfig,
}) => {
  const [links, setLinks] = useState<any[]>(initialConfig?.links || []);
  const [layout, setLayout] = useState(initialConfig?.layout || 'grid');

  if (!isOpen) return null;

  const addLink = () => {
    setLinks([
      ...links,
      {
        id: `link-${Date.now()}`,
        label: 'New Link',
        icon: 'link',
        color: '#3b82f6',
        url: '',
      },
    ]);
  };

  const updateLink = (index: number, field: string, value: any) => {
    const newLinks = [...links];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setLinks(newLinks);
  };

  const deleteLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({ links, layout });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Configure Quick Links</h2>
            <p className="text-sm text-gray-500 mt-1">Create shortcuts to important pages</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Layout Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Layout Style</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setLayout('grid')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    layout === 'grid' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <GridIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">Grid</span>
                </button>
                <button
                  onClick={() => setLayout('list')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    layout === 'list' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <Menu className="w-5 h-5" />
                  <span className="text-sm font-medium">List</span>
                </button>
                <button
                  onClick={() => setLayout('compact')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    layout === 'compact' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <Menu className="w-5 h-5" />
                  <span className="text-sm font-medium">Compact</span>
                </button>
              </div>
            </div>

            {/* Links */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Links ({links.length})
                </label>
                <button
                  onClick={addLink}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Link
                </button>
              </div>

              {links.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-3">No links yet</p>
                  <button
                    onClick={addLink}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add Your First Link
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {links.map((link, index) => (
                    <div key={link.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Grip className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium">Link {index + 1}</span>
                        </div>
                        <button
                          onClick={() => deleteLink(index)}
                          className="p-1 hover:bg-red-50 rounded text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Label</label>
                          <input
                            type="text"
                            value={link.label}
                            onChange={e => updateLink(index, 'label', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            placeholder="e.g., Dashboard, Reports"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Page</label>
                          <select
                            value={link.url}
                            onChange={e => updateLink(index, 'url', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                          >
                            <option value="">Select page...</option>
                            {pages.map(page => (
                              <option key={page.id} value={page.url_path}>
                                {page.module} → {page.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Icon</label>
                          <IconSelector
                            value={link.icon}
                            onChange={icon => updateLink(index, 'icon', icon)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Color</label>
                          <input
                            type="color"
                            value={link.color}
                            onChange={e => updateLink(index, 'color', e.target.value)}
                            className="w-full h-9 border rounded cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            {links.length > 0 && (
              <div className="pt-4 border-t">
                <label className="block text-sm font-medium text-gray-700 mb-3">Preview</label>
                <div className="bg-white border-2 rounded-lg p-4">
                  <div
                    className={
                      layout === 'grid'
                        ? 'grid grid-cols-2 gap-3'
                        : layout === 'list'
                          ? 'space-y-2'
                          : 'flex flex-wrap gap-2'
                    }
                  >
                    {links.map((link, index) => (
                      <div
                        key={index}
                        className={`border rounded-lg hover:shadow-md transition-shadow ${
                          layout === 'compact' ? 'p-2' : 'p-3'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${link.color}20` }}
                          >
                            <div className="w-4 h-4" style={{ color: link.color }}>
                              ●
                            </div>
                          </div>
                          <span className="text-sm font-medium">{link.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Links
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickLinksConfig;
