/**
 * @fileoverview Ban survey math on Web-Mercator (EPSG:3857) coordinates.
 *
 * Blueprint hard contract (§3.3/A12.5): displayed lengths, areas and bearings
 * must be computed in the project CRS grid plane; EPSG:3857 coordinates are
 * display-only. Computing on them produces up to ~50% area error in Kenya's
 * latitude band. So these are flagged:
 *
 *   surveyArea(ring, 'EPSG:3857')
 *   polylineLengthInCrs(coords, 'EPSG:3857')
 *   getArea(geom) / getLength(line)   // ol/sphere geodesic shortcuts are
 *                                     // fine for display but must not feed
 *                                     // survey results; require opt-in via
 *                                     // test override instead.
 *
 * The CallExpression literal form is the machine-checkable contract; the
 * ol/sphere import guard is scoped by config (enabled for app/lib, off for
 * the authority implementations in lib/spatial and tests).
 */
'use strict'

/** Callee names treated as survey math that must receive a project CRS. */
const SURVEY_MATH_CALLEE = /^(surveyDistance|surveyBearing|surveyArea|polygonAreaInCrs|polygonPerimeterInCrs|polylineLengthInCrs|endpointsBearingInCrs|measure|distanceBearing|planarArea|calculateArea|calculateDistance|calculateBearing)$/

function isMercatorLiteral(node) {
  return node.type === 'Literal' && node.value === 'EPSG:3857'
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow survey measurement math on EPSG:3857 (Web Mercator) coordinates — survey results must be computed in the declared project CRS (plan §3.3/A12.5)",
      category: 'Correctness',
      recommended: true,
    },
    messages: {
      mercatorMeasure:
        "Do not run survey math ('{{callee}}') on EPSG:3857 (Web Mercator) coordinates — display CRS only. Use the project CRS authority (lib/spatial/projectCrs / engine core).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // name(...) or obj.name(...)
        let calleeName = null
        if (node.callee.type === 'Identifier') calleeName = node.callee.name
        else if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
          calleeName = node.callee.property.name
        }
        if (!calleeName || !SURVEY_MATH_CALLEE.test(calleeName)) return
        for (const arg of node.arguments) {
          if (isMercatorLiteral(arg)) {
            context.report({ node: arg, messageId: 'mercatorMeasure', data: { callee: calleeName } })
          }
        }
      },
    }
  },
}
