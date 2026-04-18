'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/api-client/client';
import { SurveyType } from '@/types/project';
import { SurveyWorkflow } from '@/types/workflow';
import { nextStepIndex } from '@/lib/workflows/workflowRegistry';
import WorkflowStepper from '@/components/workspace/WorkflowStepper';
import WorkflowStepPanel from '@/components/workspace/WorkflowStepPanel';

interface ProjectProps {
  id: string;
  name: string;
  surveyType: SurveyType;
  workflowStep: number;
  maxUnlocked: number;
}

interface Props {
  project: ProjectProps;
  workflow: SurveyWorkflow;
}

export default function ProjectWorkspaceClient({ project, workflow }: Props) {
  const router = useRouter();
  const dbClient = createClient();

  const [currentStep, setCurrentStep] = useState(project.workflowStep);
  const [maxUnlocked, setMaxUnlocked] = useState(project.maxUnlocked);
  const [saving, setSaving] = useState(false);

  const handleStepChange = useCallback(async (newStep: number) => {
    setSaving(true);
    const newMax = Math.max(maxUnlocked, newStep);

    await dbClient
      .from('projects')
      .update({
        workflow_step: newStep,
        workflow_max_unlocked: newMax,
      })
      .eq('id', project.id);

    setCurrentStep(newStep);
    setMaxUnlocked(newMax);
    setSaving(false);
  }, [project.id, maxUnlocked, dbClient]);

  const handleContinue = async () => {
    const next = nextStepIndex(project.surveyType, currentStep);
    if (next === null) return;

    await handleStepChange(next);

    const nextStepDef = workflow.steps.find((s) => s.index === next);
    if (nextStepDef?.routeSuffix) {
      router.push(`/project/${project.id}/${nextStepDef.routeSuffix}`);
    }
  };

  const currentStepDef = workflow.steps.find((s) => s.index === currentStep);
  const isLastStep = currentStep === workflow.steps[workflow.steps.length - 1].index;
  const nextStep = nextStepIndex(project.surveyType, currentStep);
  const nextStepDef = nextStep !== null ? workflow.steps.find((s) => s.index === nextStep) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
              <p className="text-xs text-gray-500">{workflow.label}</p>
            </div>
            {saving && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
          <div className="mt-4">
            <WorkflowStepper
              projectId={project.id}
              steps={workflow.steps}
              currentStep={currentStep}
              maxUnlocked={maxUnlocked}
              onStepChange={handleStepChange}
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {currentStepDef && (
          <p className="text-sm text-gray-500 mb-4">{currentStepDef.description}</p>
        )}

        {currentStep < 5 && (
          <WorkflowStepPanel
            projectId={project.id}
            surveyType={project.surveyType}
            stepIndex={currentStep}
            projectName={project.name}
          />
        )}

        {!isLastStep && nextStepDef && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleContinue}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Continue to {nextStepDef.label} →
            </button>
          </div>
        )}

        {currentStep === 4 && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => router.push(`/project/${project.id}/submission`)}
              className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
            >
              Go to Submission →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}