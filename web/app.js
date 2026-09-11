"use strict";
const $ = (id) => document.getElementById(id);
const COMMON_PORTS = [443, 8443, 2053, 2083, 2087, 2096];
const COMMON_COLOS = ["SIN", "NRT", "KIX", "HKG", "LAX", "SJC", "SEA", "FRA"];
let customPorts = [], customColos = [];
let logNext = -1;
let tokenSaved = false;

const I18N = {
  zh: {
    "tab.dash":"概览","tab.cfg":"优选设置","tab.gist":"GitHub","tab.logs":"日志",
    "dash.run":"开始优选","dash.reupload":"重传结果","dash.results":"最近优选结果","dash.empty":"尚无结果 — 点击「开始优选」运行一轮。","dash.engine_h":"引擎升级",
    "card.version":"程序版本","card.engine":"测速引擎","card.schedule":"定时更新","card.gist":"Gist",
    "tbl.idx":"#","tbl.node":"节点","tbl.region":"地区","tbl.latency":"延迟","tbl.bandwidth":"带宽",
    "eng.current":"当前","eng.latest":"最新","eng.check":"检查更新","eng.update":"升级引擎","eng.autoupdate":"自动安装程序更新","eng.autoupdate_hint":"打开面板时自动检测一次，发现新版本弹出双语说明","app.check":"检查程序更新",
    "cfg.method_h":"优选方式","method.latency":"按延迟优选","method.bandwidth":"按带宽优选",
    "method.hint.latency":"对候选 IP 做 TCP 延迟测试，速度最快、几乎零流量。","method.hint.bandwidth":"对延迟达标的候选逐个下载测速，按带宽排序（会产生测速流量）。",
    "cfg.source_h":"优选来源","source.custom":"自定义优选源","source.official":"CF 官方网段","source.community":"社区精选库","source.ph":"每行一个优选 URL","source.hint":"拉取各来源后合并去重，再从你的线路进行二次优选。","source.official_note":"实时获取 Cloudflare 官方 IPv4 网段，与 CloudflareSpeedTest 默认方式一致。覆盖最全，但单轮耗时更长。","cfg.community_isp":"运营商","isp.auto":"自动检测","isp.ct":"电信","isp.cu":"联通","isp.cmcc":"移动","isp.cf":"通用","community.hint":"从 cmliu/CF-CIDR 社区实测库按运营商拉取精选网段，候选少、测速快、命中率高，但覆盖不全 — 建议与 CF 官方网段互补使用。",
    "cfg.region_h":"区域定向（真实落地机房）","cfg.region_en":"启用区域过滤","cfg.colo_ph":"输入代码，或 CODE|名称（如 SIN|新加坡）","cfg.add":"添加","cfg.region_hint":"可单选或多选；每个地区独立测速。按钮显示“代码 | 地区”解释，未知代码也可自定义名称。","cfg.min_region":"每地区最少上榜数",
    "cfg.ports_h":"测速端口","cfg.port_ph":"自定义端口","cfg.policy_h":"结果策略","cfg.topn":"本轮 TopN","cfg.maxlines":"结果行数上限","cfg.miss":"连续落榜淘汰轮数",
    "rmode.overwrite":"覆盖更新","rmode.merge":"融合更新","rmode.hint.overwrite":"每轮把最新结果整理成独立 txt 直接覆盖整个文件 — 节点池完全跟随最新实测。","rmode.hint.merge":"新结果与旧榜融合：老 IP 仍达标则保留靠后，连续落榜才淘汰 — 节点池平滑演进。",
    "cfg.tag_h":"节点信息模板","cfg.tag_sub":"# 后显示内容","cfg.tag_ph":"cf-auto | {region} | {latency}ms | {speed}","cfg.tag_hint":"变量：{region} 地区代码 · {latency} 延迟 · {speed} 带宽（自带 MB/s）· {date} 日期。空段自动省略。",
    "cfg.params_h":"CloudflareSpeedTest 参数","cfg.tl":"平均延迟上限 -tl (ms)","cfg.tll":"平均延迟下限 -tll (ms)","cfg.dn":"下载测速数量 -dn","cfg.dt":"单 IP 测速时长 -dt (秒)","cfg.url":"下载测速地址","cfg.extra":"高级附加参数","cfg.extra_ph":"原样追加，如 -t 200",
    "cfg.httping":"HTTP 模式测速（-httping）","cfg.httping_hint":"用 HTTP 请求代替 TCP 连接测延迟。若你的路由器 TCP 直连 Cloudflare 全部超时（表现为 0 达标），请打开此开关。",
    "cfg.sched_h":"定时更新","cfg.sched_en":"自动优选并更新 Gist","cfg.sched_int":"更新间隔（小时）","cfg.sched_hint":"到点按当前优选方式、来源、地区和端口执行完整一轮。","cfg.appupdate_h":"程序更新","cfg.appupdate_hint":"打开面板时自动检测一次更新，发现新版本会弹出双语 Release 说明。","cfg.save":"保存设置",
    "gist.h":"Gist 自动上传","gist.token":"GitHub Token","gist.token_ph":"ghp_ 开头经典 Token（留空表示不修改）","gist.token_saved_ph":"已保存（留空 = 不修改）","gist.id":"Gist ID","gist.file":"目标文件名","gist.proxy":"GitHub 代理（可选）","gist.proxy_ph":"http://127.0.0.1:7890","gist.save":"保存","gist.verify":"验证连接",
    "tut.title":"如何获取 GitHub Token（三步）","tut.s1":"登录 GitHub → 头像 → Settings。","tut.s2":"Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)。","tut.s3":"选择有效期，只勾选 gist，生成后复制 ghp_ 开头的 Token。","tut.gistid":"Gist ID 位于 gist 页面 URL：gist.github.com/用户名/ID。",
    "logs.auto":"自动刷新","logs.copy":"复制日志","logs.export":"导出 txt","logs.clear":"清空日志","logs.confirm_clear":"确认清空？","logs.copied":"已复制 ✓","footer":"cf-auto · CloudflareSpeedTest (GPL-3.0) · MIT",
    "status.configured":"已配置","status.unconfigured":"未配置","status.running":"运行中","status.idle":"空闲","status.closed":"已关闭","status.every":"每 {h} 小时","status.last":"上次","status.next":"下次","status.never":"从未（启动后自动首跑）","status.backend_fail":"后端连接失败",
    "status.run_main":"优选运行中","status.run_sub":"正在实测候选 IP，完成后自动更新 Gist","status.wait_main":"待机中 · 定时更新已开启","status.off_main":"空闲 · 定时更新未开启","status.off_sub":"可在下方手动开始优选",
    "msg.saved":"已保存 ✓","msg.save_fail":"保存失败：","msg.checking":"检查中…","msg.latest":"已是最新版 ✓","msg.engine_upgrade":"可升级：{a} → {b}","msg.reupload_ok":"重传成功","msg.reupload_fail":"重传失败：","msg.run_fail":"触发失败：","msg.engine_confirm":"确认下载并替换测速引擎？失败会自动回滚。","msg.upgrading":"升级中…","msg.upgraded":"已升级到 {v} ✓",
    "theme.title":"切换浅色 / 深色","rel.title":"发现新版本 {v}","rel.goto":"查看 Release","rel.install":"立即更新","rel.skip":"忽略此版本","rel.none":"当前已是最新版本","rel.check_fail":"程序更新检查失败：","rel.installing":"正在下载并安装，服务将自动重启…","rel.autostarted":"已自动开始更新，服务将在几秒后重启"
  },
  en: {
    "tab.dash":"Overview","tab.cfg":"Optimization","tab.gist":"GitHub","tab.logs":"Logs",
    "dash.run":"Start optimization","dash.reupload":"Re-upload","dash.results":"Latest results","dash.empty":"No results yet — click “Start optimization” to run once.","dash.engine_h":"Engine update",
    "card.version":"App version","card.engine":"Test engine","card.schedule":"Scheduled update","card.gist":"Gist",
    "tbl.idx":"#","tbl.node":"Endpoint","tbl.region":"Region","tbl.latency":"Latency","tbl.bandwidth":"Bandwidth",
    "eng.current":"Current","eng.latest":"Latest","eng.check":"Check","eng.update":"Update engine","eng.autoupdate":"Auto-install app updates","eng.autoupdate_hint":"Checks once when the panel opens; shows a dialog if a new version is found.","app.check":"Check app update",
    "cfg.method_h":"Optimization method","method.latency":"Optimize for latency","method.bandwidth":"Optimize for bandwidth",
    "method.hint.latency":"Runs TCP latency tests against candidate IPs. Fast and nearly traffic-free.","method.hint.bandwidth":"Downloads a test file through qualified candidates and ranks them by throughput.",
    "cfg.source_h":"Candidate source","source.custom":"Custom preferred-IP URLs","source.official":"Official CF ranges","source.community":"Community ranges","source.ph":"One preferred-IP URL per line","source.hint":"Fetch, merge, and deduplicate public candidates, then re-test them from your own network.","source.official_note":"Fetches current Cloudflare IPv4 ranges, matching CloudflareSpeedTest's default workflow. Complete but slower.","cfg.community_isp":"ISP","isp.auto":"Auto-detect","isp.ct":"Telecom","isp.cu":"Unicom","isp.cmcc":"CMCC","isp.cf":"General","community.hint":"Pulls ISP-specific curated ranges from the cmliu/CF-CIDR community library. Small, fast, high hit-rate, but incomplete coverage — a good complement to official CF ranges.",
    "cfg.region_h":"Region targeting (real edge colo)","cfg.region_en":"Enable region filtering","cfg.colo_ph":"Enter CODE or CODE|Name, e.g. SIN|Singapore","cfg.add":"Add","cfg.region_hint":"Select one or more colos; each is tested separately. Buttons show “code | location”; unknown codes may have custom names.","cfg.min_region":"Minimum results per region",
    "cfg.ports_h":"Test ports","cfg.port_ph":"Custom port","cfg.policy_h":"Result policy","cfg.topn":"Top N this run","cfg.maxlines":"Maximum result lines","cfg.miss":"Misses before eviction",
    "rmode.overwrite":"Overwrite","rmode.merge":"Merge","rmode.hint.overwrite":"Each run rebuilds a fresh file from the latest results and overwrites the board — the pool always mirrors the newest test.","rmode.hint.merge":"New results merge with the previous board: qualified old IPs stay behind the new ones and are evicted only after repeated misses — smooth evolution.",
    "cfg.tag_h":"Node label template","cfg.tag_sub":"text after #","cfg.tag_ph":"cf-auto | {region} | {latency}ms | {speed}","cfg.tag_hint":"Variables: {region}, {latency}, {speed} (includes MB/s), and {date}. Empty segments are removed.",
    "cfg.params_h":"CloudflareSpeedTest parameters","cfg.tl":"Maximum average latency -tl (ms)","cfg.tll":"Minimum average latency -tll (ms)","cfg.dn":"Download test count -dn","cfg.dt":"Test duration per IP -dt (seconds)","cfg.url":"Download test URL","cfg.extra":"Advanced extra arguments","cfg.extra_ph":"Passed through as-is, e.g. -t 200",
    "cfg.httping":"HTTP-mode latency test (-httping)","cfg.httping_hint":"Measures latency with HTTP requests instead of TCP connects. Enable this if direct TCP connections to Cloudflare all time out on your router (shown as 0 qualified).",
    "cfg.sched_h":"Scheduled update","cfg.sched_en":"Automatically optimize and update Gist","cfg.sched_int":"Update interval (hours)","cfg.sched_hint":"Runs a full optimization using the current method, source, regions, and ports.","cfg.appupdate_h":"Application updates","cfg.appupdate_hint":"Checks for updates automatically each time the panel opens; a bilingual notes dialog appears when a new version is found.","cfg.save":"Save settings",
    "gist.h":"Automatic Gist upload","gist.token":"GitHub token","gist.token_ph":"Classic ghp_ token (leave blank to keep current)","gist.token_saved_ph":"Saved (leave blank to keep it)","gist.id":"Gist ID","gist.file":"Target filename","gist.proxy":"GitHub proxy (optional)","gist.proxy_ph":"http://127.0.0.1:7890","gist.save":"Save","gist.verify":"Verify connection",
    "tut.title":"Get a GitHub token in three steps","tut.s1":"Sign in to GitHub → avatar → Settings.","tut.s2":"Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic).","tut.s3":"Choose an expiration, select only gist, generate it, and copy the ghp_ token.","tut.gistid":"The Gist ID is in the URL: gist.github.com/username/ID.",
    "logs.auto":"Auto refresh","logs.copy":"Copy log","logs.export":"Export txt","logs.clear":"Clear log","logs.confirm_clear":"Confirm clear?","logs.copied":"Copied ✓","footer":"cf-auto · CloudflareSpeedTest (GPL-3.0) · MIT",
    "status.configured":"Configured","status.unconfigured":"Not configured","status.running":"Running","status.idle":"Idle","status.closed":"Disabled","status.every":"Every {h} hours","status.last":"Last","status.next":"Next","status.never":"Never (first run starts automatically)","status.backend_fail":"Backend unavailable",
    "status.run_main":"Optimization running","status.run_sub":"Testing candidate IPs; Gist updates automatically when finished","status.wait_main":"Standing by · scheduled updates on","status.off_main":"Idle · scheduled updates off","status.off_sub":"Start an optimization manually below",
    "msg.saved":"Saved ✓","msg.save_fail":"Save failed: ","msg.checking":"Checking…","msg.latest":"Already up to date ✓","msg.engine_upgrade":"Update available: {a} → {b}","msg.reupload_ok":"Re-upload complete","msg.reupload_fail":"Re-upload failed: ","msg.run_fail":"Failed to start: ","msg.engine_confirm":"Download and replace the test engine? Failures automatically roll back.","msg.upgrading":"Updating…","msg.upgraded":"Updated to {v} ✓",
    "theme.title":"Switch light / dark","rel.title":"New version {v} available","rel.goto":"View Release","rel.install":"Update now","rel.skip":"Ignore this version","rel.none":"You are up to date","rel.check_fail":"App update check failed: ","rel.installing":"Downloading and installing; the service will restart automatically…","rel.autostarted":"Auto-update started; the service will restart shortly"
  }
};

