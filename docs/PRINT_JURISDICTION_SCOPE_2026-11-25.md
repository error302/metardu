# Print Jurisdiction Scope — 2026-11-25

## Purpose

This record separates the jurisdiction-neutral shared print shell from the
Kenya-specific document, export, and engineering modules that still exist in
the repository. It is a scope and backlog record, not a claim that every
Kenya-specific surface has been internationalized.

## Implemented: shared print shell

`src/lib/print/buildPrintDocument.ts` now applies these rules:

1. `PrintMeta.jurisdiction` is optional and must be a recognized member of the
   country standards registry. An unknown runtime value is rejected; it never
   falls through `getCountryStandard()` to the Kenya default.
2. When no jurisdiction is supplied, the header prints `Jurisdiction: Not
   declared` and `Applicable standards: Not declared`.
3. When a jurisdiction is supplied, the header prints the registry name and
   only references from that jurisdiction's reviewed `printStandards` pack.
   Kenya, Bahrain, and New Zealand currently have reviewed print packs. Other
   jurisdictions receive the neutral `Not declared` fallback until a reviewed
   pack is added.
4. Every shared-shell document is marked `DRAFT — NOT CERTIFIED` and carries a
   **Professional Review Declaration** with reviewer signature placeholders.
   `reviewOnly: false` cannot enable a statutory certification statement.
5. The shared disclaimer now refers to the competent authority in the relevant
   jurisdiction. It no longer names ISK/EBK, the Survey Act Cap 299, the
   Survey Regulations 1994, or the Survey of Kenya.
6. The default date locale is no longer `en-KE`, and the registration field is
   labelled generically rather than as an ISK number.
7. The live beacon certificate path receives the jurisdiction selected in the
   builder and passes it to the shared shell. The separate registry PDF
   template continues to validate jurisdiction and CRS independently.

The shared-shell contract is covered by:

- `src/lib/print/__tests__/buildPrintDocument.test.ts`
- `src/lib/print/__tests__/beaconCertificateReference.test.ts`

## Residual Kenya-scoped modules

The following surfaces still contain Kenya-specific statutes, authorities,
submission conventions, tolerances, or document forms. They must be treated
as **Kenya-scoped packs**, not as jurisdiction-neutral output. This slice did
not relabel them or infer another country's rules from their text.

### Statutory document packs

- `src/lib/print/deedPlanPrint.ts`
- `src/lib/print/billableDocuments.ts`
- `src/lib/documents/templates/deed-plan.ts`
- `src/lib/documents/templates/form-c22.ts`
- `src/lib/documents/templates/form-no4.ts`
- `src/lib/documents/templates/mutation-form.ts`
- `src/lib/documents/templates/mutation-vector-layout.ts`

### Kenya engineering and field print modules

- `src/lib/print/gnssObservationLog.ts`
- `src/lib/print/levelBookPrint.ts`
- `src/lib/print/settingOutSchedule.ts`
- `src/lib/print/droneReportPrint.ts`

These modules also contain Kenya-specific RDM/Survey Regulations criteria or
tolerances. Moving their citations into the registry is necessary but is not
sufficient: their calculations and acceptance criteria also need reviewed
jurisdiction-specific packs.

### Kenya drawing and interchange modules

- `src/lib/export/cadastralPlanDXF.ts`
- `src/lib/export/dxfSheetLayout.ts`
- `src/lib/export/traverseDXF.ts`
- `src/lib/export/helpers.ts`

### Kenya-specific tool surfaces

`src/app/tools/` contains multiple Kenya-specific calculation, reference,
and certificate pages, including the area, bearing, coordinates, control
marks, detail tolerances, drone/geodetic reduction, GNSS observation log,
level book/leveling, mobilisation report, setting out, tacheometry, traverse,
two-peg test, survey regulations, and fee quotation tools. Their visible
Kenya references are not neutralized by the shared-shell change.

The principal component-level residuals include:

- `src/components/shared/PrintMetaPanel.tsx`
- `src/components/shared/ProfessionalDisclaimer.tsx`
- `src/components/gnss/GNSSLogBuilder.tsx`
- `src/components/LevelBook.tsx`
- `src/components/setting-out/StakeOutSheet.tsx`
- `src/components/surveyreport/SurveyReportBuilder.tsx`
- `src/components/shared/TrustSignals.tsx`

AI knowledge modules, statutory validators, fieldbook templates, and the
road-design calculation engines are separate Kenya-scoped systems and are not
covered by this print-shell slice.

## Required follow-up before international release

1. Make the persisted project jurisdiction authoritative and validate it
   against the registry. Project-scoped print generation must pass that value;
   later changes to a user preference must not rewrite an existing project's
   jurisdiction.
2. Replace the `useCountry()` Kenya default with an explicit, distinguishable
   "not declared" state for new projects and jurisdiction-aware tools.
3. Add reviewed `printStandards` packs and jurisdiction-specific document
   templates before exposing a jurisdiction in professional deliverables.
4. Version tolerance profiles and route every PASS/FAIL to the exact profile
   revision. A citation move alone does not make a hard-coded tolerance
   portable.
5. Gate Kenya statutory packs on a Kenyan project jurisdiction and provide a
   neutral, review-only alternative elsewhere. Do not manufacture another
   jurisdiction's statutory wording by substituting a country label.

## Verification boundary

This record covers the shared HTML print shell and the live beacon certificate
wiring. It does not claim that the residual modules, project-jurisdiction
persistence, tolerance portability, or every Kenya-specific UI surface is
complete.
