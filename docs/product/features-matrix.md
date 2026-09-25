# Vellic Feature Matrix And Roadmap

Generated: 2026-06-02; updated: 2026-08-11

This is a repo-backed first version. Statuses are based on current local code, docs, tests, and project notes. Default-on shipped behavior is marked `Complete`; feature-flagged, backend-only, or partially validated behavior is marked `Partial`; documented future work is marked `Planned` or `Future`; product decisions without repo evidence are marked `Unknown`.

Note: the local checkout already had unrelated uncommitted work before this matrix was generated, including some marketing/admin files. Rows that depend on that local evidence are marked conservatively.

## Status Summary

| Status | Count |
| --- | ---: |
| Complete | 40 |
| Partial | 20 |
| Planned | 8 |
| Future | 8 |
| Unknown | 1 |

## Roadmap Priorities

| Priority | Feature | Status | Phase | Risk | Evidence |
| --- | --- | --- | --- | --- | --- |
| P1 | Usage metering and limits | Partial | Operational hardening | High | README.md; routes/admin.js; config/ |
| P1 | First-class backend comments | Partial | Collaboration Phase 3A | High | docs/collaboration-backend.md; docs/collaboration-roadmap.md |
| P1 | Commenter role functionality | Planned | Collaboration Phase 3 | High | docs/collaboration-roadmap.md |
| P1 | Postgres runtime path | Partial | Runtime migration | High | README.md; docs/postgres-migration.md; docs/postgres-runtime-ops.md |
| P1 | Worker/runtime split | Partial | Operational hardening | High | README.md; docs/screenshot-pipeline-hardening.md |
| P1 | R2 screenshot storage | Partial | Operational hardening | High | docs/screenshot-pipeline-hardening.md |
| P1 | Live co-editing mode | Partial | Phase 10D/10E | High | docs/coediting-frontend-live-mode.md; docs/coediting-rollout-safety-controls.md |
| P1 | Activity event store | Partial | Collaboration Phase 2A | High | docs/collaboration-backend.md; docs/collaboration-roadmap.md |
| P1 | Collaboration backend entities | Partial | Collaboration Phases 1-3 | High | docs/collaboration-backend.md; routes/collaboration.js |
| P1 | API-driven permission feature gates | Partial | Phase 9E | High | docs/permission-feature-gating.md; policies/permissionPolicy.js; frontend/src/api.js |
| P1 | Multiple owners | Planned | Collaboration Phase 1 | High | docs/collaboration-roadmap.md |
| P1 | Owner-governed collaboration policy | Planned | Collaboration Phase 1 + 6 | High | docs/collaboration-roadmap.md; docs/collaboration-backend.md |
| P1 | Transactional collaboration email | Partial | Platform track | High | docs/collaboration-roadmap.md; README.md |
| P1 | Marketing site information architecture | Partial | Marketing V1 | Medium | frontend/src/marketing/marketingConfig.js; frontend/src/marketing/MarketingSite.js; frontend/src/marketing/MarketingSite.test.js |
| P1 | Marketing SEO metadata and route tests | Partial | Marketing V1 | Medium | frontend/src/marketing/marketingConfig.js; frontend/src/marketing/MarketingSite.test.js; frontend/src/utils/appRoutes.test.js |
| P1 | Named version saves | Partial | Collaboration Phase 5 | Medium | docs/collaboration-roadmap.md; frontend/src/components/modals/SaveVersionModal.js; frontend/src/components/modals/SaveVersionModal.test.js |
| P1 | Version history browsing | Partial | Collaboration Phase 5 | Medium | docs/collaboration-roadmap.md; frontend/src/components/drawers/VersionHistoryDrawer.js; frontend/src/components/drawers/VersionHistoryDrawer.test.js |
| P1 | Invite acceptance and invite inbox | Partial | Collaboration Phase 6 | Medium | docs/collaboration-backend.md; frontend/src/components/routes/InviteAcceptGate.js; frontend/src/components/modals/InviteInboxModal.js |
| P1 | Access request inbox | Partial | Collaboration Phase 6 | Medium | docs/collaboration-backend.md; frontend/src/components/modals/AccessRequestInboxModal.js; frontend/src/components/modals/AccessRequestInboxModal.test.js |
| P2 | Templates and assistant | Future | Future vision | High | frontend/src/marketing/marketingConfig.js |
| P2 | Read-only realtime for viewers/commenters | Planned | Collaboration Phase 4/5 | High | docs/collaboration-roadmap.md |
| P2 | Authenticated/private page scanning | Future | Future scan hardening | High | docs/authenticated-scan-paused.md; scripts/check-scan-auth-session.js |
| P2 | Figma library handoff contract | Partial | Design system Phase 1 | Medium | docs/design-system/figma-code-first-handoff.md; docs/design-system/figma-parity-map.md |
| P2 | Shared menu surface primitive | Planned | Design system cleanup | Medium | docs/design-system/figma-code-first-handoff.md |
| P2 | Download screenshot batches | Planned | Phase 9G | Medium | docs/screenshot-pipeline-hardening.md |
| P2 | Examples library | Planned | Marketing V1/V2 | Medium | frontend/src/marketing/marketingConfig.js |
| P2 | Presence sessions | Partial | Phase 9D | Medium | docs/realtime-collaboration-baseline.md; frontend/src/hooks/useCoeditingLive.test.js |
| P2 | Collaborator selection presence | Partial | Phase 10D | Medium | docs/coediting-frontend-live-mode.md |
| P2 | Live update notifications | Planned | Collaboration Phase 5 | Medium | docs/collaboration-roadmap.md |
| P3 | Navigation prototyping and tree testing | Future | Future vision | High | frontend/src/marketing/marketingConfig.js |
| P3 | Configurable scan hierarchy modes | Future | Future scan flexibility | High | Product direction noted 2026-08-11 |
| P3 | Diagramming tools | Future | Future vision | High | frontend/src/marketing/marketingConfig.js |
| P3 | Third-party integrations | Future | Future vision | High | frontend/src/marketing/marketingConfig.js |
| P3 | Remove/rescan screenshot assets | Future | Future asset lifecycle | High | docs/screenshot-pipeline-hardening.md |
| P3 | Code Connect automation | Future | Design system Phase 2 | Medium | docs/design-system/figma-code-first-handoff.md |
| P3 | Shared option-card primitive | Partial | Design system cleanup | Low | docs/design-system/figma-code-first-handoff.md; frontend/src/components/ui/OptionCard.js |
| TBD | Pricing plan details | Unknown | Business decision | TBD | Marked Unknown; no repo evidence |

