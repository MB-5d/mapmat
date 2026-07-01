# Component Token Audit

Last updated: 2026-04-25

## Purpose

Use this as the cleanup checklist before changing Figma pages. Code remains the source of truth.

## Current Readout

- Shared primitives are in place for buttons, icon buttons, inputs, textarea, field labels, menus, checkboxes, toggles, radio cards, segmented controls, option cards, badges, tags, avatars, and modals.
- The strongest code-backed pages are `Buttons`, `Inputs`, `Selection & Choices`, `Badges & Tags`, `Avatar`, `Modals & Panels`, `Navigation & Menus`, `Nodes`, and `Status`.
- The largest remaining drift is not missing components; it is older surfaces still styling buttons, text, dark-mode colors, and status UI manually in `App.css`.

## Biggest Risks

| Area | Current gap | Safer cleanup path |
| --- | --- | --- |
| Navigation & Menus | `CanvasToolbar` now composes actions from `IconButton`; remaining risk is menu/dropdown surface parity. | Mirror the toolbar contract in Figma, then keep the next pass focused on menu panels and menu rows. |
| Status & Toast | `StatusAlert` and `Toast` now provide the shared code contract; remaining risk is older one-off admin/auth status blocks. | Mirror `StatusAlert`, `Toast`, and banner examples in Figma, then migrate one-off surfaces later. |
| Selection & Choices | Shared primitives exist; local overrides remain in `ShareModal`, report filters, and admin surfaces. | Keep primitives stable, then migrate one product surface at a time. |
| Effects / dark mode | Many dark-mode colors and shadows still use direct hex/rgba in `App.css`. | Add semantic effect/surface tokens before replacing values. |
| Text mapping | Core primitives use type tokens; legacy surfaces still use raw `font-size`, `font-weight`, and unitless `line-height`. | Replace repeated text patterns with existing semantic type tokens; create new tokens only when reuse is clear. |
| Admin, minimap, landing | These still behave like local systems. | Defer unless they block app-library parity. |

## Text Token Mapping

Text already mapped to tokens:
- Shared primitives: `Button`, `IconButton`, `TextInput`, `SelectInput`, `TextareaInput`, `Field`, `MenuItem`, `Badge`, `Tag`, `OptionCard`, selection controls.
- Node badges/status, scan row, topbar, modal shell, and account menu mostly use semantic type tokens.

Text not fully mapped yet:
- Toasts, feedback drawer, report drawer, admin console, minimap, color picker, blank-state cards, and some old modal overrides.
- `line-height: 1` or `0` on icon-only wrappers should remain geometry, not text style tokens.
- Runtime labels generated from scanned page data cannot map to named text styles by content, but their typography should still use semantic type tokens.

## Priority Order

1. Navigation & Menus: finish `CanvasToolbar` and toolbar button examples.
2. Status & Toast: mirror `StatusAlert`, `Toast`, and banner examples in Figma.
3. Selection & Choices: remove local overrides from share/report/admin surfaces where practical.
4. Effects dark mode: introduce missing semantic effect/surface tokens, then replace direct dark hex/rgba values.
5. Text mapping: sweep remaining raw typography declarations after the relevant semantic tokens exist.
