import { useState } from 'react';
import { Upload, FileText, X, Trash2, Download, Eye } from 'lucide-react';
import { useVoucherReceipts, useUploadReceipt, useDeleteReceipt } from '../../hooks/usePettyCash';
import { PettyCashReceipt } from '../../types/pettyCash';

interface PettyCashReceiptUploadProps {
  voucherId: number;
  canUpload?: boolean;
}

const PettyCashReceiptUpload: React.FC<PettyCashReceiptUploadProps> = ({
  voucherId,
  canUpload = true,
}) => {
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: receipts, isLoading } = useVoucherReceipts(voucherId);
  const uploadMutation = useUploadReceipt();
  const deleteMutation = useDeleteReceipt();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: any) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: any) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadMutation.mutateAsync({
        voucherId,
        file: selectedFile,
        description,
      });

      // Reset form
      setSelectedFile(null);
      setDescription('');
    } catch (error) {
      console.error('Failed to upload receipt:', error);
    }
  };

  const handleDelete = async (receiptId: number) => {
    if (!confirm('Are you sure you want to delete this receipt?')) return;

    try {
      await deleteMutation.mutateAsync({ voucherId, receiptId });
    } catch (error) {
      console.error('Failed to delete receipt:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    return '📎';
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      {canUpload && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Receipt</h3>

          {/* File Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              id="receipt-upload"
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,application/pdf"
            />

            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <span className="text-sm font-medium text-gray-900">{selectedFile.name}</span>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                <p className="text-sm text-gray-600">
                  Drag and drop your receipt here, or{' '}
                  <label
                    htmlFor="receipt-upload"
                    className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    browse
                  </label>
                </p>
                <p className="text-xs text-gray-500">Supports: Images, PDF (Max 25MB)</p>
              </div>
            )}
          </div>

          {/* Description Input */}
          {selectedFile && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g., Original receipt from vendor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setDescription('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload Receipt'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Receipts List */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Uploaded Receipts</h3>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading receipts...</p>
        ) : !receipts || receipts.length === 0 ? (
          <p className="text-sm text-gray-500">No receipts uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {receipts.map((receipt: PettyCashReceipt) => (
              <div
                key={receipt.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <span className="text-2xl">{getFileIcon(receipt.file_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {receipt.file_name}
                    </p>
                    {receipt.description && (
                      <p className="text-xs text-gray-500 truncate">{receipt.description}</p>
                    )}
                    <div className="flex items-center space-x-3 mt-1">
                      <span className="text-xs text-gray-500">
                        {formatFileSize(receipt.file_size)}
                      </span>
                      <span className="text-xs text-gray-500">
                        Uploaded by {receipt.uploaded_by_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(receipt.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <a
                    href={receipt.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                  <a
                    href={receipt.file_url}
                    download={receipt.file_name}
                    className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  {canUpload && (
                    <button
                      onClick={() => handleDelete(receipt.id)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PettyCashReceiptUpload;
