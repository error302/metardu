/**
 * @fileoverview Ban SILENT professional CRS defaults in fallbacks.
 *
 * The existing `no-hardcoded-srid-default` rule bans hardcoded `EPSG:xxxxx`
 * literals as defaults. That half of the problem is solved. This rule covers
 * the other half — the defaults METARDU actually shipped for years:
 *
 *   const datum = project.datum || 'Arc 1960'          // a false datum claim
 *   const zone  = input.utmZone ?? 37                  // Kenya's zone, silently
 *   const hemi  = input.hemisphere ?? 'S'              // Kenya's hemisphere
 *
 * A deliverable that prints "Arc 1960 / UTM Zone 37S" for a project that
 * declared nothing is a false authority claim on a signed document
 * (blueprint §2.4 "No silent professional defaults").
 *
 * The rule is deliberately narrow so it cannot fire on unrelated code:
 *   - datum fallbacks are matched by their known CRS datum names;
 *   - zone/hemisphere fallbacks are matched only when the LEFT-HAND side
 *     is named like a zone / hemisphere (`utm_zone`, `zone`, `hemisphere`);
 *   - a NAMED constant (`KENYA_UTM_ZONE`) is always allowed, because a
 *     jurisdiction constant that is explicitly named and documented is
 *     configuration, not a silent default.
 *
 * Everything this rule reports must instead resolve through the CRS
 * authority (`src/lib/spatial/projectCrs.ts`,
 * `src/lib/generators/reportCrs.ts`) or print NOT DECLARED.
 */
'use strict'

/** Known datum names that must never be used as a fallback value. */
const DATUM_FALLBACK = /^arc\s*1960(?:\s*\/\s*utm\s*zone\s*\d+[NS])?$/i

/** Hemispheres are single letters — only meaningful next to a zone/hemisphere name. */
const HEMISPHERE_FALLBACK = /^[NS]$/

/** The left-hand side of a fallback — used to decide what the value means. */
function leftText(context, node) {
  return context.getSourceCode().getText(node.left) || ''
}

/** The bound name of a parameter/destructuring default. */
function boundName(node) {
  if (!node.left) return ''
  if (node.left.type === 'Identifier') return node.left.name
  if (node.left.type === 'AssignmentPattern' && node.left.left.type === 'Identifier') {
    return node.left.left.name
  }
  if (node.left.type === 'ObjectPattern') {
    return node.left.properties
      .filter((property) => property.type === 'Property' && property.key)
      .map((property) => (property.key.name || property.key.value || ''))
      .join(',')
  }
  return ''
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow silent CRS defaults (datum, UTM zone, hemisphere) in fallbacks — the project reference system must be threaded explicitly or printed as NOT DECLARED',
      category: 'Correctness',
      recommended: true,
    },
    messages: {
      noDatumDefault:
        "Do not default a coordinate reference to '{{value}}'. A project that declared no datum has no datum to print — resolve it through the CRS authority or print 'NOT DECLARED'.",
      noZoneDefault:
        'Do not default a UTM zone to {{value}}. Thread the declared zone through explicitly, or use a named jurisdiction constant.',
      noHemisphereDefault:
        "Do not default a hemisphere to '{{value}}'. Thread the declared hemisphere through explicitly, or use a named jurisdiction constant.",
    },
    schema: [],
  },
  create(context) {
    /** Report a fallback whose right-hand side is a banned literal. */
    function checkFallback(node, name) {
      const right = node.right
      if (!right || right.type !== 'Literal') return

      if (typeof right.value === 'string' && DATUM_FALLBACK.test(right.value.trim())) {
        context.report({ node: right, messageId: 'noDatumDefault', data: { value: right.value } })
        return
      }
      if (typeof right.value === 'number' && right.value === 37 && /zone/i.test(name)) {
        context.report({ node: right, messageId: 'noZoneDefault', data: { value: right.value } })
        return
      }
      if (typeof right.value === 'string' && HEMISPHERE_FALLBACK.test(right.value.trim()) && /hemi/i.test(name)) {
        context.report({ node: right, messageId: 'noHemisphereDefault', data: { value: right.value } })
      }
    }

    return {
      LogicalExpression(node) {
        // `crs || 'Arc 1960'` / `zone ?? 37` / `hemisphere ?? 'S'`
        if (node.operator !== '??' && node.operator !== '||') return
        checkFallback(node, leftText(context, node))
      },
      AssignmentPattern(node) {
        // `function f(datum = 'Arc 1960')` / `const { zone = 37 } = opts`
        checkFallback(node, boundName(node))
      },
    }
  },
}
