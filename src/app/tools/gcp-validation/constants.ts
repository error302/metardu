// Constants for the GCP residual validation tool.
//
// Extracted from src/app/tools/gcp-validation/page.tsx.

import type { AccuracyClass, KnownGCP } from './types';

export const accuracyClasses: AccuracyClass[] = [
  { name: 'Class I',   horizontal: 0.075, vertical: 0.15, scale: '1:500' },
  { name: 'Class II',  horizontal: 0.150, vertical: 0.30, scale: '1:1000' },
  { name: 'Class III', horizontal: 0.375, vertical: 0.75, scale: '1:2500' },
];

export const SAMPLE_GCPS: KnownGCP[] = [
  { id: 1, name: 'GCP-01', easting: '484500.0000', northing: '9863100.0000', elevation: '120.5000' },
  { id: 2, name: 'GCP-02', easting: '484750.0000', northing: '9863250.0000', elevation: '118.2500' },
  { id: 3, name: 'GCP-03', easting: '485000.0000', northing: '9863400.0000', elevation: '115.8000' },
];

export const SAMPLE_AGISOFT = `#point  x(m)    y(m)    z(m)    error(m)
GCP-01   484500.012  9863100.008  120.485  0.023
GCP-02   484750.018  9863249.995  118.235  0.031
GCP-03   485000.025  9863399.990  115.788  0.019`;

export const SAMPLE_PIX4D = `GCP_Name,X_photo,Y_photo,Z_photo,X_GCP,Y_GCP,Z_GCP,ErrorX,ErrorY,ErrorZ,ErrorXY,ErrorTotal
GCP-01,1234.5,567.8,120.485,484500.000,9863100.000,120.500,0.012,0.008,0.015,0.014,0.023
GCP-02,2345.6,678.9,118.235,484750.000,9863250.000,118.250,0.018,0.005,0.015,0.019,0.031
GCP-03,3456.7,789.0,115.788,485000.000,9863400.000,115.800,0.025,0.010,0.012,0.027,0.034`;
