'use client';

import { SurveyType } from '@/types/project';
import dynamic from 'next/dynamic';
import { MiningVolumePanel } from '@/components/compute/MiningVolumePanel';
import { getActiveSurveyorProfile } from '@/lib/submission/surveyorProfile';

const DynamicFieldBook = dynamic(() => import('./DynamicFieldBook'), { ssr: false });

interface Props {
  projectId: string;
  surveyType: SurveyType;
  stepIndex: number;
  projectName: string;
}

export default function WorkflowStepPanel({ projectId, surveyType, stepIndex }: Props) {
  if (stepIndex === 5) return null;

  return (
    <div className="space-y-4">
      {stepIndex === 1 && <SetupPanel surveyType={surveyType} />}
      {stepIndex === 2 && <FieldBookStepPanel projectId={projectId} surveyType={surveyType} />}
        {stepIndex === 3 && <ComputeStepPanel surveyType={surveyType} projectId={projectId} />}
      {stepIndex === 4 && <ReviewStepPanel surveyType={surveyType} />}
    </div>
  );
}

function SetupPanel({ surveyType }: { surveyType: SurveyType }) {
  const hints: Record<SurveyType, string[]> = {
    cadastral: ['LR Number / Title Number', 'Client name and contact', 'UTM Zone', 'County'],
    engineering: ['Road / structure reference', 'Chainage start and end', 'Design authority', 'Contract number'],
    topographic: ['Drawing scale', 'Contour interval', 'Datum', 'Area boundary'],
    geodetic: ['Network order', 'Datum', 'Control point references', 'GNSS equipment'],
    mining: ['Mine name', 'Permit number', 'Survey area', 'Mineral type'],
    hydrographic: ['Water body name', 'Tide gauge', 'Chart datum', 'Sounder'],
    drone: ['Mission ID', 'Aircraft', 'Camera', 'Target GSD'],
    deformation: ['Structure name', 'Monitoring frequency', 'Reference epoch', 'Alert threshold'],
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Step 1 — Setup</h2>
      <p className="text-sm text-gray-500 mb-4">Confirm project details before entering field observations.</p>
      <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
        {(hints[surveyType] ?? []).map((hint) => <li key={hint}>{hint}</li>)}
      </ul>
    </div>
  );
}

function FieldBookStepPanel({ projectId, surveyType }: { projectId: string; surveyType: SurveyType }) {
  return (
    <div className="space-y-4">
      <DynamicFieldBook projectId={projectId} surveyType={surveyType} />
    </div>
  );
}

function ComputeStepPanel({ surveyType, projectId }: { surveyType: SurveyType; projectId: string }) {
  const computeItems: Record<SurveyType, string[]> = {
    cadastral: ['Bowditch traverse adjustment', 'Linear misclosure + precision', 'Shoelace area'],
    engineering: ['Rise & fall reduction', '10√K mm closure (RDM 1.1)', 'Cross-section volumes'],
    topographic: ['Coordinate reduction', 'DTM generation', 'Contour extraction'],
    geodetic: ['Network adjustment', 'Baseline processing', 'Accuracy classification'],
    mining: ['Traverse adjustment', 'End-of-month volumes', 'Mine plan DXF'],
    hydrographic: ['Tidal correction', 'Depth reduction'],
    drone: ['GCP residuals', 'Point cloud volumes', 'Orthophoto check'],
    deformation: ['Epoch comparison', 'Displacement vectors', 'Statistical test'],
  };

  return (
    <div className="space-y-4">
      {surveyType === 'mining' ? (
        <MiningVolumePanel projectId={projectId} projectData={{}} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Step 3 — Compute</h2>
          <p className="text-sm text-gray-500 mb-4">These computations will run against your field book data.</p>
          <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
            {(computeItems[surveyType] ?? []).map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="mt-5 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Compute runners ship in Phase 16. Ensure field book data is complete before advancing.
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewStepPanel({ surveyType }: { surveyType: SurveyType }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900 mb-1">Step 4 — Review</h2>
      <p className="text-sm text-gray-500">Review computation results before generating submission documents.</p>
    </div>
  );
}