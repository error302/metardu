'use client';

interface Reading {
  staff: number;
  face: 'FL' | 'FR';
}

interface Props {
  readings?: Reading[];
}

export default function CollimationReport({ readings = [] }: Props) {
  const flReadings = readings.filter((r) => r.face === 'FL');
  const frReadings = readings.filter((r) => r.face === 'FR');

  const meanFL =
    flReadings.length > 0
      ? flReadings.reduce((s, r) => s + r.staff, 0) / flReadings.length
      : null;

  const meanFR =
    frReadings.length > 0
      ? frReadings.reduce((s, r) => s + r.staff, 0) / frReadings.length
      : null;

  const collimationError =
    meanFL !== null && meanFR !== null ? meanFL - meanFR : null;

  return (
    <div className="rounded-lg border border-gray-200 p-4 bg-white">
      <h3 className="font-semibold text-gray-800 mb-3">Collimation Report</h3>
      {readings.length === 0 ? (
        <p className="text-sm text-gray-400">No readings recorded yet.</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p>Mean FL: <strong>{meanFL?.toFixed(4) ?? '—'} m</strong></p>
          <p>Mean FR: <strong>{meanFR?.toFixed(4) ?? '—'} m</strong></p>
          <p>
            Collimation Error:{' '}
            <strong
              className={
                collimationError !== null && Math.abs(collimationError) > 0.005
                  ? 'text-red-600'
                  : 'text-green-600'
              }
            >
              {collimationError?.toFixed(4) ?? '—'} m
            </strong>
            {collimationError !== null && Math.abs(collimationError) > 0.005 && (
              <span className="ml-2 text-red-500">(Exceeds 5 mm — adjust instrument)</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
