"use strict";
const $ = (id) => document.getElementById(id);
const COMMON_PORTS = [443, 8443, 2053, 2083, 2087, 2096];
const COMMON_COLOS = ["SIN", "NRT", "KIX", "HKG", "LAX", "SJC", "SEA", "FRA"];
let customPorts = [], customColos = [];
let logNext = -1;

/* ================= 主题切换 ================= */
const themeBtn = $("theme-toggle");
function themeIcon() { themeBtn.textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾"; }
themeBtn.onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("cf-theme", next);
  themeIcon();
};
themeIcon();

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
    $("st-gist").textContent = s.gist_configured ? "已配置" : "未配置";
    $("st-gist").style.color = s.gist_configured ? "" : "var(--txt3)";
    const sc = s.schedule;
    $("st-sched").innerHTML = sc.enabled
      ? `每 ${sc.interval_hours} 小时` + (sc.running ? " · 运行中" : "")
      : "已关闭";
    $("hdr-status").textContent = `v${s.version} · ${s.busy ? "优选进行中" : "空闲"}`;
    $("btn-run").disabled = s.busy;
    $("run-meta").textContent = sc.enabled
      ? `上次: ${sc.last_run} · 下次: ${sc.next_run}`
      : `上次: ${sc.last_run} · 定时已关闭`;
  } catch (e) { $("hdr-status").textContent = "后端连接失败"; }
}
setInterval(refreshStatus, 5000);

