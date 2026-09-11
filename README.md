<div align="center">

<img src="web/assets/cf-auto-logo.webp" alt="cf-auto Logo" width="160">

# cf-auto

**Self-updating Cloudflare preferred-IP source for EdgeTunnel — running entirely on your OpenWrt router.**

运行在 OpenWRT 路由器上的 Cloudflare 优选 IP 自动化面板：定时实测 → 自动筛选 → 上传 Gist → 订阅即时可用。

**简体中文** | [English](README_EN.md)

[![version](https://img.shields.io/badge/version-0.3.1-4f8cff)](#-安装)
[![platform](https://img.shields.io/badge/platform-OpenWrt%2023.05%2B-00b3a4)](#-安装)
[![arch](https://img.shields.io/badge/arch-x86_64%20%7C%20aarch64-8a63ff)](#-安装)
[![engine](https://img.shields.io/badge/engine-CloudflareSpeedTest%20v2.3.5-ffb454)](#引擎说明)
[![license](https://img.shields.io/badge/license-MIT-3fcf8e)](#许可)

</div>

---

## 这是什么

EdgeTunnel / WorkerVless2sub 类方案都依赖"优选 IP"，而市面上公开的优选 API 测的是**别人家网络**的速度。cf-auto 把测速环节搬回你自己的路由器：

```text
候选池 → 本机实测（真实线路） → 合并筛选 → 自动上传 Gist
                                            → EdgeTunnel 订阅自动更新
```

一轮完整优选在你自己的线路上完成，测出来的延迟就是**你**的延迟。

## 特性

- ⚡ **两种优选方式**：按延迟（TCP 快扫，零流量）或按带宽（对 Top 候选逐个下载实测吞吐）
- 🌐 **三种优选来源**：自定义优选源 URL（社区初筛 + 本机终审）、CF 官方网段全扫（实时拉取 `api.cloudflare.com`），或社区精选库（按运营商拉取 cmliu/CF-CIDR 精选网段，小池快测两三分钟一轮）
- 🛑 **一键停止**：优选进行中可随时在概览页终止，误点无忧、结果不落盘
- 🌏 **地区自动补全**：未开区域定向时，也通过 `cdn-cgi/trace` 识别每个上榜 IP 的真实落地机房
- 📍 **区域定向**：按真实落地机房过滤（HTTPING + `-cfcolo`，SIN/NRT/KIX/HKG… 可多选），支持每地区最少上榜数保护
- 🏷️ **地区代码解释**：内置常用 Cloudflare colo 中英文名称（如 `SIN | 新加坡`），也可添加 `CODE|名称` 自定义代码与说明
- 🔄 **两种更新方式**：覆盖（每轮全新结果整文件覆盖，跟随最新实测）或融合（合并 + 衰减淘汰，节点池平滑演进）
- 🧪 **HTTP 模式测速**：TCP 直连 Cloudflare 全部超时的线路，可一键切换 HTTPING 测延迟
- ⏰ **定时更新**：自定义间隔自动优选并上传，一次配置长期运行
- ✏️ **自定义节点信息**：`#` 后的节点注释提供模板变量（地区/延迟/带宽/日期），随意组合
- 🌗 **明暗双主题**：Apple 风格 Web 面板，局域网访问 `:7800`，跟随系统/手动切换
- 🌍 **中英双语**：面板使用完整 i18n 翻译键，可在中文与 English 之间即时切换
- 🔧 **一键引擎升级**：面板内检查/升级 CloudflareSpeedTest，自动备份回滚
- 📦 **ipk 一键安装**：x86_64 / aarch64 双架构，procd 开机自启

> 每个选项的详细解释、完整接入教程与常见问题排查见 [优选设置与使用教程](docs/optimization-guide.md)。

## 安装

```sh
opkg install cf-auto_0.3.1_x86_64.ipk    # x86_64 软路由
opkg install cf-auto_0.3.1_aarch64.ipk   # ARM64 设备（N1 等）
```

安装即注册 procd 服务并开机自启，面板地址：`http://路由器IP:7800`

```sh
/etc/init.d/cf-auto start|stop|restart|enable|disable
```

## 快速上手

1. **优选设置** — 选好方式与来源，粘贴优选源 URL（自定义模式下），勾选端口，保存
2. **GitHub** — 填入 Token / Gist ID / 目标文件名，点"验证连接"
3. **概览** — 点"开始优选"，观察日志与结果表
4. **接入订阅** — 把 Gist raw 地址填进 EdgeTunnel 后台的自定义优选源：

   ```text
   https://gist.githubusercontent.com/<用户>/<GistID>/raw/CF-Auto-Top.txt
   ```

更完整的分步教程见 [优选设置与使用教程](docs/optimization-guide.md)。

## 获取 GitHub Token（三步）

1. 登录 GitHub → 右上角头像 → **Settings**
2. 左栏底部 **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
3. Expiration 选长期，**唯一勾选 `gist`** → Generate → 复制 `ghp_` 开头 Token

> Token 仅保存在路由器本地（权限 0600），只用于读写你自己的 Gist。

## 优选方式与来源

| | 按延迟 | 按带宽 |
|---|---|---|
| 测试内容 | TCP 握手延迟 | 延迟 + 逐 IP 下载实测 |
| 排序 | 延迟升序 | 带宽降序 |
| 流量 | ≈0 | 约 100-300MB/轮 |
| 适用 | 常态保鲜 | 大带宽需求（8K/IPTV） |

| | 自定义优选源 | CF 官方网段 |
|---|---|---|
| 候选池 | 社区优选列表合并去重（几百个） | Cloudflare 官方全部网段实时拉取 |
| 耗时 | 秒级~分钟级 | 数十分钟 |
| 建议 | 日常定时 | 低频深度扫描 |

结果注释模板：`cf-auto | {region} | {latency}ms | {speed}`，变量可在面板自由组合。

## 结果更新策略

两种更新方式可在面板切换：**覆盖更新**（默认）每轮把最新结果整理成独立 txt 直接覆盖整个文件，节点池完全跟随最新实测；**融合更新**则新冠军进前排、老 IP 仍达标保留靠后、连续 N 轮（默认 3）落榜才移除，节点池平滑演进。启用区域定向时，每个选中地区保证最少上榜数。结果文件注释头只含程序版本与更新时间，融合模式的淘汰账本保存在路由器本地 `state.json`。

## 引擎说明

测速引擎为 [XIU2/CloudflareSpeedTest](https://github.com/XIU2/CloudflareSpeedTest) v2.3.5（GPL-3.0），
以独立二进制方式捆绑调用，不修改其源码；许可全文见包内 `/usr/share/doc/cf-auto/CFST-LICENSE`。
首次构建时 `build.ps1` 会自动从 GitHub Releases 拉取对应架构的二进制。

## 注意事项

- 测速从路由器本机直连发起（不经过 OpenClash），反映线路真实质量
- GitHub 对 Gist raw 内容有缓存，EdgeTunnel 侧生效存在约 1 小时延迟属正常
- GitHub API 直连不通时，面板"GitHub 代理"填入本机 OpenClash 混合端口即可
- 升级重装不影响 `/etc/cf-auto/config.json` 与 `state.json`

## 构建

```powershell
.\build.ps1 -Version 0.3.1    # 自动下载引擎并交叉编译双架构 ipk
```

## 许可

本项目代码以 [MIT](LICENSE) 发布；捆绑的 CloudflareSpeedTest 引擎遵循其自身的 GPL-3.0 许可。

## 致谢

| 库 | 说明 |
|---|---|
| [XIU2/CloudflareSpeedTest](https://github.com/XIU2/CloudflareSpeedTest) | Cloudflare 优选 IP 测速引擎（GPL-3.0） |
| [Cloudflare](https://www.cloudflare.com/) | 官方网段数据与测速节点 |
| [OpenWrt](https://openwrt.org/) | ipk 打包与 procd 服务规范 |

> 感谢以上开源项目的作者与社区贡献者。
