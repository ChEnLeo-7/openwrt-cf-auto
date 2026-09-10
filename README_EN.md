<div align="center">

<img src="web/assets/cf-auto-logo.webp" alt="cf-auto Logo" width="160">

# cf-auto

**Self-updating Cloudflare preferred-IP source for EdgeTunnel, running entirely on your OpenWrt router.**

[简体中文](README.md) | **English**

[![version](https://img.shields.io/badge/version-0.2.1-4f8cff)](#installation)
[![platform](https://img.shields.io/badge/platform-OpenWrt%2023.05%2B-00b3a4)](#installation)
[![arch](https://img.shields.io/badge/arch-x86_64%20%7C%20aarch64-8a63ff)](#installation)
[![engine](https://img.shields.io/badge/engine-CloudflareSpeedTest%20v2.3.5-ffb454)](#engine)
[![license](https://img.shields.io/badge/license-MIT-3fcf8e)](#license)

</div>

---

## What is it?

EdgeTunnel and WorkerVless2sub-style solutions depend on preferred IPs, but public preferred-IP APIs measure performance on someone else's network. cf-auto moves that test onto your own router:

```text
Candidate pool -> local testing (your actual route) -> merge and filter -> upload to Gist
                                                                    -> EdgeTunnel subscription updates
```

The complete selection process runs on your own connection, so the measured latency is your actual latency.

## Features

- **Two selection methods**: latency mode uses a zero-traffic TCP scan; bandwidth mode downloads through top candidates to measure real throughput.
- **Two candidate sources**: use custom source URLs for community preselection plus local verification, or scan official Cloudflare ranges fetched from `api.cloudflare.com`.
- **Region targeting**: filter by the actual Cloudflare colo using HTTPING and `-cfcolo` (SIN, NRT, KIX, HKG, and more), with a configurable minimum per region.
- **Colo explanations**: common Cloudflare colo codes have localized labels such as `SIN | Singapore`; custom `CODE|Name` entries are supported and persisted.
- **Merge and decay**: new winners move to the front, qualified existing IPs remain behind them, and stale entries are removed only after repeated misses.
- **Scheduled updates**: run selection and upload automatically at a configurable interval.
- **Custom node labels**: compose comments after `#` with region, latency, bandwidth, and date variables.
- **Light and dark themes**: an Apple-inspired web panel available on your LAN at port `7800`, with automatic or manual theme switching.
- **Chinese and English UI**: the panel uses translation keys throughout and switches languages instantly without a reload.
- **Application updates**: checks GitHub Release tags automatically each time the panel opens, presents bilingual notes in a dialog, and supports one-click or automatic IPK installation.
- **One-click engine updates**: check and update CloudflareSpeedTest from the panel with automatic backup and rollback.
- **One-command IPK installation**: packages for x86_64 and aarch64 with procd autostart.

## Installation

```sh
opkg install cf-auto_0.2.1_x86_64.ipk    # x86_64 router
opkg install cf-auto_0.2.1_aarch64.ipk   # ARM64 device, such as an N1
```

Installation registers and enables the procd service. Open the panel at `http://ROUTER_IP:7800`.

```sh
/etc/init.d/cf-auto start|stop|restart|enable|disable
```

## Quick start

1. Under **Selection settings**, choose a method and source, enter source URLs when using custom mode, select ports, and save.
2. Under **GitHub**, enter the token, Gist ID, and destination filename, then verify the connection.
3. Under **Overview**, start a run and monitor the log and result table.
4. Set the resulting Gist raw URL as the custom preferred-IP source in EdgeTunnel:

   ```text
   https://gist.githubusercontent.com/<user>/<GistID>/raw/CF-Auto-Top.txt
   ```

## Create a GitHub token

1. Sign in to GitHub, open your profile menu, and select **Settings**.
2. Open **Developer settings** -> **Personal access tokens** -> **Tokens (classic)** -> **Generate new token (classic)**.
3. Choose a suitable expiration, select only the `gist` scope, generate the token, and copy the value beginning with `ghp_`.

> The token is stored only on the router with `0600` permissions and is used solely to access your own Gist.

## Selection methods and sources

| | By latency | By bandwidth |
|---|---|---|
| Test | TCP handshake latency | Latency plus per-IP download test |
| Sort | Lowest latency first | Highest bandwidth first |
| Traffic | Approximately zero | About 100-300 MB per run |
| Best for | Routine refreshes | High-bandwidth workloads such as 8K/IPTV |

| | Custom sources | Official Cloudflare ranges |
|---|---|---|
| Candidate pool | Merged and deduplicated community lists | All official Cloudflare ranges fetched live |
| Duration | Seconds to minutes | Tens of minutes |
| Suggested use | Regular scheduled runs | Infrequent deep scans |

Example result template: `cf-auto | {region} | {latency}ms | {speed}`. Variables can be freely combined in the panel.

## Result update strategy

cf-auto uses merge-and-decay rather than replacing the entire file after each run. New winners are placed first, existing IPs that still qualify are retained behind them, and an entry is removed only after missing a configurable number of consecutive runs (three by default). With region targeting enabled, every selected region retains a minimum number of entries. The output header contains only the application version and update time; the decay ledger remains locally in `state.json`.

## Engine

The test engine is [XIU2/CloudflareSpeedTest](https://github.com/XIU2/CloudflareSpeedTest) v2.3.5 under GPL-3.0. It is bundled and invoked as a separate binary without source modifications. Its license is installed at `/usr/share/doc/cf-auto/CFST-LICENSE`.

On the first build, `build.ps1` downloads the matching engine binaries from GitHub Releases.

## Application updates

The panel checks the latest GitHub Release from `ChEnLeo-7/openwrt-cf-auto` every time it opens. When a newer tag is available, a dialog shows the Release title, bilingual notes, and update actions. You can open the Release page, install the matching IPK immediately, or enable automatic installation under **Optimization → Application updates** (the matching IPK is then downloaded and installed automatically on detection).

The updater selects the x86_64 or aarch64 asset automatically. Configuration and selection state are kept outside the package payload and survive the upgrade.

## Notes

- Tests connect directly from the router without passing through OpenClash, reflecting the actual route quality.
- GitHub caches raw Gist content, so EdgeTunnel updates may take about one hour to become visible.
- If the GitHub API is unreachable directly, enter the local OpenClash mixed proxy port under **GitHub proxy**.
- Reinstalling or upgrading does not overwrite `/etc/cf-auto/config.json` or `state.json`.

## Build

```powershell
.\build.ps1 -Version 0.2.1    # Download the engine and cross-compile both IPK architectures
```

## License

This project is released under the [MIT License](LICENSE). The bundled CloudflareSpeedTest engine remains subject to GPL-3.0.
