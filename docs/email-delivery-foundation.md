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
- Local/in-dev default is `log`.
- Production default is `disabled` until a real provider is configured.

## Current Product Behavior

- Invite creation does not depend on email delivery succeeding.
- If email queueing fails, the invite still exists and can still be accepted in-app.
- Current invite emails instruct users to open `Account > Invites`.
- The email body does not yet include a raw accept token link.
  - This is intentional until durable app routing and email deep-link UX are in place.

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
- Email jobs run through the normal backend worker loop.
- Delivery rows record:
  - template key
  - recipient
  - provider
  - attempt count
  - final status
  - provider message id when available
  - provider response/error metadata

## Next Email Steps

1. Add owner access-request notification emails.
2. Add approval / denial notification emails.
3. Add invite email deep links once app routing is durable.
4. Add provider webhook ingestion for delivery/bounce visibility.
5. Add admin/support tooling for delivery inspection if needed.
