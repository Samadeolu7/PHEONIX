import React, { useRef, useState } from 'react';
import {
  AppDocument,
  Application,
  DOC_ACCEPT,
  DOCUMENT_TYPES,
  MAX_DOC_MB,
  portalApi,
  toApiError,
} from '../api';
import { Button, Card, Notice, SelectField } from '../ui';

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * Upload supporting documents for an open application.
 * Client-side checks are only for convenience; the server re-checks size,
 * type and the file's real content.
 */
export function DocumentsCard({
  app,
  onChange,
}: {
  app: Application;
  onChange: (docs: AppDocument[]) => void;
}) {
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setError('');
    if (f && f.size > MAX_DOC_MB * 1024 * 1024) {
      setError(
        `That file is ${kb(f.size)}. The maximum is ${MAX_DOC_MB} MB — try a smaller photo or a PDF.`
      );
      f = null;
    } else if (f && f.type && !OK_TYPES.includes(f.type)) {
      setError('Please upload a PDF, JPG or PNG file.');
      f = null;
    }
    setFile(f);
    if (!f && inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    if (!docType) return setError('Choose what kind of document this is.');
    if (!file) return setError('Choose a file to upload.');
    setError('');
    setProgress(0);
    try {
      const doc = await portalApi.uploadDocument(app.reference, docType, file, setProgress);
      onChange([...app.documents, doc]);
      setFile(null);
      setDocType('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      const err = toApiError(e);
      setError(
        err.status === 413
          ? `File too large. Maximum is ${MAX_DOC_MB} MB.`
          : err.fields.file || err.fields.document_type || err.message
      );
    } finally {
      setProgress(null);
    }
  };

  const remove = async (d: AppDocument) => {
    if (!window.confirm(`Remove "${d.original_name || d.document_type_display}"?`)) return;
    try {
      await portalApi.deleteDocument(app.reference, d.id);
      onChange(app.documents.filter(x => x.id !== d.id));
    } catch (e) {
      setError(toApiError(e).message);
    }
  };

  const canUpload = app.can_upload && app.documents.length < 10;
  if (!app.documents.length && !canUpload) return null;

  return (
    <Card className="mt-4">
      <h2 className="font-semibold mb-1">Supporting documents</h2>
      <p className="text-xs text-gray-600 mb-4">
        Uploading these now can speed up your application. Usually: a means of ID, a passport
        photograph and proof of address. PDF, JPG or PNG, up to {MAX_DOC_MB} MB each. Files are
        stored privately and only the branch reviewing your application can see them.
      </p>

      {app.documents.length > 0 && (
        <ul className="divide-y border rounded-md mb-4">
          {app.documents.map(d => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.document_type_display}</div>
                <div className="text-xs text-gray-500 truncate">
                  {d.original_name} · {kb(d.size)}
                </div>
              </div>
              {app.can_remove_documents && (
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className="text-xs text-red-700 underline shrink-0"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {canUpload && (
        <div>
          <SelectField
            label="Document type"
            name="document_type"
            value={docType}
            onChange={e => setDocType(e.target.value)}
            placeholder="Select"
            options={DOCUMENT_TYPES}
          />
          <div className="mb-4">
            <label htmlFor="doc_file" className="block text-sm font-medium text-gray-700 mb-1">
              File
            </label>
            <input
              id="doc_file"
              ref={inputRef}
              type="file"
              accept={DOC_ACCEPT}
              onChange={e => pick(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
          </div>
          <Button type="button" onClick={upload} loading={progress !== null} disabled={!file}>
            {progress !== null ? `Uploading… ${progress}%` : 'Upload document'}
          </Button>
        </div>
      )}
    </Card>
  );
}
