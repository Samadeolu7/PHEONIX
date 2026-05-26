import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  AlertTriangle,
  Search,
  Filter,
  ChevronLeft,
  Calendar,
  Eye,
  X,
  File,
  Shield,
  Award,
  Heart,
  Gavel,
  Receipt,
  Building2,
  FolderOpen,
} from 'lucide-react';
import { hrService } from '../../services/hrService';
import { EmployeeDocumentCategory } from '../../types/hr';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  contract: <FileText className="w-4 h-4" />,
  id_document: <Shield className="w-4 h-4" />,
  certificate: <Award className="w-4 h-4" />,
  medical: <Heart className="w-4 h-4" />,
  disciplinary: <Gavel className="w-4 h-4" />,
  tax: <Receipt className="w-4 h-4" />,
  pension: <Building2 className="w-4 h-4" />,
  other: <FolderOpen className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-800',
  id_document: 'bg-purple-100 text-purple-800',
  certificate: 'bg-green-100 text-green-800',
  medical: 'bg-red-100 text-red-800',
  disciplinary: 'bg-orange-100 text-orange-800',
  tax: 'bg-yellow-100 text-yellow-800',
  pension: 'bg-indigo-100 text-indigo-800',
  other: 'bg-gray-100 text-gray-800',
};

const CATEGORIES: { value: EmployeeDocumentCategory; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'medical', label: 'Medical' },
  { value: 'disciplinary', label: 'Disciplinary' },
  { value: 'tax', label: 'Tax' },
  { value: 'pension', label: 'Pension' },
  { value: 'other', label: 'Other' },
];

export default function EmployeeDocumentsPage() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<EmployeeDocumentCategory>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Fetch staff info
  const { data: staff } = useQuery({
    queryKey: ['staff-member', staffId],
    queryFn: () => hrService.getStaffMember(staffId!),
    enabled: !!staffId,
  });

  const resolvedStaffPk = staff?.id;

  // Fetch documents
  const {
    data: documentsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['employee-documents', staffId, categoryFilter],
    queryFn: () =>
      hrService.getEmployeeDocuments({
        staff: staffId,
        category: (categoryFilter as EmployeeDocumentCategory) || undefined,
      }),
    enabled: !!staffId,
  });

  // Fetch expiring soon
  const { data: expiringDocs } = useQuery({
    queryKey: ['expiring-documents'],
    queryFn: () => hrService.getExpiringSoonDocuments(),
  });

  const documents = useMemo(() => {
    const results = documentsData?.results || [];
    if (!searchTerm) return results;
    const lower = searchTerm.toLowerCase();
    return results.filter(
      doc =>
        doc.title.toLowerCase().includes(lower) ||
        doc.category_display.toLowerCase().includes(lower) ||
        doc.description?.toLowerCase().includes(lower)
    );
  }, [documentsData, searchTerm]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => hrService.uploadEmployeeDocument(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-documents'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-documents'] });
      resetUploadForm();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => hrService.deleteEmployeeDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-documents'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-documents'] });
      setDeleteConfirm(null);
    },
  });

  const resetUploadForm = () => {
    setShowUploadModal(false);
    setUploadTitle('');
    setUploadCategory('other');
    setUploadDescription('');
    setUploadExpiryDate('');
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = () => {
    if (!uploadFile || !uploadTitle || !resolvedStaffPk) return;

    const formData = new FormData();
    formData.append('staff', resolvedStaffPk.toString());
    formData.append('title', uploadTitle);
    formData.append('category', uploadCategory);
    formData.append('file', uploadFile);
    if (uploadDescription) formData.append('description', uploadDescription);
    if (uploadExpiryDate) formData.append('expiry_date', uploadExpiryDate);

    uploadMutation.mutate(formData);
  };

  const staffExpiringDocs = useMemo(() => {
    if (!expiringDocs || !resolvedStaffPk) return [];
    return expiringDocs.filter(d => d.staff === resolvedStaffPk);
  }, [expiringDocs, resolvedStaffPk]);

  const staffName = staff
    ? `${staff.staff_id ? `${staff.staff_id} • ` : ''}${staff.first_name} ${staff.last_name}`
    : `Staff ${staffId}`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-3 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Employee Documents</h1>
            <p className="text-gray-500 mt-1">
              Manage documents for{' '}
              <Link
                to={`/hr/staff/${staffId}/view`}
                className="text-blue-600 hover:underline font-medium"
              >
                {staffName}
              </Link>
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload Document
          </button>
        </div>
      </div>

      {/* Expiring Soon Alert */}
      {staffExpiringDocs.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
            <AlertTriangle className="w-5 h-5" />
            {staffExpiringDocs.length} Document{staffExpiringDocs.length > 1 ? 's' : ''} Expiring
            Soon
          </div>
          <div className="space-y-1">
            {staffExpiringDocs.map(doc => (
              <div key={doc.id} className="text-sm text-amber-700 flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                <span className="font-medium">{doc.title}</span> — expires{' '}
                {new Date(doc.expiry_date!).toLocaleDateString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Document Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {CATEGORIES.map(cat => {
          const count = (documentsData?.results || []).filter(d => d.category === cat.value).length;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? '' : cat.value)}
              className={`flex flex-col items-center p-3 rounded-lg border transition-colors ${
                categoryFilter === cat.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`p-1.5 rounded ${CATEGORY_COLORS[cat.value]}`}>
                {CATEGORY_ICONS[cat.value]}
              </span>
              <span className="text-xs text-gray-600 mt-1">{cat.label}</span>
              <span className="text-lg font-bold text-gray-900">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">
          Failed to load documents. Please try again.
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <File className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No documents found</p>
          <p className="text-gray-400 text-sm mt-1">
            {categoryFilter
              ? 'Try changing the filter or upload a new document.'
              : 'Upload the first document for this employee.'}
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Upload Document
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 hidden md:table-cell">Expiry Date</th>
                <th className="px-4 py-3 hidden lg:table-cell">Uploaded By</th>
                <th className="px-4 py-3 hidden lg:table-cell">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${CATEGORY_COLORS[doc.category] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {CATEGORY_ICONS[doc.category] || <File className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{doc.title}</p>
                        {doc.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        CATEGORY_COLORS[doc.category] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {doc.category_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {doc.expiry_date ? (
                      <span
                        className={`text-sm ${
                          doc.is_expired ? 'text-red-600 font-medium' : 'text-gray-600'
                        }`}
                      >
                        {doc.is_expired && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {new Date(doc.expiry_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">No expiry</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600">
                    {doc.uploaded_by_name || '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={doc.file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      <a
                        href={doc.file}
                        download
                        className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => setDeleteConfirm(doc.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
              <button
                onClick={resetUploadForm}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder="e.g., Employment Contract 2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  aria-label="Document category"
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value as EmployeeDocumentCategory)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  aria-label="Document file"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.txt,.csv"
                />
                <p className="text-xs text-gray-400 mt-1">
                  PDF, Word, Excel, images, or text files accepted.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={uploadDescription}
                  onChange={e => setUploadDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional notes about this document..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  aria-label="Expiry date"
                  value={uploadExpiryDate}
                  onChange={e => setUploadExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Set if the document has an expiration (e.g., contract end date, ID expiry).
                </p>
              </div>
            </div>

            {uploadMutation.isError && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Failed to upload document. Please try again.
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetUploadForm}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadTitle || !uploadFile || uploadMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploadMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Document</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
