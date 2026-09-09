import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Plus,
  Trash2,
  Download,
  Eye,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Upload,
  FileText,
  Shield,
  Home,
  Briefcase,
  Mail,
  FolderOpen,
  Pencil,
} from 'lucide-react';
import { hrService } from '../../services/hrService';
import { GuarantorDocumentCategory, StaffGuarantor } from '../../types/hr';
import { ManualLink } from '../../components/help';

const DOC_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  id_document: <Shield className="w-4 h-4" />,
  utility_bill: <Home className="w-4 h-4" />,
  employment_letter: <Briefcase className="w-4 h-4" />,
  reference_letter: <Mail className="w-4 h-4" />,
  other: <FolderOpen className="w-4 h-4" />,
};

const DOC_CATEGORIES: { value: GuarantorDocumentCategory; label: string }[] = [
  { value: 'id_document', label: 'ID / Passport' },
  { value: 'utility_bill', label: 'Utility Bill / Proof of Address' },
  { value: 'employment_letter', label: "Employment Letter" },
  { value: 'reference_letter', label: 'Reference Letter' },
  { value: 'other', label: 'Other' },
];

const emptyGuarantorForm = {
  first_name: '',
  last_name: '',
  relationship: '',
  phone: '',
  email: '',
  occupation: '',
  address: '',
  id_number: '',
};

