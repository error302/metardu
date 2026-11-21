# METARDU UX & Motion Principles (working checklist)

The 20 principles applied to a field survey product. Each rule below is a
concrete, checkable pattern — use it when building or reviewing any screen.
Field context first: gloves, sunlight, one hand, dust, 390–1440 px.

## Fit for the field (Fitts, hit areas, frequency)
1. **Fitts's law / bigger hit areas** — every tappable control ≥44 px
   (buttons use `min-h-11`, primary field actions `min-h-12`). Edges and
   bottom-sheet handles count as targets; never park a control where the
   sticky header can intercept taps (Slice 3 full-snap fix).
2. **Frequency of use** — highest-frequency actions sit at the thumb zone:
   capture actions in the bottom sheet, Reject swipe on rows, one-tap
   repeats, remembered last feature code. Rare actions (settings, sign-off)
   may live further away.
3. **Solid drawing in 3D** — map UI must never obscure the map: overlays
   with `pointer-events-none` containers, side panel collapsible, bottom
   sheet snaps keep map visible (peek/half/full).

## Choice & memory (Hick, Miller, Jakob)
4. **Hick's law** — never offer 124 raw options unfiltered: CrsPicker has a
   search box before the select; tool docks show per-tab tool sets only.
5. **Miller's law** — chunk CRS metadata into one scannable line
   (`code · name · datum · units · note`), statuses into a single strip,
   and keep groups ≤4 items (sketch tools grid).
6. **Jakob's law** — use platform-familiar patterns: native `<select>` for
   pickers, `<details>` for collapsible session headers, standard
   label/field association. No exotic widgets on data-entry forms.
7. **Postel's law** — numeric fields accept `0,10`, ` 0.10 `, trailing
   spaces; forms state what was understood instead of scolding
   ("RMSE must be a positive number of metres, or left empty").

## Feedback & timing (Doherty, snappy, exaggerated, follow-through)
8. **Doherty threshold** — interactions respond <400 ms: CRS filter is
   client-side; async loads show a status line immediately ("Reading the
   saved project reference").
9. **Snappy timing** — panel/motion transitions 180–200 ms
   `cubic-bezier(0.22, 1, 0.36, 1)`; no slow fades on action feedback.
10. **Exaggerated feedback / squash & stretch** — state changes are visible
    and honest: disabled tools state *why* (banner + tooltip), locate
    button pulses while searching, sync states name the outcome. Honest
    over cute: never animate a number into meaninglessness.
11. **Follow through** — a completed action lands somewhere: toasts stack
    and dismiss (MapNotifications), save messages persist until the next
    state, rejected rows stay struck-through with a restore path.
12. **Anticipation** — destructive or high-consequence actions preview
    their effect first: contour interval warning before export, CRS-change
    confirmation, transformation approval checkbox.

## Staging & hierarchy (staging, pose-to-pose, secondary action)
13. **Staging the focus** — one primary action per panel (Generate, Save,
    Export); everything else is secondary styling. Warnings use amber,
    errors red, honest-neutral text muted.
14. **Pose to pose** — layouts snap between defined states (sheet
    peek/half/full, dock slide rule ≥901px) instead of free-floating
    intermediate sizes users can't predict.
15. **Secondary action** — supporting info (datum notes, accuracy basis,
    provenance) travels with the primary value but never competes with it.

## Motion discipline (arcs, slow in/out, appeal)
16. **Moving in arcs / slow in & slow out** — panels slide from the edge
    they belong to with eased start/end; sheets rise from the bottom.
17. **Overall appeal** — high-contrast light and dark themes, typographic
    hierarchy, consistent radii/borders. Appeal = professional calm, not
    decoration.
18. **Reduced motion** — every animation is wrapped in
    `@media (prefers-reduced-motion: reduce)` overrides (map-workspace.css).

## Honesty rules (product-specific, override "delight" if they conflict)
19. **Never fake capability** — device location is never labelled GNSS;
    satellite count says "no GNSS receiver"; uncertified outputs carry
    certification placeholders.
20. **Never invent data** — undeclared accuracy stays undeclared
    ("not assessed"), missing CRS stays "Choose a CRS…", failed loads
    report the failure instead of an empty list.
