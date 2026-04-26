# Figma Code-First Handoff Contract

Last updated: 2026-04-14

## Purpose

This file defines how the new `Vellic - DS Library` Figma file maps to the current repo.

Use this contract when:

- a designer edits Figma variables, components, or composed patterns
- an engineer needs to know which repo files own the matching app behavior
- the team needs to decide whether a change is Figma-only polish or a real app change

## Source Of Truth

- Source of truth for the shipped app is still code.
- Source of truth for reusable design naming, review layouts, and visual intent is the Figma library.
- Figma does **not** auto-update the app.
- Code Connect is deferred to phase 2.

## What Changes Automatically

- Figma edits update the Figma file only.
- Repo edits update the app only.
- There is no live token sync, component sync, or style sync between them yet.

## Recommended Sync Path

- Use code-first sync for now. It is the lowest-risk path and the easiest to maintain.
- Do not treat Figma as a live app-update mechanism yet.
- The best future upgrade path is Code Connect for stable components, not full automatic style sync.
- Current blocker for Code Connect activation: this Figma account needs a Developer seat on an Organization or Enterprise plan before MCP Code Connect tools can be used to create mappings.

## Manual Sync Flow

Use this whenever a Figma change should become a real app change.

1. Update the Figma library component, variable, or pattern.
2. Check the matching owner in this file.
3. Decide whether the change is:
   - token-only
   - component styling
   - component structure
   - state/logic
4. Update the mapped code files.
5. Run the frontend build and verify the affected flow.
6. If names, ownership, or variant rules changed, update this handoff doc.

## Change Packet

For any non-trivial design update, keep these four things together:

- Figma page or component name
- mapped repo owner file
- changed token or state name
- one screenshot or short note showing the intended result

If those four items stay together, manual sync remains fast and predictable even without full automation.

## Current Styling Reality

- The live app is currently driven by CSS variables and CSS classes in [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css).
- Lucide is the icon source of truth for shared app icons.
- Tailwind is not the current token-binding source for these app surfaces. Do not point Figma variables at a Tailwind config unless the repo actually moves there.

## Figma Variable Contract

Use these Figma names going forward. They map to the current repo variables or to known gaps that still need cleanup.

