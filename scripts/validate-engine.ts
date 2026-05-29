import { forwardTraverse } from '../src/lib/engine/traverse';

const points = [
  { name: 'RD21', easting: -4182.37, northing: 114370.35 }
];
const distances = [102.20, 74.49, 6.00, 6.00, 228.80, 74.00, 203.14];
// Convert DMS to decimal degrees
// 287° 14' 04" -> 287 + 14/60 + 4/3600
const d287_14_04 = 287 + 14/60 + 4/3600;
const d174_04_11 = 174 + 4/60 + 11/3600;
const d84_04_11 = 84 + 4/60 + 11/3600;
const d354_04_11 = 354 + 4/60 + 11/3600;

const bearings = [
  d287_14_04,
  d287_14_04,
  d287_14_04,
  d174_04_11,
  d174_04_11,
  d84_04_11,
  d354_04_11
];
const stations = ['AB3', 'AB4a', 'AB4', 'AB4b', 'AB1', 'AB2', 'AB3_closing'];

const result = forwardTraverse({
  start: points[0],
  stations,
  distances,
  bearings
});

console.log('Traverse Results:');
result.legs.forEach(leg => {
  console.log(`${leg.from} -> ${leg.to}: E: ${leg.easting.toFixed(2)}, N: ${leg.northing.toFixed(2)}`);
});
console.log('Closing error:', (result.legs[result.legs.length - 1].easting - (-4279.98)).toFixed(2), (result.legs[result.legs.length - 1].northing - 114400.63).toFixed(2));
