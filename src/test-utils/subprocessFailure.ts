/** Preserve fixture CLI output while rejecting unrelated execution errors. */
export function subprocessFailure(error: unknown): { code: number; output: string } {
  if (typeof error !== 'object' || error === null || !('status' in error) || !('stdout' in error)) throw error
  return { code: typeof error.status === 'number' ? error.status : 1,
    output: typeof error.stdout === 'string' ? error.stdout : Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : '' }
}
