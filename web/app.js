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
    "eng.current":"当前","eng.latest":"最新","eng.check":"检查更新","eng.update":"升级引擎","eng.autoupdate":"自动安装程序更新","eng.checkhours":"每隔（小时）","app.check":"检查程序更新",
    "cfg.method_h":"优选方式","method.latency":"按延迟优选","method.bandwidth":"按带宽优选",
    "method.hint.latency":"对候选 IP 做 TCP 延迟测试，速度最快、几乎零流量。","method.hint.bandwidth":"对延迟达标的候选逐个下载测速，按带宽排序（会产生测速流量）。",
    "cfg.source_h":"优选来源","source.custom":"自定义优选源","source.official":"CF 官方网段","source.ph":"每行一个优选 URL","source.hint":"拉取各来源后合并去重，再从你的线路进行二次优选。","source.official_note":"实时获取 Cloudflare 官方 IPv4 网段，与 CloudflareSpeedTest 默认方式一致。覆盖最全，但单轮耗时更长。",
    "cfg.region_h":"区域定向（真实落地机房）","cfg.region_en":"启用区域过滤","cfg.colo_ph":"输入代码，或 CODE|名称（如 SIN|新加坡）","cfg.add":"添加","cfg.region_hint":"可单选或多选；每个地区独立测速。按钮显示“代码 | 地区”解释，未知代码也可自定义名称。","cfg.min_region":"每地区最少上榜数",
    "cfg.ports_h":"测速端口","cfg.port_ph":"自定义端口","cfg.policy_h":"结果策略","cfg.topn":"本轮 TopN","cfg.maxlines":"结果行数上限","cfg.miss":"连续落榜淘汰轮数",
    "cfg.tag_h":"节点信息模板","cfg.tag_sub":"# 后显示内容","cfg.tag_ph":"cf-auto | {region} | {latency}ms | {speed}","cfg.tag_hint":"变量：{region} 地区代码 · {latency} 延迟 · {speed} 带宽（自带 MB/s）· {date} 日期。空段自动省略。",
    "cfg.params_h":"CloudflareSpeedTest 参数","cfg.tl":"平均延迟上限 -tl (ms)","cfg.tll":"平均延迟下限 -tll (ms)","cfg.dn":"下载测速数量 -dn","cfg.dt":"单 IP 测速时长 -dt (秒)","cfg.url":"下载测速地址","cfg.extra":"高级附加参数","cfg.extra_ph":"原样追加，如 -t 200",
    "cfg.sched_h":"定时更新","cfg.sched_en":"自动优选并更新 Gist","cfg.sched_int":"更新间隔（小时）","cfg.sched_hint":"到点按当前优选方式、来源、地区和端口执行完整一轮。","cfg.appupdate_h":"程序更新","cfg.appupdate_hint":"发现新版本时展示双语 Release 说明；启用后自动下载匹配架构的 ipk 并安装。","cfg.save":"保存设置",
    "gist.h":"Gist 自动上传","gist.token":"GitHub Token","gist.token_ph":"ghp_ 开头经典 Token（留空表示不修改）","gist.token_saved_ph":"已保存（留空 = 不修改）","gist.id":"Gist ID","gist.file":"目标文件名","gist.proxy":"GitHub 代理（可选）","gist.proxy_ph":"http://127.0.0.1:7890","gist.save":"保存","gist.verify":"验证连接",
    "tut.title":"如何获取 GitHub Token（三步）","tut.s1":"登录 GitHub → 头像 → Settings。","tut.s2":"Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)。","tut.s3":"选择有效期，只勾选 gist，生成后复制 ghp_ 开头的 Token。","tut.gistid":"Gist ID 位于 gist 页面 URL：gist.github.com/用户名/ID。",
    "logs.auto":"自动刷新","footer":"cf-auto · CloudflareSpeedTest (GPL-3.0) · MIT",
    "status.configured":"已配置","status.unconfigured":"未配置","status.running":"运行中","status.idle":"空闲","status.closed":"已关闭","status.every":"每 {h} 小时","status.last":"上次","status.next":"下次","status.never":"从未（启动后自动首跑）","status.backend_fail":"后端连接失败",
    "msg.saved":"已保存 ✓","msg.save_fail":"保存失败：","msg.checking":"检查中…","msg.latest":"已是最新版 ✓","msg.engine_upgrade":"可升级：{a} → {b}","msg.reupload_ok":"重传成功","msg.reupload_fail":"重传失败：","msg.run_fail":"触发失败：","msg.engine_confirm":"确认下载并替换测速引擎？失败会自动回滚。","msg.upgrading":"升级中…","msg.upgraded":"已升级到 {v} ✓",
    "theme.title":"切换浅色 / 深色","rel.title":"发现新版本 {v}","rel.goto":"查看 Release","rel.install":"立即更新","rel.skip":"忽略此版本","rel.none":"当前已是最新版本","rel.check_fail":"程序更新检查失败：","rel.installing":"正在下载并安装，服务将自动重启…"
  },
  en: {
    "tab.dash":"Overview","tab.cfg":"Optimization","tab.gist":"GitHub","tab.logs":"Logs",
    "dash.run":"Start optimization","dash.reupload":"Re-upload","dash.results":"Latest results","dash.empty":"No results yet — click “Start optimization” to run once.","dash.engine_h":"Engine update",
    "card.version":"App version","card.engine":"Test engine","card.schedule":"Scheduled update","card.gist":"Gist",
    "tbl.idx":"#","tbl.node":"Endpoint","tbl.region":"Region","tbl.latency":"Latency","tbl.bandwidth":"Bandwidth",
    "eng.current":"Current","eng.latest":"Latest","eng.check":"Check","eng.update":"Update engine","eng.autoupdate":"Automatically install app updates","eng.checkhours":"Every (hours)","app.check":"Check app update",
    "cfg.method_h":"Optimization method","method.latency":"Optimize for latency","method.bandwidth":"Optimize for bandwidth",
    "method.hint.latency":"Runs TCP latency tests against candidate IPs. Fast and nearly traffic-free.","method.hint.bandwidth":"Downloads a test file through qualified candidates and ranks them by throughput.",
    "cfg.source_h":"Candidate source","source.custom":"Custom preferred-IP URLs","source.official":"Official CF ranges","source.ph":"One preferred-IP URL per line","source.hint":"Fetch, merge, and deduplicate public candidates, then re-test them from your own network.","source.official_note":"Fetches current Cloudflare IPv4 ranges, matching CloudflareSpeedTest's default workflow. Complete but slower.",
    "cfg.region_h":"Region targeting (real edge colo)","cfg.region_en":"Enable region filtering","cfg.colo_ph":"Enter CODE or CODE|Name, e.g. SIN|Singapore","cfg.add":"Add","cfg.region_hint":"Select one or more colos; each is tested separately. Buttons show “code | location”; unknown codes may have custom names.","cfg.min_region":"Minimum results per region",
    "cfg.ports_h":"Test ports","cfg.port_ph":"Custom port","cfg.policy_h":"Result policy","cfg.topn":"Top N this run","cfg.maxlines":"Maximum result lines","cfg.miss":"Misses before eviction",
    "cfg.tag_h":"Node label template","cfg.tag_sub":"text after #","cfg.tag_ph":"cf-auto | {region} | {latency}ms | {speed}","cfg.tag_hint":"Variables: {region}, {latency}, {speed} (includes MB/s), and {date}. Empty segments are removed.",
    "cfg.params_h":"CloudflareSpeedTest parameters","cfg.tl":"Maximum average latency -tl (ms)","cfg.tll":"Minimum average latency -tll (ms)","cfg.dn":"Download test count -dn","cfg.dt":"Test duration per IP -dt (seconds)","cfg.url":"Download test URL","cfg.extra":"Advanced extra arguments","cfg.extra_ph":"Passed through as-is, e.g. -t 200",
    "cfg.sched_h":"Scheduled update","cfg.sched_en":"Automatically optimize and update Gist","cfg.sched_int":"Update interval (hours)","cfg.sched_hint":"Runs a full optimization using the current method, source, regions, and ports.","cfg.appupdate_h":"Application updates","cfg.appupdate_hint":"Shows bilingual Release notes when an update is found; when enabled, downloads and installs the matching IPK automatically.","cfg.save":"Save settings",
    "gist.h":"Automatic Gist upload","gist.token":"GitHub token","gist.token_ph":"Classic ghp_ token (leave blank to keep current)","gist.token_saved_ph":"Saved (leave blank to keep it)","gist.id":"Gist ID","gist.file":"Target filename","gist.proxy":"GitHub proxy (optional)","gist.proxy_ph":"http://127.0.0.1:7890","gist.save":"Save","gist.verify":"Verify connection",
    "tut.title":"Get a GitHub token in three steps","tut.s1":"Sign in to GitHub → avatar → Settings.","tut.s2":"Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic).","tut.s3":"Choose an expiration, select only gist, generate it, and copy the ghp_ token.","tut.gistid":"The Gist ID is in the URL: gist.github.com/username/ID.",
    "logs.auto":"Auto refresh","footer":"cf-auto · CloudflareSpeedTest (GPL-3.0) · MIT",
    "status.configured":"Configured","status.unconfigured":"Not configured","status.running":"Running","status.idle":"Idle","status.closed":"Disabled","status.every":"Every {h} hours","status.last":"Last","status.next":"Next","status.never":"Never (first run starts automatically)","status.backend_fail":"Backend unavailable",
    "msg.saved":"Saved ✓","msg.save_fail":"Save failed: ","msg.checking":"Checking…","msg.latest":"Already up to date ✓","msg.engine_upgrade":"Update available: {a} → {b}","msg.reupload_ok":"Re-upload complete","msg.reupload_fail":"Re-upload failed: ","msg.run_fail":"Failed to start: ","msg.engine_confirm":"Download and replace the test engine? Failures automatically roll back.","msg.upgrading":"Updating…","msg.upgraded":"Updated to {v} ✓",
    "theme.title":"Switch light / dark","rel.title":"New version {v} available","rel.goto":"View Release","rel.install":"Update now","rel.skip":"Ignore this version","rel.none":"You are up to date","rel.check_fail":"App update check failed: ","rel.installing":"Downloading and installing; the service will restart automatically…"
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
  rerenderChips();
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

/* ================= 日志 ================= */
async function refreshLogs(reset) {
  if (reset) logNext = -1;
  try {
    const r = await api("/api/logs?after=" + logNext);
    if (r.lines.length) {
      $("logbox").textContent += r.lines.join("\n") + "\n";
      $("logbox").scrollTop = $("logbox").scrollHeight;
    }
    logNext = r.next;
  } catch (e) { /* ignore */ }
}
setInterval(() => { if ($("log-auto").checked && $("tab-logs").classList.contains("active")) refreshLogs(false); }, 3000);

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
bindSeg("seg-method", updateMethodHint);
bindSeg("seg-source", v => {
  $("src-custom").classList.toggle("hide", v !== "custom");
  $("src-official").classList.toggle("hide", v !== "official");
});

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
  document.querySelectorAll("#seg-source button").forEach(b => b.classList.toggle("on", b.dataset.v === c.source_mode));
  $("src-custom").classList.toggle("hide", c.source_mode !== "custom");
  $("src-official").classList.toggle("hide", c.source_mode !== "official");
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
  $("cfg-update-hours").value = (c.app_update && c.app_update.check_hours) || 12;
  $("cfg-cf-tl").value = c.cfst.tl;
  $("cfg-cf-tll").value = c.cfst.tll;
  $("cfg-cf-dn").value = c.cfst.dn;
  $("cfg-cf-dt").value = c.cfst.dt;
  $("cfg-cf-url").value = c.cfst.url;
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
    app_update: { auto_install: $("cfg-autoupdate").checked, check_hours: +$("cfg-update-hours").value },
    cfst: {
      tl: +$("cfg-cf-tl").value, tll: +$("cfg-cf-tll").value,
      dn: +$("cfg-cf-dn").value, dt: +$("cfg-cf-dt").value,
      url: $("cfg-cf-url").value.trim(), extra_args: $("cfg-cf-extra").value.trim()
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
function showRelease(rel) {
  releaseTag = rel.tag;
  $("rel-title").textContent = fmt("rel.title", {v: rel.tag});
  $("rel-body").textContent = rel.body || rel.tag;
  $("rel-link").href = rel.url || "https://github.com/ChEnLeo-7/openwrt-cf-auto/releases";
  $("rel-scrim").classList.remove("hide");
}
async function checkAppRelease(silent=false) {
  try {
    const [rel, st] = await Promise.all([api("/api/apprelease"), api("/api/status")]);
    if (rel.update_available || isNewer(st.version, rel.tag)) {
      if (!silent || localStorage.getItem("cf-skip-version") !== rel.tag) showRelease(rel);
    } else if (!silent) {
      alert(t("rel.none"));
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
    $("rel-body").textContent = t("rel.installing");
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
