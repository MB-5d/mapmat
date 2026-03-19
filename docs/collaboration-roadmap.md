# Collaboration Roadmap

This document turns the current collaboration/coediting QA findings into an execution plan that favors:

- security first
- simple product rules
- scalable backend primitives
- minimal rework between phases

It is intentionally ordered by dependency, not by UI visibility.

## Current Baseline

Validated as of 2026-03-18:

- Owner and editor can co-edit the same saved map live.
- Viewer and commenter can open shared maps with role-based edit restrictions.
- Collaboration invites and memberships work for `editor`, `commenter`, and `viewer`.
- Basic presence exists for active sessions.
- Version listing works for shared maps.
- Owner and editor can save map versions.

Known gaps:

- Comment data still lives inside map/node JSON and is explicitly disabled in live mode.
- Viewer/commenter do not yet have a complete read-only live subscription experience.
- There is no collaboration activity log; existing `history` is scan history only.
- The permission model still has a single true owner (`maps.user_id`).
- Invite rules are still simple owner/editor rules, not owner-governed collaboration policy.

## Guiding Rules

1. Server-side permissions stay authoritative. Frontend role gating is only presentation.
2. Multi-user state should not depend on mutating whole-map JSON when a smaller first-class entity is more correct.
3. Version history, scan history, and collaboration activity log are different concepts and should stay separate.
4. Read-only realtime should be a subscription path, not a weakened edit path.
5. New UX should be driven from explicit backend policy/config, not hidden frontend assumptions.

## Cross-Cutting Platform Tracks

These tracks should be planned alongside Phase 1, but they do not need to block local development of the access model.

### Email Delivery Foundation

Current state:

- Collaboration invites currently work through backend tokens and manual acceptance flows.
- There is no real email delivery provider wired into the repo yet.

Recommended direction:

- Add a provider abstraction before wiring product flows directly to a vendor.
  - Example providers later: Postmark, Resend, SES.
- Support email job types for:
  - collaboration invites
  - access request notifications
  - owner approval decisions
  - account verification / password reset if those become product requirements
- Send email asynchronously through a job/queue boundary rather than inline with request handling.
- Keep delivery events and failures observable.
  - retries
  - bounce/complaint handling
  - provider webhook ingestion
- Use reusable templates with a shared payload contract.

Operational requirements before production:

- SPF, DKIM, and DMARC configured for the sending domain
- branded sender addresses
- rate limits and abuse controls
- email audit trail for support/debugging

Planning impact:

- This should start as a platform track during Phase 1B.
- It should be production-ready before collaboration invites and access requests depend on real email delivery.
- It does not block the local/backend permission refactor in Phase 1A.

### Website / App Domain Topology

Current state:

- The repo already assumes a separate frontend/backend origin model via `FRONTEND_URL`.
- Auth already has cookie-domain support via `COOKIE_DOMAIN`.
- The product still behaves like one app surface, even though website and app should diverge.

Recommended direction:

- Plan for two public surfaces:
  - `www.<domain>` for the marketing website
  - `app.<domain>` for the authenticated product
- Prefer serving backend API traffic to the app as same-origin `/api` behind `app.<domain>`, even if the backend runs on a separate internal service.
  - This reduces cookie/CORS complexity.
  - It also keeps auth behavior cleaner than exposing a public `api.<domain>` too early.
- Keep a dedicated backend service internally if needed for scale, but do not make public API topology more complex unless there is a real product need.

Optional later domains:

- `docs.<domain>` for help/docs
- `status.<domain>` for uptime/status
- `api.<domain>` only if external/public API needs justify it

Planning impact:

- You do not need to buy domains before doing the proper IA and route separation.
- You should decide the target topology now so auth, invites, links, and cookies are designed correctly.
- Website/app separation should be treated as a product architecture decision, not just a domain-purchase step.

## QA Checkpoints

