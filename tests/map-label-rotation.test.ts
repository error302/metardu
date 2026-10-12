import { createAnnotationLayer, bearingToOLRotation } from '@/lib/map/annotations'
const grid = 'EPSG:32636'
test.each([[0,-90],[45,-45],[90,0],[135,45],[180,90],[225,-45],[270,0],[315,45]])('bearing %s has an upright canvas label at %s degrees', (bearing, degrees) => {
  expect(bearingToOLRotation(bearing)).toBeCloseTo(degrees * Math.PI / 180, 12)
})
test('coincident boundary vertices cannot acquire a fabricated north bearing', async () => {
  await expect(createAnnotationLayer({epsg:grid,coords3857:[],stations21037:[
    {pointName:'TEST-A',easting:500000,northing:0},
    {pointName:'TEST-B',easting:500000,northing:0},
    {pointName:'TEST-C',easting:500050,northing:50},
  ]})).rejects.toThrow(/coincident/i)
})
