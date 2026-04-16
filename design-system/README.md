# Design System Export

## Scope
- This folder is a code-first snapshot of the current shared UI layer.
- Sources: `frontend/src/App.css`, `frontend/src/LandingPage.css`, `frontend/src/utils/constants.js`, `frontend/src/components/ui`, and `frontend/src/components/drawers/AccountDrawer.js`.
- The export reflects the repo as it exists now. It does not add guessed tokens, guessed variants, or guessed components.

## Files
- `tokens.json`: structured app tokens, landing tokens, and runtime layout/color constants that live in JavaScript.
- `tokens.css`: raw CSS custom properties exactly as defined in code.
- `components.json`: current canonical shared components and their real APIs.
- `design.pen`: small Pencil index file that points to the right working files in this folder.
- `design.lib.pen`: reusable Pencil library file for the shared MapMat primitives and shells.
- `app-components.pen`: composed current app component examples built against the same shared tokens and patterns.

## Included
- App semantic tokens and layout tokens from `frontend/src/App.css`.
- Dark theme overrides from `frontend/src/App.css`.
- Landing-only tokens from `frontend/src/LandingPage.css`.
- Runtime palettes and layout constants from `frontend/src/utils/constants.js`.
- Shared primitives and shells from `frontend/src/components/ui` plus `AccountDrawer`.
- Nata Sans as the design file typeface, matching the app.
- Lucide icons through Pencil `icon_font` nodes, matching the app icon source.

## Ambiguities
- The landing page still operates as a separate token track. It is exported under `landing` instead of being merged into the app token vocabulary.
- Runtime palettes (`DEFAULT_COLORS`, `DEFAULT_CONNECTION_COLORS`) and layout values (`LAYOUT`) are real code-side tokens, but they are not CSS vars. They appear only in `tokens.json`.
- Some surfaces still exist as bespoke page-level implementations rather than canonical shared components, so they are flagged instead of guessed into `components.json`.

## Not Exported
- Admin console pills, tabs, and table presentation.
- `MinimapNavigator` palette and other component-local custom surface values.
- Marketing-only button classes and section-specific landing components.

## Validation Contract
- If shared component props or token names change, regenerate this folder from code before using it as a design handoff.
- Treat the app codebase as source of truth. This export is a snapshot, not a parallel design system.

## Pencil Setup
- Open `design-system/design.pen` first if you want the folder index and file guide.
- Open `design-system/design.lib.pen` when you want the reusable MapMat library.
- Open `design-system/app-components.pen` when you want the composed current app component examples.
- Use the Pencil theme axis to switch `theme` between `light` and `dark` for app-token previews.
- Landing tokens remain namespaced in the JSON export, but the Pencil library and app component files stay focused on the shared app UI layer.

## Current Limitation
- JSON validation passed locally for `design.pen`, `design.lib.pen`, and `app-components.pen`.
- Pencil MCP transport was not reliable enough in this session to perform the final visual-open verification, so the final “opens cleanly and looks correct in Pencil” check still needs manual confirmation in the editor.
