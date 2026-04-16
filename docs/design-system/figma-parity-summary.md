# Figma Parity Summary

Active working contract: [figma-code-first-handoff.md](/Users/matthewbraun/Desktop/mapmat/docs/design-system/figma-code-first-handoff.md)

This summary remains the audit snapshot. The new handoff doc is the live reference for Figma variable names, component ownership, state mapping, and the code-first workflow.

This summary is based on a code-only frontend audit completed on 2026-04-11. No Figma file metadata, design library inventory, or Code Connect mappings exist in the repo, so the Figma side is inferred from current naming, CSS contracts, and repeated UI patterns.

## Totals
- Total matched: 8
- Total partial: 18
- Missing in Figma: 6
- Missing in code: 4

## Readout
- The strongest existing parity is at the primitive and shell level: `Button`, `IconButton`, `TextInput`, `SelectInput`, `TextareaInput`, the base modal contract, and `AccountDrawer`.
- The biggest parity gap is not visual inconsistency alone; it is missing abstraction. Tabs, badges, option cards, and menus are repeated often enough to deserve shared code primitives and named Figma component sets.
- The highest-risk product surfaces for Figma alignment are `ScanBar`, `CanvasToolbar`, `MinimapNavigator`, `FeedbackWidget`, `ReportDrawer`, and admin surfaces. They are important, bespoke, and not clearly represented as reusable Figma counterparts yet.
- The token layer is safer than the first audit pass: legacy aliases for `--color-bg`, `--color-bg-secondary`, `--color-text-muted`, and `--radius-sm` now exist in `App.css`. The next cleanup step is reducing reliance on those aliases and moving more surfaces onto the `--ui-*` token set directly.
- The marketing site is internally consistent, but it currently behaves like a second design system rather than a themed extension of the app system.

## Top 10 Cleanup Priorities
1. Continue the semantic token cleanup in `frontend/src/App.css`. The missing legacy aliases now exist, so the next step is replacing those aliases and shared-surface hardcoded values with direct `--ui-*` semantic tokens.
2. Extract a shared segmented control or tabs primitive and map it to a single Figma component set. Current drift shows up in `AuthModal`, `SettingsDrawer`, `VersionHistoryDrawer`, and `FeedbackWidget`.
3. Extract a shared badge or pill primitive with semantic variants for status, role, count, and comparison states. This would simplify `NodeCard`, `ShareModal`, `VersionHistoryDrawer`, `AdminConsole`, and landing compare chips.
4. Extract a shared option-card primitive for selectable cards. This should absorb `modal-option-card`, `create-map-option`, `export-btn`, and `share-permission-option`.
5. Extract a shared menu or dropdown surface primitive for account menus, toolbar menus, collaborator menus, mention dropdowns, and annotation menus.
6. Create explicit Figma components for the main custom workspace surfaces: `ScanBar`, `CanvasToolbar`, `MinimapNavigator`, `FeedbackWidget`, and `ReportDrawer`.
7. Move the app chrome and canvas surfaces onto semantic tokens instead of direct hex and rgba values, especially `Topbar`, `CanvasMapHeader`, `NodeCard`, and `ShareModal`.
8. Standardize form controls so modal, project, and admin flows consistently use the existing `ui/*` wrappers instead of mixing wrapper components with ad hoc native input styling.
9. Decide whether the landing page remains a deliberate second system or whether it should converge with the app token vocabulary. Right now the split is real, but undocumented.
10. After the primitive set is stable, formalize Figma naming and ownership and add Code Connect or another explicit component mapping layer so parity can be maintained instead of re-audited manually.

## Suggested Pilot Flow For Figma Alignment
Start with a single end-to-end workspace flow instead of trying to align the whole product at once. The best pilot is the main scan-to-review path because it touches the highest-value custom surfaces and most of the shared primitives.

Suggested pilot:
1. Align foundations first: app tokens, `Button`, `IconButton`, form inputs, modal shell, and `AccountDrawer`.
2. Model `Topbar` and `ScanBar` together, including editable vs shared states and the scan-options panel.
3. Model the main workspace chrome together: `CanvasMapHeader`, `CanvasToolbar`, `ZoomControls`, `LayersPanel`, and `ColorKey`.
4. Model `NodeCard` with its important states: thumbnail, selected, ghosted, deleted, and stack-collapsed.
5. Add the review surfaces that attach directly to nodes: comments panel, comment popover, and feedback drawer.
6. Finish the pilot with `ReportDrawer` and `ShareModal`, since they represent the handoff from audit work to collaboration and export.

Why this pilot:
- It covers the product's primary desktop workflow.
- It exercises nearly every shared primitive and shell already present in code.
- It forces alignment on the most expensive bespoke surfaces before time is spent on lower-priority admin or marketing work.