## Feature List

### Scanning and discovery

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Public URL scan to visual map | Complete | P0 | Done | Low | Current product | README.md; frontend/src/components/scan/ScanBar.js; frontend/src/marketing/marketingConfig.js |
| Scan progress tracking | Complete | P0 | Done | Low | Current product | README.md; frontend/src/components/scan/ScanProgressModal.js; server.js |
| Scan history | Complete | P1 | Done | Low | Current product | README.md; frontend/src/components/modals/HistoryModal.js |
| Scan result classification | Complete | P1 | Done | Medium | Current product | frontend/src/components/reports/ReportDrawer.js; scripts/check-scan-labeling-fixture.js; scripts/check-scan-page-classification.js |
| Collapsed/root-only scan safeguards | Complete | P1 | Done | Medium | Current product | frontend/src/components/reports/ReportDrawer.js; scripts/check-scan-collapse-fixture.js; frontend/src/utils/scanCompletion.js |
| Authenticated/private page scanning | Future | P2 | L | High | Future scan hardening | docs/authenticated-scan-paused.md; scripts/check-scan-auth-session.js |
| Configurable scan hierarchy modes | Future | P3 | L | High | Future scan flexibility | Product direction noted 2026-08-11 |

Future scope: explore a strict URL-hierarchy scan alongside the current content/navigation relationship scan. The product design should define how query-based archive views and same-domain links outside the focused URL path appear in each mode.

