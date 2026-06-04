import { useState, useEffect, useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, FileText, Trash2, RefreshCw, Eye, X } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuthStore } from '../stores/authStore';
import { ApiError, documents } from '../lib/api';
import {
  DROPZONE_ACCEPT,
  SUPPORTED_FORMATS_HELP,
  getFileExtension,
  validateDocumentFilename,
} from '../lib/documentFormats';
import type { DocumentType } from '../types';

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'bylaw', label: 'Bylaw' },
  { value: 'declaration', label: 'Declaration' },
  { value: 'rule', label: 'Rule' },
  { value: 'policy', label: 'Policy' },
  { value: 'faq', label: 'FAQ' },
  { value: 'reserve_fund', label: 'Reserve Fund Study' },
  { value: 'meeting_minutes', label: 'Meeting Minutes' },
  { value: 'other', label: 'Other' },
];

interface DocItem {
  id: string;
  condocorp_id: string;
  title: string;
  filename: string;
  document_type: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
}

function isImageExtension(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'gif', 'bmp'].includes(ext);
}

export function DocumentsPage() {
  const { activeCondoCorp } = useAuthStore();
  const [docList, setDocList] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('other');
  const [title, setTitle] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!activeCondoCorp) return;
    const data = await documents.list(activeCondoCorp.id);
    setDocList(data);
    setLoading(false);
  }, [activeCondoCorp]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!activeCondoCorp || acceptedFiles.length === 0) return;
    setUploading(true);
    setActionError(null);

    for (const file of acceptedFiles) {
      const typeError = validateDocumentFilename(file.name);
      if (typeError) {
        setActionError(typeError);
        continue;
      }

      const docTitle = title || file.name.replace(/\.[^/.]+$/, '');
      try {
        const doc = await documents.upload(activeCondoCorp.id, file, docTitle, docType);
        if (doc?.id) {
          try {
            await documents.process(activeCondoCorp.id, doc.id);
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Processing failed after upload';
            setActionError(`${file.name}: ${msg}`);
          }
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
        setActionError(`${file.name}: ${msg}`);
      }
    }

    setUploading(false);
    setShowUpload(false);
    setTitle('');
    setDocType('other');
    loadDocuments();
  }, [activeCondoCorp, docType, title, loadDocuments]);

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    const messages = fileRejections.map(rejection => {
      const typeError = validateDocumentFilename(rejection.file.name);
      if (typeError) return `${rejection.file.name}: ${typeError}`;
      return `${rejection.file.name}: ${rejection.errors.map(e => e.message).join(', ')}`;
    });
    setActionError(messages.join(' '));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: DROPZONE_ACCEPT,
    maxFiles: 10,
  });

  const canReprocess = (doc: DocItem) =>
    doc.status !== 'indexed' && doc.status !== 'processing';

  const reprocessDocument = async (doc: DocItem) => {
    if (!activeCondoCorp || !canReprocess(doc)) return;
    setActionError(null);
    setProcessingId(doc.id);
    setDocList(prev =>
      prev.map(d =>
        d.id === doc.id ? { ...d, status: 'processing', failure_reason: null } : d
      )
    );
    try {
      await documents.process(activeCondoCorp.id, doc.id);
      await loadDocuments();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Reprocessing failed');
      await loadDocuments();
    } finally {
      setProcessingId(null);
    }
  };

  const deleteDocument = async (doc: DocItem) => {
    if (!activeCondoCorp) return;
    if (!window.confirm(`Delete "${doc.title}" and all of its chunks?`)) return;
    setActionError(null);
    try {
      await documents.delete(activeCondoCorp.id, doc.id);
      if (viewingDoc?.id === doc.id) {
        closePreview();
      }
      await loadDocuments();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setViewingDoc(null);
  };

  const viewDocument = async (doc: DocItem) => {
    if (!activeCondoCorp) return;
    closePreview();
    setViewingDoc(doc);
    setPreviewLoading(true);
    setActionError(null);
    try {
      const blob = await documents.file(activeCondoCorp.id, doc.id);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to load document');
      setViewingDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      <PageHeader
        title="Documents"
        description="Upload and manage your CondoCorp documents"
        action={
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Upload size={16} /> Upload Document
          </button>
        }
      />

      {showUpload && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Optional - defaults to filename"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value as DocumentType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                {DOCUMENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary-400 bg-primary-50'
                : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto text-gray-400 mb-3" size={32} />
            {uploading ? (
              <p className="text-sm text-gray-500">
                Uploading and indexing… scanned PDFs may take several minutes.
              </p>
            ) : isDragActive ? (
              <p className="text-sm text-primary-600">Drop files here</p>
            ) : (
              <>
                <p className="text-sm text-gray-700 font-medium">
                  Drag & drop files here, or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-lg mx-auto">{SUPPORTED_FORMATS_HELP}</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Uploaded</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No documents uploaded yet
                  </td>
                </tr>
              ) : (
                docList.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400 shrink-0" />
                        <div>
                          <div className="font-medium text-gray-900">{doc.title}</div>
                          <div className="text-xs text-gray-400">{doc.filename}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">
                      {doc.document_type.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusBadge status={doc.status} />
                        {doc.status === 'failed' && doc.failure_reason && (
                          <p className="text-xs text-red-600 max-w-xs" title={doc.failure_reason}>
                            {doc.failure_reason}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => viewDocument(doc)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
                          title="View document"
                        >
                          <Eye size={16} />
                        </button>
                        {canReprocess(doc) && (
                          <button
                            onClick={() => reprocessDocument(doc)}
                            disabled={processingId === doc.id}
                            className="p-1.5 text-gray-400 hover:text-yellow-600 rounded-lg hover:bg-yellow-50 transition-colors disabled:opacity-50"
                            title="Reprocess"
                          >
                            <RefreshCw size={16} className={processingId === doc.id ? 'animate-spin' : ''} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteDocument(doc)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">{viewingDoc.title}</h3>
                <p className="text-xs text-gray-500">{viewingDoc.filename}</p>
              </div>
              <button
                onClick={closePreview}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              {previewLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : previewUrl ? (
                (() => {
                  const ext = getFileExtension(viewingDoc.filename);
                  if (ext === 'docx') {
                    return (
                      <div className="p-8 text-center space-y-4">
                        <p className="text-sm text-gray-600">
                          Word documents cannot be previewed in the browser.
                        </p>
                        <a
                          href={previewUrl}
                          download={viewingDoc.filename}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
                        >
                          Download {viewingDoc.filename}
                        </a>
                      </div>
                    );
                  }
                  if (ext === 'pdf' || ext === 'html' || ext === 'htm') {
                    return (
                      <iframe
                        src={previewUrl}
                        title={viewingDoc.title}
                        className="w-full h-full min-h-[70vh] border-0"
                      />
                    );
                  }
                  if (isImageExtension(ext)) {
                    return (
                      <div className="overflow-auto p-4 flex justify-center items-start h-full min-h-[70vh]">
                        <img
                          src={previewUrl}
                          alt={viewingDoc.title}
                          className="max-w-full h-auto"
                        />
                      </div>
                    );
                  }
                  return (
                    <iframe
                      src={previewUrl}
                      title={viewingDoc.title}
                      className="w-full h-full min-h-[70vh] border-0"
                    />
                  );
                })()
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  Could not load this document. The file may be missing from storage — try deleting and uploading again.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
