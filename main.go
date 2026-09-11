package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
)

//go:embed web
var webFS embed.FS

const Version = "0.3.0"

var configPath string
var cfgPtr atomic.Pointer[Config]

func cur() *Config { return cfgPtr.Load() }

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

type statusResp struct {
	Version    string         `json:"version"`
	Engine     string         `json:"engine"`
	Busy       bool           `json:"busy"`
	GistOK     bool           `json:"gist_configured"`
	ConfigPath string         `json:"config_path"`
	Schedule   ScheduleStatus `json:"schedule"`
}

func apiStatus(w http.ResponseWriter, r *http.Request) {
	c := cur()
	writeJSON(w, statusResp{
		Version:    Version,
		Engine:     engineCurrentVersion(),
		Busy:       isBusy(),
		GistOK:     c.Gist.Token != "" && c.Gist.ID != "",
		ConfigPath: configPath,
		Schedule:   scheduleStatus(c),
	})
}

func apiGetConfig(w http.ResponseWriter, r *http.Request) {
	c := cur()
	var resp struct {
		Config
		TokenSet bool `json:"token_set"`
	}
	resp.Config = *c
	resp.TokenSet = c.Gist.Token != ""
	resp.Gist.Token = ""
	writeJSON(w, resp)
}

func apiSetConfig(w http.ResponseWriter, r *http.Request) {
	var in Config
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, 400, "配置解析失败: "+err.Error())
		return
	}
	old := cur()
	if in.Gist.Token == "" && old.Gist.Token != "" {
		in.Gist.Token = old.Gist.Token
	}
	if in.Gist.Filename == "" {
		in.Gist.Filename = old.Gist.Filename
	}
	if in.Listen == "" {
		in.Listen = old.Listen
	}
	in.normalize()
	if err := SaveConfig(configPath, &in); err != nil {
		writeErr(w, 500, "保存配置失败: "+err.Error())
		return
	}
	cfgPtr.Store(&in)
	Log.Addf("[配置] 已更新：方式 %s / 来源 %s / 源 %d 个 / 端口 %v / 地区过滤 %v / Top%d",
		in.Method, in.SourceMode, len(in.Sources), in.Ports, in.Region.Enabled, in.TopN)
	writeJSON(w, map[string]interface{}{"ok": true})
}

func apiRun(w http.ResponseWriter, r *http.Request) {
	started, err := tryRun()
	if err != nil {
		writeErr(w, 409, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"ok": started})
}

func apiStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, 405, "method not allowed")
		return
	}
	if !isBusy() {
		writeErr(w, 409, "当前没有正在进行的优选")
		return
	}
	StopRun()
	writeJSON(w, map[string]interface{}{"ok": true})
}

func apiResults(w http.ResponseWriter, r *http.Request) {
	resultMu.RLock()
	defer resultMu.RUnlock()
	writeJSON(w, lastResult)
}

func apiLogs(w http.ResponseWriter, r *http.Request) {
	after := atoiDefault(r.URL.Query().Get("after"), -1)
	lines, next := Log.Snapshot(after)
	writeJSON(w, map[string]interface{}{"lines": lines, "next": next})
}