### Map creation and editing

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Blank/manual map creation | Complete | P1 | Done | Low | Current product | frontend/src/components/modals/CreateMapModal.js; frontend/src/components/modals/CreateMapModal.test.js |
| Map import | Complete | P1 | Done | Medium | Current product | frontend/src/components/modals/ImportModal.js; frontend/src/marketing/marketingConfig.js |
| Structure editing | Complete | P0 | Done | Low | Current product | frontend/src/components/nodes/NodeActionBar.js; frontend/src/components/modals/EditNodeModal.js; frontend/src/marketing/marketingConfig.js |
| Duplicate node/page workflow | Complete | P2 | Done | Low | Current product | frontend/src/components/nodes/NodeActionBar.js; frontend/src/App.largeMap.test.js |
| Color coding and legend | Complete | P2 | Done | Low | Current product | frontend/src/components/toolbar/ColorKey.js; frontend/src/components/modals/EditColorModal.js; frontend/src/components/toolbar/ColorKey.test.js |
| Large-map layout and performance support | Complete | P1 | Done | Medium | Current product | frontend/src/App.largeMap.test.js; frontend/src/utils/largeMapPerformance.test.js; utils/mapScene.js |
| Minimap/viewfinder navigation | Complete | P1 | Done | Medium | Current product | frontend/src/components/minimap/MinimapNavigator.jsx; frontend/src/components/minimap/MinimapNavigator.test.js; frontend/src/components/toolbar/Minimap.js |

### Images and capture

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Page thumbnail capture | Complete | P1 | Done | Medium | Current product | docs/screenshot-pipeline-hardening.md; frontend/src/components/nodes/NodeCard.js; scripts/check-image-capture-job-smoke.js |
| Full-page screenshot capture | Complete | P1 | Done | Medium | Current product | docs/screenshot-pipeline-hardening.md; frontend/src/components/modals/ImageOverlay.js |
| Screenshot safety limits and cleanup | Complete | P1 | Done | Medium | Current product | docs/screenshot-pipeline-hardening.md; README.md |
| Capture issues panel | Complete | P2 | Done | Low | Current product | frontend/src/components/toolbar/CaptureIssuesPanel.js; frontend/src/utils/captureIssues.js; frontend/src/utils/captureIssues.test.js |
| Download screenshot batches | Planned | P2 | M | Medium | Phase 9G | docs/screenshot-pipeline-hardening.md |
| Remove/rescan screenshot assets | Future | P3 | M | High | Future asset lifecycle | docs/screenshot-pipeline-hardening.md |

### Reports and exports

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Report drawer | Complete | P1 | Done | Low | Current product | frontend/src/components/reports/ReportDrawer.js; frontend/src/components/reports/ReportDrawer.test.js |
| Insights tab and page scoring | Complete | P1 | Done | Medium | Current product | frontend/src/components/reports/ReportDrawer.js; frontend/src/components/reports/ReportDrawer.test.js |
| PNG export | Complete | P1 | Done | Low | Current product | README.md; frontend/src/components/modals/ExportModal.js |
| PDF export | Complete | P1 | Done | Low | Current product | README.md; frontend/src/components/modals/ExportModal.js |
| CSV export | Complete | P1 | Done | Low | Current product | frontend/src/components/modals/ExportModal.js |
| JSON export | Complete | P2 | Done | Low | Current product | frontend/src/components/modals/ExportModal.js |
| Site Index export | Complete | P2 | Done | Low | Current product | frontend/src/components/modals/ExportModal.js |
| AI Site Brief export | Complete | P2 | Done | Medium | Current product | frontend/src/components/modals/ExportModal.js |

### Saving, projects, and versions

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Saved maps | Complete | P0 | Done | Low | Current product | README.md; frontend/src/components/modals/SaveMapModal.js; server.js |
| Projects | Complete | P1 | Done | Low | Current product | README.md; frontend/src/components/modals/ProjectsModal.js; frontend/src/components/modals/ProjectsModal.test.js |
| Autosave/save flow | Complete | P0 | Done | Medium | Current product | frontend/src/App.js; frontend/src/components/modals/SaveMapModal.test.js |
| Named version saves | Partial | P1 | M | Medium | Collaboration Phase 5 | docs/collaboration-roadmap.md; frontend/src/components/modals/SaveVersionModal.js; frontend/src/components/modals/SaveVersionModal.test.js |
| Version history browsing | Partial | P1 | M | Medium | Collaboration Phase 5 | docs/collaboration-roadmap.md; frontend/src/components/drawers/VersionHistoryDrawer.js; frontend/src/components/drawers/VersionHistoryDrawer.test.js |

