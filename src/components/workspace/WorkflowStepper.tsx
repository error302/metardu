'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { WorkflowStep } from '@/types/workflow';
import { isStepUnlocked } from '@/lib/workflows/workflowRegistry';

interface Props {
  projectId: string;
  steps: WorkflowStep[];
  currentStep: number;
  maxUnlocked: number;
  onStepChange: (stepIndex: number) => Promise<void>;
}

export default function WorkflowStepper({
  projectId,
  steps,
  currentStep,
  maxUnlocked,
  onStepChange,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleStepClick = (step: WorkflowStep) => {
    if (!isStepUnlocked(maxUnlocked, step.index)) return;
    if (step.index === currentStep) return;

    startTransition(async () => {
      await onStepChange(step.index);
      if (step.routeSuffix) {
        router.push(`/project/${projectId}/${step.routeSuffix}`);
      }
    });
  };

  return (
    <nav aria-label="Survey workflow steps" className="w-full">
      <ol className="hidden md:flex items-start justify-between gap-0">
        {steps.map((step, idx) => {
          const unlocked = isStepUnlocked(maxUnlocked, step.index);
          const isActive = step.index === currentStep;
          const isDone = step.index < currentStep;
          const isLast = idx === steps.length - 1;

          return (
            <li key={step.id} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => handleStepClick(step)}
                  disabled={!unlocked || isPending}
                  aria-current={isActive ? 'step' : undefined}
                  className={[
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                    isActive ? 'bg-blue-600 border-blue-600 text-white' :
                    isDone ? 'bg-green-500 border-green-500 text-white' :
                    unlocked ? 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-600' :
                    'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed',
                  ].join(' ')}
                >
                  {isDone ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  ) : step.index}
                </button>
                <div className="mt-2 text-center px-1">
                  <p className={`text-xs font-medium leading-tight ${isActive ? 'text-blue-700' : isDone ? 'text-green-700' : unlocked ? 'text-gray-700' : 'text-gray-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-400 leading-tight mt-0.5 hidden lg:block">{step.description}</p>
                </div>
              </div>
              {!isLast && <div className={`flex-1 h-0.5 mt-4 mx-1 ${step.index < currentStep ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </li>
          );
        })}
      </ol>
      <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((step) => {
          const unlocked = isStepUnlocked(maxUnlocked, step.index);
          const isActive = step.index === currentStep;
          const isDone = step.index < currentStep;
          return (
            <button
              key={step.id}
              onClick={() => handleStepClick(step)}
              disabled={!unlocked || isPending}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                isActive ? 'bg-blue-600 border-blue-600 text-white' :
                isDone ? 'bg-green-500 border-green-500 text-white' :
                unlocked ? 'bg-white border-gray-300 text-gray-700' :
                'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed',
              ].join(' ')}
            >
              {step.index}. {step.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}