'use client';

import { DocumentStatus, ProjectDocument } from '@/types/submission';
import { getDocumentsForSurveyType } from '@/lib/submission/submissionDocuments';
import DocumentCard from '@/components/submission/DocumentCard';

interface Props {
  project: { id: string; name: string; survey_type: string };
  existingDocs: ProjectDocument[];
}

export default function SubmissionClient({ project, existingDocs }: Props) {
  const docStates = Object.fromEntries(existingDocs.map((d) => [d.document_id, d]));

  const documents = getDocumentsForSurveyType(project.survey_type);
  const readyCount = Object.values(docStates).filter((d) => d.status === 'ready').length;
  const totalCount = documents.length;
  const progressPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;

  const handleStatusChange = (
    documentId: string,
    status: DocumentStatus,
    fileUrl?: string
  ) => {
    // This would normally update state - for now it's handled via the callback
    console.log(`Document ${documentId} status: ${status}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Submission Package —{' '}
          <span className="font-medium text-gray-700">{readyCount} of {totalCount}</span> documents ready
        </p>
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="text-gray-400 text-sm">No documents configured for survey type: {project.survey_type}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              projectId={project.id}
              existing={docStates[doc.id] ?? null}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}