'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadDocument, deleteDocument, getDocumentDownloadUrl } from '@/actions/documents';
import type { Document } from '@prisma/client';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentPanel({
  collection,
  documentId,
  initialDocuments,
  canWrite,
}: {
  collection: string;
  documentId: string;
  initialDocuments: Document[];
  canWrite: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const formData = new FormData();
    formData.set('file', file);

    startTransition(async () => {
      try {
        const doc = await uploadDocument(collection, documentId, formData);
        setDocuments((prev) => [doc, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  async function handleDownload(id: string) {
    const url = await getDocumentDownloadUrl(id);
    window.open(url, '_blank');
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Documents</h2>
        {canWrite && (
          <label className="cursor-pointer text-xs font-medium text-brand hover:underline">
            {pending ? 'Uploading…' : 'Upload'}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} disabled={pending} />
          </label>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-muted">No documents attached yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between py-2 text-sm">
              <button onClick={() => handleDownload(doc.id)} className="truncate text-ink hover:underline">
                {doc.fileName}
              </button>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{formatSize(doc.size)}</span>
                {canWrite && (
                  <button onClick={() => handleDelete(doc.id)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
