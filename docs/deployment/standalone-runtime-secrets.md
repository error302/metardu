# Standalone runtime configuration

Standalone build artifacts must not contain `.env` files. The preparation helper
no longer copies `.env.local`; it rejects an existing bundled dotenv file and
leaves it intact for recovery outside the output. Next's trace excludes dotenv
files. Runtime secrets belong in the host environment or the source installation's
private environment files, outside the portable artifact.

For a source installation, `npm start` and `npm run start:standalone` use
`scripts/start-standalone.mjs`. It loads the project root's production environment
through the pinned `@next/env` loader, preserves existing operator variables,
checks the selected output directory and starts that output's server. It does not
copy environment files. `METARDU_NEXT_DIST_DIR` can select an owned build directory;
path traversal, destinations outside the project and ancestor links escaping the
project are rejected. A missing server or traced dependency directory stops startup
or preparation rather than creating a nonportable dependency symlink.

Docker's independent runner continues starting its bundled `server.js` directly
with injected runtime variables. The source launcher is not required inside the
image. For PM2 source installations, launch `scripts/start-standalone.mjs` with
the project as its working directory. For standalone-only installations, inject
the environment through the process manager or Node's explicit external env-file
option; keep that file outside the artifact.

The preparation helper checks destination ownership before recursive replacement
of its own copied asset directories. It retains the selected build platform's
native PDF canvas and Sharp codec metadata. The final runtime remains independent
of the build toolchain.

Local synthetic tests prove source env loading, operator precedence, secret
retention on rejected output, and path traversal rejection. Windows sandbox
restrictions prevented creating the synthetic junction; the Linux build must
pass that case too. Build/package/runtime verification is tracked separately
under `test-results/export-package/`.

[Next.js environment loading and precedence](https://nextjs.org/docs/app/guides/environment-variables)
is the loader reference. No real secret values were printed, copied into test
fixtures or sent to a provider for this verification.