let LANG = localStorage.getItem("cf-lang") || (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
const COLO_NAMES = {
  zh: {SIN:"新加坡",NRT:"东京",HND:"东京羽田",KIX:"大阪",HKG:"香港",TPE:"台北",ICN:"首尔",LAX:"洛杉矶",SJC:"圣何塞",SFO:"旧金山",SEA:"西雅图",ORD:"芝加哥",DFW:"达拉斯",MIA:"迈阿密",JFK:"纽约",YYZ:"多伦多",LHR:"伦敦",CDG:"巴黎",AMS:"阿姆斯特丹",FRA:"法兰克福",MUC:"慕尼黑",MAD:"马德里",MXP:"米兰",ARN:"斯德哥尔摩",WAW:"华沙",IST:"伊斯坦布尔",DXB:"迪拜",BOM:"孟买",DEL:"德里",BKK:"曼谷",KUL:"吉隆坡",MNL:"马尼拉",GRU:"圣保罗"},
  en: {SIN:"Singapore",NRT:"Tokyo",HND:"Tokyo Haneda",KIX:"Osaka",HKG:"Hong Kong",TPE:"Taipei",ICN:"Seoul",LAX:"Los Angeles",SJC:"San Jose",SFO:"San Francisco",SEA:"Seattle",ORD:"Chicago",DFW:"Dallas",MIA:"Miami",JFK:"New York",YYZ:"Toronto",LHR:"London",CDG:"Paris",AMS:"Amsterdam",FRA:"Frankfurt",MUC:"Munich",MAD:"Madrid",MXP:"Milan",ARN:"Stockholm",WAW:"Warsaw",IST:"Istanbul",DXB:"Dubai",BOM:"Mumbai",DEL:"Delhi",BKK:"Bangkok",KUL:"Kuala Lumpur",MNL:"Manila",GRU:"São Paulo"}
};
let customColoNames = {};
const t = (key) => (I18N[LANG] && I18N[LANG][key]) || I18N.zh[key] || key;
const fmt = (key, values={}) => Object.entries(values).reduce((s,[k,v]) => s.replaceAll("{"+k+"}",v), t(key));
const coloLabel = (code) => {
  const name = customColoNames[code] || COLO_NAMES[LANG][code] || "";
  return name ? `${code} | ${name}` : code;
};

/* ================= 主题切换 ================= */
const themeBtn = $("theme-toggle");
const langBtn = $("lang-toggle");
function themeIcon() {
  themeBtn.textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾";
  themeBtn.title = t("theme.title");
}
function applyI18n() {
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = t(el.dataset.i18nPh));
  langBtn.textContent = LANG === "zh" ? "EN" : "中文";
  if (tokenSaved) $("cfg-g-token").placeholder = t("gist.token_saved_ph");
  themeIcon();
  updateMethodHint();
  updateResultmodeHint();
  rerenderChips();
  renderLog();
  refreshStatus();
  refreshResults();
}
themeBtn.onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("cf-theme", next);
  themeIcon();
};
langBtn.onclick = () => {
  LANG = LANG === "zh" ? "en" : "zh";
  localStorage.setItem("cf-lang", LANG);
  applyI18n();
};

