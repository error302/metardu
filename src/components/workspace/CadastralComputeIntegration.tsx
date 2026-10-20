 'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

const resultSchema = z.object({
  status: z.enum(['ready', 'warning', 'failed']), acceptanceStatus: z.literal('draft_unverified'),
  area: z.object({ squareMetres: z.number().finite(), hectares: z.number().finite() }),
  instantFeedback: z.object({ perimeter: z.number().finite(), linearMisclosure: z.number().finite(), precisionFormatted: z.string(), passes: z.boolean() }),
  adjustedPoints: z.array(z.object({ name: z.string(), easting: z.number().finite(), northing: z.number().finite() })),
  warnings: z.array(z.string()), errors: z.array(z.string()),
});

export default function CadastralComputeIntegration({ projectId }: { projectId: string }) {

  const router=useRouter();
  const [loading,setLoading]=useState(false);

  const [error,setError]=useState<string|null>(null);

  const [result,setResult]=useState<z.infer<typeof resultSchema>|null>(null);

  async function compute() {

    setLoading(true); setError(null); setResult(null);

    try {

      const response=await fetch(`/api/project/${projectId}/field-to-finish`,{method:'POST'});

      const payload: unknown=await response.json();

      if(!response.ok) {
        const errorBody = z.object({error:z.string()}).safeParse(payload);
        throw new Error(errorBody.success ? errorBody.data.error : 'Computation failed');
      }
      const parsed = resultSchema.safeParse(payload);
      if (!parsed.success) throw new Error('The server returned an incomplete computation result. Reopen the project before using its outputs.');
      const data = parsed.data;

      if(data.status==='failed') throw new Error(data.errors?.join('; ') || 'Traverse could not be computed');

      setResult(data);
      router.refresh();

    } catch(e) {setError(e instanceof Error?e.message:'Computation failed');}

    finally {setLoading(false);}

  }

  return <section className="space-y-4 rounded border p-4">

    <h3 className="font-semibold">Cadastral traverse computation</h3>

    <p>Save your field book and starting control first. This calculation uses your recorded grid bearings and grid distances, in station order.</p>

    <button onClick={compute} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{loading?'Computing…':'Compute saved traverse'}</button>

    {error && <p role="alert" className="text-red-500">{error}</p>}

    {result && <div aria-live="polite" className="space-y-3">

      <p>Unverified computation draft saved. Review the original observations, control evidence and project tolerances before using the plan.</p>

      <dl><dt>Area</dt><dd>{result.area.squareMetres.toFixed(3)} m² ({result.area.hectares.toFixed(4)} ha)</dd>

      <dt>Perimeter</dt><dd>{result.instantFeedback.perimeter.toFixed(3)} m</dd>

      <dt>Linear misclosure</dt><dd>{result.instantFeedback.linearMisclosure.toFixed(4)} m</dd>

      <dt>Relative precision</dt><dd>{result.instantFeedback.precisionFormatted}</dd></dl>

      <p>{result.instantFeedback.passes?'Numerical closure check passed. This does not certify boundary or legal correctness.':'Numerical closure check failed. Review the observations.'}</p>

      {result.warnings.map((warning,i)=><p key={i}>{warning}</p>)}

      <table className="w-full"><caption>Adjusted grid coordinates</caption><thead><tr><th>Station</th><th>Easting (m)</th><th>Northing (m)</th></tr></thead>

      <tbody>{result.adjustedPoints.map((point,i)=><tr key={i}><td>{point.name}</td><td>{point.easting.toFixed(3)}</td><td>{point.northing.toFixed(3)}</td></tr>)}</tbody></table>

    </div>}

  </section>;

}

