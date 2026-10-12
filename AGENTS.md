# METARDU runtime and preservation rules

- Continue in this checkout; preserve existing source changes. Do not create another worktree or duplicate application container.
- Use the existing `metardu-app` production stack for Docker runtime checks. Supporting PostgreSQL, Redis, worker, collaboration, NTRIP and backup services are required services, not duplicate previews.
- Start runtime verification with `npm run docker:verify`. It reads health, ownership and duplicate application inventory; it never starts, builds, migrates or stops services.
- For source checks use focused tests, type checks and the existing host source preview where needed. Its synthetic database is separate from customer production. Browser/synthetic proof is not production/field proof.
- Do not create dated verification images, preview containers or extra Buildx builders for each change. Finish source verification before one planned production promotion. Use a reusable candidate tag and a verified current-production rollback tag.
- Review migration compatibility and backup/recovery evidence before promotion. Never modify applied migration hashes or bypass a rejected customer database clone.
- Never run blanket Docker system/image/volume/builder prune. Cleanup requires exact inspected IDs, ownership, mounts, activity and protected production/rollback checks. Leave unrelated images and volumes intact.
- Do not compact Docker's Windows virtual disk or shut down Docker/WSL while production is running. Docker accounting and physical Windows free space are separate measurements.
- Preserve the user's localhost CAD training drawing. Use the owned 127.0.0.1 origin for synthetic browser QA through CUA. Never write page storage or state through browser automation internals.
- Keep verification evidence and actual release/field blockers documented. Do not claim the broader engineering platform is finished after an isolated milestone.