/* ================= 标签页 ================= */
document.querySelectorAll(".seg-item").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".seg-item").forEach(b => b.classList.remove("on"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("on");
    $("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "logs") refreshLogs(true);
  };
});

function msg(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  el.className = "msg " + (ok === true ? "ok" : ok === false ? "err" : "");
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 6000);
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}

/* ================= 状态 ================= */
async function refreshStatus() {
  try {
    const s = await api("/api/status");
    $("st-version").textContent = "v" + s.version;
    $("st-engine").textContent = s.engine;
    $("st-gist").textContent = s.gist_configured ? t("status.configured") : t("status.unconfigured");
    $("st-gist").style.color = s.gist_configured ? "" : "var(--txt3)";
    const sc = s.schedule;
    $("st-sched").textContent = sc.enabled
      ? fmt("status.every", {h: sc.interval_hours}) + (sc.running ? " · " + t("status.running") : "")
      : t("status.closed");
    $("hdr-status").textContent = `v${s.version} · ${s.busy ? t("status.running") : t("status.idle")}`;
    $("btn-run").disabled = s.busy;
    const last = sc.last_run || t("status.never");
    $("run-meta").textContent = sc.enabled
      ? `${t("status.last")}: ${last} · ${t("status.next")}: ${sc.next_run}`
      : `${t("status.last")}: ${last} · ${t("status.closed")}`;
    const banner = $("run-status");
    banner.classList.toggle("running", s.busy);
    banner.classList.toggle("idle", !s.busy);
    if (s.busy) {
      $("status-main").textContent = t("status.run_main");
      $("status-sub").textContent = t("status.run_sub");
    } else if (sc.enabled) {
      $("status-main").textContent = t("status.wait_main");
      $("status-sub").textContent = `${fmt("status.every", {h: sc.interval_hours})} · ${t("status.next")}: ${sc.next_run}`;
    } else {
      $("status-main").textContent = t("status.off_main");
      $("status-sub").textContent = t("status.off_sub");
    }
  } catch (e) { $("hdr-status").textContent = t("status.backend_fail"); }
}
setInterval(refreshStatus, 5000);

