---
name: Vellic
description: Visual sitemap workspace for scanning, editing, reviewing, and sharing website structure.
colors:
  primary: "#6366f1"
  primary-strong: "#4f46e5"
  primary-deep: "#4338ca"
  surface: "#ffffff"
  surface-muted: "#f8fafc"
  border: "#e2e8f0"
  border-strong: "#cbd5e1"
  text: "#1e293b"
  muted: "#64748b"
  danger: "#ef4444"
  warning: "#d97706"
  success: "#16a34a"
  info: "#2563eb"
  dark-surface: "#1a1022"
  dark-surface-muted: "#3d2a52"
  dark-text: "#d4c8e0"
  dark-muted: "#b8add1"
  page-depth-1: "#38bdf8"
  page-depth-2: "#2dd4bf"
  page-depth-3: "#a3e635"
  page-depth-4: "#fbbf24"
  page-depth-5: "#fb7185"
  page-depth-6: "#a78bfa"
typography:
  display:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(2.9rem, 5vw, 4.7rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "40px"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0"
  label:
    fontFamily: "Sora, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "999px"
spacing:
  none: "0px"
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  tag:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

# Design System: Vellic

## 1. Overview

**Creative North Star: "The Clear Workbench"**

Vellic is a product UI first. The interface should feel like a calm workbench for understanding website structure: map-centered, precise, task-focused, and low-friction. Familiar product patterns are preferred when they help users move faster.

The system rejects generic SaaS polish, heavy AI-looking visual effects, decorative dashboard tropes, and visual noise that competes with the sitemap. Marketing surfaces can be more spacious and expressive, but they should stay product-led and sparse.

**Key Characteristics:**

- Code-backed tokens and shared primitives are the source of truth.
- Primary color is used for action, selection, and focus, not decoration.
- Surfaces are restrained, with depth coming from borders, tonal layers, and small shadows.
- The map, node cards, comments, reports, and sharing flows should stay visually connected.

## 2. Colors

The palette is a restrained product palette: neutral surfaces, indigo brand actions, semantic status colors, and bright page-depth colors only where sitemap structure needs them.

### Primary

- **Vellic Indigo** (#6366f1): Primary accent for focus, selection, and active UI.
- **Action Indigo** (#4338ca): Primary button fill and high-commitment action color.
- **Brand Indigo** (#4f46e5): Logo mark and stronger brand moments.

### Secondary

- **Structure Cyan** (#38bdf8): Page depth 1 and structural map color.
- **Structure Teal** (#2dd4bf): Page depth 2 and relationship contrast.
- **Structure Lavender** (#a78bfa): Deep page-depth distinction.

### Tertiary

- **Success Green** (#16a34a): Positive completion and success status.
- **Warning Amber** (#d97706): Warnings and caution states.
- **Danger Red** (#ef4444): Destructive and failed states.
- **Info Blue** (#2563eb): Informational states and secondary callouts.

### Neutral

- **Canvas White** (#ffffff): Primary content and component surface.
- **Quiet Surface** (#f8fafc): App background, low-emphasis panels, and empty-state surfaces.
- **Border Slate** (#e2e8f0): Default divider and control border.
- **Strong Border Slate** (#cbd5e1): Hover, focus-adjacent, and stronger separation.
- **Ink Slate** (#1e293b): Primary text.
- **Muted Slate** (#64748b): Secondary text and supporting labels.
- **Dark Plum Surface** (#1a1022): Dark-mode base surface.
- **Dark Plum Panel** (#3d2a52): Dark-mode muted surface.

### Named Rules

**The Map First Rule.** Color should clarify sitemap structure, status, ownership, or action. If it only decorates, remove it.

**The Secondary Insights Rule.** Map Insights can use status and report colors, but it should not become the dominant brand signal.

## 3. Typography

- **Display Font:** Sora with system sans fallbacks
- **Body Font:** Sora with system sans fallbacks
- **Label/Mono Font:** Sora with system sans fallbacks

**Character:** Sora gives Vellic a precise, modern product tone without needing a separate display face. Keep type functional inside the workspace and reserve larger display scales for landing or empty states.

### Hierarchy

- **Display** (700, clamp(2.9rem, 5vw, 4.7rem), 1.02): Marketing and large empty-state headlines only.
- **Headline** (700, 32px, 40px): Major page or modal headings.
- **Title** (600, 20px, 26px): Panel titles, drawer titles, and strong section labels.
- **Body** (400, 16px, 24px): Main explanatory text. Keep long prose to 65 to 75 characters when possible.
- **Label** (500, 12px, 16px): Field labels, compact controls, and table-like UI labels.

### Named Rules

**The Product Scale Rule.** Inside the app, prefer fixed token sizes and compact hierarchy over fluid display type.

**The One Family Rule.** Do not add another font unless the project explicitly changes brand direction.

## 4. Elevation

Vellic uses a hybrid depth model: borders and tonal layers at rest, small shadows for raised controls, overlays, drawers, and modals. The default product surface should feel stable, not floaty.

### Shadow Vocabulary

- **Card** (`0 1px 3px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)`): Small repeated content surfaces.
- **Raised** (`0 4px 12px rgba(15, 23, 42, 0.12)`): Hovered or promoted controls.
- **Canvas Control** (`0 4px 12px rgba(0, 0, 0, 0.1)`): Floating canvas tools.
- **Overlay** (`0 12px 24px rgba(15, 23, 42, 0.12)`): Popovers and menus.
- **Modal** (`0 20px 25px rgba(15, 23, 42, 0.15)`): Modal shells.
- **Drawer** (`-12px 0 24px rgba(15, 23, 42, 0.15)`): Right-side drawers.

### Named Rules

**The Resting Flat Rule.** Surfaces are flat or lightly bordered at rest. Elevation should signal interaction, layering, or modal state.

## 5. Components

Shared primitives live under `frontend/src/components/ui`, with styling owned mainly by `frontend/src/App.css` and generated tokens in `frontend/src/design-system.generated.css`.

### Buttons

- **Shape:** 8px radius for standard buttons.
- **Primary:** Action Indigo fill with white text, 40px default height, 10px by 16px padding.
- **Hover / Focus:** Preserve contrast text and icon color. Use tokenized hover fill and focus ring.
- **Secondary / Ghost / Link:** Keep the same type and radius system. Change emphasis through border, background, and text color only.

### Chips

- **Style:** Tags and badges use compact 6px radius, semantic color roles, and 10px to 14px text depending on role.
- **State:** Selected, active, status, and role chips should use semantic variants instead of one-off colors.

### Cards / Containers

- **Corner Style:** 12px for main content cards and modal cards, 8px for compact tool surfaces.
- **Background:** White or Quiet Surface in light mode, plum surfaces in dark mode.
- **Shadow Strategy:** Mostly border and tonal separation. Add shadow only for overlays, floating controls, and promoted state.
- **Border:** Default Border Slate, stronger border for hover or selected states.
- **Internal Padding:** 16px for cards, 24px for larger modals or drawers.

### Inputs / Fields

- **Style:** White background, 6px radius, 1px border, Sora text.
- **Labels:** Use the label style at 12px / 16px / 500, with 4px spacing to the control.
- **Focus:** Brand border or tokenized focus ring.
- **Error / Disabled:** Use semantic border and text tokens. Disabled controls must remain readable.

### Navigation

- **Style:** Familiar product navigation. Topbar, scan row, toolbar, menus, tabs, and drawers should keep the same control vocabulary.
- **States:** Hover, focus, active, disabled, loading, and selected states must be explicit.
- **Mobile Treatment:** The app is desktop and tablet-landscape first; marketing can use responsive mobile handoff patterns.

### Node Card

Node cards are the signature workspace component. They should prioritize page title, URL, thumbnail state, comments, status, and actions without becoming decorative cards. Selected, ghosted, thumbnail, collapsed, deleted, and permission-limited states must remain visually distinct.

## 6. Do's and Don'ts

### Do:

- **Do** keep the visual sitemap and node cards central to the product experience.
- **Do** reuse `Button`, `IconButton`, `TextInput`, `SelectInput`, `TextareaInput`, `Badge`, `Tag`, `StatusAlert`, `Toast`, `Modal`, and related shared primitives before adding new local styling.
- **Do** preserve WCAG AA contrast, visible focus states, reduced-motion alternatives, and non-color status cues.
- **Do** keep marketing product-led, sparse, and concrete.
- **Do** treat code as the source of truth for shipped app behavior.

### Don't:

- **Don't** override shared brand-button contrast behavior with local hover styles.
- **Don't** use generic SaaS polish, heavy AI-looking visual effects, decorative dashboard tropes, or dense visual noise.
- **Don't** make Map Insights feel like the primary product.
- **Don't** add a second visual system for admin, marketing, or report surfaces without documenting the split.
- **Don't** add new fonts, oversized display type, or decorative motion inside task-focused product UI.