func apiLogsExport(w http.ResponseWriter, r *http.Request) {
	lines := Log.All()
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="cf-auto-log.txt"`)
	for _, l := range lines {
		fmt.Fprintln(w, l)
	}
}

func apiLogsClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, 405, "method not allowed")
		return
	}
	Log.Clear()
	writeJSON(w, map[string]interface{}{"ok": true})
}

func atoiDefault(s string, d int) int {
	n := 0
	ok := false
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			ok = false
			break
		}
		n = n*10 + int(ch-'0')
		ok = true
	}
	if !ok {
		return d
	}
	return n
}

func apiGistVerify(w http.ResponseWriter, r *http.Request) {
	c := cur()
	if c.Gist.Token == "" || c.Gist.ID == "" {
		writeErr(w, 400, "请先填写 GitHub Token 和 Gist ID")
		return
	}
	content, err := gistGetFile(c.Gist.Token, c.Gist.ID, c.Gist.Filename, c.Gist.ProxyURL)
	if err != nil {
		if strings.Contains(err.Error(), "404") {
			writeJSON(w, map[string]interface{}{"ok": true, "message": "Gist 可访问，目标文件 " + c.Gist.Filename + " 尚不存在（首次上传时创建）"})
			return
		}
		writeErr(w, 502, "Gist 验证失败: "+err.Error())
		return
	}
	lines := 0
	for _, l := range strings.Split(content, "\n") {
		if l = strings.TrimSpace(l); l != "" && !strings.HasPrefix(l, "#") {
			lines++
		}
	}
	writeJSON(w, map[string]interface{}{"ok": true, "message": fmt.Sprintf("Gist 验证成功，当前 %s 有 %d 个节点", c.Gist.Filename, lines)})
}

func apiUpload(w http.ResponseWriter, r *http.Request) {
	c := cur()
	filename := c.Gist.Filename
	cacheFile := filepath.Join(tmpDir(), "state_"+filename+".txt")
	data, err := os.ReadFile(cacheFile)
	if err != nil {
		writeErr(w, 404, "暂无本地缓存结果，请先跑一轮优选")
		return
	}
	if err := gistPatchFile(c.Gist.Token, c.Gist.ID, filename, string(data), c.Gist.ProxyURL); err != nil {
		writeErr(w, 502, "上传失败: "+err.Error())
		return
	}
	Log.Addf("[Gist] 手动重传 %s 成功", filename)
	writeJSON(w, map[string]interface{}{"ok": true})
}

func apiEngineInfo(w http.ResponseWriter, r *http.Request) {
	c := cur()
	latest, _ := cfstLatestVersion(c.Gist.ProxyURL)
	writeJSON(w, engineInfo{
		Current: engineCurrentVersion(),
		Latest:  latest,
		Path:    cfstPath(),
	})
}

func apiAppRelease(w http.ResponseWriter, r *http.Request) {
	c := cur()
	rel, err := appLatestRelease(c.Gist.ProxyURL)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"tag": rel.Tag, "body": rel.Body, "url": rel.URL, "update_available": isNewerVersion(Version, rel.Tag)})
}

func apiAppUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := appUpdate(cur()); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"ok": true})
}

func apiEngineUpdate(w http.ResponseWriter, r *http.Request) {
	if err := engineUpdate(cur()); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"ok": true, "version": engineCurrentVersion()})
}

func main() {
	flag.StringVar(&configPath, "config", defaultConfigPath(), "配置文件路径")
	listen := flag.String("listen", "", "覆盖配置中的监听地址")
	flag.Parse()

	_ = os.MkdirAll(tmpDir(), 0755)
	_ = os.MkdirAll(dataDir(), 0755)

	c, err := LoadConfig(configPath)
	if err != nil {
		fmt.Println("加载配置失败:", err)
		os.Exit(1)
	}
	if *listen != "" {
		c.Listen = *listen
	}
	cfgPtr.Store(c)

	Log.Addf("cf-auto v%s 启动 | 配置: %s | 面板: %s | 引擎: %s (%s)",
		Version, configPath, c.Listen, engineCurrentVersion(), cfstPath())

	go scheduleLoop()

	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		fmt.Println("嵌入前端异常:", err)
		os.Exit(1)
	}
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(sub)))
	mux.HandleFunc("/api/status", apiStatus)
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			apiSetConfig(w, r)
			return
		}
		apiGetConfig(w, r)
	})
	mux.HandleFunc("/api/run", apiRun)
	mux.HandleFunc("/api/stop", apiStop)
	mux.HandleFunc("/api/results", apiResults)
	mux.HandleFunc("/api/logs", apiLogs)
	mux.HandleFunc("/api/logs/export", apiLogsExport)
	mux.HandleFunc("/api/logs/clear", apiLogsClear)
	mux.HandleFunc("/api/gist/verify", apiGistVerify)
	mux.HandleFunc("/api/upload", apiUpload)
	mux.HandleFunc("/api/engine", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			apiEngineUpdate(w, r)
			return
		}
		apiEngineInfo(w, r)
	})
	mux.HandleFunc("/api/apprelease", apiAppRelease)
	mux.HandleFunc("/api/appupdate", apiAppUpdate)

	if err := http.ListenAndServe(c.Listen, mux); err != nil {
		fmt.Println("HTTP 服务失败:", err)
		os.Exit(1)
	}
}
