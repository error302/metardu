# Saved reference declaration read repair

The page-loading audit reproduced a real inconsistency in the owned source
preview: Project Overview and the retained terrain view showed the saved
EPSG:21037 declaration and synthetic height datum, but Project Settings said
Not declared and displayed blank vertical-reference fields. No declaration was
submitted to work around this display failure.

The GET query aliased `project_reference_systems` as `reference` and selected
`to_jsonb(reference)`. The projects table also has a legacy text column named
`reference`. PostgreSQL resolved the function argument to that column, so a
null or ordinary file-reference string hid the actual joined declaration.
The corrected expression is `to_jsonb(reference.*)`, which explicitly selects
the joined row. Ownership checks, the owner-matching join and private no-store
responses remain in place. No migration or persisted CRS change is required.

## Reproduction and verification

- A read-only query against the existing synthetic project returned null from
  the ambiguous expression and EPSG:21037 from the explicit whole-row expression.
- The existing native verifier now includes the real legacy `projects.reference`
  column. Its old fixture omitted it, which concealed this SQL name-resolution
  defect. Added cases cover both null and nonempty legacy references without
  changing saved data during GET.
- `node scripts/verify-setout-generation.mjs red --reference` reproduced three
  failures, including the previously passing shared-reader case, with 21 other
  checks passing. The source fix then passes all 24 cases with `green --reference`.
  Receipts are under `.cache/reference-declaration/alias-read/`; older receipts
  are retained outside that subdirectory.
- The verifier checks the exact existing loopback rehearsal service and database
  marker. All writes are confined to its uniquely marked schema. The final
  receipt confirms exact fixture removal, unchanged original record fingerprints,
  unchanged migration ledger and unchanged source hashes during the run.
  Authentication is an adapted context and fixture tables are not an RLS proof.
- The five focused declaration/access/persistence/component/reference suites pass
  55 tests: `.cache/workspace-ui/reference-tests.json`. App/test type checking and
  scoped route lint pass.
- Actual Chrome reload now restores the saved declaration, EPSG:21037, synthetic
  local height datum, local height type and benchmark basis. The read-only
  receipt is `.cache/workspace-ui/browser-settings.json`; screenshot:
  `.cache/workspace-ui/reference-settings.png`. No saved settings were changed.

## Persistent navigation during long forms

The same Settings review reproduced the disappearing work-mode header while
scrolled: its computed top was -1242 px at page scroll 1242 px even though it
was styled sticky. Body combined horizontal clipping with `overflow-y: auto`,
which computed a separate hidden/auto overflow context. Leaving body vertical
overflow visible preserves document scrolling and horizontal clipping.

Actual Chrome then reports header top 0 at page scroll 859 px, header height
65 px and zero document horizontal overflow. The work-mode More menu opens and
navigates from that scrolled position. This is desktop source-preview proof;
phone, zoom, complete page-family and privileged administrator acceptance remain
separate. Production, signing-key deferral, release/recovery and field gates
remain open.