### Auth and access

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Email/password auth | Complete | P0 | Done | Low | Current product | README.md; frontend/src/components/modals/AuthModal.js; frontend/src/components/modals/AuthModal.test.js |
| Email verification and password reset | Complete | P0 | Done | Medium | Current product | README.md; frontend/src/components/modals/AuthModal.js |
| Google sign-in | Complete | P1 | Done | Medium | Current product | README.md; frontend/src/components/modals/AuthModal.js; frontend/src/components/modals/AuthModal.test.js |
| Account/profile/settings surfaces | Complete | P2 | Done | Low | Current product | frontend/src/components/drawers/AccountDrawer.js; frontend/src/components/drawers/ProfileDrawer.js; frontend/src/components/drawers/SettingsDrawer.js |
| Workspace device support gate | Complete | P1 | Done | Low | Current product | frontend/src/RootApp.js; frontend/src/utils/deviceSupport.test.js; frontend/src/RootApp.test.js |

### Sharing and collaboration

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Share links with expiration | Complete | P0 | Done | Medium | Current product | README.md; frontend/src/components/modals/ShareModal.js; frontend/src/components/modals/ShareModal.test.js |
| Viewer/commenter/editor roles | Complete | P0 | Done | Medium | Current product | docs/collaboration-roadmap.md; frontend/src/components/modals/ShareModal.js; frontend/src/components/routes/MapAccessGate.js |
| Collaboration backend entities | Partial | P1 | M | High | Collaboration Phases 1-3 | docs/collaboration-backend.md; routes/collaboration.js |
| Invite acceptance and invite inbox | Partial | P1 | M | Medium | Collaboration Phase 6 | docs/collaboration-backend.md; frontend/src/components/routes/InviteAcceptGate.js; frontend/src/components/modals/InviteInboxModal.js |
| Access request inbox | Partial | P1 | M | Medium | Collaboration Phase 6 | docs/collaboration-backend.md; frontend/src/components/modals/AccessRequestInboxModal.js; frontend/src/components/modals/AccessRequestInboxModal.test.js |
| API-driven permission feature gates | Partial | P1 | M | High | Phase 9E | docs/permission-feature-gating.md; policies/permissionPolicy.js; frontend/src/api.js |
| Multiple owners | Planned | P1 | L | High | Collaboration Phase 1 | docs/collaboration-roadmap.md |
| Owner-governed collaboration policy | Planned | P1 | L | High | Collaboration Phase 1 + 6 | docs/collaboration-roadmap.md; docs/collaboration-backend.md |
| Transactional collaboration email | Partial | P1 | M | High | Platform track | docs/collaboration-roadmap.md; README.md |

### Comments and review

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Node comments and replies | Complete | P0 | Done | Medium | Current product | frontend/src/components/comments/CommentPopover.js; frontend/src/components/comments/CommentsPanel.js; frontend/src/components/comments/CommentsPanel.test.js |
| First-class backend comments | Partial | P1 | M | High | Collaboration Phase 3A | docs/collaboration-backend.md; docs/collaboration-roadmap.md |
| Commenter role functionality | Planned | P1 | M | High | Collaboration Phase 3 | docs/collaboration-roadmap.md |

### Realtime and co-editing

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Presence sessions | Partial | P2 | M | Medium | Phase 9D | docs/realtime-collaboration-baseline.md; frontend/src/hooks/useCoeditingLive.test.js |
| Live co-editing mode | Partial | P1 | XL | High | Phase 10D/10E | docs/coediting-frontend-live-mode.md; docs/coediting-rollout-safety-controls.md |
| Collaborator selection presence | Partial | P2 | M | Medium | Phase 10D | docs/coediting-frontend-live-mode.md |
| Activity event store | Partial | P1 | M | High | Collaboration Phase 2A | docs/collaboration-backend.md; docs/collaboration-roadmap.md |
| Live update notifications | Planned | P2 | M | Medium | Collaboration Phase 5 | docs/collaboration-roadmap.md |
| Read-only realtime for viewers/commenters | Planned | P2 | L | High | Collaboration Phase 4/5 | docs/collaboration-roadmap.md |

