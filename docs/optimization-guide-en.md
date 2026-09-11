# cf-auto Selection Settings & User Guide

This document explains every option on the cf-auto panel's **Selection settings** tab and walks through the full workflow. For installation and a quick start, return to the [README](../README_EN.md).

## Panel overview

The panel runs at `http://ROUTER_IP:7800` and has four tabs:

| Tab | Purpose |
|---|---|
| Overview | App version, engine version, schedule status, Gist status; the **Start optimization** button; the latest result table; engine update entry |
| Optimization | Core settings: method, source, regions, ports, parameters, result policy, scheduling |
| GitHub | Token / Gist ID / target filename / proxy, plus connection verification |
| Logs | Live rolling log with an auto-refresh toggle |

## Selection method

| | By latency | By bandwidth |
|---|---|---|
| Test | TCP handshake latency (HTTP request latency when HTTP-mode testing is on) | Latency first, then per-IP download measurement for qualified IPs |
| Sort | Lowest latency first | Highest bandwidth first |
| Traffic | About zero | About 100-300 MB per run |
| Best for | Routine refreshes on a schedule | High-bandwidth workloads such as 8K/IPTV |

When you switch methods, the panel hides parameters that do not apply: **Download test count -dn**, **Test duration per IP -dt**, and **Download test URL** only appear in bandwidth mode.

## Candidate source

**Custom preferred-IP URLs**: one URL per line. cf-auto fetches every source, merges and deduplicates the results into a candidate pool, and re-tests them from your own connection. Common public lists (availability not guaranteed; fill in several as backups):

```text
https://addressesapi.090227.xyz/CloudFlareYes
https://ip.164746.xyz/ipTop10.html
https://bestcf.pages.dev/cmliu/all.txt
```

**Official Cloudflare ranges**: fetches Cloudflare's official IPv4 ranges live from `api.cloudflare.com` (matching CloudflareSpeedTest's default behavior). The most complete coverage but each run takes tens of minutes — best for infrequent deep scans or as a fallback when custom sources die.

## Region targeting

When enabled, results are filtered by the real landing colo: cf-auto tests with HTTPING and reads the Cloudflare `cf-ray` colo code, keeping only IPs that land in the selected regions (the `-cfcolo` parameter).

- Common regions: `SIN` Singapore, `NRT` Tokyo, `KIX` Osaka, `HKG` Hong Kong, `LAX` Los Angeles, `SJC` San Jose, `SEA` Seattle, `FRA` Frankfurt; custom entries use `CODE|Name` (for example `YYY|Italy`)
- **Minimum results per region** (default 3) keeps small regions represented when TopN would otherwise crowd them out
- **Important**: your line's Cloudflare egress colo is decided by your provider's routing and can change over time. If a region keeps reporting "0 qualified this round (this line may not route to XX); skipped", deselect that region or turn region targeting off
- Region targeting adds HTTPING time; multiple regions x multiple ports multiply the run duration

## Test ports

The default is `443`. The panel offers `443 / 8443 / 2053 / 2083 / 2087 / 2096` (HTTPS ports supported by Cloudflare).

- Results look like `IP:port`; your EdgeTunnel subscription must support connecting on that port
- More ports mean longer runs; keep 443 unless you have a specific need

## CloudflareSpeedTest parameters

| Parameter | Default | Description |
|---|---|---|
| Max average latency `-tl` | 300 ms | IPs above this are dropped; lower means stricter results |
| Min average latency `-tll` | 0 | Filters suspiciously fast (possibly hijacked) IPs; keep at 0 normally |
| Download test count `-dn` | 10 | Bandwidth mode: the top N latency-qualified IPs enter the download test |
| Test duration per IP `-dt` | 8 s | Bandwidth mode: download seconds per IP — longer is more accurate and slower |
| Download test URL | speed.cloudflare.com | URL used for the download test |
| HTTP-mode latency test | Off | Uses HTTP requests instead of TCP connects. **If the log shows the TCP mode timing out across the board (0 qualified), enable this** |
| Advanced extra arguments | Empty | Appended to cfst as-is, e.g. `-t 200 -p 50` |

## Result policy

**Update mode** (choose one):

