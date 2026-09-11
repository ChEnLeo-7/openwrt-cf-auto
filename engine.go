package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed data/official_ips.txt
var officialIPsFS embed.FS

var engineBusy atomic.Bool
var ipLineRe = regexp.MustCompile(`^((\d{1,3}\.){3}\d{1,3})(:\d+)?`)
var cidrRe = regexp.MustCompile(`^((\d{1,3}\.){3}\d{1,3})/(\d{1,2})$`)

func isBusy() bool { return engineBusy.Load() }

func fetchCandidates(sources []string, proxyURL string) ([]string, error) {
	set := map[string]bool{}
	var ips []string
	tr := &http.Transport{}
	if proxyURL != "" {
		if u, err := url.Parse(proxyURL); err == nil {
			tr.Proxy = http.ProxyURL(u)
		}
	}
	cli := &http.Client{Timeout: 25 * time.Second, Transport: tr}
	fetched := 0
	for _, src := range sources {
		src = strings.TrimSpace(src)
		if src == "" {
			continue
		}
		resp, err := cli.Get(src)
		if err != nil {
			Log.Addf("[候选池] 拉取失败 %s: %v", src, err)
			continue
		}
		sc := bufio.NewScanner(resp.Body)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if i := strings.Index(line, "#"); i >= 0 {
				line = line[:i]
			}
			line = strings.TrimSpace(line)
			m := ipLineRe.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			ip := m[1]
			if !set[ip] {
				set[ip] = true
				ips = append(ips, ip)
			}
		}
		resp.Body.Close()
		fetched++
	}
	if fetched == 0 {
		return nil, errors.New("所有优选源均拉取失败")
	}
	sort.Strings(ips)
	Log.Addf("[候选池] %d 个源成功，去重后 %d 个候选 IP", fetched, len(ips))
	return ips, nil
}

// fetchOfficialRanges 获取 Cloudflare 官方 IPv4 网段；在线失败时回退到内嵌快照
func fetchOfficialRanges() ([]string, error) {
	cli := &http.Client{Timeout: 20 * time.Second}
	resp, err := cli.Get("https://api.cloudflare.com/client/v4/ips")
	if err == nil {
		defer resp.Body.Close()
		var d struct {
			Success bool `json:"success"`
			Result  struct {
				IPv4CIDRs []string `json:"ipv4_cidrs"`
			} `json:"result"`
		}
		if json.NewDecoder(resp.Body).Decode(&d) == nil && d.Success && len(d.Result.IPv4CIDRs) > 0 {
			Log.Addf("[候选池] Cloudflare 官方网段获取成功：%d 个 CIDR", len(d.Result.IPv4CIDRs))
			return d.Result.IPv4CIDRs, nil
		}
	}
	b, err := officialIPsFS.ReadFile("data/official_ips.txt")
	if err != nil {
		return nil, errors.New("官方网段获取失败且无内嵌快照")
	}
	Log.Addf("[候选池] 在线获取官方网段失败，使用内嵌快照")
	return strings.Fields(string(b)), nil
}

var errNoQualified = errors.New("本轮 0 达标")

func runCfst(ctx context.Context, cfg *Config, port int, region string, listFile, workDir string) ([]ResultRow, error) {
	csvFile := filepath.Join(workDir, fmt.Sprintf("result_%d_%s.csv", port, sanitize(region)))
	_ = os.Remove(csvFile)
	args := []string{
		"-f", listFile,
		"-tp", strconv.Itoa(port),
		"-p", "20",
		"-o", csvFile,
	}
	if cfg.Cfst.TLL > 0 {
		args = append(args, "-tll", strconv.Itoa(cfg.Cfst.TLL))
	}
	if cfg.Cfst.TL > 0 {
		args = append(args, "-tl", strconv.Itoa(cfg.Cfst.TL))
	}
	if region != "" || cfg.Cfst.HTTPing {
		args = append(args, "-httping")
	}
	if region != "" {
		args = append(args, "-cfcolo", region)
	}
	if cfg.Method == "bandwidth" {
		args = append(args, "-url", cfg.Cfst.URL, "-dn", strconv.Itoa(cfg.Cfst.DN), "-dt", strconv.Itoa(cfg.Cfst.DT))
	} else {
		args = append(args, "-dd")
	}
	if cfg.Cfst.ExtraArgs != "" {
		args = append(args, strings.Fields(cfg.Cfst.ExtraArgs)...)
	}

	enginePath := cfstPath()
	if _, err := os.Stat(enginePath); err != nil {
		return nil, fmt.Errorf("测速引擎不存在: %s", enginePath)
	}
	label := fmt.Sprintf("端口 %d", port)
	if region != "" {
		label += " 机房 " + region
	}
	Log.Addf("[引擎] %s 模式 %s 启动 cfst %s", label, cfg.Method, strings.Join(args, " "))
	cmd := exec.CommandContext(ctx, enginePath, args...)
	cmd.Dir = filepath.Dir(enginePath)
	out, err := cmd.CombinedOutput()
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimRight(line, "\r")
		if line != "" && !strings.Contains(line, "开始测试") && !strings.Contains(line, "完整测速结果") {
			Log.Addf("[引擎] %s", line)
		}
	}
	if ctx.Err() != nil {
		return nil, errors.New("测速超时被终止")
	}
	if err != nil {
		return nil, fmt.Errorf("cfst 退出异常: %v", err)
	}
	return parseCfstCSV(csvFile, port, region)
}

