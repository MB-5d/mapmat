# Multilingual marketing staging

Production remains unchanged until a separate rollout is approved.

## Staging domains

- Marketing: `https://staging.vellic.io`
- App: `https://app-staging.vellic.io` (root redirects to `/app`)
- API: `https://api-staging.vellic.io`

Backend staging variables:

```env
APP_BASE_URL=https://app-staging.vellic.io
FRONTEND_URL=https://app-staging.vellic.io,https://staging.vellic.io
```

App staging variables:

```env
REACT_APP_API_BASE=https://api-staging.vellic.io
REACT_APP_APP_ORIGIN=https://app-staging.vellic.io
REACT_APP_MARKETING_ORIGIN=https://staging.vellic.io
REACT_APP_APP_ONLY_MODE=true
```

Marketing staging variables are listed in `marketing/.env.staging.example`.

## Safe Vercel and GoDaddy order

1. In the existing `mapmat-staging` Vercel project, add `app-staging.vellic.io`.
2. Vercel will show the DNS record it requires. In GoDaddy, open the `vellic.io` DNS page and add that exact record. It is normally a CNAME with host `app-staging`, but use Vercel's displayed value.
3. Wait until Vercel marks `app-staging.vellic.io` valid. Verify `/` redirects to `/app`, login works, and the response has `X-Robots-Tag: noindex, nofollow`.
4. Create a separate Vercel project rooted at `marketing/`, tracking the `staging` branch. Add the four variables from `marketing/.env.staging.example`.
5. Deploy and verify its generated Vercel URL before moving a custom domain.
6. Remove `staging.vellic.io` from the combined app project only after step 3 passes. Add it to the marketing project and apply the exact GoDaddy DNS value Vercel shows.
7. Verify `/`, `/es/`, `/de/`, `/fr/`, `/ja/`, `/sitemap.xml`, and `/robots.txt`. All staging responses must remain noindex.

Google OAuth keeps this callback:

```text
https://api-staging.vellic.io/auth/google/callback
```

Add `https://app-staging.vellic.io` as an authorized JavaScript origin. The marketing origin does not need to initiate app authentication.

## Search Console and Bing

Do not submit staging URLs.

1. Open Google Search Console and add a Domain property for `vellic.io`.
2. Copy Google's TXT value. In GoDaddy DNS, add a TXT record at host `@`, paste the value, save it, and keep it permanently.
3. After Google verifies the property, open Bing Webmaster Tools and choose **Import from Google Search Console**.
4. After a separately approved production launch, submit `https://vellic.io/sitemap.xml` in both tools and inspect `/`, `/es/`, `/de/`, `/fr/`, and `/ja/`.

Only reviewer-approved locale files may set `indexable: true`. Machine drafts remain noindex and display the review-pending toast.