### Admin and feedback

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| In-app feedback widget | Complete | P1 | Done | Low | Current product | frontend/src/components/feedback/FeedbackWidget.js; frontend/src/utils/feedback.js |
| Feedback console and roadmap themes | Complete | P1 | Done | Medium | Current product | frontend/src/components/admin/FeedbackConsole.js; routes/admin.js |
| Usage metering and limits | Partial | P1 | M | High | Operational hardening | README.md; routes/admin.js; config/ |
| Runtime verification scripts | Complete | P1 | Done | Low | Current operations | README.md; scripts/smoke-test.js; scripts/check-local-collaboration.js |

### Platform and data

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| SQLite local/dev runtime | Complete | P1 | Done | Low | Current platform | README.md; docs/postgres-migration.md |
| Postgres runtime path | Partial | P1 | L | High | Runtime migration | README.md; docs/postgres-migration.md; docs/postgres-runtime-ops.md |
| Worker/runtime split | Partial | P1 | M | High | Operational hardening | README.md; docs/screenshot-pipeline-hardening.md |
| R2 screenshot storage | Partial | P1 | M | High | Operational hardening | docs/screenshot-pipeline-hardening.md |

### Marketing and product surface

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Marketing site information architecture | Partial | P1 | M | Medium | Marketing V1 | frontend/src/marketing/marketingConfig.js; frontend/src/marketing/MarketingSite.js; frontend/src/marketing/MarketingSite.test.js |
| Marketing SEO metadata and route tests | Partial | P1 | S | Medium | Marketing V1 | frontend/src/marketing/marketingConfig.js; frontend/src/marketing/MarketingSite.test.js; frontend/src/utils/appRoutes.test.js |
| Pricing plan details | Unknown | TBD | TBD | TBD | Business decision | Marked Unknown; no repo evidence |
| Examples library | Planned | P2 | M | Medium | Marketing V1/V2 | frontend/src/marketing/marketingConfig.js |

### Future product vision

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Templates and assistant | Future | P2 | XL | High | Future vision | frontend/src/marketing/marketingConfig.js |
| Navigation prototyping and tree testing | Future | P3 | XL | High | Future vision | frontend/src/marketing/marketingConfig.js |
| Diagramming tools | Future | P3 | XL | High | Future vision | frontend/src/marketing/marketingConfig.js |
| Third-party integrations | Future | P3 | XL | High | Future vision | frontend/src/marketing/marketingConfig.js |

### Design system

| Feature | Status | Priority | LOE | Risk | Roadmap Phase | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Shared UI primitives | Complete | P1 | Done | Low | Current product | frontend/src/components/ui; frontend/src/components/ui/Primitives.test.js; docs/design-system/figma-code-first-handoff.md |
| Figma library handoff contract | Partial | P2 | M | Medium | Design system Phase 1 | docs/design-system/figma-code-first-handoff.md; docs/design-system/figma-parity-map.md |
| Code Connect automation | Future | P3 | L | Medium | Design system Phase 2 | docs/design-system/figma-code-first-handoff.md |
| Shared menu surface primitive | Planned | P2 | M | Medium | Design system cleanup | docs/design-system/figma-code-first-handoff.md |
| Shared option-card primitive | Partial | P3 | S | Low | Design system cleanup | docs/design-system/figma-code-first-handoff.md; frontend/src/components/ui/OptionCard.js |

## Linear Guidance

Use this matrix as the high-level source of truth. Create Linear issues later for committed build slices, bugs, or tasks that need assignment, due dates, and implementation tracking. The `Linear URL` column in the spreadsheet is intentionally blank so issues can be linked when work becomes concrete.

## Memory Guidance

If memory is updated later, store only a short pointer to this document and spreadsheet, not the full matrix content.
