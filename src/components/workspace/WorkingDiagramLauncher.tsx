'use client';

import { useRouter } from 'next/navigation';

interface Props {
  projectId: string;
}

export default function WorkingDiagramLauncher({ projectId }: Props) {
  const router = useRouter();

  return (
    <div className="rounded-lg border border-gray-200 p-4 bg-white">
      <h3 className="font-semibold text-gray-800 mb-1">Working Diagram</h3>
      <p className="text-sm text-gray-500 mb-3">
        Generate the traverse working diagram for this project.
      </p>
      <button
        onClick={() => router.push(`/working-diagram?projectId=${projectId}`)}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
      >
        Open Working Diagram →
      </button>
    </div>
  );
}