/* ================= 结果表 ================= */
function renderResults(r) {
  const tb = $("result-table").querySelector("tbody");
  tb.innerHTML = "";
  const entries = r.entries || [];
  $("result-meta").textContent = entries.length
    ? `${r.time} · ${r.tested_n} IPs · +${r.added} ~${r.kept} −${r.dropped}`
    : "";
  if (!entries.length) {
    $("result-empty").style.display = "";
    return;
  }
  $("result-empty").style.display = "none";
  entries.forEach((e, i) => {
    const tr = document.createElement("tr");
    const reg = e.region ? `<span class="reg">${coloLabel(e.region)}</span>` : '<span class="dim">—</span>';
    const lat = e.latency > 0 ? e.latency.toFixed(0) + " ms" : '<span class="dim">—</span>';
    const spd = e.speed > 0 ? e.speed.toFixed(1) + " MB/s" : '<span class="dim">—</span>';
    tr.innerHTML = `<td class="dim">${i + 1}</td><td class="mono">${e.ep}</td><td>${reg}</td><td>${lat}</td><td>${spd}</td>`;
    tb.appendChild(tr);
  });
}
async function refreshResults() {
  try { renderResults(await api("/api/results")); } catch (e) { /* ignore */ }
}
setInterval(refreshResults, 8000);

