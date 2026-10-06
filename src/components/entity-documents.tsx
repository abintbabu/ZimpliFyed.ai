import { listDocuments } from '@/actions/documents';
import { DocumentPanel } from '@/components/document-panel';

/** Server component: lists a record's attachments and renders the shared upload panel. */
export async function EntityDocuments({ collection, documentId, canWrite }: { collection: string; documentId: string; canWrite: boolean }) {
  const documents = await listDocuments(collection, documentId);
  return <DocumentPanel collection={collection} documentId={documentId} initialDocuments={documents} canWrite={canWrite} />;
}