func sanitize(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			return r
		}
		return '_'
	}, s)
}

func parseCfstCSV(path string, port int, region string) ([]ResultRow, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errNoQualified // cfst 在 0 达标时不会写出结果文件
		}
		return nil, fmt.Errorf("打开结果 CSV 失败: %v", err)
	}
	defer f.Close()
	var rows []ResultRow
	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		if first {
			first = false
			continue
		}
		fl := strings.Split(line, ",")
		if len(fl) < 6 {
			continue
		}
		ip := strings.TrimSpace(fl[0])
		if ipLineRe.FindStringSubmatch(ip) == nil {
			continue
		}
		lat, _ := strconv.ParseFloat(strings.TrimSpace(fl[4]), 64)
		spd, _ := strconv.ParseFloat(strings.TrimSpace(fl[5]), 64)
		rows = append(rows, ResultRow{IP: ip, Port: port, Latency: lat, Speed: spd, Region: region})
	}
	Log.Addf("[引擎] 端口 %d 解析到 %d 条有效结果", port, len(rows))
	return rows, nil
}

// RunOnce 完整一轮：候选池 → 测速（按方式/地区循环）→ 合并 → 上传
func RunOnce(cfg *Config) error {
	if !engineBusy.CompareAndSwap(false, true) {
		return errors.New("测速引擎正忙，请稍后再试")
	}
	defer engineBusy.Store(false)

	started := time.Now()
	Log.Addf("======== 优选开始（方式 %s / 来源 %s）========", cfg.Method, cfg.SourceMode)

	workDir := tmpDir()
	_ = os.MkdirAll(workDir, 0755)
	listFile := filepath.Join(workDir, "ips.txt")

	switch cfg.SourceMode {
	case "official":
		ranges, err := fetchOfficialRanges()
		if err != nil {
			return err
		}
		if err := os.WriteFile(listFile, []byte(strings.Join(ranges, "\n")), 0644); err != nil {
			return err
		}
	case "community":
		_, ranges, err := fetchCommunityRanges(cfg)
		if err != nil {
			Log.Addf("[社区库] 获取失败（%v），回退 CF 官方网段", err)
			if ranges, err = fetchOfficialRanges(); err != nil {
				return err
			}
		}
		if err := os.WriteFile(listFile, []byte(strings.Join(ranges, "\n")), 0644); err != nil {
			return err
		}
	default:
		if len(cfg.Sources) == 0 {
			return errors.New("优选源列表为空，请先在面板配置（或切换为 CF 官方源模式）")
		}
		ips, err := fetchCandidates(cfg.Sources, cfg.Gist.ProxyURL)
		if err != nil {
			return err
		}
		if err := os.WriteFile(listFile, []byte(strings.Join(ips, "\n")), 0644); err != nil {
			return err
		}
	}

	regions := []string{""}
	if cfg.Region.Enabled && len(cfg.Region.Colos) > 0 {
		regions = cfg.Region.Colos
	}

	var allRows []ResultRow
	for _, port := range cfg.Ports {
		for _, region := range regions {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			rows, err := runCfst(ctx, cfg, port, region, listFile, workDir)
			cancel()
			if err != nil {
				if errors.Is(err, errNoQualified) {
					if region != "" {
						Log.Addf("[区域] 端口 %d 机房 %s 本轮 0 达标（本线路可能不路由到 %s），跳过", port, region, region)
					} else {
						Log.Addf("[区域] 端口 %d 本轮 0 达标（阈值过严或线路不通），跳过", port)
					}
				} else {
					Log.Addf("[引擎] 端口 %d 机房 %s 测速失败: %v", port, region, err)
				}
				continue
			}
			allRows = append(allRows, rows...)
		}
	}
	if len(allRows) == 0 {
		return errors.New("本轮无任何有效测速结果（候选池、阈值或机房过滤过严？）")
	}

	enrichRegions(allRows, cfg)

	filename := cfg.Gist.Filename
	oldContent := ""
	if cfg.Gist.Token != "" && cfg.Gist.ID != "" {
		if c, err := gistGetFile(cfg.Gist.Token, cfg.Gist.ID, filename, cfg.Gist.ProxyURL); err == nil {
			oldContent = c
		} else {
			Log.Addf("[Gist] 读取现有结果失败（将全新开始）: %v", err)
		}
	}
	cacheFile := filepath.Join(workDir, "state_"+filename+".txt")
	if oldContent == "" {
		if b, err := os.ReadFile(cacheFile); err == nil {
			oldContent = string(b)
		}
	}

	st := loadState()
	ledger := st.Ledgers[filename]
	if ledger == nil {
		ledger = map[string]int{}
	}
	newContent, stats := mergeResults(oldContent, allRows, ledger, cfg)
	st.Ledgers[filename] = ledger
	saveState(st)

	if cfg.Gist.Token != "" && cfg.Gist.ID != "" {
		if cfg.Gist.AutoUpload != nil && !*cfg.Gist.AutoUpload {
			Log.Addf("[Gist] 自动上传已关闭，结果仅保存在本地（可在概览页手动上传）")
		} else if err := gistPatchFile(cfg.Gist.Token, cfg.Gist.ID, filename, newContent, cfg.Gist.ProxyURL); err != nil {
			Log.Addf("[Gist] 上传失败: %v", err)
			_ = os.WriteFile(cacheFile, []byte(newContent), 0644)
			return fmt.Errorf("优选完成但上传失败: %v", err)
		} else {
			Log.Addf("[Gist] 已上传 %s (%d 行)", filename, len(strings.Split(strings.TrimSpace(newContent), "\n")))
		}
	} else {
		Log.Addf("[Gist] 未配置 Token/GistID，结果仅保存在本地 %s", cacheFile)
	}
	_ = os.WriteFile(cacheFile, []byte(newContent), 0644)

	stats.Content = newContent
	resultMu.Lock()
	lastResult = stats
	resultMu.Unlock()

	Log.Addf("======== 优选完成：上榜 %d（新增 %d 保留 %d 淘汰 %d）耗时 %s ========",
		countEntries(newContent), stats.Added, stats.Kept, stats.Dropped, time.Since(started).Round(time.Second))
	return nil
}

