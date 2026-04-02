// src/math/index.ts
// All math functions in one clean import point

export * from './levelling';
export * from './traverse';
export * from './area';
export * from './volume';
export * from './curves';
export * from './tacheometry';
export * from './coordinates';

export const formatSurveyNumber = (value: number, decimals: number = 3): number => {
  return Number(value.toFixed(decimals));
};

export const SURVEY_CONSTANTS = {
  LEVELLING_TOLERANCE_MULTIPLIER: 10,
  DEFAULT_STADIA_CONSTANT: 100,
  UTM_ZONE_KENYA_SOUTH: 37,
  UTM_ZONE_KENYA_NORTH: 38
} as const;
