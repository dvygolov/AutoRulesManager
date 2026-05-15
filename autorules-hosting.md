# AutoRulesManager Loader Hosting

## Runtime Flow

1. The root `https://autorulesmanager.pages.dev/` page serves a branded install landing with a bookmarklet button.
2. The bookmarklet contains the loader plus current build metadata.
3. The loader runs only on `*.facebook.com`.
4. The loader reads build-specific OG chunk pages through Ads Manager Graph using the current Ads Manager runtime token.
5. The embedded metadata contains the build, payload SHA-256, and OG chunk pages.
6. If the cached `localStorage` payload version matches the embedded build, the loader executes the cached payload.
7. If cache is missing, the loader fetches OG chunks, verifies the payload metadata, writes the payload to `localStorage`, then injects it as a Blob script.

## Build And Publish

```powershell
npm run build
npm run deploy
```

After deploy, scrape the build-specific chunk URLs printed by the packager, for example:

- `https://autorulesmanager.pages.dev/autorules/150526b3/og/chunk-001.html`

## Why Not Load The Script Directly?

Facebook Ads Manager CSP blocks normal direct runtime script loading from Cloudflare Pages. AutoRulesManager uses the same OG metadata pattern as AdReplica so the small bookmarklet can load the current payload from inside Ads Manager.
