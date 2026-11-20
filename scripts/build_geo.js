import fs from 'node:fs';

const mainland = JSON.parse(fs.readFileSync('india_boundary.json', 'utf8'));
const allParts = JSON.parse(fs.readFileSync('india_all_polygons.json', 'utf8'));
const islands = allParts.slice(1);
const sriLanka = JSON.parse(fs.readFileSync('sri_lanka.json', 'utf8'));

const firs = [
  {
    code: 'VIDF',
    name: 'DELHI FIR',
    labelPos: [29.5, 75.0],
    boundary: [[24.5, 71.2], [24.0, 74.5], [23.8, 78.5], [24.5, 82.5], [27.0, 84.5]]
  },
  {
    code: 'VABF',
    name: 'MUMBAI FIR',
    labelPos: [19.5, 70.0],
    boundary: [[24.5, 71.2], [24.0, 74.5], [23.8, 78.5], [20.0, 78.0], [15.0, 75.0], [14.0, 74.4]]
  },
  {
    code: 'VECC',
    name: 'KOLKATA FIR',
    labelPos: [23.5, 88.5],
    boundary: [[27.0, 84.5], [24.5, 82.5], [20.0, 82.5], [18.0, 84.5], [16.0, 85.0]]
  },
  {
    code: 'VOMF',
    name: 'CHENNAI FIR',
    labelPos: [12.0, 78.0],
    boundary: [[14.0, 74.4], [15.0, 75.0], [20.0, 78.0], [20.0, 82.5], [16.0, 85.0]]
  }
];

const fileContent = `// Precision Geospatial Coordinate System for Indian Airspace (OCC Radar Display)
// Mathematically calibrated Equidistant projection centered on IST Standard Meridian (82.5°E, 22.5°N)
// Survey of India compliant official territorial boundary + Islands + Airspace FIR Sectors.

export const VB_WIDTH = 680;
export const VB_HEIGHT = 720;

const LAT_0 = 22.5;
const LNG_0 = 82.5;
const COS_LAT_0 = Math.cos(LAT_0 * Math.PI / 180);
const SCALE_Y = (VB_HEIGHT - 70) / (37.2 - 6.8);
const SCALE_X = SCALE_Y;

export function project(lat, lng, vbW = VB_WIDTH, vbH = VB_HEIGHT) {
  const x = Math.round((vbW / 2) + (lng - LNG_0) * COS_LAT_0 * SCALE_X);
  const y = Math.round((vbH / 2) - (lat - LAT_0) * SCALE_Y);
  return { x, y };
}

export const INDIA_MAINLAND = ${JSON.stringify(mainland)};

export const INDIA_ISLANDS = ${JSON.stringify(islands)};

export const SRI_LANKA = ${JSON.stringify(sriLanka)};

export const AIRSPACE_FIRS = ${JSON.stringify(firs)};
`;

fs.writeFileSync('public/js/india_geo.js', fileContent);
console.log('Successfully generated public/js/india_geo.js, size:', fs.statSync('public/js/india_geo.js').size);