export default function StaffGuarantorsPage() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showGuarantorModal, setShowGuarantorModal] = useState(false);
  const [editingGuarantor, setEditingGuarantor] = useState<StaffGuarantor | null>(null);
  const [guarantorForm, setGuarantorForm] = useState(emptyGuarantorForm);
  const [guarantorPhoto, setGuarantorPhoto] = useState<File | null>(null);
  const [deleteGuarantorConfirm, setDeleteGuarantorConfirm] = useState<number | null>(null);
  const [expandedGuarantor, setExpandedGuarantor] = useState<number | null>(null);

  const [uploadForGuarantor, setUploadForGuarantor] = useState<number | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<GuarantorDocumentCategory>('other');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<number | null>(null);

  const { data: staff } = useQuery({
    queryKey: ['staff-member', staffId],
    queryFn: () => hrService.getStaffMember(staffId!),
    enabled: !!staffId,
  });

  const resolvedStaffPk = staff?.id;

  const {
    data: guarantorsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['staff-guarantors', staffId],
    queryFn: () => hrService.getStaffGuarantors({ staff: staffId }),
    enabled: !!staffId,
  });

  const guarantors = guarantorsData?.results || [];

  const { data: documentsData } = useQuery({
    queryKey: ['guarantor-documents', staffId],
    queryFn: () => hrService.getGuarantorDocuments({ staff: staffId }),
    enabled: !!staffId,
  });

  const documents = documentsData?.results || [];

  const saveGuarantorMutation = useMutation({
    mutationFn: (formData: FormData) =>
      editingGuarantor
        ? hrService.updateStaffGuarantor(editingGuarantor.id, formData)
        : hrService.createStaffGuarantor(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-guarantors', staffId] });
      resetGuarantorForm();
    },
  });

  const deleteGuarantorMutation = useMutation({
    mutationFn: (id: number) => hrService.deleteStaffGuarantor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-guarantors', staffId] });
      setDeleteGuarantorConfirm(null);
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: (formData: FormData) => hrService.uploadGuarantorDocument(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guarantor-documents', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-guarantors', staffId] });
      resetUploadForm();
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id: number) => hrService.deleteGuarantorDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guarantor-documents', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-guarantors', staffId] });
      setDeleteDocConfirm(null);
    },
  });

  const resetGuarantorForm = () => {
    setShowGuarantorModal(false);
    setEditingGuarantor(null);
    setGuarantorForm(emptyGuarantorForm);
    setGuarantorPhoto(null);
  };

  const openEditGuarantor = (g: StaffGuarantor) => {
    setEditingGuarantor(g);
    setGuarantorForm({
      first_name: g.first_name,
      last_name: g.last_name,
      relationship: g.relationship || '',
      phone: g.phone || '',
      email: g.email || '',
      occupation: g.occupation || '',
      address: g.address || '',
      id_number: g.id_number || '',
    });
    setShowGuarantorModal(true);
  };

  const handleSaveGuarantor = () => {
    if (!guarantorForm.first_name || !guarantorForm.last_name || !resolvedStaffPk) return;
    const formData = new FormData();
    formData.append('staff', resolvedStaffPk.toString());
    Object.entries(guarantorForm).forEach(([key, value]) => {
      if (value) formData.append(key, value);
    });
    if (guarantorPhoto) formData.append('photo', guarantorPhoto);
    saveGuarantorMutation.mutate(formData);
  };

  const resetUploadForm = () => {
    setUploadForGuarantor(null);
    setUploadTitle('');
    setUploadCategory('other');
    setUploadFile(null);
  };

  const handleUploadDoc = () => {
    if (!uploadFile || !uploadTitle || !uploadForGuarantor) return;
    const formData = new FormData();
    formData.append('guarantor', uploadForGuarantor.toString());
    formData.append('title', uploadTitle);
    formData.append('category', uploadCategory);
    formData.append('file', uploadFile);
    uploadDocMutation.mutate(formData);
  };

  const staffName = staff
    ? `${staff.staff_id ? `${staff.staff_id} • ` : ''}${staff.first_name} ${staff.last_name}`
    : `Staff ${staffId}`;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-3 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff Guarantors</h1>
            <p className="text-gray-500 mt-1">
              Guarantors and supporting documents for{' '}
              <Link
                to={`/hr/staff/${staffId}/view`}
                className="text-blue-600 hover:underline font-medium"
              >
                {staffName}
              </Link>
            </p>
            <ManualLink topic="howto-staff-guarantors" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
              How do I add a guarantor and upload their documents?
            </ManualLink>
          </div>
          <button
            onClick={() => setShowGuarantorModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Guarantor
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">
          Failed to load guarantors. Please try again.
        </div>
      ) : guarantors.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No guarantors on file</p>
          <p className="text-gray-400 text-sm mt-1">
            Add this staff member's guarantor(s) and their supporting documents.
          </p>
          <button
            onClick={() => setShowGuarantorModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Add Guarantor
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {guarantors.map(g => {
            const isExpanded = expandedGuarantor === g.id;
            const guarantorDocs = documents.filter(d => d.guarantor === g.id);
            return (
              <div key={g.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    {g.photo ? (
                      <img
                        src={g.photo}
                        alt={`${g.first_name} ${g.last_name}`}
                        className="w-12 h-12 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                        <Users className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">
                        {g.first_name} {g.last_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {g.relationship || 'Guarantor'}
                        {g.phone ? ` • ${g.phone}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExpandedGuarantor(isExpanded ? null : g.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <FileText className="w-4 h-4" />
                      {g.document_count} Document{g.document_count === 1 ? '' : 's'}
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEditGuarantor(g)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteGuarantorConfirm(g.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-4">
                      {g.email && <div><span className="text-gray-400">Email: </span>{g.email}</div>}
                      {g.occupation && <div><span className="text-gray-400">Occupation: </span>{g.occupation}</div>}
                      {g.id_number && <div><span className="text-gray-400">ID Number: </span>{g.id_number}</div>}
                      {g.address && <div><span className="text-gray-400">Address: </span>{g.address}</div>}
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">Documents</h3>
                      <button
                        onClick={() => setUploadForGuarantor(g.id)}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload Document
                      </button>
                    </div>

                    {guarantorDocs.length === 0 ? (
                      <p className="text-sm text-gray-400 py-3">No documents uploaded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {guarantorDocs.map(doc => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 rounded bg-gray-100 text-gray-600">
                                {DOC_CATEGORY_ICONS[doc.category] || <FolderOpen className="w-4 h-4" />}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                                <p className="text-xs text-gray-500">{doc.category_display}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <a
                                href={doc.file}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                              <a
                                href={doc.file}
                                download
                                className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                              <button
                                onClick={() => setDeleteDocConfirm(doc.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Guarantor Modal */}
      {showGuarantorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingGuarantor ? 'Edit Guarantor' : 'Add Guarantor'}
              </h2>
              <button onClick={resetGuarantorForm} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={guarantorForm.first_name}
                    onChange={e => setGuarantorForm({ ...guarantorForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={guarantorForm.last_name}
                    onChange={e => setGuarantorForm({ ...guarantorForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to Staff</label>
                <input
                  type="text"
                  placeholder="e.g. Spouse, Sibling, Colleague"
                  value={guarantorForm.relationship}
                  onChange={e => setGuarantorForm({ ...guarantorForm, relationship: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={guarantorForm.phone}
                    onChange={e => setGuarantorForm({ ...guarantorForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={guarantorForm.email}
                    onChange={e => setGuarantorForm({ ...guarantorForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                  <input
                    type="text"
                    value={guarantorForm.occupation}
                    onChange={e => setGuarantorForm({ ...guarantorForm, occupation: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                  <input
                    type="text"
                    placeholder="NIN, voter's card, passport..."
                    value={guarantorForm.id_number}
                    onChange={e => setGuarantorForm({ ...guarantorForm, id_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={guarantorForm.address}
                  onChange={e => setGuarantorForm({ ...guarantorForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={e => setGuarantorPhoto(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium"
                />
              </div>
            </div>

            {saveGuarantorMutation.isError && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Failed to save guarantor. Please check the details and try again.
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetGuarantorForm}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGuarantor}
                disabled={
                  !guarantorForm.first_name || !guarantorForm.last_name || saveGuarantorMutation.isPending
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveGuarantorMutation.isPending ? 'Saving...' : editingGuarantor ? 'Save Changes' : 'Add Guarantor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {uploadForGuarantor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Upload Guarantor Document</h2>
              <button onClick={resetUploadForm} className="p-1 text-gray-400 hover:text-gray-600">
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
                  placeholder="e.g., NIN Slip"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  aria-label="Document category"
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value as GuarantorDocumentCategory)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {DOC_CATEGORIES.map(cat => (
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
                  aria-label="Document file"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
                <p className="text-xs text-gray-400 mt-1">
                  PDF, Word, or image files up to 8MB.
                </p>
              </div>
            </div>

            {uploadDocMutation.isError && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Failed to upload document. Check the file type and size, then try again.
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
                onClick={handleUploadDoc}
                disabled={!uploadTitle || !uploadFile || uploadDocMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploadDocMutation.isPending ? (
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

      {/* Delete Guarantor Confirmation */}
      {deleteGuarantorConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Guarantor</h3>
            </div>
            <p className="text-gray-600 mb-6">
              This removes the guarantor and all of their uploaded documents. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteGuarantorConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteGuarantorMutation.mutate(deleteGuarantorConfirm)}
                disabled={deleteGuarantorMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteGuarantorMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Document Confirmation */}
      {deleteDocConfirm !== null && (
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
                onClick={() => setDeleteDocConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteDocMutation.mutate(deleteDocConfirm)}
                disabled={deleteDocMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteDocMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
