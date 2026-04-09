import {
  chooseBoundaryPoints,
  chooseOrthophotoCandidate,
  computeScaleBarLengthMetres,
  extractOverlayPolygons,
} from './orthophotoPlanHelpers';

describe('orthophotoPlanHelpers', () => {
  it('prefers explicit orthophoto image references over unrelated files', () => {
    const candidate = chooseOrthophotoCandidate(
      { report_url: '/uploads/documents/project/report.pdf' },
      {
        orthophoto: {
          image_url: '/uploads/documents/project/orthophoto-sheet.jpg',
        },
      },
      [
        { file_name: 'boundary-plan.pdf', file_path: '/uploads/documents/project/boundary-plan.pdf' },
        { file_name: 'site-overview.png', file_path: '/uploads/documents/project/site-overview.png' },
      ]
    );

    expect(candidate?.ref).toBe('/uploads/documents/project/orthophoto-sheet.jpg');
  });

  it('falls back to control points when parcel boundary is missing', () => {
    const boundaryPoints = chooseBoundaryPoints(null, [
      { name: 'P1', easting: 1000, northing: 1000, is_control: true },
      { name: 'P2', easting: 1050, northing: 1000, is_control: true },
      { name: 'P3', easting: 1050, northing: 1025, is_control: true },
      { name: 'OBS1', easting: 1010, northing: 1010, is_control: false },
    ]);

    expect(boundaryPoints).toHaveLength(3);
    expect(boundaryPoints.map((point) => point.name)).toEqual(['P1', 'P2', 'P3']);
  });

  it('extracts encroachment and gap polygons from validation results', () => {
    const overlays = extractOverlayPolygons({
      overlaps: [
        {
          id: 'enc-1',
          area: 42.7,
          description: 'House encroachment',
          coordinates: [
            { easting: 0, northing: 0 },
            { easting: 10, northing: 0 },
            { easting: 10, northing: 10 },
          ],
        },
      ],
      gaps: [
        {
          coordinates: [
            { easting: 20, northing: 20 },
            { easting: 24, northing: 20 },
            { easting: 24, northing: 23 },
          ],
        },
      ],
    });

    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({ id: 'enc-1', kind: 'encroachment', label: 'House encroachment' });
    expect(overlays[1].kind).toBe('gap');
  });

  it('chooses a readable scale bar length from the parcel extent', () => {
    const scaleBarLength = computeScaleBarLengthMetres([
      { easting: 0, northing: 0 },
      { easting: 84, northing: 0 },
      { easting: 84, northing: 44 },
      { easting: 0, northing: 44 },
    ]);

    expect(scaleBarLength).toBe(25);
  });
});
