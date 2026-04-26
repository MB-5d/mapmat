# Vellic Workflow Notes

## Drift Control
- When a task spans both app styling/code and the Figma library, do the work in the order that reduces drift and design debt.
- Default order:
  1. stabilize shared code-side tokens, component styles, and states first
  2. validate the app build
  3. update the Figma library against that stabilized code contract
- Treat the app codebase as the source of truth unless the user explicitly says a Figma decision should lead and then be ported back to code.
- Call out explicitly before any Figma cleanup step that requires matching repo changes.
- Design system goal: represent reusable UI decisions as tokens or shared components so the system can scale and adapt without duplicate manual styling.
