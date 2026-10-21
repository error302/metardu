/** Compose must never retain an independently built, stale migration artifact. */
export function assertRuntimeArtifactPair(config) {
  const app = config?.services?.['metardu-app'], migration = config?.services?.['metardu-db-migrate']
  if (typeof app?.image !== 'string' || !app.image.trim() || migration?.image !== app.image || migration.build !== undefined) {
    throw new Error('Application and migration services must share one explicitly selected runtime image; an independent migration build is refused.')
  }
  return app.image
}

export function assertRuntimeMigrationContainer(app, migration) {
  if (!app?.Image || migration?.Name !== '/metardu-db-migrate' ||
      migration?.Config?.Labels?.['com.docker.compose.project'] !== 'metardu' ||
      migration?.Config?.Labels?.['com.docker.compose.service'] !== 'metardu-db-migrate' ||
      migration.Image !== app.Image || migration.State?.Status !== 'exited' || migration.State?.ExitCode !== 0) {
    throw new Error('The owned migration service must have completed successfully using the running application image.')
  }
}
