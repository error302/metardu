import { z } from 'zod'
const number=z.string().trim().min(1).transform(Number).refine(Number.isFinite)
export const benchmarkNavigationQuery=z.object({
 lat:number.pipe(z.number().min(-90).max(90)),lon:number.pipe(z.number().min(-180).max(180)),
 radiusKm:number.pipe(z.number().min(0).max(500)).default('50'),
 limit:number.pipe(z.number().int().min(1).max(200)).default('10'),
 offset:number.pipe(z.number().int().min(0).max(1000000)).default('0'),
 types:z.string().min(1).transform(value=>value.split(',')).pipe(z.array(z.enum(['BM','CP','TRIG','TIDAL'])).min(1).max(4)).optional(),
 country:z.string().trim().max(100).optional(),q:z.string().trim().max(100).optional(),
}).strict()
