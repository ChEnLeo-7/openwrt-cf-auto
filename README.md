<div align="center">

# cf-auto

**Self-updating Cloudflare preferred-IP source for EdgeTunnel — running entirely on your OpenWrt router.**

运行在 OpenWRT 路由器上的 Cloudflare 优选 IP 自动化面板：定时实测 → 自动筛选 → 上传 Gist → 订阅即时可用。

[![version](https://img.shields.io/badge/version-0.1.0-4f8cff)](#-安装)
[![platform](https://img.shields.io/badge/platform-OpenWrt%2023.05%2B-00b3a4)](#-安装)
[![arch](https://img.shields.io/badge/arch-x86_64%20%7C%20aarch64-8a63ff)](#-安装)
[![engine](https://img.shields.io/badge/engine-CloudflareSpeedTest%20v2.3.5-ffb454)](#-引擎说明)
[![license](https://img.shields.io/badge/license-MIT-3fcf8e)](#-许可)

</div>

---

## 这是什么

EdgeTunnel / WorkerVless2sub 类方案都依赖"优选 IP"，而市面上公开的优选 API 测的是**别人家网络**的速度。cf-auto 把测速环节搬回你自己的路由器：

```text
优选订阅源 → 拉取候选 IP → 本机实测（真实线路） → 合并筛选 Top 节点
    → 自动上传 Gist → EdgeTunnel 面板作为自定义优选源 → 订阅自动更新
```

一轮完整优选在你自己的线路上完成，测出来的延迟就是**你**的延迟。

## 特性

- **三档独立调度**：小时档（纯延迟快扫）/ 夜间档（下载带宽深测）/ 区域档（HTTPing + `-cfcolo` 按真实落地机房定向，比地区标注诚实得多）
- **合并 + 衰减淘汰**：新冠军保序进前排，老上榜 IP 仍达标则保留靠后，连续落榜才淘汰——节点池平滑演进，订阅端不会大起大落
- **多端口测速**：443 / 8443 / 2053 / 自定义端口任选，每端口独立一轮
- **Web 管理面板**：局域网访问 `:7800`，参数可视化调整、即时运行、日志实时查看，无任何外部依赖
- **Gist 自动上传**：结果自动更新到你的 GitHub Gist，附"获取 Token"三步教程；支持经代理访问 GitHub API
- **一键引擎升级**：面板内检查/升级 CloudflareSpeedTest，自动备份回滚
- **ipk 一键安装**：x86_64 / aarch64 双架构，procd 开机自启

## 安装

```sh
# x86_64 路由器（软路由）
opkg install cf-auto_0.1.0_x86_64.ipk
# ARM64 设备（N1 盒子等）
opkg install cf-auto_0.1.0_aarch64.ipk
```

安装即注册 procd 服务并开机自启，面板地址：`http://路由器IP:7800`

```sh
/etc/init.d/cf-auto start|stop|restart|enable|disable
```

> 依赖仅 `ca-bundle`（GitHub API TLS），opkg 自动处理。

## 快速上手

1. **测速设置** — 粘贴你的优选订阅源（每行一个 URL），勾选测速端口，保存
2. **GitHub 与 Gist** — 填入 Token / Gist ID / 目标文件名，点"验证连接"
3. **仪表盘** — 小时档"立即运行"，观察日志与结果表
4. **接入订阅** — 把 Gist raw 地址填进 EdgeTunnel 后台的自定义优选源：

   ```text
   https://gist.githubusercontent.com/<用户>/<GistID>/raw/CF-Auto-Top.txt
   ```

## 获取 GitHub Token（三步）

1. 登录 GitHub → 右上角头像 → **Settings**
2. 左栏底部 **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
3. Expiration 选长期，**唯一勾选 `gist`**（权限最小化）→ Generate → 复制 `ghp_` 开头 Token

> Token 仅保存在路由器本地（配置文件权限 0600），只用于读写你自己的 Gist。

## 三档调度

| 档位 | 用途 | 测试内容 | 流量 |
|---|---|---|---|
| 小时档 | 常态保鲜 | TCP 延迟（`-dd` 关下载测速） | ≈0 |
| 夜间档 | 带宽精选 | 延迟 + 逐 IP 下载测速（时长/数量可调） | 约 100-300MB/晚 |
| 区域档 | 落地机房定向 | HTTPing + `-cfcolo SIN,NRT,KIX,HKG…` | ≈0 |

## 结果更新策略

采用**合并 + 衰减淘汰**，而非每轮整文件覆盖：

- 本轮新冠军按排名进前排
- 老上榜 IP 本轮仍达标 → 保留并后移；未达标 → 落榜计数 +1
- 连续 N 轮（默认 3，可调）落榜才移除；结果行数上限可调（默认 25）

账本状态内嵌在结果文件头部注释中，路由器重装后拷贝文件即可恢复。

## 目录结构

```text
/usr/bin/cf-auto-panel      Go 面板后端（Web UI 嵌入式编译）
/usr/bin/cfst               CloudflareSpeedTest 引擎
/etc/cf-auto/config.json    配置文件（权限 0600）
/etc/init.d/cf-auto         procd 服务脚本
/tmp/cfauto/                运行时临时文件（重启清空）
```

## 引擎说明

测速引擎为 [XIU2/CloudflareSpeedTest](https://github.com/XIU2/CloudflareSpeedTest) v2.3.5（GPL-3.0），
以独立二进制方式捆绑调用，不修改其源码；许可全文见包内 `/usr/share/doc/cf-auto/CFST-LICENSE`。
首次构建时 `build.ps1` 会自动从 GitHub Releases 拉取对应架构的二进制。

## 注意事项

- 测速从路由器本机直连发起（不经过 OpenClash），反映线路真实质量
- GitHub 对 Gist raw 内容有缓存，EdgeTunnel 侧生效存在约 1 小时延迟属正常
- GitHub API 直连不通时，面板"GitHub 代理"填入本机 OpenClash 混合端口即可
- 刷机/重装后配置在 `/etc/cf-auto/config.json`，注意备份

## 构建

```powershell
.\build.ps1 -Version 0.1.0    # 自动交叉编译双架构并产出 ipk
```

## 许可

本项目代码以 [MIT](LICENSE) 发布；捆绑的 CloudflareSpeedTest 引擎遵循其自身的 GPL-3.0 许可。
