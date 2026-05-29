# Database Migrations

## Deployment Order

1. `scripts/create-projects-table.sql` — Base projects table
2. `scripts/phase25_scheme_tables.sql` — Scheme, blocks, parcels
3. `scripts/phase26_5_add_role_column.sql` — User roles (RBAC)
4. `scripts/phase26_5_coordinate_precision.sql` — Coordinate precision constraints
5. `scripts/phase27_deploy.sql` — Traverse tables + history + versioning
6. `scripts/phase31_team_workflow.sql` — Team assignments + activity log

## Running Migrations

```bash
# On the GCP VM:
psql -U metardu -d metardu -f scripts/phase26_5_add_role_column.sql
psql -U metardu -d metardu -f scripts/phase26_5_coordinate_precision.sql
psql -U metardu -d metardu -f scripts/phase27_deploy.sql
psql -U metardu -d metardu -f scripts/phase31_team_workflow.sql
```

## Notes
- All `CREATE TABLE` statements use `IF NOT EXISTS` for safe re-running
- Coordinate columns use `NUMERIC(12,3)` for Easting/Northing (mm precision)
- Area columns use `NUMERIC(12,6)` for hectares
