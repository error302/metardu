const fs = require('fs')
const path = require('path')

const target = path.join(__dirname, '..', 'src', 'components', 'workspace', 'WorkflowStepPanel.tsx')
let content = fs.readFileSync(target, 'utf8')

// Replace in hints
const oldHints = "cadastral: ['LR Number / Title Number', 'Client name and contact', 'UTM Zone', 'County'],"
const newHints = "cadastral: ['LR Number / Title Number', 'Client name and contact', 'UTM Zone', 'County'],\n    construction: ['Building/structure grid origin', 'Rotated grid azimuth', 'Floor datum benchmark', 'Structural tolerances'],"

// Replace in computeItems
const oldCompute = "engineering: ['Rise & fall reduction', '10√K mm closure (RDM 1.1)', 'Cross-section volumes'],"
const newCompute = "engineering: ['Rise & fall reduction', '10√K mm closure (RDM 1.1)', 'Cross-section volumes'],\n    construction: ['Grid coordinate transformation', 'Polar setting out (angle + distance)', 'Column verticality residuals', 'Floor slab level deviation'],"

// Normalize newlines in search if needed
content = content.replace(oldHints, newHints)
content = content.replace(oldCompute, newCompute)

fs.writeFileSync(target, content, 'utf8')
console.log('Updated WorkflowStepPanel.tsx successfully')
