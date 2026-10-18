/** Asset retries need a new document; ordinary application errors can reset React. */
export function isAssetLoadError(error: Error): boolean {
  return error.name === 'ChunkLoadError' ||
    /loading (?:css )?chunk [\s\S]*failed|failed to fetch dynamically imported module|importing a module script failed/i.test(error.message)
}

export function reloadCurrentDocument(): void {
  window.location.reload()
}
