import { SurveyType } from '@/types/project';
import { SubmissionDocument } from '@/types/submission';

export const SUBMISSION_DOCUMENTS: SubmissionDocument[] = [
  {
    id: 'traverse-report',
    label: 'Traverse Computation Report',
    description: 'Bowditch-adjusted traverse with angular and linear closure.',
    format: 'pdf',
    surveyTypes: ['cadastral', 'engineering', 'topographic', 'mining', 'geodetic'],
    requiredData: ['traverse observations', 'starting coordinates'],
  },
  {
    id: 'field-book',
    label: 'Field Book Workbook',
    description: 'Complete field observations in spreadsheet format.',
    format: 'xlsx',
    surveyTypes: [
      'cadastral', 'engineering', 'topographic', 'geodetic',
      'mining', 'hydrographic', 'drone', 'deformation',
    ],
    requiredData: ['field book entries'],
  },
  {
    id: 'levelling-report',
    label: 'Levelling Report',
    description: 'Rise & fall / HPC reduction with 10√K mm closure check per RDM 1.1 Table 5.1.',
    format: 'pdf',
    surveyTypes: ['engineering', 'topographic', 'geodetic', 'mining', 'deformation'],
    requiredData: ['levelling observations', 'benchmark RL'],
  },
  {
    id: 'working-diagram',
    label: 'Working Diagram',
    description: 'Scaled traverse diagram with beacon annotations.',
    format: 'pdf',
    surveyTypes: ['cadastral', 'engineering', 'topographic', 'mining'],
    requiredData: ['adjusted traverse coordinates', 'beacon data'],
  },
  {
    id: 'deed-plan',
    label: 'Deed Plan (Form No. 4)',
    description: 'Regulatory cadastral plan per Survey Act Cap 299.',
    format: 'pdf',
    surveyTypes: ['cadastral'],
    requiredData: ['adjusted coordinates', 'beacon data', 'LR number', 'client details'],
  },
  {
    id: 'boundary-shapefile',
    label: 'Boundary Shapefile',
    description: 'Parcel boundary as zipped shapefile for GIS use.',
    format: 'shp',
    surveyTypes: ['cadastral', 'mining'],
    requiredData: ['adjusted coordinates'],
  },
  {
    id: 'setting-out-dxf',
    label: 'Setting-Out DXF',
    description: 'Setting-out data in DXF format for AutoCAD import.',
    format: 'dxf',
    surveyTypes: ['engineering', 'mining'],
    requiredData: ['setting-out observations', 'design coordinates'],
  },
  {
    id: 'longitudinal-section',
    label: 'Longitudinal Section Report',
    description: 'Profile levels along centreline with RL and chainage.',
    format: 'pdf',
    surveyTypes: ['engineering', 'topographic'],
    requiredData: ['longitudinal section data'],
  },
  {
    id: 'volumetric-report',
    label: 'Volumetric / Earthworks Report',
    description: 'Cut and fill volumes with prismoidal correction.',
    format: 'pdf',
    surveyTypes: ['mining', 'engineering', 'drone'],
    requiredData: ['cross-section data or point cloud', 'design surface'],
  },
  {
    id: 'gcp-report',
    label: 'GCP Accuracy Report',
    description: 'Ground control point residuals and overall accuracy certificate.',
    format: 'pdf',
    surveyTypes: ['drone'],
    requiredData: ['GCP coordinates', 'photogrammetry report'],
  },
  {
    id: 'orthophoto-plan',
    label: 'Orthophoto Plan',
    description: 'Georeferenced orthophoto exported as PDF and GeoTIFF.',
    format: 'pdf',
    surveyTypes: ['drone'],
    requiredData: ['orthophoto file', 'project extent'],
  },
  {
    id: 'sounding-chart',
    label: 'Hydrographic Sounding Chart',
    description: 'Bathymetric sounding chart with tide corrections applied.',
    format: 'pdf',
    surveyTypes: ['hydrographic'],
    requiredData: ['sounding data', 'tide gauge records'],
  },
  {
    id: 'deformation-report',
    label: 'Deformation / Monitoring Report',
    description: 'Epoch comparison with displacement vectors and statistical analysis.',
    format: 'pdf',
    surveyTypes: ['deformation'],
    requiredData: ['epoch observations', 'reference epoch'],
  },
  {
    id: 'control-schedule',
    label: 'Coordinate Schedule',
    description: 'Final adjusted coordinates of all control points.',
    format: 'xlsx',
    surveyTypes: ['geodetic', 'cadastral', 'engineering', 'mining'],
    requiredData: ['adjusted coordinates'],
  },
  {
    id: 'full-package',
    label: 'Full Submission Package',
    description: 'All completed documents bundled as a single ZIP.',
    format: 'zip',
    surveyTypes: [
      'cadastral', 'engineering', 'topographic', 'geodetic',
      'mining', 'hydrographic', 'drone', 'deformation',
    ],
    requiredData: ['all documents above must be generated first'],
  },
];

export function getDocumentsForSurveyType(surveyType: string): SubmissionDocument[] {
  return SUBMISSION_DOCUMENTS.filter((doc) =>
    doc.surveyTypes.includes(surveyType as SurveyType)
  );
}