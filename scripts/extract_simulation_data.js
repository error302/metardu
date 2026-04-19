const XLSX = require('xlsx');
const fs = require('fs');

const files = [
  'C:/Users/ADMIN/Downloads/FINAL THEORETICAL COMPUTATIONS FOR 4 ACRES.xlsx',
  'C:/Users/ADMIN/Downloads/5 acres compilation NEW.xlsx'
];

const extractedData = {
  projects: []
};

function parseDMS(dmsStr) {
  if (!dmsStr || typeof dmsStr !== 'string') return null;
  // Match degrees, minutes, seconds
  const match = dmsStr.match(/(\d+)°\s*(\d+)'\s*(\d+)"/);
  if (match) {
    return {
      degrees: parseInt(match[1]),
      minutes: parseInt(match[2]),
      seconds: parseInt(match[3])
    };
  }
  return null;
}

for (const f of files) {
  const fileName = f.split('/').pop();
  console.log('Processing:', fileName);
  const wb = XLSX.readFile(f);
  const project = {
    fileName: fileName,
    traverse: [],
    areas: [],
    leveling: [] // Initially empty, will check sheets
  };

  // Try to find Traverse data in CONSISTENCY CHECKS
  const ccSheet = wb.Sheets['CONSISTENCY CHECKS'];
  if (ccSheet) {
    const data = XLSX.utils.sheet_to_json(ccSheet, { header: 1 });
    // Look for lines that look like traverse steps
    data.forEach(row => {
      const bearing = parseDMS(row[0]);
      if (bearing && row[3]) { // If has bearing and station name
        project.traverse.push({
          line: row[0],
          bearing: bearing,
          dN: row[1],
          dE: row[2],
          station: row[3],
          n: row[4],
          e: row[5]
        });
      }
    });
  }

  // Try to find Area data in AREAS
  const areaSheet = wb.Sheets['AREAS'];
  if (areaSheet) {
    const data = XLSX.utils.sheet_to_json(areaSheet, { header: 1 });
    data.forEach(row => {
      // Look for lines containing "Total Area" or "Area =" or similar
      const rowStr = JSON.stringify(row);
      if (rowStr.includes('Area') || rowStr.includes('acre')) {
        project.areas.push(row.filter(c => c !== null));
      }
    });
  }

  // Check for any sheet that might be Leveling
  wb.SheetNames.forEach(name => {
    if (name.toLowerCase().includes('level') || name.toLowerCase().includes('height')) {
       const sheet = wb.Sheets[name];
       const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
       project.leveling.push({ sheetName: name, data: data.slice(0, 20) }); // Take a sample
    }
  });

  extractedData.projects.push(project);
}

fs.writeFileSync('artifacts/simulation_data.json', JSON.stringify(extractedData, null, 2));
console.log('Extraction complete. Saved to artifacts/simulation_data.json');
