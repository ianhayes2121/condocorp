import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Trash2, RefreshCw, Eye, X } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuthStore } from '../stores/authStore';
import { documents } from '../lib/api';
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
  created_at: string;
}

interface ChunkItem {
  id: string;
  chunk_number: number;
  chunk_text: string;
}

export function DocumentsPage() {
  const { activeCondoCorp } = useAuthStore();
  const [docList, setDocList] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('other');
  const [title, setTitle] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);

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

    for (const file of acceptedFiles) {
      const docTitle = title || file.name.replace(/\.[^/.]+$/, '');
      const doc = await documents.upload(activeCondoCorp.id, file, docTitle, docType);
      if (doc?.id) {
        documents.process(activeCondoCorp.id, doc.id).catch(console.error);
      }
    }

    setUploading(false);
    setShowUpload(false);
    setTitle('');
    setDocType('other');
    loadDocuments();
  }, [activeCondoCorp, docType, title, loadDocuments]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/html': ['.html'],
    },
    maxFiles: 10,
  });

  const reprocessDocument = async (doc: DocItem) => {
    if (!activeCondoCorp) return;
    await documents.process(activeCondoCorp.id, doc.id);
    loadDocuments();
  };

  const deleteDocument = async (doc: DocItem) => {
    if (!activeCondoCorp) return;
    await documents.delete(activeCondoCorp.id, doc.id);
    loadDocuments();
  };

  const viewChunks = async (doc: DocItem) => {
    if (!activeCondoCorp) return;
    setSelectedDoc(doc);
    const data = await documents.chunks(activeCondoCorp.id, doc.id);
    setChunks(data);
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
              <p className="text-sm text-gray-500">Uploading...</p>
            ) : isDragActive ? (
              <p className="text-sm text-primary-600">Drop files here</p>
            ) : (
              <>
                <p className="text-sm text-gray-700 font-medium">
                  Drag & drop files here, or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT, HTML (max 10 files)</p>
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
                    <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => viewChunks(doc)}
                          className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
                          title="View chunks"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => reprocessDocument(doc)}
                          className="p-1.5 text-gray-400 hover:text-yellow-600 rounded-lg hover:bg-yellow-50 transition-colors"
                          title="Reprocess"
                        >
                          <RefreshCw size={16} />
                        </button>
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

      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                Chunks: {selectedDoc.title} ({chunks.length} chunks)
              </h3>
              <button
                onClick={() => { setSelectedDoc(null); setChunks([]); }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {chunks.map(chunk => (
                <div key={chunk.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      Chunk #{chunk.chunk_number}
                    </span>
                    <span className="text-xs text-gray-400">
                      {chunk.chunk_text.length} chars
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{chunk.chunk_text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
