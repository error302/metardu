'use client';

interface BenchMark {
  bmNo: string;
  description: string;
  rl: number;
  location: string;
  type?: string;
}

interface Props {
  benchmarks: BenchMark[];
}

export default function BMDescriptionCard({ benchmarks }: Props) {
  if (benchmarks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-4 bg-white">
        <h3 className="font-semibold text-gray-800 mb-1">Benchmark Descriptions</h3>
        <p className="text-sm text-gray-400">No benchmarks defined for this project.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 bg-white">
      <h3 className="font-semibold text-gray-800 mb-3">Benchmark Descriptions</h3>
      <div className="space-y-3">
        {benchmarks.map((bm) => (
          <div key={bm.bmNo} className="border-l-4 border-blue-500 pl-3">
            <p className="font-medium text-sm">BM {bm.bmNo} — RL: {bm.rl.toFixed(3)} m</p>
            <p className="text-sm text-gray-600">{bm.description}</p>
            <p className="text-xs text-gray-400">{bm.location}</p>
            {bm.type && (
              <span className="text-xs bg-gray-100 px-1 rounded">{bm.type}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