/* ================= 日志英文转译（切换语言时对近期日志重渲染） ================= */
const LOG_EN = [
  [/======== 优选开始（方式 (\S+) \/ 来源 (\S+)）========/g, "======== Run started (method $1 / source $2) ========"],
  [/======== 优选完成：上榜 (\d+)（新增 (\d+) 保留 (\d+) 淘汰 (\d+)）耗时 (\S+) ========/g,
   "======== Run completed: listed $1 (added $2, kept $3, dropped $4) took $5 ========"],
  [/======== 优选开始/g, "======== Run started"],
  [/======== 优选完成/g, "======== Run completed"],
  [/优选异常结束[:：]?/g, "Run failed: "],
  [/cf-auto (v[\d.]+) 启动 \| 配置[:：](\S+) \| 面板[:：](\S+) \| 引擎[:：](\S+) \(([^)]+)\)/g,
   "cf-auto $1 started | config: $2 | panel: $3 | engine: $4 ($5)"],
  [/\[定时更新\] 到期，自动触发（间隔 (\d+) 小时）/g, "[Scheduler] due, auto-triggered (interval $1 h)"],
  [/\[配置\] 已更新：方式 (\S+) \/ 来源 (\S+) \/ 源 (\d+) 个 \/ 端口 (\[[^\]]*\]) \/ 地区过滤 (\S+) \/ Top(\d+)/g,
   "[Config] updated: method $1 / source $2 / $3 sources / ports $4 / region filter $5 / Top$6"],
  [/\[候选池\] 拉取失败/g, "[Pool] fetch failed"],
  [/(\d+) 个源成功，去重后 (\d+) 个候选 IP/g, "$1 sources fetched, deduped to $2 candidate IPs"],
  [/Cloudflare 官方网段获取成功[:：](\d+) 个 CIDR/g, "official Cloudflare ranges fetched: $1 CIDRs"],
  [/在线获取官方网段失败，使用内嵌快照/g, "official ranges fetch failed; using embedded snapshot"],
  [/\[引擎\] 端口 (\d+) 机房 (\S+) 模式 (\S+) 启动 cfst/g, "[Engine] port $1 colo $2 mode $3 starting cfst"],
  [/\[引擎\] 端口 (\d+) 模式 (\S+) 启动 cfst/g, "[Engine] port $1 mode $2 starting cfst"],
  [/端口 (\d+) 解析到 (\d+) 条有效结果/g, "port $1 parsed $2 valid results"],
  [/\[引擎\] 端口 (\d+) 机房 (\S+) 测速失败/g, "[Engine] port $1 colo $2 test failed"],
  [/\[区域\] 端口 (\d+) 机房 (\S+) 本轮 0 达标（本线路可能不路由到 \S+），跳过/g, "[Region] port $1 colo $2: 0 qualified this round (this line may not route to $3); skipped"],
  [/\[区域\] 端口 (\d+) 本轮 0 达标（阈值过严或线路不通），跳过/g, "[Region] port $1: 0 qualified this round (thresholds too strict or line blocked); skipped"],
  [/本轮 0 达标/g, "0 qualified this round"],
  [/测速超时被终止/g, "test aborted by timeout"],
  [/cfst 退出异常/g, "cfst exited abnormally"],
  [/打开结果 CSV 失败/g, "failed to open result CSV"],
  [/测速引擎不存在/g, "test engine missing"],
  [/测速引擎正忙，请稍后再试/g, "test engine is busy, try again shortly"],
  [/所有优选源均拉取失败/g, "all preferred sources failed to fetch"],
  [/本轮无任何有效测速结果（候选池、阈值或机房过滤过严？）/g, "no valid results this round (empty pool, or thresholds/colo filter too strict?)"],
  [/优选源列表为空，请先在面板配置（或切换为 CF 官方源模式）/g, "source list is empty; configure it in the panel or switch to official CF ranges"],
  [/优选完成但上传失败/g, "optimization finished but upload failed"],
  [/\[Gist\] 已上传 (\S+) \((\d+) 行\)/g, "[Gist] uploaded $1 ($2 lines)"],
  [/\[Gist\] 上传失败/g, "[Gist] upload failed"],
  [/\[Gist\] 读取现有结果失败（将全新开始）/g, "[Gist] failed to read existing result (starting fresh)"],
  [/\[Gist\] 未配置 Token\/GistID，结果仅保存在本地/g, "[Gist] token/GistID not set; result saved locally only"],
  [/\[Gist\] 手动重传 (\S+) 成功/g, "[Gist] manual re-upload of $1 succeeded"],
  [/\[程序更新\] 已下载 (\S+)，将在 2 秒后安装并重启服务/g, "[App update] downloaded $1; installing in 2 s, service will restart"],
  [/\[程序更新\] 自动更新失败/g, "[App update] auto-update failed"],
  [/\[引擎升级\] 当前 (\S+)，查询最新版/g, "[Engine update] current $1, checking latest…"],
  [/\[引擎升级\] 已是最新版 (\S+)/g, "[Engine update] already up to date $1"],
  [/\[引擎升级\] 直连下载失败，尝试 gh-proxy 加速/g, "[Engine update] direct download failed, retrying via gh-proxy"],
  [/\[引擎升级\] 备份旧引擎失败/g, "[Engine update] failed to back up old engine"],
  [/\[引擎升级\] 安装新引擎失败（已回滚）/g, "[Engine update] failed to install new engine (rolled back)"],
  [/\[引擎升级\] 新引擎校验失败（得到 (\S+)，已回滚）/g, "[Engine update] new engine verification failed (got $1, rolled back)"],
  [/\[引擎升级\] 成功升级到 (\S+)/g, "[Engine update] upgraded to $1"],
  [/\[引擎升级\] 下载失败/g, "[Engine update] download failed"],
  [/\[引擎升级\] 解压失败/g, "[Engine update] extraction failed"],
  [/解压包中未找到 cfst 二进制/g, "cfst binary not found in the archive"],
  [/启动安装失败/g, "failed to start installer"],
  [/查询最新版失败/g, "failed to query latest version"],
  [/已下载 (\S+)，将在 2 秒后安装并重启服务/g, "downloaded $1; installing in 2 s, service will restart"],
  [/(\d+) 条有效结果/g, "$1 valid results"],
  [/机房 (\S+)/g, "colo $1"],
  [/端口 (\d+)/g, "port $1"],
  [/模式 (\S+)/g, "mode $1"],
  [/方式 (\S+)/g, "method $1"],
  [/来源 (\S+)/g, "source $1"],
  [/耗时 (\S+)/g, "took $1"],
  [/上榜 (\d+)/g, "listed $1"],
  [/新增 (\d+)/g, "added $1"],
  [/保留 (\d+)/g, "kept $1"],
  [/淘汰 (\d+)/g, "dropped $1"],
  [/测速失败/g, "test failed"],
  [/上传失败/g, "upload failed"],
  [/下载失败/g, "download failed"],
  [/拉取失败/g, "fetch failed"],
  [/\[候选池\]/g, "[Pool]"],
  [/\[社区库\] 运营商检测: (\S+) \((\w+)\)/g, "[Community] ISP detected: $2 ($1)"],
  [/\[社区库\] 运营商检测失败，使用通用库 \((\w+)\)/g, "[Community] ISP detection failed, using general library ($1)"],
  [/\[社区库\] 使用缓存网段（(\S+)，(\d+) 段）/g, "[Community] using cached ranges ($1, $2)"],
  [/\[社区库\] 直连拉取失败，经代理成功/g, "[Community] direct fetch failed; succeeded via proxy"],
  [/\[社区库\] 在线获取失败，使用内嵌快照/g, "[Community] online fetch failed, using embedded snapshot"],
  [/\[社区库\] 运营商 (\S+) \((\w+)\) → 去重 (\d+) 段/g, "[Community] ISP $2 ($1): $3 deduped ranges"],
  [/\[社区库\] 获取失败（.+?），回退 CF 官方网段/g, "[Community] fetch failed ($1), falling back to official CF ranges"],
  [/\[社区库\]/g, "[Community]"],
  [/\[引擎\]/g, "[Engine]"],
  [/\[配置\]/g, "[Config]"],
  [/\[程序更新\]/g, "[App update]"],
  [/\[引擎升级\]/g, "[Engine update]"],
  [/\[定时更新\]/g, "[Scheduler]"],
];
function zhToEn(line) {
  let out = line;
  for (const [re, rep] of LOG_EN) out = out.replace(re, rep);
  return out;
}

