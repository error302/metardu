import { generateIFC43Alignment, type IFC43ExportOptions } from '../ifc43Alignment'

describe('generateIFC43Alignment', () => {
  const sampleOptions: IFC43ExportOptions = {
    projectName: 'Nakuru_Njoro_Access_Road',
    alignmentName: 'Main_Carriageway_Alignment',
    utmZone: 37,
    hemisphere: 'S',
    datum: 'WGS 84',
    surveyorName: 'Eng. K. Kipkemoi',
    surveyorLicense: 'MISK-1234',
    horizontalPoints: [
      { chainage: 0, easting: 250100.0, northing: 9945200.0, elevation: 1850.0 },
      { chainage: 100, easting: 250180.0, northing: 9945260.0, elevation: 1852.5 },
      { chainage: 250, easting: 250300.0, northing: 9945350.0, elevation: 1857.0 },
    ],
    verticalPoints: [
      { chainage: 0, easting: 250100.0, northing: 9945200.0, elevation: 1850.0 },
      { chainage: 150, easting: 250220.0, northing: 9945290.0, elevation: 1854.0 },
      { chainage: 250, easting: 250300.0, northing: 9945350.0, elevation: 1857.0 },
    ],
  }

  it('generates a valid ISO-10303-21 STEP structure', () => {
    const ifc = generateIFC43Alignment(sampleOptions)

    expect(ifc).toContain('ISO-10303-21;')
    expect(ifc).toContain('HEADER;')
    expect(ifc).toContain("FILE_SCHEMA(('IFC4X3_ADD2'));")
    expect(ifc).toContain('ENDSEC;')
    expect(ifc).toContain('DATA;')
    expect(ifc.trim()).toMatch(/END-ISO-10303-21;$/)
  })

  it('declares units and UTM coordinate reference system', () => {
    const ifc = generateIFC43Alignment(sampleOptions)

    expect(ifc).toContain('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);')
    expect(ifc).toContain('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);')
    expect(ifc).toContain("IFCCOORDINATESYSTEMREFERENCE('UTM Zone 37S','EPSG','32737',$)")
  })

  it('defines IFC 4.3 infrastructure hierarchy: Project -> Site -> Road -> Alignment', () => {
    const ifc = generateIFC43Alignment(sampleOptions)

    expect(ifc).toContain("IFCPROJECT('Nakuru_Njoro_Access_Road'")
    expect(ifc).toContain("IFCSITE(")
    expect(ifc).toContain("IFCROAD(")
    expect(ifc).toContain("IFCALIGNMENT(")
    expect(ifc).toContain("IFCALIGNMENTHORIZONTAL(")
    expect(ifc).toContain("IFCALIGNMENTVERTICAL(")
  })

  it('formats 3D Cartesian coordinates with proper precision and without syntax errors', () => {
    const ifc = generateIFC43Alignment(sampleOptions)

    // Verify there are no $p typo placeholders
    expect(ifc).not.toContain('$p')

    // Verify 3D points
    expect(ifc).toContain('IFCCARTESIANPOINT((250100.000,9945200.000,1850.000));')
    expect(ifc).toContain('IFCCARTESIANPOINT((250300.000,9945350.000,1857.000));')

    // Verify 2D horizontal points
    expect(ifc).toContain('IFCCARTESIANPOINT((250100.000,9945200.000));')

    // Verify 2D vertical profile points (chainage, elevation)
    expect(ifc).toContain('IFCCARTESIANPOINT((0.000,1850.000));')
    expect(ifc).toContain('IFCCARTESIANPOINT((150.000,1854.000));')
  })

  it('correctly handles northern hemisphere UTM zone calculation', () => {
    const northOptions: IFC43ExportOptions = {
      ...sampleOptions,
      utmZone: 36,
      hemisphere: 'N',
    }

    const ifc = generateIFC43Alignment(northOptions)
    expect(ifc).toContain("IFCCOORDINATESYSTEMREFERENCE('UTM Zone 36N','EPSG','32636',$)")
  })

  it('writes the Arc 1960 authority EPSG code for declared Arc 1960 projects', () => {
    const arcOptions: IFC43ExportOptions = {
      ...sampleOptions,
      utmZone: 37,
      hemisphere: 'S',
      datum: 'Arc 1960',
    }

    const ifc = generateIFC43Alignment(arcOptions)
    expect(ifc).toContain("IFCCOORDINATESYSTEMREFERENCE('UTM Zone 37S','EPSG','21037',$)")
  })

  it('throws instead of mislabelling an unregistered Arc 1960 zone/hemisphere', () => {
    const badOptions: IFC43ExportOptions = {
      ...sampleOptions,
      utmZone: 37,
      hemisphere: 'N',
      datum: 'Arc 1960',
    }

    expect(() => generateIFC43Alignment(badOptions)).toThrow(/not registered/i)
  })
})
