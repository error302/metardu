// Compatibility entry point: every logger consumer gets lazy server reporting.
// The monitoring adapter uses the lower-level core, keeping this direction
// acyclic without requiring another module to initialize error forwarding.
export { logger, NO_FORWARD, log, auditLog } from './loggingCore'
import { setExternalErrorReporter } from './loggingCore'

setExternalErrorReporter((error, metadata) => {
  void import('./monitoring/sentry').then(({ captureError }) => {
    captureError(error, metadata)
  }).catch(() => {})
})