| Figma variable | Repo token / usage | Owner | Status |
| --- | --- | --- | --- |
| `color/primary` | `--ui-color-primary` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/primary-hover` | `--ui-color-primary-hover` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/danger` | `--ui-color-danger` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/danger-hover` | `--ui-color-danger-hover` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/surface/base` | `--ui-color-surface` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/surface/subtle` | `--ui-color-surface-muted` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/border/default` | `--ui-color-border` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/border/strong` | `--ui-color-border-strong` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/text/default` | `--ui-color-text` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/text/muted` | `--ui-color-muted` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/input/background` | `--ui-color-input-bg` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/input/placeholder` | `--ui-color-input-placeholder` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `color/focus/ring` | `--ui-focus-ring` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `radius/none` | `--radius-none` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `radius/xxs` | `--radius-xxs` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `radius/xs` | `--radius-xs` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `radius/sm` | `--ui-radius-sm` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `radius/md` | `--ui-radius-md` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `radius/lg` | `--ui-radius-lg` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `radius/xl` | `--ui-radius-xl` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `radius/full` | `--radius-full` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `space/none` | `--space-none` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `space/xxs` | `--space-xxs` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `space/xs` | `--space-xs` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `space/sm` | `--space-sm` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `space/md` | `--space-md` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `space/lg` | `--space-lg` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `space/xl` | `--space-xl` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `space/2xl` | `--space-2xl` | [scripts/design-system-source.js](/Users/matthewbraun/Desktop/mapmat/scripts/design-system-source.js) | Active |
| `canvas/node/width` | `--node-w` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/node/height/collapsed` | `--node-h-collapsed` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/node/height/thumbnail` | `--node-h-thumb` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/gap/level-x` | `--gap-l1-x` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/gap/stack-y` | `--gap-stack-y` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/indent/x` | `--indent-x` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/bus/gap-y` | `--bus-y-gap` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `canvas/root/y` | `--root-y` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Active |
| `legacy/color/bg` | `--color-bg` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Legacy alias |
| `legacy/color/bg-secondary` | `--color-bg-secondary` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Legacy alias |
| `legacy/color/text-muted` | `--color-text-muted` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Legacy alias |
| `legacy/radius/sm` | `--radius-sm` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Legacy alias |

## Figma Component Contract

Use stable component names in Figma. When a component changes, update the mapped code owner below.

| Figma component | Repo owner | Code status | Notes |
| --- | --- | --- | --- |
| `Vellic / UI / Button` | [frontend/src/components/ui/Button.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/Button.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | Primary, secondary, danger; `sm/md/lg` |
| `Vellic / UI / Icon Button` | [frontend/src/components/ui/IconButton.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/IconButton.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | Default, primary, danger; `sm/md/lg` |
| `Vellic / UI / Input` | [frontend/src/components/ui/TextInput.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/TextInput.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | `sm/md/lg` |
| `Vellic / UI / Select` | [frontend/src/components/ui/SelectInput.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/SelectInput.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | `sm/md/lg` |
| `Vellic / UI / Textarea` | [frontend/src/components/ui/TextareaInput.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/TextareaInput.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | `sm/md/lg` |
| `Vellic / UI / Badge` | [frontend/src/components/ui/Badge.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/Badge.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | Informational only; `sm/md`, fill/hollow, brand/mono/info/error/warning/success/neutral |
| `Vellic / UI / Tag` | [frontend/src/components/ui/Tag.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/Tag.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | Functional chip; fill/hollow, brand/mono, 6px radius |
| `Vellic / Navigation / Topbar` | [frontend/src/components/toolbar/Topbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/Topbar.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Includes account entry and scan-row container |
| `Vellic / Navigation / Scan Row` | [frontend/src/components/scan/ScanBar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/scan/ScanBar.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Editable vs shared title, clear state, options menu |
| `Vellic / Navigation / Account Menu` | [frontend/src/components/toolbar/Topbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/Topbar.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Menu surface still embedded in Topbar |
| `Vellic / Navigation / Toolbar Button` | [frontend/src/components/toolbar/CanvasToolbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/CanvasToolbar.js), [frontend/src/components/ui/IconButton.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/IconButton.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Composed from shared primitive | Canvas toolbar actions use `IconButton` with toolbar-specific placement styles |
| `Vellic / Shell / Modal` | [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css), modal files in [frontend/src/components/modals](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals) | Shared shell exists | Base shell for share/save/create/scan progress |
| `Vellic / Shell / Drawer` | [frontend/src/components/drawers/AccountDrawer.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/drawers/AccountDrawer.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared shell exists | Also informs settings/version/admin drawer work |
| `Vellic / Shell / Panel` | [frontend/src/components/comments/CommentsPanel.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentsPanel.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Treat as contextual right-rail shell |
| `Vellic / Shell / Popover` | [frontend/src/components/comments/CommentPopover.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentPopover.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Also informs future mention/context menus |
| `Vellic / Shell / Menu Surface` | [frontend/src/components/toolbar/Topbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/Topbar.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Missing shared primitive | Current code still has repeated dropdown/menu patterns |
| `Vellic / Content / Node Card` | [frontend/src/components/nodes/NodeCard.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/nodes/NodeCard.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Core canvas surface; thumbnails and action bar still mixed with hardcoded styling |
| `Vellic / Content / Welcome Option Card` | [frontend/src/components/modals/CreateMapModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/CreateMapModal.js), [frontend/src/components/modals/ExportModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/ExportModal.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Missing shared primitive | Figma set is stable before code is |
| `Vellic / Status / Alert` | [frontend/src/components/ui/StatusAlert.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/StatusAlert.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared primitive exists | Info, success, warning, danger |
| `Vellic / Status / Toast` | [frontend/src/components/ui/Toast.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/Toast.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Shared surface exists | Composes `StatusAlert` and `IconButton` |
| `Vellic / Status / Banner` | [frontend/src/App.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.js), [frontend/src/components/ui/StatusAlert.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/ui/StatusAlert.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Composed from shared primitive | Read-only, conflict, presence, connected |
| `Vellic / Collaboration / Presence Chip` | [frontend/src/App.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Missing shared primitive | Used in banners and selection states |
| `Vellic / Collaboration / Share Permission Option` | [frontend/src/components/modals/ShareModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/ShareModal.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Partial | Viewer, commenter, editor permissions |
| `Vellic / Pattern / Comments Panel` | [frontend/src/components/comments/CommentsPanel.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentsPanel.js) | Partial | Feature-level composition built from shell + form primitives |
| `Vellic / Pattern / Comment Popover` | [frontend/src/components/comments/CommentPopover.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentPopover.js) | Partial | Feature-level composition with reply and mention states |
| `Vellic / Pattern / Share Modal` | [frontend/src/components/modals/ShareModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/ShareModal.js) | Partial | Permission flow, invite flow, requests |
| `Vellic / Pattern / Save Map Modal` | [frontend/src/components/modals/SaveMapModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/SaveMapModal.js) | Partial | Form uses modal shell but not all shared control wrappers |
| `Vellic / Pattern / Create Map Modal` | [frontend/src/components/modals/CreateMapModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/CreateMapModal.js) | Partial | Still coupled to inline option-card styling |

## State And Variant Contract

When these states change in Figma, update the matching code path instead of guessing.

| Figma axis / state | Current code switch | Repo owner | Notes |
| --- | --- | --- | --- |
| `Mode=Editable|Shared` | `canEdit`, `sharedTitle` | [frontend/src/components/scan/ScanBar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/scan/ScanBar.js) | Scan row |
| `Auth=Logged In|Logged Out` | `isLoggedIn` | [frontend/src/components/toolbar/Topbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/Topbar.js) | Topbar |
| `State=Default|Active|Mention` | canvas toolbar button state | [frontend/src/components/toolbar/CanvasToolbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/CanvasToolbar.js) | Still partly inline |
| `Permission=Viewer|Commenter|Editor|Owner` | `sharePermission`, `currentCollaborationRole`, request role selection | [frontend/src/components/modals/ShareModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/ShareModal.js) | Share + access review |
| `Selected=Yes|No` | `isSelected` | [frontend/src/components/nodes/NodeCard.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/nodes/NodeCard.js) | Node card |
| `Thumbnail=On|Off` | `showThumbnails`, `thumbnailUrl`, thumbnail lifecycle callbacks | [frontend/src/components/nodes/NodeCard.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/nodes/NodeCard.js) | Thumbnail asset loading is still imperfect in MCP |
| `Ghosted=Yes|No` | `isGhosted`, annotation deleted state | [frontend/src/components/nodes/NodeCard.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/nodes/NodeCard.js) | Node card |
| `Action Bar=Owner|Commenter|Viewer` | `canEdit`, `canComment`, `showCommentAction` | [frontend/src/components/nodes/NodeCard.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/nodes/NodeCard.js) | Collaboration mode changes this surface |
| `Comments=Editable|Read Only` | `canComment`, `readOnlyMessage` | [frontend/src/components/comments/CommentPopover.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentPopover.js) | Popover footer and textarea |
| `Comments=Replying|Default` | `replyingTo` | [frontend/src/components/comments/CommentPopover.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentPopover.js) | Reply banner |
| `Comments=Mention Open|Closed` | `showMentions`, `mentionFilter` | [frontend/src/components/comments/CommentPopover.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentPopover.js) | Mention dropdown |
| `Panel=Populated|Filtered Empty|Empty` | derived filtered list state | [frontend/src/components/comments/CommentsPanel.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentsPanel.js) | Comments panel |
| `Banner=Read Only|Conflict|Presence|Connected` | derived collaboration and shared-map state | [frontend/src/App.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.js), [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css) | Still not a shared code component |
| `Request=Loading|Approved|Denied|Failed` | collaboration request handling | [frontend/src/components/modals/ShareModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/ShareModal.js) | Access review |

## Pilot Flow Ownership

For the first full Figma-to-code handoff, use the scan/workspace/comments/share flow.

Primary files:

- [frontend/src/components/toolbar/Topbar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/toolbar/Topbar.js)
- [frontend/src/components/scan/ScanBar.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/scan/ScanBar.js)
- [frontend/src/components/nodes/NodeCard.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/nodes/NodeCard.js)
- [frontend/src/components/comments/CommentsPanel.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentsPanel.js)
- [frontend/src/components/comments/CommentPopover.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/comments/CommentPopover.js)
- [frontend/src/components/modals/ShareModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/ShareModal.js)
- [frontend/src/App.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.js)
- [frontend/src/App.css](/Users/matthewbraun/Desktop/mapmat/frontend/src/App.css)

## Team Rules

1. Designers can edit the Figma library freely for layout, naming, variables, and component structure.
2. Engineers should not assume a Figma edit changed the app.
3. If a Figma variable changes, update the mapped repo token or document it as an unresolved gap.
4. If a Figma component changes, update the mapped React component or CSS owner.
5. If a new variant or permission state is added in Figma, add the matching code branch before calling the work complete.
6. Keep Figma component names, variant property names, and variable names stable once they start being referenced in docs or tickets.
7. Do not introduce Code Connect mappings until the names above stop moving.

## Design Change Checklist

Use this checklist for any design-system change.

1. Update the Figma library.
2. Check this file for the mapped repo owner.
3. Decide whether the change is:
   - Figma-only review cleanup
   - repo token change
   - repo component change
   - repo state/logic change
4. Update the code owner files.
5. Validate the changed flow in the app.
6. If the contract changed, update this file and the parity docs.

## Current Known Limits

- `Sora` is still blocked on the current MCP write path, so library write automation is using `Inter` for now.
- Some preview/image-backed specimens can fail to render through MCP even when the live app is correct. When that happens, keep a visible manual-polish marker in Figma instead of pretending the specimen is final.
- Local text styles and effect styles are still safer to polish manually in Figma than through the current write path.

## Related Docs

- [figma-parity-summary.md](/Users/matthewbraun/Desktop/mapmat/docs/design-system/figma-parity-summary.md)
- [figma-parity-map.md](/Users/matthewbraun/Desktop/mapmat/docs/design-system/figma-parity-map.md)
