/**
 * @fileoverview Ban hardcoded CRS/SRID literals in parameter defaults and
 * nullish/or fallbacks.
 *
 * Blueprint hard contract (§3.3 / F4): a length, area or bearing computed in
 * the wrong CRS is silently wrong — never the wrong result by accident of a
 * default. Every CRS must be threaded explicitly from the project CRS
 * provider. So these are all errors:
 *
 *   function f(epsg = 'EPSG:21037') {}        // parameter default
 *   const { epsg = 'EPSG:21037' } = opts      // destructuring default
 *   f(x, 'EPSG:32637')                        // (covered by existing
 *                                             //  no-restricted-syntax rule)
 *   const crs = input ?? 'EPSG:21037'         // nullish fallback default
 *
 * Property/variable *declarations* of named constants (e.g.
 * `const SRID_21037 = 'EPSG:21037'`) are NOT defaults and are fine.
 */
'use strict'

const SRID_LITERAL = /^EPSG:\d{4,5}$/

/** Report if `value` of an AssignmentPattern is a hardcoded SRID literal. */
function checkAssignmentPattern(node, context) {
  if (node.right && node.right.type === 'Literal' && typeof node.right.value === 'string' && SRID_LITERAL.test(node.right.value)) {
    context.report({ node: node.right, messageId: 'noDefault', data: { value: node.right.value } })
  }
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded CRS/SRID literals as parameter, destructuring or nullish defaults — CRS must be threaded explicitly from the project CRS provider (plan §3.3/F4)',
      category: 'Correctness',
      recommended: true,
    },
    messages: {
      noDefault:
        "Do not default a CRS to a hardcoded SRID ('{{value}}'). Thread the project CRS explicitly (e.g. currentUtmEpsg from MapReactContext or the engine core/projection authority).",
    },
    schema: [],
  },
  create(context) {
    return {
      AssignmentPattern(node) {
        checkAssignmentPattern(node, context)
      },
      LogicalExpression(node) {
        // `crs ?? 'EPSG:21037'` / `crs || 'EPSG:21037'` fallback defaults
        if (
          (node.operator === '??' || node.operator === '||') &&
          node.right.type === 'Literal' &&
          typeof node.right.value === 'string' &&
          SRID_LITERAL.test(node.right.value)
        ) {
          context.report({ node: node.right, messageId: 'noDefault', data: { value: node.right.value } })
        }
      },
    }
  },
}
