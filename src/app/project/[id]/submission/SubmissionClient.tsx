'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DocumentStatus, ProjectDocument } from '@/types/submission';
import { getDocumentsForSurveyType } from '@/lib/submission/submissionDocuments';
import { SurveyType } from '@/types/project';
import { SupportingDocUpload } from '@/components/submission/SupportingDocUpload';
import { FormNo4Preview } from '@/components/drawing/FormNo4Preview';

interface Props {
  project: { id: string; name: string; survey_type: string };
  existingDocs: ProjectDocument[];
  projectId: string;
}

interface DocState {
  id: string;
  status: DocumentStatus;
  progress: number;
  error?: string;
  fileUrl?: string;
  generatedAt?: string;
}

interface SubmissionPackage {
  submissionRef: string;
  projectId: string;
  surveyor: { registrationNumber: string; fullName: string; firmName: string; isKMemberActive: boolean };
  subtype: 'cadastral_subdivision' | 'cadastral_amalgamation' | 'cadastral_resurvey' | 'cadastral_mutation';
  parcel: { lrNumber: string; county: string; district: string; locality: string; areaM2: number; perimeterM: number };
  traverse: {
    points: { pointName: string; easting: number; northing: number; adjustedEasting: number; adjustedNorthing: number; observedBearing: number; observedDistance: number }[];
    angularMisclosure: number;
    linearMisclosure: number;
    precisionRatio: string;
    closingErrorE: number;
    closingErrorN: number;
    adjustmentMethod: 'bowditch' | 'transit';
    areaM2: number;
    perimeterM: number;
  };
  supportingDocs: { type: 'ppa2' | 'lcb_consent' | 'mutation_form' | 'beacon_cert'; label: string; required: boolean; fileUrl: string | null; uploadedAt: string | null }[];
  generatedAt: string;
  revision: number;
}