/* ================= 日志 ================= */
let rawLog = [];
function renderLog() {
  const box = $("logbox");
  const lines = rawLog.map(l => LANG === "en" ? zhToEn(l) : l);
  box.textContent = lines.join("\n");
  box.scrollTop = box.scrollHeight;
}
async function refreshLogs(reset) {
  if (reset) { logNext = -1; rawLog = []; }
  try {
    const r = await api("/api/logs?after=" + logNext);
    if (r.lines.length) {
      rawLog.push(...r.lines);
      if (rawLog.length > 800) rawLog = rawLog.slice(-800);
    }
    logNext = r.next;
    if (r.lines.length || reset) renderLog();
  } catch (e) { /* ignore */ }
}
setInterval(() => { if ($("log-auto").checked && $("tab-logs").classList.contains("active")) refreshLogs(false); }, 3000);

function logText() {
  return rawLog.map(l => LANG === "en" ? zhToEn(l) : l).join("\n");
}
function flashBtn(btn, text) {
  const orig = btn.dataset.label || btn.textContent;
  if (!btn.dataset.label) btn.dataset.label = orig;
  btn.textContent = text;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1400);
}
$("btn-log-copy").onclick = async () => {
  const btn = $("btn-log-copy");
  try {
    await navigator.clipboard.writeText(logText());
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = logText();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  flashBtn(btn, t("logs.copied"));
};
$("btn-log-export").onclick = () => {
  const blob = new Blob([logText()], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  a.href = URL.createObjectURL(blob);
  a.download = `cf-auto-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
let clearArm = null;
$("btn-log-clear").onclick = async () => {
  const btn = $("btn-log-clear");
  if (!clearArm) {
    clearArm = setTimeout(() => { clearArm = null; btn.classList.remove("armed"); btn.textContent = btn.dataset.label || t("logs.clear"); }, 3000);
    btn.classList.add("armed");
    btn.textContent = t("logs.confirm_clear");
    return;
  }
  clearTimeout(clearArm); clearArm = null;
  btn.classList.remove("armed");
  btn.textContent = btn.dataset.label || t("logs.clear");
  try {
    await api("/api/logs/clear", { method: "POST" });
    logNext = -1; rawLog = [];
    renderLog();
  } catch (e) { /* ignore */ }
};

/* ================= 分段控件 ================= */
function bindSeg(id, onChange) {
  const box = $(id);
  box.querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      box.querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      if (onChange) onChange(b.dataset.v);
    };
  });
}
function updateMethodHint() {
  const selected = document.querySelector("#seg-method button.on");
  $("method-hint").textContent = t(selected && selected.dataset.v === "bandwidth" ? "method.hint.bandwidth" : "method.hint.latency");
}
function applyMethodVisibility(method) {
  document.querySelectorAll(".bw-only").forEach(el => el.classList.toggle("hide", method !== "bandwidth"));
}
function updateResultmodeHint() {
  const selected = document.querySelector("#seg-resultmode button.on");
  const merge = selected && selected.dataset.v === "merge";
  $("resultmode-hint").textContent = t(merge ? "rmode.hint.merge" : "rmode.hint.overwrite");
  $("lbl-miss").classList.toggle("hide", !merge);
}
bindSeg("seg-method", v => { updateMethodHint(); applyMethodVisibility(v); });
bindSeg("seg-resultmode", updateResultmodeHint);
bindSeg("seg-source", v => {
  $("src-custom").classList.toggle("hide", v !== "custom");
  $("src-official").classList.toggle("hide", v !== "official");
  $("src-community").classList.toggle("hide", v !== "community");
});
bindSeg("seg-isp");

/* ================= 端口 / 地区 chips ================= */
function renderChips(boxId, list, selected, removable) {
  const box = $(boxId);
  box.innerHTML = "";
  const extras = boxId === "cfg-ports" ? customPorts : customColos;
  [...new Set([...list, ...extras])].forEach(item => {
    const chip = document.createElement("span");
    chip.className = "chip" + (selected.includes(item) ? " on" : "");
    chip.textContent = boxId === "cfg-colos" ? coloLabel(item) : item;
    if (removable && !COMMON_PORTS.includes(item) && !COMMON_COLOS.includes(item)) {
      const x = document.createElement("span");
      x.className = "x"; x.textContent = " ✕"; chip.appendChild(x);
    }
    chip.onclick = (ev) => {
      if (ev.target.classList.contains("x")) {
        if (boxId === "cfg-ports") customPorts = customPorts.filter(x => x !== item);
        else customColos = customColos.filter(x => x !== item);
        selected = selected.filter(x => x !== item);
        renderChips(boxId, list, selected, removable);
        return;
      }
      const i = selected.indexOf(item);
      if (i >= 0) selected.splice(i, 1); else selected.push(item);
      chip.classList.toggle("on");
    };
    box.appendChild(chip);
  });
  box._selected = selected;
}

function rerenderChips() {
  if ($("cfg-ports")._selected) renderChips("cfg-ports", COMMON_PORTS, $("cfg-ports")._selected, true);
  if ($("cfg-colos")._selected) renderChips("cfg-colos", COMMON_COLOS, $("cfg-colos")._selected, true);
}

$("btn-add-port").onclick = () => {
  const p = +$("cfg-port-custom").value;
  if (!p || p < 1 || p > 65535) return;
  if (!COMMON_PORTS.includes(p) && !customPorts.includes(p)) customPorts.push(p);
  if (!($("cfg-ports")._selected || []).includes(p)) $("cfg-ports")._selected.push(p);
  $("cfg-port-custom").value = "";
  renderChips("cfg-ports", COMMON_PORTS, $("cfg-ports")._selected, true);
};

$("btn-add-colo").onclick = () => {
  const raw = $("cfg-colo-custom").value.trim();
  if (!raw) return;
  const parts = raw.split("|");
  const code = parts.shift().trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const name = parts.join("|").trim();
  if (!code) return;
  if (!COMMON_COLOS.includes(code) && !customColos.includes(code)) customColos.push(code);
  if (name) {
    customColoNames[code] = name;
  }
  const selected = $("cfg-colos")._selected || [];
  if (!selected.includes(code)) selected.push(code);
  $("cfg-colo-custom").value = "";
  renderChips("cfg-colos", COMMON_COLOS, selected, true);
};

/* ================= 配置 ================= */
function fillConfig(c) {
  document.querySelectorAll("#seg-method button").forEach(b => b.classList.toggle("on", b.dataset.v === c.method));
  updateMethodHint();
  document.querySelectorAll("#seg-source button").forEach(b => b.classList.toggle("on", b.dataset.v === c.source_mode));
  applyMethodVisibility(c.method);
  document.querySelectorAll("#seg-resultmode button").forEach(b => b.classList.toggle("on", (c.result_mode || "overwrite") === b.dataset.v));
  updateResultmodeHint();
  $("src-custom").classList.toggle("hide", c.source_mode !== "custom");
  $("src-official").classList.toggle("hide", c.source_mode !== "official");
  $("src-community").classList.toggle("hide", c.source_mode !== "community");
  document.querySelectorAll("#seg-isp button").forEach(b => b.classList.toggle("on", b.dataset.v === ((c.community && c.community.isp) || "auto")));
  $("cfg-sources").value = (c.sources || []).join("\n");
  customPorts = (c.ports || []).filter(p => !COMMON_PORTS.includes(p));
  renderChips("cfg-ports", COMMON_PORTS, [...(c.ports || [])], true);
  $("cfg-region-en").checked = c.region.enabled;
  $("region-box").classList.toggle("hide", !c.region.enabled);
  customColos = (c.region.colos || []).filter(x => !COMMON_COLOS.includes(x));
  customColoNames = c.region.names || {};
  renderChips("cfg-colos", COMMON_COLOS, [...(c.region.colos || [])], true);
  $("cfg-min-region").value = c.region.min_per_region;
  $("cfg-topn").value = c.top_n;
  $("cfg-maxlines").value = c.max_lines;
  $("cfg-miss").value = c.miss_limit;
  $("cfg-tag").value = c.tag_template;
  $("cfg-sched-en").checked = c.schedule.enabled;
  $("cfg-sched-int").value = c.schedule.interval_hours;
  $("cfg-autoupdate").checked = !!(c.app_update && c.app_update.auto_install);
  $("cfg-cf-tl").value = c.cfst.tl;
  $("cfg-cf-tll").value = c.cfst.tll;
  $("cfg-cf-dn").value = c.cfst.dn;
  $("cfg-cf-dt").value = c.cfst.dt;
  $("cfg-cf-url").value = c.cfst.url;
  $("cfg-cf-httping").checked = !!c.cfst.httping;
  $("cfg-cf-extra").value = c.cfst.extra_args || "";
  tokenSaved = !!c.token_set;
  $("cfg-g-token").placeholder = tokenSaved ? t("gist.token_saved_ph") : t("gist.token_ph");
  $("cfg-g-id").value = c.gist.id;
  $("cfg-g-file").value = c.gist.filename;
  $("cfg-g-proxy").value = c.gist.proxy_url || "";
}

function collectCfg() {
  return {
    sources: $("cfg-sources").value.split("\n").map(s => s.trim()).filter(s => s.startsWith("http")),
    ports: $("cfg-ports")._selected || [],
    method: document.querySelector("#seg-method button.on").dataset.v,
    source_mode: document.querySelector("#seg-source button.on").dataset.v,
    community: { isp: document.querySelector("#seg-isp button.on").dataset.v },
    result_mode: (document.querySelector("#seg-resultmode button.on") || {}).dataset.v || "overwrite",
    region: {
      enabled: $("cfg-region-en").checked,
      colos: $("cfg-colos")._selected || [],
      min_per_region: +$("cfg-min-region").value,
      names: customColoNames
    },
    top_n: +$("cfg-topn").value,
    max_lines: +$("cfg-maxlines").value,
    miss_limit: +$("cfg-miss").value,
    tag_template: $("cfg-tag").value.trim(),
    schedule: { enabled: $("cfg-sched-en").checked, interval_hours: +$("cfg-sched-int").value },
    app_update: { auto_install: $("cfg-autoupdate").checked },
    cfst: {
      tl: +$("cfg-cf-tl").value, tll: +$("cfg-cf-tll").value,
      dn: +$("cfg-cf-dn").value, dt: +$("cfg-cf-dt").value,
      url: $("cfg-cf-url").value.trim(), httping: $("cfg-cf-httping").checked, extra_args: $("cfg-cf-extra").value.trim()
    },
    gist: {
      token: $("cfg-g-token").value.trim(),
      id: $("cfg-g-id").value.trim(),
      filename: $("cfg-g-file").value.trim(),
      proxy_url: $("cfg-g-proxy").value.trim()
    }
  };
}

async function loadConfig() {
  const c = await api("/api/config");
  fillConfig(c);
}

$("cfg-region-en").onchange = e => $("region-box").classList.toggle("hide", !e.target.checked);

$("btn-save-cfg").onclick = async () => {
  try {
    await api("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collectCfg()) });
    msg("cfg-msg", t("msg.saved"), true);
    refreshStatus();
  } catch (e) { msg("cfg-msg", t("msg.save_fail") + e.message, false); }
};

$("btn-save-gist").onclick = async () => {
  try {
    const c = collectCfg();
    const server = await api("/api/config");
    c.sources = server.sources; c.ports = server.ports; c.method = server.method;
    c.source_mode = server.source_mode; c.region = server.region;
    c.top_n = server.top_n; c.max_lines = server.max_lines; c.miss_limit = server.miss_limit;
    c.tag_template = server.tag_template; c.schedule = server.schedule; c.app_update = server.app_update; c.cfst = server.cfst;
    await api("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    msg("gist-msg", t("msg.saved"), true);
    refreshStatus();
  } catch (e) { msg("gist-msg", t("msg.save_fail") + e.message, false); }
};

$("btn-verify").onclick = async () => {
  msg("gist-msg", t("msg.checking"));
  try {
    const r = await api("/api/gist/verify", { method: "POST" });
    msg("gist-msg", r.message || "✓", true);
  } catch (e) { msg("gist-msg", e.message, false); }
};

/* ================= 运行 / 重传 ================= */
$("btn-run").onclick = async () => {
  $("btn-run").disabled = true;
  try {
    await api("/api/run", { method: "POST" });
    refreshStatus();
    setTimeout(refreshResults, 4000);
  } catch (e) { alert(t("msg.run_fail") + e.message); $("btn-run").disabled = false; }
};
$("btn-reupload").onclick = async () => {
  try { await api("/api/upload", { method: "POST" }); alert(t("msg.reupload_ok")); }
  catch (e) { alert(t("msg.reupload_fail") + e.message); }
};

/* ================= 引擎 ================= */
async function refreshEngine() {
  try {
    const e = await api("/api/engine");
    $("eng-current").textContent = e.current;
    $("eng-latest").textContent = e.latest || "—";
  } catch (e) { /* ignore */ }
}
$("btn-engine-check").onclick = async () => {
  msg("eng-msg", t("msg.checking"));
  try {
    const e = await api("/api/engine");
    $("eng-latest").textContent = e.latest;
    msg("eng-msg", e.current === e.latest ? t("msg.latest") : fmt("msg.engine_upgrade", {a:e.current,b:e.latest}), e.current === e.latest);
  } catch (e2) { msg("eng-msg", e2.message, false); }
};
$("btn-engine-update").onclick = async () => {
  if (!confirm(t("msg.engine_confirm"))) return;
  msg("eng-msg", t("msg.upgrading"));
  try {
    const r = await api("/api/engine", { method: "POST" });
    msg("eng-msg", fmt("msg.upgraded", {v:r.version}), true);
    refreshEngine(); refreshStatus();
  } catch (e) { msg("eng-msg", e.message, false); }
};

/* ================= 程序 Release 更新 ================= */
let releaseTag = "";
function versionParts(v) { return String(v || "").replace(/^v/, "").split(".").map(x => parseInt(x, 10) || 0); }
function isNewer(current, latest) {
  const a = versionParts(current), b = versionParts(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((b[i] || 0) !== (a[i] || 0)) return (b[i] || 0) > (a[i] || 0);
  }
  return false;
}
function closeRelease() { $("rel-scrim").classList.add("hide"); }
function showRelease(rel, installing) {
  releaseTag = rel.tag;
  $("rel-title").textContent = fmt("rel.title", {v: rel.tag});
  $("rel-body").textContent = (rel.body || rel.tag) + (installing ? "\n\n" + t("rel.autostarted") : "");
  $("rel-link").href = rel.url || "https://github.com/ChEnLeo-7/openwrt-cf-auto/releases";
  $("rel-install").style.display = installing ? "none" : "";
  $("rel-scrim").classList.remove("hide");
}
async function checkAppRelease(silent=false) {
  try {
    const [rel, st, cfg] = await Promise.all([api("/api/apprelease"), api("/api/status"), api("/api/config")]);
    const available = rel.update_available || isNewer(st.version, rel.tag);
    if (!available) {
      if (!silent) alert(t("rel.none"));
      return;
    }
    if (silent && localStorage.getItem("cf-skip-version") === rel.tag) return;
    const autoOn = cfg.app_update && cfg.app_update.auto_install;
    if (autoOn && silent) {
      try { await api("/api/appupdate", {method:"POST"}); } catch (e) { /* 安装失败时仍展示说明 */ }
      showRelease(rel, true);
    } else {
      showRelease(rel, false);
    }
  } catch (e) {
    if (!silent) alert(t("rel.check_fail") + e.message);
  }
}
$("rel-skip").onclick = () => { if (releaseTag) localStorage.setItem("cf-skip-version", releaseTag); closeRelease(); };
$("rel-scrim").onclick = e => { if (e.target === $("rel-scrim")) closeRelease(); };
$("rel-install").onclick = async () => {
  if (!confirm(t("rel.installing"))) return;
  $("rel-install").disabled = true;
  try {
    await api("/api/appupdate", {method:"POST"});
    $("rel-body").textContent += "\n\n" + t("rel.autostarted");
    setTimeout(closeRelease, 2500);
  } catch (e) {
    $("rel-install").disabled = false;
    alert(e.message);
  }
};
$("btn-app-check").onclick = () => checkAppRelease(false);

$("cfg-autoupdate").onchange = async () => {
  try {
    const c = collectCfg();
    await api("/api/config", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(c)});
  } catch (e) { alert(t("msg.save_fail") + e.message); }
};

/* ================= 启动 ================= */
applyI18n();
loadConfig().then(() => checkAppRelease(true)).catch(e => console.error(e));
refreshStatus();
refreshResults();
refreshEngine();
