# Staging QA Test Roster

Use these only on staging:

- Frontend: `https://staging.vellic.io/app`
- Backend: `https://api-staging.vellic.io`

## Login Codes

- Existing seeded accounts are already verified, so normal password login should not need a code.
- If staging test auth sends a code to an `@test.vellic.local` account, use `123456`.
- Staging email copies are controlled by `EMAIL_COPY_TO_ADDRESSES`; set it to `hello@vellic.io` to copy outbound emails.

## Plan Accounts

Password for these accounts: `Test1234!`

| Plan | Email |
| --- | --- |
| Free | `free@test.vellic.local` |
| Pro | `pro@test.vellic.local` |
| Studio | `studio@test.vellic.local` |
| Agency | `agency@test.vellic.local` |
| Pro alias compatibility | `solo@test.vellic.local` |

## Role Accounts

Password for these accounts: `Admin123!`

| Role | Email |
| --- | --- |
| Owner | `vellic-owner@example.com` |
| Editor | `vellic-editor@example.com` |
| Commenter | `vellic-commenter@example.com` |
| Viewer | `vellic-viewer@example.com` |

## Studio And Agency Invite Targets

Password for these accounts: `Test1234!`

| Test | Email |
| --- | --- |
| Studio editor target | `studio-editor@test.vellic.local` |
| Studio owner target | `studio-extra-owner@test.vellic.local` |
| Agency editor target | `agency-editor@test.vellic.local` |
| Agency owner target | `agency-extra-owner@test.vellic.local` |

## How To Test Adding An Editor

1. Log in as `studio@test.vellic.local` or `agency@test.vellic.local`.
2. Create a project and save a map.
3. Open `Share`.
4. Invite `studio-editor@test.vellic.local` or `agency-editor@test.vellic.local` as `Editor`.
5. Log in as that editor in a separate browser profile.
6. Open the account menu, open `Invites`, and accept the invite.
7. Confirm the map appears under `Shared With Me`.
8. Confirm the editor can edit and move nodes, but cannot remove the primary owner.

## How To Test Adding An Owner

1. Log in as `studio@test.vellic.local` or `agency@test.vellic.local`.
2. Create and save a map.
3. Open `Share`.
4. Invite `studio-extra-owner@test.vellic.local` or `agency-extra-owner@test.vellic.local` as `Owner`.
5. Log in as that owner target in a separate browser profile.
6. Accept the invite from `Invites`.
7. Confirm both owners can manage members and share settings.
8. Confirm a non-owner editor cannot grant owner access.

## Reset Command

Run this against staging only:

```bash
npm run seed:staging-qa-accounts -- --reset
```