export default function SubmissionClient({ project, existingDocs, projectId }: Props) {
  const supabase = createClient();
  const [previewPkg, setPreviewPkg] = useState<SubmissionPackage | null>(null);
  const [docStates, setDocStates] = useState<Record<string, DocState>>(() => {
    const initial: Record<string, DocState> = {};
    getDocumentsForSurveyType(project.survey_type).forEach((doc) => {
      const existing = existingDocs.find((d) => d.document_id === doc.id);
      initial[doc.id] = {
        id: doc.id,
        status: existing?.status ?? 'pending',
        progress: existing?.status === 'ready' ? 100 : 0,
        fileUrl: existing?.file_url ?? undefined,
        generatedAt: existing?.generated_at ?? undefined,
      };
    });
    return initial;
  });

  const documents = getDocumentsForSurveyType(project.survey_type as SurveyType);
  const readyCount = Object.values(docStates).filter((d) => d.status === 'ready').length;
  const totalCount = documents.length;
  const progressPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;

  const [assembling, setAssembling] = useState(false);
  const [packageResult, setPackageResult] = useState<{
    passed: boolean;
    ref: string;
    blockers: string[];
    warnings: string[];
  } | null>(null);

  useEffect(() => {
    async function loadPreview() {
      try {
        const res = await fetch(`/api/submission/preview?projectId=${projectId}`);
        if (res.ok) {
          const pkg = await res.json();
          setPreviewPkg(pkg);
        }
      } catch (err) {
        console.error('Failed to load preview:', err);
      }
    }
    loadPreview();
  }, [projectId]);

  const generateDocument = useCallback(async (docId: string) => {
    setDocStates((prev) => ({
      ...prev,
      [docId]: { ...prev[docId], status: 'generating', progress: 10, error: undefined },
    }));

    try {
      const doc = documents.find((d) => d.id === docId);
      if (!doc) throw new Error('Document not found');

      setDocStates((prev) => ({
        ...prev,
        [docId]: { ...prev[docId], progress: 30 },
      }));

      const response = await fetch('/api/submission/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          documentId: docId,
          documentType: doc.id,
          format: doc.format,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      setDocStates((prev) => ({
        ...prev,
        [docId]: { ...prev[docId], progress: 70 },
      }));

      const result = await response.json();

      await supabase.from('submission_documents').upsert({
        project_id: project.id,
        document_id: docId,
        status: 'ready',
        file_url: result.downloadUrl,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,document_id' });

      setDocStates((prev) => ({
        ...prev,
        [docId]: {
          ...prev[docId],
          status: 'ready',
          progress: 100,
          fileUrl: result.downloadUrl,
          generatedAt: new Date().toISOString(),
        },
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setDocStates((prev) => ({
        ...prev,
        [docId]: {
          ...prev[docId],
          status: 'error',
          error: errorMessage,
        },
      }));
    }
  }, [documents, project.id, supabase]);

  const retryDocument = useCallback((docId: string) => {
    generateDocument(docId);
  }, [generateDocument]);

  const downloadDocument = useCallback((docId: string) => {
    const doc = docStates[docId];
    if (doc?.fileUrl) {
      window.open(doc.fileUrl, '_blank');
    }
  }, [docStates]);

  const getStatusIcon = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return '✅';
      case 'generating':
        return '🔄';
      case 'error':
        return '❌';
      default:
        return '⏳';
    }
  };

  const getStatusLabel = (status: DocumentStatus) => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'generating':
        return 'Generating...';
      case 'error':
        return 'Failed';
      default:
        return 'Pending';
    }
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
          <div 
            className="h-full bg-green-500 transition-all duration-500" 
            style={{ width: `${progressPct}%` }} 
          />
        </div>
        {progressPct === 100 && (
          <p className="mt-2 text-sm text-green-600 font-medium">
            ✓ All documents ready for submission
          </p>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No documents configured for survey type: {project.survey_type}
        </p>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => {
            const state = docStates[doc.id] ?? { id: doc.id, status: 'pending' as DocumentStatus, progress: 0 };
            const isGenerating = state.status === 'generating';
            const isReady = state.status === 'ready';
            const isError = state.status === 'error';

            return (
              <div
                key={doc.id}
                className={`border rounded-lg p-4 ${
                  isReady 
                    ? 'border-green-200 bg-green-50' 
                    : isError 
                      ? 'border-red-200 bg-red-50' 
                      : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(state.status)}</span>
                      <h3 className="font-semibold text-gray-900">{doc.label}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        isReady 
                          ? 'bg-green-100 text-green-700' 
                          : isError 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {getStatusLabel(state.status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{doc.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Format: {doc.format.toUpperCase()} | Required: {doc.requiredData.join(', ')}
                    </p>
                    
                    {isGenerating && (
                      <div className="mt-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${state.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{state.progress}%</span>
                        </div>
                      </div>
                    )}

                    {isError && state.error && (
                      <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
                        <strong>Error:</strong> {state.error}
                      </div>
                    )}

                    {isReady && state.generatedAt && (
                      <p className="mt-2 text-xs text-gray-500">
                        Generated: {new Date(state.generatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="ml-4 flex flex-col gap-2">
                    {!isReady && (
                      <button
                        onClick={() => generateDocument(doc.id)}
                        disabled={isGenerating}
                        className={`px-4 py-2 text-sm font-medium rounded transition ${
                          isGenerating
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isGenerating ? 'Generating...' : 'Generate'}
                      </button>
                    )}

                    {isReady && (
                      <button
                        onClick={() => downloadDocument(doc.id)}
                        className="px-4 py-2 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 transition"
                      >
                        Download
                      </button>
                    )}

                    {isError && (
                      <button
                        onClick={() => retryDocument(doc.id)}
                        className="px-4 py-2 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 transition"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {readyCount > 0 && readyCount < totalCount && (
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-semibold text-amber-800">Submission Incomplete</h3>
          <p className="text-sm text-amber-700 mt-1">
            {totalCount - readyCount} document(s) still pending. Generate all remaining documents to complete your submission package.
          </p>
          <button
            onClick={() => {
              documents.forEach((doc) => {
                const state = docStates[doc.id];
                if (!state || state.status !== 'ready') {
                  generateDocument(doc.id);
                }
              });
            }}
            className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 transition"
          >
            Generate All Missing
          </button>
        </div>
      )}

      {readyCount === totalCount && totalCount > 0 && (
        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-800">Submission Package Complete</h3>
          <p className="text-sm text-green-700 mt-1">
            All {totalCount} documents are ready. You can now submit your survey package to the relevant authority.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={async () => {
                const response = await fetch('/api/submission/package', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId: project.id }),
                });
                if (response.ok) {
                  const result = await response.json();
                  window.open(result.downloadUrl, '_blank');
                }
              }}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition"
            >
              Download Full Package (ZIP)
            </button>
          </div>
        </div>
      )}

      <SupportingDocUpload projectId={project.id} />

      {previewPkg && (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Form No. 4 Preview</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Verify geometry before generating package. The DXF export matches this preview exactly.
          </p>
          <FormNo4Preview pkg={previewPkg} width={760} height={500} />
        </div>
      )}

      <div className="mt-8 p-4 border border-orange-200 bg-orange-50 rounded-lg">
        <h3 className="font-semibold text-orange-800">Generate Compliant Submission Package</h3>
        <p className="text-sm text-orange-700 mt-1">
          Generate a complete submission package with Form No. 4 DXF, computation workbook, and supporting documents.
        </p>
        <button
          onClick={async () => {
            setAssembling(true);
            try {
              const res = await fetch('/api/submission/assemble', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: project.id })
              });

              if (!res.ok) {
                const err = await res.json();
                setPackageResult({
                  passed: false,
                  ref: '',
                  blockers: err.blockers ?? ['Unknown error'],
                  warnings: err.warnings ?? []
                });
                return;
              }

              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = res.headers.get('X-Submission-Ref') + '.zip';
              a.click();
              URL.revokeObjectURL(url);

              setPackageResult({
                passed: true,
                ref: res.headers.get('X-Submission-Ref') ?? '',
                blockers: [],
                warnings: []
              });
            } catch (err) {
              setPackageResult({
                passed: false,
                ref: '',
                blockers: [err instanceof Error ? err.message : 'Unknown error'],
                warnings: []
              });
            } finally {
              setAssembling(false);
            }
          }}
          disabled={assembling}
          className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded transition"
        >
          {assembling ? 'Generating Package...' : 'Generate Submission Package'}
        </button>

        {packageResult && !packageResult.passed && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded">
            <h4 className="font-medium text-red-800">QA Gate Failed</h4>
            <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
              {packageResult.blockers.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
            {packageResult.warnings.length > 0 && (
              <div className="mt-2">
                <p className="text-sm text-amber-700">Warnings:</p>
                <ul className="text-sm text-amber-600 list-disc list-inside">
                  {packageResult.warnings.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {packageResult?.passed && (
          <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded">
            <p className="text-green-800 font-medium">
              Package generated: {packageResult.ref}
            </p>
            <p className="text-sm text-green-600 mt-1">
              Your submission ZIP has downloaded. Submit to the Director of Surveys office.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}