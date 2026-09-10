package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/http"
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

var engineBusy atomic.Bool

func isBusy() bool { return engineBusy.Load() }

var ipLineRe = regexp.MustCompile(`^((\d{1,3}\.){3}\d{1,3})(:\d+)?`)

func fetchCandidates(sources []string) ([]string, error) {
	set := map[string]bool{}
	var ips []string
	cli := &http.Client{Timeout: 25 * time.Second}
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

func runCfst(ctx context.Context, cfg *Config, port int, tier string, ipsFile, workDir string) ([]ResultRow, error) {
	csvFile := filepath.Join(workDir, fmt.Sprintf("result_%d.csv", port))
	_ = os.Remove(csvFile)
	args := []string{
		"-f", ipsFile,
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
	switch tier {
	case "deep":
		args = append(args, "-url", cfg.Cfst.URL, "-dn", strconv.Itoa(cfg.Cfst.DN), "-dt", strconv.Itoa(cfg.Cfst.DT))
	case "region":
		args = append(args, "-httping")
		if colos := cfg.Tiers.Region.Colos; strings.TrimSpace(colos) != "" {
			args = append(args, "-cfcolo", strings.TrimSpace(colos))
		}
		args = append(args, "-dd")
	default: // hourly
		args = append(args, "-dd")
	}
	if cfg.Cfst.ExtraArgs != "" {
		args = append(args, strings.Fields(cfg.Cfst.ExtraArgs)...)
	}

	enginePath := cfstPath()
	if _, err := os.Stat(enginePath); err != nil {
		return nil, fmt.Errorf("测速引擎不存在: %s", enginePath)
	}
	Log.Addf("[引擎] 端口 %d 档位 %s 启动 cfst %s", port, tier, strings.Join(args, " "))
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
	return parseCfstCSV(csvFile, port)
}

func parseCfstCSV(path string, port int) ([]ResultRow, error) {
	f, err := os.Open(path)
	if err != nil {
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
		if ipLineRe.FindStringSubmatch(ip) != nil {
			rows = append(rows, ResultRow{IP: ip, Port: port, Latency: lat, Speed: spd})
		}
	}
	Log.Addf("[引擎] 端口 %d 解析到 %d 条有效结果", port, len(rows))
	return rows, nil
}

// RunTier 执行一档完整流程：候选池 → 多端口测速 → 合并 → 上传
func RunTier(tier string, cfg *Config) error {
	if !engineBusy.CompareAndSwap(false, true) {
		return errors.New("测速引擎正忙，请稍后再试")
	}
	defer engineBusy.Store(false)

	started := time.Now()
	Log.Addf("======== 档位 [%s] 开始 ========", tier)

	if len(cfg.Sources) == 0 {
		return errors.New("优选源列表为空，请先在面板配置")
	}
	ips, err := fetchCandidates(cfg.Sources)
	if err != nil {
		return err
	}
	workDir := tmpDir()
	_ = os.MkdirAll(workDir, 0755)
	ipsFile := filepath.Join(workDir, "ips.txt")
	if err := os.WriteFile(ipsFile, []byte(strings.Join(ips, "\n")), 0644); err != nil {
		return err
	}

	var allRows []ResultRow
	for _, port := range cfg.Ports {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		rows, err := runCfst(ctx, cfg, port, tier, ipsFile, workDir)
		cancel()
		if err != nil {
			Log.Addf("[引擎] 端口 %d 测速失败: %v", port, err)
			continue
		}
		allRows = append(allRows, rows...)
	}
	if len(allRows) == 0 {
		return errors.New("本轮无任何有效测速结果（候选池或阈值过严？）")
	}

	filename := cfg.tierFilename(tier)
	oldContent := ""
	if cfg.Gist.Token != "" && cfg.Gist.ID != "" {
		if c, err := gistGetFile(cfg.Gist.Token, cfg.Gist.ID, filename, cfg.Gist.ProxyURL); err == nil {
			oldContent = c
		} else {
			Log.Addf("[Gist] 读取现有结果失败（将全新开始）: %v", err)
		}
	}
	// 本地缓存兜底（gist 不可读时）
	cacheFile := filepath.Join(workDir, "state_"+filename+".txt")
	if oldContent == "" {
		if b, err := os.ReadFile(cacheFile); err == nil {
			oldContent = string(b)
		}
	}

	newContent, _, added, kept, dropped := mergeResults(oldContent, allRows, tier, cfg)

	if cfg.Gist.Token != "" && cfg.Gist.ID != "" {
		if err := gistPatchFile(cfg.Gist.Token, cfg.Gist.ID, filename, newContent, cfg.Gist.ProxyURL); err != nil {
			Log.Addf("[Gist] 上传失败: %v", err)
			_ = os.WriteFile(cacheFile, []byte(newContent), 0644)
			return fmt.Errorf("测速完成但上传失败: %v", err)
		}
		Log.Addf("[Gist] 已上传 %s (%d 行)", filename, len(mergedLineCount(newContent)))
	} else {
		Log.Addf("[Gist] 未配置 Token/GistID，结果仅保存在本地 %s", cacheFile)
	}
	_ = os.WriteFile(cacheFile, []byte(newContent), 0644)

	lastResultMu.Lock()
	lastResult[tier] = TierResult{
		Time:     started.Format("2006-01-02 15:04:05"),
		Content:  newContent,
		TestedN:  len(allRows),
		Added:    added,
		Kept:     kept,
		Dropped:  dropped,
		Filename: filename,
	}
	lastResultMu.Unlock()

	Log.Addf("======== 档位 [%s] 完成：上榜 %d（新增 %d 保留 %d 淘汰 %d）耗时 %s ========",
		tier, len(mergedLineCount(newContent)), added, kept, dropped, time.Since(started).Round(time.Second))
	return nil
}

func mergedLineCount(content string) []string {
	var out []string
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			out = append(out, line)
		}
	}
	return out
}
