"use strict";
const $ = (id) => document.getElementById(id);
const COMMON_PORTS = [443, 8443, 2053, 2083, 2087, 2096];
let customPorts = [];
let logNext = -1;

/* ---------- 标签页 ---------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
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

/* ---------- 状态轮询 ---------- */
async function refreshStatus() {
  try {
    const s = await api("/api/status");
    $("st-version").textContent = "v" + s.version;
    $("st-engine").textContent = s.engine;
    $("st-busy").textContent = s.busy ? "测速中…" : "空闲";
    $("st-busy").style.color = s.busy ? "var(--warn)" : "var(--ok)";
    $("st-gist").textContent = s.gist_configured ? "已配置 ✓" : "未配置";
    $("st-gist").style.color = s.gist_configured ? "var(--ok)" : "var(--err)";
    $("hdr-status").textContent = `v${s.version} · 引擎 ${s.engine} · ${s.busy ? "测速中" : "空闲"}`;
    const names = { hourly: "小时档", deep: "夜间档", region: "区域档" };
    s.tiers.forEach(t => {
      const el = $("tier-" + t.name + "-info");
      if (el) el.textContent =
        (t.enabled ? "已启用" : "未启用") + (t.running ? " · 运行中" : "") +
        `\n上次: ${t.last_run}${t.last_ok ? " ✓" : ""}\n下次: ${t.next_run}`;
      const runBtn = document.querySelector(`[data-run="${t.name}"]`);
      if (runBtn) runBtn.disabled = t.running;
    });
  } catch (e) { $("hdr-status").textContent = "后端连接失败: " + e.message; }
}
setInterval(refreshStatus, 5000);

/* ---------- 结果 ---------- */
async function refreshResults() {
  try {
    const r = await api("/api/results");
    const names = { hourly: "小时档", deep: "夜间档", region: "区域档" };
    let html = "";
    for (const [tier, v] of Object.entries(r)) {
      const lines = (v.content || "").split("\n").filter(l => l && !l.startsWith("#"));
      html += `【${names[tier] || tier}】${v.time} · 有效结果 ${v.tested_n} · 上榜 ${lines.length}（+${v.added} 留${v.kept} 汰${v.dropped}）→ ${v.filename}\n`;
      html += lines.join("\n") + "\n\n";
    }
    $("results-box").textContent = html || "尚无结果，点击上方\u201c立即运行\u201d体验一轮完整优选。";
  } catch (e) { /* ignore */ }
}
setInterval(refreshResults, 8000);

/* ---------- 日志 ---------- */
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
$("btn-log-clear-view").onclick = () => { $("logbox").textContent = ""; logNext = -1; };

/* ---------- 端口选择 ---------- */
function renderPorts(selected) {
  const box = $("cfg-ports");
  box.innerHTML = "";
  const all = [...new Set([...COMMON_PORTS, ...customPorts])];
  all.forEach(p => {
    const chip = document.createElement("span");
    chip.className = "chip" + (selected.includes(p) ? " on" : "");
    chip.innerHTML = p + (customPorts.includes(p) ? ' <span class="x">✕</span>' : "");
    chip.onclick = (ev) => {
      if (ev.target.classList.contains("x")) {
        customPorts = customPorts.filter(x => x !== p);
        if (selected.includes(p)) selected.splice(selected.indexOf(p), 1);
        renderPorts(selected);
        return;
      }
      const i = selected.indexOf(p);
      if (i >= 0) selected.splice(i, 1); else selected.push(p);
      chip.classList.toggle("on");
    };
    box.appendChild(chip);
  });
}

/* ---------- 配置加载/保存 ---------- */
function fillConfig(c) {
  $("cfg-sources").value = (c.sources || []).join("\n");
  customPorts = (c.ports || []).filter(p => !COMMON_PORTS.includes(p));
  renderPorts(c.ports || []);
  $("cfg-topn").value = c.top_n;
  $("cfg-maxlines").value = c.max_lines;
  $("cfg-miss").value = c.miss_limit;
  $("cfg-t-hourly-en").checked = c.tiers.hourly.enabled;
  $("cfg-t-hourly-int").value = c.tiers.hourly.interval_hours;
  $("cfg-t-hourly-file").value = c.tiers.hourly.filename || "";
  $("cfg-t-deep-en").checked = c.tiers.deep.enabled;
  $("cfg-t-deep-time").value = c.tiers.deep.time;
  $("cfg-t-deep-file").value = c.tiers.deep.filename || "";
  $("cfg-t-region-en").checked = c.tiers.region.enabled;
  $("cfg-t-region-int").value = c.tiers.region.interval_hours;
  $("cfg-t-region-colos").value = c.tiers.region.colos;
  $("cfg-t-region-file").value = c.tiers.region.filename || "";
  $("cfg-cf-tl").value = c.cfst.tl;
  $("cfg-cf-tll").value = c.cfst.tll;
  $("cfg-cf-dn").value = c.cfst.dn;
  $("cfg-cf-dt").value = c.cfst.dt;
  $("cfg-cf-url").value = c.cfst.url;
  $("cfg-cf-extra").value = c.cfst.extra_args || "";
  $("cfg-g-token").value = "";
  $("cfg-g-token").placeholder = c.token_set ? "已保存（留空表示不修改）" : "ghp_ 开头的经典 Token";
  $("cfg-g-id").value = c.gist.id;
  $("cfg-g-file").value = c.gist.filename;
  $("cfg-g-proxy").value = c.gist.proxy_url || "";
}

