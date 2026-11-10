# Isolated scan browser (staging candidate, not deployed)

Authenticated logins use separate Railway VMs. Public browser work uses a
separate, credential-free VM. All are explicitly `ISOLATED`, without public ports
or inherited app variables. Three leases per process bound concurrent usage.
Only the reviewed browser runtime, restricted proxy and pinned Playwright/ws
packages go into the checkpoint. Use a staging project/environment token, never
an account token, in the application configuration.

The trusted supervisor starts a public-address-only, DNS-pinned proxy. Chromium
runs as UID 1001 with its own sandbox enabled, inside a fresh Linux network
namespace with **only loopback active** (kernel-created tunnel devices stay down and unaddressed). A root-owned loopback relay reaches the
restricted proxy through a root-only Unix socket. The browser has no direct
external interface, default route, private-network interface or app files. The
proxy rejects private/metadata addresses, IPv6 and unsupported ports.

Railway's VM kernel lacks the `iptables owner` extension, so the initial UID
firewall prototype was replaced with network namespaces. The Node executable is
copied from `process.execPath` to a root-owned, executable public path; copying
the shell's `node` path copies a version-manager shim and does not work.

Browser control uses the supported ephemeral SDK stdin/stdout stream, with output
retention disabled and bounded frame queues. There is no public browser endpoint.
The custom WebSocket transport supplies Railway's required dashboard Origin
header; TLS and short-lived shell-token authentication remain enabled.

The maximum 30-minute lifetime includes login, scan and explicit image capture.
Closing, cancellation, expiry and shutdown remove the remote browser; provider
idle expiry is secondary. Failed isolation never falls back to an app-host browser.
The app requires explicit `SCAN_BROWSER_ISOLATION=railway`, staging environment ID,
`SCAN_BROWSER_RAILWAY_TOKEN`, `SCAN_BROWSER_CHECKPOINT`, and
`ALLOW_PRIVATE_NETWORKS=false`. Production configuration is rejected.

Protected capture-later is separately off by default:
`SCAN_AUTH_CAPTURE_LATER_ENABLED=true` and
`REACT_APP_PROTECTED_CAPTURE_LATER_ENABLED=true` enable it. Outside disposable
local tests it requires the isolated-browser configuration. Existing Images jobs
perform capture, keep ciphertext bound to the map, and require sign-in again when
the connection ends. Maps never store website credentials. Saved images outlive
website login expiry. Anonymous public delivery remains denied.

Do not call this production-ready until the cloud denial/bypass/expiry suite,
real staging app integration, provider cleanup and deployment capacity limits
are verified. The pinned Railway SDK is beta. Store installation/automatic update
also requires a reviewed Chrome Web Store release; an unpacked package is not one.
