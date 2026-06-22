```
                           AutoRulesManager
    _            __     __  _ _             __          __  _
   | |           \ \   / / | | |            \ \        / / | |
   | |__  _   _   \ \_/ /__| | | _____      _\ \  /\  / /__| |__
   | '_ \| | | |   \   / _ \ | |/ _ \ \ /\ / /\ \/  \/ / _ \ '_ \
   | |_) | |_| |    | |  __/ | | (_) \ V  V /  \  /\  /  __/ |_) |
   |_.__/ \__, |    |_|\___|_|_|\___/ \_/\_/    \/  \/ \___|_.__/
           __/ |
          |___/             https://yellowweb.top

If you like this script, PLEASE DONATE!
```

[Support this project](https://yellowweb.top/donate)


# AutoRulesManager

Browser-side tool for Facebook Ads Manager automated rules export, import, deletion, and status switching.

AutoRulesManager runs inside the current Ads Manager tab. It can export account rules to JSON, import rules into one or many ad accounts, optionally delete existing rules before import, and enable or disable rules in bulk. Money thresholds are converted across account currencies, including prefixed fields such as `ad.today_spent`, `ad.today_cost_per_lead_fb`, and `campaign.lifetime_cost_per_lead_fb`.

## Install

Open the landing page, click the yellow `AutoRules` button to copy the bookmarklet, then create a browser bookmark and paste it into the bookmark URL field:

https://autorulesmanager.pages.dev/

Then open Facebook Ads Manager and click the bookmark.

## Build

```powershell
npm run build
```

Equivalent direct command:

```powershell
node .\autorules-og-packager.js --base-url=https://autorulesmanager.pages.dev/autorules
```

## Deploy

Deploy `dist` as the Cloudflare Pages root for project `autorulesmanager`.

```powershell
npm run deploy
```

After deploying payload changes, refresh the Facebook OG scrape for the build-specific chunk URLs printed by the packager, for example:

- `https://autorulesmanager.pages.dev/autorules/150526b3/og/chunk-001.html`

The bookmarklet embeds current build metadata and points at build-specific OG chunk URLs. This avoids stale Facebook OG objects for `/latest/` URLs.
