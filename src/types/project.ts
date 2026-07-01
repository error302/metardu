export type SurveyType =
  | 'cadastral'
  | 'engineering'
  | 'topographic'
  | 'geodetic'
  | 'drone'
  | 'deformation';

export const SURVEY_TYPE_LABELS: Record<SurveyType, string> = {
  cadastral: 'Cadastral Survey',
  engineering: 'Engineering Survey',
  topographic: 'Topographic Survey',
  geodetic: 'Geodetic / Control Survey',
  drone: 'Drone / UAV Photogrammetry',
  deformation: 'Deformation / Monitoring Survey',
};

export const LEVELLING_SURVEY_TYPES: SurveyType[] = [
  'engineering',
  'topographic',
  'geodetic',
  'deformation',
];

export const isLevellingSurveyType = (type: SurveyType): boolean =>
  LEVELLING_SURVEY_TYPES.includes(type);

export const ALL_SURVEY_TYPES: SurveyType[] = [
  'cadastral',
  'engineering',
  'topographic',
  'geodetic',
  'drone',
  'deformation',
];