function collectCfg() {
  return {
    sources: $("cfg-sources").value.split("\n").map(s => s.trim()).filter(s => s && s.startsWith("http")),
    ports: ($("cfg-ports")._selected || []),
    top_n: +$("cfg-topn").value,
    max_lines: +$("cfg-maxlines").value,
    miss_limit: +$("cfg-miss").value,
    tiers: {
      hourly: { enabled: $("cfg-t-hourly-en").checked, interval_hours: +$("cfg-t-hourly-int").value, time: "03:30", colos: "", filename: $("cfg-t-hourly-file").value.trim() },
      deep: { enabled: $("cfg-t-deep-en").checked, interval_hours: 24, time: $("cfg-t-deep-time").value || "03:30", colos: "", filename: $("cfg-t-deep-file").value.trim() },
      region: { enabled: $("cfg-t-region-en").checked, interval_hours: +$("cfg-t-region-int").value, time: "03:30", colos: $("cfg-t-region-colos").value.trim(), filename: $("cfg-t-region-file").value.trim() }
    },
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
  $("cfg-ports")._selected = [...(c.ports || [])];
  fillConfig(c);
}

$("btn-save-cfg").onclick = async () => {
  const c = collectCfg();
  const saved = await api("/api/config").catch(() => null);
  if (saved && !c.gist.token) c.gist.token = "";
  try {
    await api("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    msg("cfg-msg", "已保存 ✓", true);
    refreshStatus();
  } catch (e) { msg("cfg-msg", "保存失败: " + e.message, false); }
};

$("btn-save-gist").onclick = async () => {
  try {
    const c = collectCfg();
    // 仅更新 gist 部分，sources/ports 用当前服务器值
    const server = await api("/api/config");
    c.sources = server.sources; c.ports = server.ports;
    c.top_n = server.top_n; c.max_lines = server.max_lines; c.miss_limit = server.miss_limit;
    c.tiers = server.tiers; c.cfst = server.cfst;
    await api("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    msg("gist-msg", "已保存 ✓", true);
    refreshStatus();
  } catch (e) { msg("gist-msg", "保存失败: " + e.message, false); }
};

$("btn-add-port").onclick = () => {
  const p = +$("cfg-port-custom").value;
  if (!p || p < 1 || p > 65535) return;
  if (!COMMON_PORTS.includes(p) && !customPorts.includes(p)) customPorts.push(p);
  if (!($("cfg-ports")._selected || []).includes(p)) $("cfg-ports")._selected.push(p);
  $("cfg-port-custom").value = "";
  renderPorts($("cfg-ports")._selected);
};

$("btn-verify").onclick = async () => {
  msg("gist-msg", "验证中…");
  try {
    const r = await api("/api/gist/verify", { method: "POST" });
    msg("gist-msg", r.message || "验证成功 ✓", true);
  } catch (e) { msg("gist-msg", e.message, false); }
};

/* ---------- 档位运行/重传 ---------- */
document.querySelectorAll("[data-run]").forEach(btn => {
  btn.onclick = async () => {
    btn.disabled = true;
    msg("cfg-msg", "");
    try {
      await api("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: btn.dataset.run }) });
      refreshStatus();
      setTimeout(refreshResults, 3000);
    } catch (e) { alert("触发失败: " + e.message); btn.disabled = false; }
  };
});
document.querySelectorAll("[data-upload]").forEach(btn => {
  btn.onclick = async () => {
    try {
      await api("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: btn.dataset.upload }) });
      alert("重传成功");
    } catch (e) { alert("重传失败: " + e.message); }
  };
});

/* ---------- 引擎 ---------- */
async function refreshEngine() {
  try {
    const e = await api("/api/engine");
    $("eng-current").value = e.current;
    $("eng-latest").value = e.latest || "点击检查更新";
    $("eng-path").value = e.path;
  } catch (e) { /* ignore */ }
}
$("btn-engine-check").onclick = async () => {
  msg("eng-msg", "查询中…");
  try {
    const e = await api("/api/engine");
    $("eng-latest").value = e.latest;
    msg("eng-msg", e.current === e.latest ? "已是最新版 ✓" : `可升级：${e.current} → ${e.latest}`, e.current === e.latest);
  } catch (e2) { msg("eng-msg", e2.message, false); }
};
$("btn-engine-update").onclick = async () => {
  if (!confirm("确认下载并替换测速引擎？升级失败会自动回滚。")) return;
  msg("eng-msg", "升级中（下载+校验，约半分钟）…");
  try {
    const r = await api("/api/engine", { method: "POST" });
    msg("eng-msg", "已升级到 " + r.version + " ✓", true);
    refreshEngine(); refreshStatus();
  } catch (e) { msg("eng-msg", e.message, false); }
};

/* ---------- 启动 ---------- */
loadConfig().catch(e => console.error(e));
refreshStatus();
refreshResults();
refreshEngine();
