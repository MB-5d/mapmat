# Browser helper store release — draft, not published

## Proposed listing

Name: Vellic Scan Helper

Summary: Connect a website you choose to Vellic for protected-page scanning and
image captures you request.

Description: Sign in to your website normally in Chrome, including Google sign-in
or any email/authenticator step. In Vellic, start a connection and enter its pairing
code in the helper. Review the website and Vellic destination before connecting.
The helper temporarily reads that site's login cookies and, when selected, its
site storage. It removes its temporary site permissions after the connection.
Vellic uses the temporary connection to scan the selected area and capture images
only when you ask through Images. Connections expire within 30 minutes. You can
cancel them sooner. Passwords and verification codes stay in the website's normal
sign-in flow; the helper does not ask you to send them to Vellic.

## Permission justifications

- Optional `cookies`: transfer the selected website's signed-in session after
  explicit consent; remove permission afterward.
- Optional `scripting`: collect selected site storage only when the user opts in;
  remove permission afterward.
- Optional HTTPS host access: request only the selected website; revoke after
  import or cancellation, with independent cleanup if its window closes.
- Fixed Vellic API host: deliver the user-approved connection to the configured
  Vellic environment over HTTPS.
- `alarms`: retry removal of temporary access after interruption.
- External app messaging: the exact Vellic app can check helper version, permission
  cleanup and Chrome's update status. It cannot initiate a site-session transfer.

## Draft privacy disclosure

The helper transfers authentication cookies and optionally site storage only for
the website the user selects. These may grant broader account access than the scan
area; the consent screen states this. Login state is held temporarily in the
scanner and discarded at its original expiry, on cancellation, or on failure.
It is never saved in the map, extension storage or browser-only build image.
Images explicitly requested by the user are retained as encrypted map assets and
are accessible to authorized map users. Website content and login state are not
used for advertising or sold. The helper does not contain remotely hosted code.

This text must be checked against the final deployed behavior and incorporated
into the published privacy policy before submission. A public privacy-policy URL,
store artwork/screenshots, publisher identity and review instructions are still
required. No policy publication or store submission is authorized by this draft.

## Release procedure

1. Use the publisher's Chrome Web Store draft item to obtain its assigned identity
   and public key. The unpacked staging key is not proof of store ownership.
2. Build only the reviewed runtime files for the intended environment; pin the
   store identity, API/app origins, version and package checksum. Exclude keys,
   `.env` files, login state, diagnostics and local test files.
3. Supply the exact verified store URL to the app. A missing or mismatched link
   must fail closed; never substitute an unrelated listing or unpacked download.
4. With publication approval, submit the prepared artifact for review.
5. Test clean install, missing/old/incompatible helper, same-identity upgrade,
   busy connection, update throttling, permission cleanup and Incognito settings
   in actual Chrome. Verify an upgrade does not retain website permissions.
6. Retain a rollback package and previous environment configuration. Publishing
   to customers and enabling production remain separate approval boundaries.