- **Overwrite** (default): each run rebuilds a fresh file from the latest results and replaces the whole board — the pool always mirrors the newest test, simple and current
- **Merge**: new results merge with the previous board — new winners take the front seats, qualified existing IPs stay behind them with their miss counter cleared, and an entry is removed only after N consecutive misses. The pool evolves smoothly, which avoids subscription churn from single-run variance

Other options:

| Option | Default | Description |
|---|---|---|
| Top N this run | 10 | Maximum IPs entering the board each run |
| Maximum result lines | 25 | Cap on file length (also limits retained entries in merge mode) |
| Misses before eviction | 3 | Merge mode only: remove an IP after N consecutive misses |

The merge-mode ledger is stored locally at `/etc/cf-auto/state.json`, separate from the result file; the file header contains only the app version and update time. Switching modes requires no ledger cleanup — overwrite mode prunes stale ledger entries automatically.

## Node label template

The comment after `IP:port#` is generated from a template with these variables:

| Variable | Meaning | Example |
|---|---|---|
| `{region}` | Region code (the run's actual landing colo when region targeting is off) | `SIN` |
| `{latency}` | Latency (rounded, includes ms) | `85ms` |
| `{speed}` | Bandwidth (includes MB/s; absent in latency mode) | `12.3MB/s` |
| `{date}` | Update date | `2026-09-11` |

Default template: `cf-auto | {region} | {latency}ms | {speed}`. Empty segments are removed automatically.

## Scheduled updates

When enabled, a full run executes at the configured interval (hours) using the current method, source, regions, and ports, then uploads to Gist. The service starts on boot and catches up on a missed first run automatically. For routine refreshes, latency mode + custom sources + a 1-6 hour interval works well; for official-range scans prefer 12-24 hours.

## Full workflow

### Step 1: create a GitHub token (three steps)

1. Sign in to GitHub, open your profile menu, and select **Settings**
2. Open **Developer settings** -> **Personal access tokens** -> **Tokens (classic)** -> **Generate new token (classic)**
3. Choose a long expiration, select only the `gist` scope, generate, and copy the token beginning with `ghp_`

> The token is stored only on the router with `0600` permissions and is used solely to access your own Gist.

### Step 2: configure GitHub upload

Open the **GitHub** tab:

1. Paste the token
2. Gist ID: open any Gist of yours (or create one); the segment after `gist.github.com/<user>/` in the URL is the ID
3. Target filename: the default `CF-Auto-Top.txt` is fine as long as your subscription URL matches
4. GitHub proxy: fill this in if the router cannot reach the GitHub API directly (for example the local OpenClash mixed port `http://127.0.0.1:7890`)
5. Click **Verify connection**, then save

### Step 3: run the first round

Pick the method, source, and ports under **Selection settings**, save, then click **Start optimization** under **Overview**. The log shows: candidate pool fetch -> per-region testing -> merge and filter -> Gist upload.

### Step 4: connect to EdgeTunnel

Set the Gist raw URL as the custom preferred-IP source in your EdgeTunnel deployment:

```text
https://gist.githubusercontent.com/<user>/<GistID>/raw/CF-Auto-Top.txt
```

GitHub caches raw content for about an hour, so a short delay on the subscription side is normal.

## FAQ

**A full run yields 0 qualified — what now?**
Check in order: did the source fetch succeed (candidate pool line in the log) -> if the log shows mode TCP with everything timing out, enable **HTTP-mode latency test** -> with region targeting on, if every region reports "may not route to", turn region targeting off or pick different regions -> is `-tl` set too low?

**The log says "this line may not route to XX"?**
Your line's current egress colo is not XX. Cloudflare egress is decided by provider routing and changes over time — deselect that region. The message is only a skip warning and does not affect other regions.

**Merge or overwrite?**
Keep the default overwrite for simplicity; choose merge if you want the pool to evolve gradually and single-run variance to matter less.

**Adding or changing test ports?**
Add them under **Test ports**; they take effect next run. Make sure your subscription client supports those ports.

**Does upgrading or reinstalling lose my config?**
No. `/etc/cf-auto/config.json` (settings) and `state.json` (ledger) survive upgrades and reinstalls.

**Manual trigger says the engine is busy?**
The previous run (or a scheduled one) is still in progress; wait for it to finish.