/* ================= 结果表 ================= */
function renderResults(r) {
  const tb = $("result-table").querySelector("tbody");
  tb.innerHTML = "";
  const entries = r.entries || [];
  $("result-meta").textContent = entries.length
    ? `${r.time} · 测得 ${r.tested_n} · +${r.added} 留${r.kept} 汰${r.dropped}`
    : "";
  if (!entries.length) {
    $("result-empty").style.display = "";
    return;
  }
  $("result-empty").style.display = "none";
  entries.forEach((e, i) => {
    const tr = document.createElement("tr");
    const reg = e.region ? `<span class="reg">${e.region}</span>` : '<span class="dim">—</span>';
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
bindSeg("seg-method", v => {
  $("method-hint").textContent = v === "bandwidth"
    ? "延迟达标的前 N 名逐个下载测速文件实测吞吐（流量约 100-300MB），按带宽排名。"
    : "对候选 IP 做 TCP 延迟测试，速度最快、零流量。";
});
bindSeg("seg-source", v => {
  $("src-custom").classList.toggle("hide", v !== "custom");
  $("src-official").classList.toggle("hide", v !== "official");
});

/* ================= 端口 / 地区 chips ================= */
function renderChips(boxId, list, selected, removable) {
  const box = $(boxId);
  box.innerHTML = "";
  [...new Set(list)].forEach(item => {
    const chip = document.createElement("span");
    chip.className = "chip" + (selected.includes(item) ? " on" : "");
    chip.innerHTML = item + (removable && !COMMON_PORTS.includes(item) && !COMMON_COLOS.includes(item) ? ' <span class="x">✕</span>' : "");
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

$("btn-add-port").onclick = () => {
  const p = +$("cfg-port-custom").value;
  if (!p || p < 1 || p > 65535) return;
  if (!COMMON_PORTS.includes(p) && !customPorts.includes(p)) customPorts.push(p);
  if (!($("cfg-ports")._selected || []).includes(p)) $("cfg-ports")._selected.push(p);
  $("cfg-port-custom").value = "";
  renderChips("cfg-ports", COMMON_PORTS, $("cfg-ports")._selected, true);
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
  renderChips("cfg-colos", COMMON_COLOS, [...(c.region.colos || [])], true);
  $("cfg-min-region").value = c.region.min_per_region;
  $("cfg-topn").value = c.top_n;
  $("cfg-maxlines").value = c.max_lines;
  $("cfg-miss").value = c.miss_limit;
  $("cfg-tag").value = c.tag_template;
  $("cfg-sched-en").checked = c.schedule.enabled;
  $("cfg-sched-int").value = c.schedule.interval_hours;
  $("cfg-cf-tl").value = c.cfst.tl;
  $("cfg-cf-tll").value = c.cfst.tll;
  $("cfg-cf-dn").value = c.cfst.dn;
  $("cfg-cf-dt").value = c.cfst.dt;
  $("cfg-cf-url").value = c.cfst.url;
  $("cfg-cf-extra").value = c.cfst.extra_args || "";
  $("cfg-g-token").placeholder = c.token_set ? "已保存（留空 = 不修改）" : "ghp_ 开头经典 Token";
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
      min_per_region: +$("cfg-min-region").value
    },
    top_n: +$("cfg-topn").value,
    max_lines: +$("cfg-maxlines").value,
    miss_limit: +$("cfg-miss").value,
    tag_template: $("cfg-tag").value.trim(),
    schedule: { enabled: $("cfg-sched-en").checked, interval_hours: +$("cfg-sched-int").value },
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
    msg("cfg-msg", "已保存 ✓", true);
    refreshStatus();
  } catch (e) { msg("cfg-msg", "保存失败: " + e.message, false); }
};

$("btn-save-gist").onclick = async () => {
  try {
    const c = collectCfg();
    const server = await api("/api/config");
    c.sources = server.sources; c.ports = server.ports; c.method = server.method;
    c.source_mode = server.source_mode; c.region = server.region;
    c.top_n = server.top_n; c.max_lines = server.max_lines; c.miss_limit = server.miss_limit;
    c.tag_template = server.tag_template; c.schedule = server.schedule; c.cfst = server.cfst;
    await api("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    msg("gist-msg", "已保存 ✓", true);
    refreshStatus();
  } catch (e) { msg("gist-msg", "保存失败: " + e.message, false); }
};

$("btn-verify").onclick = async () => {
  msg("gist-msg", "验证中…");
  try {
    const r = await api("/api/gist/verify", { method: "POST" });
    msg("gist-msg", r.message || "验证成功 ✓", true);
  } catch (e) { msg("gist-msg", e.message, false); }
};

/* ================= 运行 / 重传 ================= */
$("btn-run").onclick = async () => {
  $("btn-run").disabled = true;
  try {
    await api("/api/run", { method: "POST" });
    refreshStatus();
    setTimeout(refreshResults, 4000);
  } catch (e) { alert("触发失败: " + e.message); $("btn-run").disabled = false; }
};
$("btn-reupload").onclick = async () => {
  try { await api("/api/upload", { method: "POST" }); alert("重传成功"); }
  catch (e) { alert("重传失败: " + e.message); }
};

/* ================= 引擎 ================= */
async function refreshEngine() {
  try {
    const e = await api("/api/engine");
    $("eng-current").textContent = e.current;
    $("eng-latest").textContent = e.latest || "点击检查更新";
  } catch (e) { /* ignore */ }
}
$("btn-engine-check").onclick = async () => {
  msg("eng-msg", "查询中…");
  try {
    const e = await api("/api/engine");
    $("eng-latest").textContent = e.latest;
    msg("eng-msg", e.current === e.latest ? "已是最新版 ✓" : `可升级：${e.current} → ${e.latest}`, e.current === e.latest);
  } catch (e2) { msg("eng-msg", e2.message, false); }
};
$("btn-engine-update").onclick = async () => {
  if (!confirm("确认下载并替换测速引擎？失败会自动回滚。")) return;
  msg("eng-msg", "升级中…");
  try {
    const r = await api("/api/engine", { method: "POST" });
    msg("eng-msg", "已升级到 " + r.version + " ✓", true);
    refreshEngine(); refreshStatus();
  } catch (e) { msg("eng-msg", e.message, false); }
};

/* ================= 启动 ================= */
loadConfig().catch(e => console.error(e));
refreshStatus();
refreshResults();
refreshEngine();
