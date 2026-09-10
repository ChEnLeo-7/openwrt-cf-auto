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

const Version = "0.1.0"

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
	Version    string       `json:"version"`
	Engine     string       `json:"engine"`
	Busy       bool         `json:"busy"`
	GistOK     bool         `json:"gist_configured"`
	ConfigPath string       `json:"config_path"`
	Tiers      []TierStatus `json:"tiers"`
}

func apiStatus(w http.ResponseWriter, r *http.Request) {
	c := cur()
	writeJSON(w, statusResp{
		Version:    Version,
		Engine:     engineCurrentVersion(),
		Busy:       isBusy(),
		GistOK:     c.Gist.Token != "" && c.Gist.ID != "",
		ConfigPath: configPath,
		Tiers:      statusSnapshot(c),
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
	if in.Listen == "" {
		in.Listen = old.Listen
	}
	if in.Gist.Filename == "" {
		in.Gist.Filename = old.Gist.Filename
	}
	in.normalize()
	if err := SaveConfig(configPath, &in); err != nil {
		writeErr(w, 500, "保存配置失败: "+err.Error())
		return
	}
	cfgPtr.Store(&in)
	Log.Addf("[配置] 已更新：源 %d 个 / 端口 %v / Top%d / Gist %s", len(in.Sources), in.Ports, in.TopN, in.Gist.ID)
	writeJSON(w, map[string]interface{}{"ok": true})
}

func apiRun(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Tier string `json:"tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || !validTier(in.Tier) {
		writeErr(w, 400, "tier 无效（hourly/deep/region）")
		return
	}
	started, err := tryRunTier(cur(), in.Tier, true)
	if err != nil {
		writeErr(w, 409, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"ok": started})
}

func validTier(t string) bool { return t == "hourly" || t == "deep" || t == "region" }

func apiResults(w http.ResponseWriter, r *http.Request) {
	lastResultMu.RLock()
	defer lastResultMu.RUnlock()
	out := map[string]TierResult{}
	for k, v := range lastResult {
		out[k] = v
	}
	writeJSON(w, out)
}

func apiLogs(w http.ResponseWriter, r *http.Request) {
	after := atoiDefault(r.URL.Query().Get("after"), -1)
	lines, next := Log.Snapshot(after)
	writeJSON(w, map[string]interface{}{"lines": lines, "next": next})
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
		// 文件不存在但 gist 本身可达的情况
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
	var in struct {
		Tier string `json:"tier"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	if !validTier(in.Tier) {
		in.Tier = "hourly"
	}
	c := cur()
	filename := c.tierFilename(in.Tier)
	cacheFile := filepath.Join(tmpDir(), "state_"+filename+".txt")
	data, err := os.ReadFile(cacheFile)
	if err != nil {
		writeErr(w, 404, "该档位暂无本地缓存结果，请先跑一轮测速")
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
	latest, _ := engineLatestVersion(c.Gist.ProxyURL)
	writeJSON(w, engineInfo{
		Current: engineCurrentVersion(),
		Latest:  latest,
		Path:    cfstPath(),
	})
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

	go schedulerLoop()

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
	mux.HandleFunc("/api/results", apiResults)
	mux.HandleFunc("/api/logs", apiLogs)
	mux.HandleFunc("/api/gist/verify", apiGistVerify)
	mux.HandleFunc("/api/upload", apiUpload)
	mux.HandleFunc("/api/engine", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			apiEngineUpdate(w, r)
			return
		}
		apiEngineInfo(w, r)
	})

	if err := http.ListenAndServe(c.Listen, mux); err != nil {
		fmt.Println("HTTP 服务失败:", err)
		os.Exit(1)
	}
}
