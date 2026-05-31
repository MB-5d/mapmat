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
- Provider webhook ingestion endpoints for Resend and Postmark delivery-state callbacks.
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
- `RESEND_WEBHOOK_SECRET`
- `POSTMARK_WEBHOOK_BASIC_USERNAME`
- `POSTMARK_WEBHOOK_BASIC_PASSWORD`
- `POSTMARK_WEBHOOK_TOKEN`
- `POSTMARK_WEBHOOK_TOKEN_HEADER`

Provider-specific:

- `RESEND_API_KEY`
- `POSTMARK_SERVER_TOKEN`

## Operational Notes

- Health endpoint: `GET /health/email`
- Provider webhook endpoints:
  - `POST /api/email/webhooks/resend`
  - `POST /api/email/webhooks/postmark`
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
- Webhook events are stored separately in `email_delivery_events` with idempotent dedupe keys.
- Admin detail responses redact invite-token-like fields before returning payload metadata.
- Resend webhooks use signed raw-body verification with timestamp tolerance.
- Postmark webhooks should be protected with configured basic auth or a shared custom header token.

## Non-Goals For This Slice

- Marketing / promotional email sending
- campaign scheduling
- unsubscribe / consent management
- bounce suppression lists for bulk mail
- provider webhook ingestion

Those belong in a separate marketing-email track so transactional collaboration email keeps a clean sender/reputation boundary.

## Next Email Steps

1. Add richer provider-event mapping if open/click/subscription states become product-relevant.
2. Add admin resend / retry tooling only after webhook state is trustworthy in production.
3. Add production monitoring / alerting on failed delivery or bounce spikes.
4. Add provider-specific delivery suppression handling where appropriate.
5. Build marketing email as a separate platform track with its own compliance rules.