func countEntries(content string) int {
	n := 0
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			n++
		}
	}
	return n
}

// enrichRegions 为缺少地区信息的结果补全落地机房（通过 CF 的 cdn-cgi/trace 接口）。
// 区域定向开启时 httping 已带地区，无需处理；仅补全最可能上榜的候选，控制耗时。
func enrichRegions(rows []ResultRow, cfg *Config) {
	if cfg.Region.Enabled {
		return
	}
	var pending []*ResultRow
	for i := range rows {
		if rows[i].Region == "" && rows[i].Latency > 0 {
			pending = append(pending, &rows[i])
		}
	}
	if len(pending) == 0 {
		return
	}
	sort.Slice(pending, func(i, j int) bool { return pending[i].Latency < pending[j].Latency })
	limit := cfg.TopN + 60
	if len(pending) > limit {
		pending = pending[:limit]
	}

	sem := make(chan struct{}, 10)
	done := make(chan struct{}, len(pending))
	for _, r := range pending {
		sem <- struct{}{}
		go func(r *ResultRow) {
			defer func() { <-sem; done <- struct{}{} }()
			if colo := fetchColo(r.IP, r.Port); colo != "" {
				r.Region = colo
			}
		}(r)
	}
	for range pending {
		<-done
	}
	ok := 0
	for _, r := range pending {
		if r.Region != "" {
			ok++
		}
	}
	Log.Addf("[地区] 已补全 %d/%d 个候选的落地机房", ok, len(pending))
}

// fetchColo 直连该 IP 的 /cdn-cgi/trace 读取落地机房代码
func fetchColo(ip string, port int) string {
	d := &net.Dialer{Timeout: 4 * time.Second}
	conn, err := tls.DialWithDialer(d, "tcp", net.JoinHostPort(ip, strconv.Itoa(port)), &tls.Config{
		ServerName:         ip,
		InsecureSkipVerify: true,
		MinVersion:         tls.VersionTLS12,
	})
	if err != nil {
		return ""
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(4 * time.Second))
	if _, err := fmt.Fprintf(conn, "GET /cdn-cgi/trace HTTP/1.1\r\nHost: %s\r\nUser-Agent: cf-auto\r\nConnection: close\r\n\r\n", ip); err != nil {
		return ""
	}
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 1024)
	for len(buf) < 16*1024 {
		n, err := conn.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			if i := strings.Index(string(buf), "colo="); i >= 0 {
				break
			}
		}
		if err != nil {
			break
		}
	}
	for _, line := range strings.Split(string(buf), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "colo=") {
			return strings.TrimSpace(strings.TrimPrefix(line, "colo="))
		}
	}
	return ""
}