Use targeted script validation between backend phases, then spend manual QA time at the points where user-visible behavior actually changes.

- Current checkpoint:
  - Phase 1A and 1B are covered by targeted local verifier passes.
- Next full manual collaboration checklist:
  - After Phase 2A plus Phase 3A.
  - Reason: activity/history plumbing and real commenter backend will both exist, so the browser pass can validate shared history, comments, role gating, and event visibility together.
- Broader end-to-end UX checklist:
  - After Phase 5.
  - Reason: live notifications, history UI, and named-version UX are not worth rechecking exhaustively before their UI exists.

## Recommended Execution Order

### Phase 1: Access Model And Governance Foundation

This is the main blocker phase. Do this before adding richer commenter/history/invite features.

#### Why first

- Multiple owners cannot be added cleanly while "owner" still means `maps.user_id`.
- Owner-only approval rules and private/open invite modes need a map-level policy source.
- If commenter/history features are added first, this phase will force permission rewrites later.

#### Scope

- Introduce a first-class owner model.
  - Recommended direction: allow `owner` as a collaboration membership role, while keeping `maps.user_id` as creator/back-compat metadata.
  - Update permission resolution so owner status can come from membership, not only `maps.user_id`.
- Add map-level collaboration settings.
  - Example settings:
    - `access_policy`: `private` or `viewer_invites_open`
    - `non_viewer_invites_require_owner`
    - `access_requests_enabled`
    - `presence_identity_mode`: named or anonymous fallback
- Add access request records.
  - Needed for "request access" and owner-only approval queues.
- Refactor invite permission rules.
  - Owners: full permission management.
  - Editors: can still collaborate, but permission management becomes policy-driven.
  - Anyone can send `viewer` invites only when owners allow open viewer invites.
  - Access request notifications route only to owners.

#### Exit criteria

- A map can have more than one owner.
- Owners can add/remove other owners.
- Private/open collaboration is controlled by backend policy, not hardcoded UI.
- Owner-only approval paths exist in backend contract, even if UI is still basic.

### Phase 2: Collaboration Activity Backbone

Do this before live change toasts or a user-facing history log.

#### Why second

- Live notifications and audit history need a durable source of truth.
- A shared activity stream also gives us debugging and support visibility.

#### Scope

- Add an append-only `map_activity_events` store.
- Record events for:
  - invite created / accepted / revoked
  - membership role changed
  - owner added / removed
  - access request created / approved / denied
  - version saved
  - comment created / updated / resolved / deleted
  - live operation batches committed
- Add an event summarizer for high-frequency live edits.
  - Example: coalesce repeated title edits from one actor into a single user-facing event.
- Expose a read API for recent activity.

#### Exit criteria

- Every permission or content-changing collaboration action produces an activity event.
- The backend can return a recent activity feed for a map.
- Live notifications can consume this feed without inventing their own state model.

### Phase 3: Comment System For Shared Maps

This is the first user-facing feature slice after the permission/event foundation.

#### Why here

- Current comments are node JSON mutations in the frontend and are blocked in live mode.
- Commenter functionality cannot be made reliable while comments are still treated like full-map edits.

#### Scope

- Move comments to a first-class backend model instead of only mutating map JSON.
  - Recommended shape: map-scoped comments keyed by `map_id`, `node_id`, `comment_id`.
  - Preserve replies, resolved/completed state, mentions, author, timestamps.
- Permissions:
  - owner/editor/commenter: create and update comments
  - viewer: read comments only
- Read-only users can open comments and comment history without edit access.
- Coediting/live mode can read comment state without requiring a full map save.

#### Exit criteria

- Commenters can add comments on shared maps.
- Viewers and commenters can read comments consistently.
- Comment actions appear in the activity stream.
- Comments no longer require leaving live mode to be useful.

### Phase 4: Read-Only Realtime And Rich Presence

This phase makes presence and visibility feel collaborative for all roles.

#### Why after comments

