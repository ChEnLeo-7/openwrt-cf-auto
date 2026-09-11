package main

import (
	"bufio"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed data/community
var communityFS embed.FS

const communityBase = "https://raw.githubusercontent.com/cmliu/cmliu/main/CF-CIDR"

var ispNames = map[string]string{"ct": "电信", "cu": "联通", "cmcc": "移动", "cf": "通用"}

func ispName(isp string) string {
	if n, ok := ispNames[isp]; ok {
		return n
	}
	return "通用"
}

// ispFromText 从运营商文本中识别 ct/cu/cmcc/cf
func ispFromText(s string) string {
	low := strings.ToLower(s)
	switch {
	case strings.Contains(s, "电信"), strings.Contains(low, "telecom"):
		return "ct"
	case strings.Contains(s, "联通"), strings.Contains(low, "unicom"):
		return "cu"
	case strings.Contains(s, "移动"), strings.Contains(low, "cmcc"), strings.Contains(low, "mobile"):
		return "cmcc"
	}
	return "cf"
}

type cidrCache struct {
	ISP       string   `json:"isp"`
	FetchedAt int64    `json:"fetched_at"`
	Ranges    []string `json:"ranges"`
}

func cidrCachePath() string { return filepath.Join(dataDir(), "cidr_cache.json") }

// detectISP 通过国内直连接口检测本机运营商，返回 ct/cu/cmcc/cf，失败返回空串
func detectISP() string {
	cli := &http.Client{Timeout: 6 * time.Second}
	// 百度 qifu（国内直连）
	if out, err := httpGetText(cli, "https://qifu-api.baidubce.com/ip/local/geo/v1/district"); err == nil {
		var d struct {
			Data struct {
				ISP string `json:"isp"`
			} `json:"data"`
		}
		if json.Unmarshal([]byte(out), &d) == nil && d.Data.ISP != "" {
			if isp := ispFromText(d.Data.ISP); isp != "cf" {
				return isp
			}
		}
	}
	// cip.cc 兜底
	if out, err := httpGetText(cli, "https://cip.cc"); err == nil {
		for _, l := range strings.Split(out, "\n") {
			if strings.Contains(l, "运营商") {
				if isp := ispFromText(l); isp != "cf" {
					return isp
				}
			}
		}
	}
	return ""
}

func httpGetText(cli *http.Client, rawURL string) (string, error) {
	resp, err := cli.Get(rawURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var sb strings.Builder
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		sb.WriteString(sc.Text())
		sb.WriteString("\n")
	}
	return sb.String(), nil
}

func fetchCommunityRanges(cfg *Config) (string, []string, error) {
	ttl := time.Duration(cfg.Community.RefreshHours) * time.Hour

	var cached cidrCache
	if b, err := os.ReadFile(cidrCachePath()); err == nil {
		_ = json.Unmarshal(b, &cached)
		if len(cached.Ranges) > 0 && time.Since(time.Unix(cached.FetchedAt, 0)) < ttl {
			Log.Addf("[社区库] 使用缓存网段（%s，%d 段）", ispName(cached.ISP), len(cached.Ranges))
			return cached.ISP, cached.Ranges, nil
		}
	}

	isp := cfg.Community.ISP
	if isp == "" || isp == "auto" {
		isp = detectISP()
		if isp == "" {
			if cached.ISP != "" {
				isp = cached.ISP
			} else {
				isp = "cf"
			}
			Log.Addf("[社区库] 运营商检测失败，使用通用库 (%s)", isp)
		} else {
			Log.Addf("[社区库] 运营商检测: %s (%s)", ispName(isp), isp)
		}
	}

	ranges, err := fetchCIDROnline(isp, cfg.Gist.ProxyURL)
	if err != nil {
		if ranges, err = embeddedCommunityRanges(isp); err != nil {
			return isp, nil, err
		}
		Log.Addf("[社区库] 在线获取失败，使用内嵌快照")
	}
	Log.Addf("[社区库] 运营商 %s (%s) → 去重 %d 段", ispName(isp), isp, len(ranges))

	_ = os.MkdirAll(dataDir(), 0755)
	b, _ := json.Marshal(cidrCache{ISP: isp, FetchedAt: time.Now().Unix(), Ranges: ranges})
	_ = os.WriteFile(cidrCachePath(), b, 0600)
	return isp, ranges, nil
}

// fetchCIDROnline 拉取 cmliu/CF-CIDR 社区网段（按运营商 + 通用库合并）；直连失败走代理
func fetchCIDROnline(isp, proxyURL string) ([]string, error) {
	files := []string{}
	if isp != "cf" {
		files = append(files, "CF-CIDR/"+isp+".txt")
	}
	files = append(files, "CF-CIDR.txt")

	try := func(proxy string) ([]string, error) {
		tr := &http.Transport{}
		if proxy != "" {
			if u, err := url.Parse(proxy); err == nil {
				tr.Proxy = http.ProxyURL(u)
			}
		}
		cli := &http.Client{Timeout: 20 * time.Second, Transport: tr}
		set := map[string]bool{}
		var out []string
		for _, f := range files {
			resp, err := cli.Get(communityBase + "/" + f)
			if err != nil {
				return nil, err
			}
			if resp.StatusCode != 200 {
				resp.Body.Close()
				return nil, fmt.Errorf("%s: HTTP %d", f, resp.StatusCode)
			}
			sc := bufio.NewScanner(resp.Body)
			sc.Buffer(make([]byte, 64*1024), 1024*1024)
			for sc.Scan() {
				l := strings.TrimSpace(sc.Text())
				if cidrRe.MatchString(l) && !set[l] {
					set[l] = true
					out = append(out, l)
				}
			}
			resp.Body.Close()
		}
		if len(out) == 0 {
			return nil, errors.New("社区网段为空")
		}
		return out, nil
	}

	ranges, err := try("")
	if err == nil {
		return ranges, nil
	}
	if proxyURL != "" {
		if ranges, err2 := try(proxyURL); err2 == nil {
			Log.Addf("[社区库] 直连拉取失败，经代理成功")
			return ranges, nil
		}
	}
	return nil, err
}

// embeddedCommunityRanges 内嵌快照兜底
func embeddedCommunityRanges(isp string) ([]string, error) {
	files := []string{}
	if isp != "cf" {
		files = append(files, "data/community/"+isp+".txt")
	}
	files = append(files, "data/community/cf.txt")
	set := map[string]bool{}
	var out []string
	for _, f := range files {
		b, err := communityFS.ReadFile(f)
		if err != nil {
			continue
		}
		for _, l := range strings.Fields(string(b)) {
			if cidrRe.MatchString(l) && !set[l] {
				set[l] = true
				out = append(out, l)
			}
		}
	}
	if len(out) == 0 {
		return nil, errors.New("无内嵌社区网段")
	}
	return out, nil
}
