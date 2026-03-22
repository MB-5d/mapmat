# Email Delivery Foundation

This document describes the first email platform slice added for collaboration flows.

## Current Scope

- Queued email delivery using the existing `jobs` worker loop.
- Provider abstraction with these modes:
  - `log`
  - `disabled`
  - `resend`
  - `postmark`
- Delivery audit records in `email_deliveries`.
- Collaboration invite email queued automatically when a new invite is created.
- Owner notification email queued when a user requests access.
- Requester notification email queued when an access request is approved or denied.
- Member notification email queued when their role changes or their access is removed.
- Admin diagnostics endpoints for delivery summary, recent deliveries, and single-delivery inspection.
- Local/in-dev default is `log`.
- Production default is `disabled` until a real provider is configured.

## Current Product Behavior

- Invite creation does not depend on email delivery succeeding.
- If email queueing fails, the invite still exists and can still be accepted in-app.
- Invite emails deep-link into `/app/invites/accept/:token`.
- Approval / denial / role-change / removal emails deep-link into `/app/maps/:mapId`.
- The in-app invite inbox still exists and remains the safest fallback if delivery fails.

## Environment Variables

- `EMAIL_PROVIDER`
  - `log`, `disabled`, `resend`, `postmark`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME`
- `EMAIL_REPLY_TO_ADDRESS`
- `APP_BASE_URL`

Provider-specific:

- `RESEND_API_KEY`
- `POSTMARK_SERVER_TOKEN`

## Operational Notes

- Health endpoint: `GET /health/email`
- Admin diagnostics:
  - `GET /api/admin/email-deliveries/summary`
  - `GET /api/admin/email-deliveries`
  - `GET /api/admin/email-deliveries/:deliveryId`
- Email jobs run through the normal backend worker loop.
- Delivery rows record:
  - template key
  - recipient
  - provider
  - attempt count
  - final status
  - provider message id when available
  - provider response/error metadata
- Admin detail responses redact invite-token-like fields before returning payload metadata.

## Non-Goals For This Slice

- Marketing / promotional email sending
- campaign scheduling
- unsubscribe / consent management
- bounce suppression lists for bulk mail
- provider webhook ingestion

Those belong in a separate marketing-email track so transactional collaboration email keeps a clean sender/reputation boundary.

## Next Email Steps

1. Add provider webhook ingestion for delivery / bounce / complaint visibility.
2. Add provider-message-id lookup helpers and webhook reconciliation.
3. Add admin resend / retry tooling only after webhook state is trustworthy.
4. Add production monitoring / alerting on failed delivery spikes.
5. Build marketing email as a separate platform track with its own compliance rules.