- Viewer/commenter realtime is most useful once comment and activity data have durable backends.
- Presence identity and read-only subscriptions are lower risk after the permission foundation is stable.

#### Scope

- Add a read-only realtime subscription path for `viewer` and `commenter`.
  - They receive presence and committed updates.
  - They cannot publish map-edit operations.
- Enrich participant payloads with:
  - display name
  - role
  - deterministic color seed
  - avatar/initials seed
- Frontend presence UI:
  - collaborator chips or avatars
  - optional anonymous fallback when identity sharing is restricted
  - selection highlights only where product-approved

#### Exit criteria

- Viewer/commenter can see owner/editor changes live without refreshing.
- Presence shows stable identity treatment per participant.
- Presence data is consistent across heartbeat and websocket paths.

### Phase 5: Versions, Activity Log, And Live Notifications

This phase turns the backend work into a coherent product surface.

#### Scope

- Keep scan history separate.
- Add a dedicated collaboration/activity log UI.
- Expand version history UI:
  - show who saved each version
  - show timestamp and optional notes
  - owner/editor can save named versions
  - viewer/commenter can view version history read-only
- Add small live notifications driven by activity events.
  - Example: `Alicia renamed "Pricing" to "Plans"`
  - Example: `Marcus linked "Contact" to "Support"`
  - Example: `Owner saved version "Pre-launch IA"`

#### Exit criteria

- "History" is no longer overloaded.
- Version history and activity log are both readable and role-appropriate.
- Live toasts are sourced from backend activity events, not guessed from local UI mutations.

### Phase 6: Owner-Focused Collaboration UX

This phase is mostly policy-driven UI and can move quickly once Phases 1-5 exist.

#### Scope

- Multi-owner management in the share/collaboration panel.
- Access request inbox for owners only.
- Private/open collaboration controls for owners.
- Viewer invite shortcuts when open-viewer mode is enabled.
- Clear permission explanations in UI by role.

#### Exit criteria

- Owners control governance without needing backend scripts.
- Non-owners only see the invite/approval controls their policy allows.

## Requested Items Mapped To Phases

| Requested item | Recommended phase | Reason |
| --- | --- | --- |
| Commenter functionality | Phase 3 | Needs first-class comments, not local node JSON edits |
| User presence with name/color/icon/avatar | Phase 4 | Depends on stable identity + read-only realtime |
| Live update notifications | Phase 5 | Should be driven by activity events from Phase 2 |
| Tracking changes in history log | Phase 2 + Phase 5 | Needs activity store first, then UI |
| Owners/editors save and name versions | Mostly done, complete in Phase 5 | Backend is close; UI and actor metadata need finishing |
| Viewers/commenters view history and comments | Phase 3 + Phase 5 | Comments and read-only history are separate but related |
| Multiple owners | Phase 1 | Structural permission-model change |
| Only owners approve/designate permissions | Phase 1 + Phase 6 | Policy first, UI later |
| Access request notifications only to owners | Phase 1 + Phase 2 + Phase 6 | Needs owner model and request events |
| Anyone can send viewer invite unless private | Phase 1 + Phase 6 | Requires explicit collaboration policy |

## Recommended Next Build Slice

The most efficient next implementation slice is:

1. Phase 1A: multiple-owner data model + permission-policy refactor
2. Phase 1B: map collaboration settings + access request backend contract
3. Parallel platform design: email delivery abstraction + target domain topology
4. Phase 2A: append-only activity event store
5. Phase 3A: first-class comment backend for commenter write access

That sequence unlocks almost every other requested feature without redoing the core model twice.

## What Not To Do First

Avoid starting with these in isolation:

- frontend-only live change toasts
- commenter UI polish without backend comment persistence
- multi-owner UI before multi-owner permissions exist on the server
- overloading existing scan history into a collaboration audit feed

Those paths would add visible progress quickly but create security and maintenance debt.
