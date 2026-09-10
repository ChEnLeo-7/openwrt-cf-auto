package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

type engineInfo struct {
	Current    string `json:"current"`
	Latest     string `json:"latest"`
	Path       string `json:"path"`
	LatestBody string `json:"latest_body"`
	LatestURL  string `json:"latest_url"`
}

type releaseAsset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

type appRelease struct {
	Tag    string         `json:"tag_name"`
	Body   string         `json:"body"`
	URL    string         `json:"html_url"`
	Assets []releaseAsset `json:"assets"`
}

var versionRe = regexp.MustCompile(`v\d+\.\d+\.\d+`)

func execOutput(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func engineCurrentVersion() string {
	out, _ := execOutput(cfstPath(), "-v")
	if m := versionRe.FindString(out); m != "" {
		return m
	}
	return "未安装"
}

// cfstLatestVersion 查询测速引擎（XIU2/CloudflareSpeedTest）最新版本
func cfstLatestVersion(proxyURL string) (string, error) {
	cli, err := ghClient(proxyURL)
	if err != nil {
		return "", err
	}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/XIU2/CloudflareSpeedTest/releases/latest", nil)
	req.Header.Set("User-Agent", "cf-auto")
	resp, err := cli.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var rel struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", err
	}
	if rel.TagName == "" {
		return "", fmt.Errorf("未能获取最新版本号")
	}
	return rel.TagName, nil
}

// appLatestRelease 查询本程序（openwrt-cf-auto）最新 Release
func appLatestRelease(proxyURL string) (appRelease, error) {
	cli, err := ghClient(proxyURL)
	if err != nil {
		return appRelease{}, err
	}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/ChEnLeo-7/openwrt-cf-auto/releases/latest", nil)
	req.Header.Set("User-Agent", "cf-auto")
	resp, err := cli.Do(req)
	if err != nil {
		return appRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return appRelease{}, fmt.Errorf("GitHub Release API HTTP %d", resp.StatusCode)
	}
	var rel appRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return appRelease{}, err
	}
	if rel.Tag == "" {
		return appRelease{}, fmt.Errorf("未能获取最新版本号")
	}
	return rel, nil
}

func isNewerVersion(current, latest string) bool {
	current = strings.TrimPrefix(current, "v")
	latest = strings.TrimPrefix(latest, "v")
	var c, l [3]int
	fmt.Sscanf(current, "%d.%d.%d", &c[0], &c[1], &c[2])
	fmt.Sscanf(latest, "%d.%d.%d", &l[0], &l[1], &l[2])
	for i := range c {
		if l[i] != c[i] {
			return l[i] > c[i]
		}
	}
	return false
}

func appUpdate(cfg *Config) error {
	if isWindows() {
		return fmt.Errorf("Windows 开发环境不支持安装 ipk")
	}
	rel, err := appLatestRelease(cfg.Gist.ProxyURL)
	if err != nil {
		return err
	}
	if !isNewerVersion(Version, rel.Tag) {
		return nil
	}
	arch := "x86_64"
	if runtime.GOARCH == "arm64" {
		arch = "aarch64"
	}
	want := fmt.Sprintf("cf-auto_%s_%s.ipk", strings.TrimPrefix(rel.Tag, "v"), arch)
	assetURL := ""
	for _, a := range rel.Assets {
		if a.Name == want {
			assetURL = a.URL
			break
		}
	}
	if assetURL == "" {
		return fmt.Errorf("Release 中未找到当前架构安装包 %s", want)
	}
	path := filepath.Join(tmpDir(), want)
	if err := downloadFile(assetURL, path, cfg.Gist.ProxyURL); err != nil {
		if err2 := downloadFile("https://gh-proxy.org/"+assetURL, path, ""); err2 != nil {
			return fmt.Errorf("下载更新失败: %v / %v", err, err2)
		}
	}
	command := "nohup sh -c \"sleep 2; opkg install --force-reinstall '" + path + "'\" >/tmp/cf-auto-update.log 2>&1 </dev/null &"
	cmd := exec.Command("sh", "-c", command)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("启动安装失败: %v", err)
	}
	Log.Addf("[程序更新] 已下载 %s，将在 2 秒后安装并重启服务", want)
	return nil
}

func appUpdateLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	var last time.Time
	for range ticker.C {
		cfg := cur()
		if !cfg.AppUpdate.AutoInstall || (!last.IsZero() && time.Since(last) < time.Duration(cfg.AppUpdate.CheckHours)*time.Hour) {
			continue
		}
		last = time.Now()
		rel, err := appLatestRelease(cfg.Gist.ProxyURL)
		if err == nil && isNewerVersion(Version, rel.Tag) {
			if err := appUpdate(cfg); err != nil {
				Log.Addf("[程序更新] 自动更新失败: %v", err)
			}
		}
	}
}

func cfstAssetName() string {
	arch := runtime.GOARCH // amd64 / arm64
	if runtime.GOOS == "windows" {
		return fmt.Sprintf("cfst_windows_%s.zip", arch)
	}
	return fmt.Sprintf("cfst_linux_%s.tar.gz", arch)
}

// engineUpdate 下载最新版 CFST 替换本地引擎，失败自动回滚
func engineUpdate(cfg *Config) error {
	if isWindows() {
		return fmt.Errorf("开发环境（Windows）不支持在线更新引擎，请在路由器面板操作")
	}
	cur := cfstPath()
	Log.Addf("[引擎升级] 当前 %s，查询最新版...", engineCurrentVersion())
	latest, err := cfstLatestVersion(cfg.Gist.ProxyURL)
	if err != nil {
		return fmt.Errorf("查询最新版失败: %v", err)
	}
	if engineCurrentVersion() == latest {
		Log.Addf("[引擎升级] 已是最新版 %s", latest)
		return nil
	}
	asset := cfstAssetName()
	dlURL := fmt.Sprintf("https://github.com/XIU2/CloudflareSpeedTest/releases/download/%s/%s", latest, asset)
	tmpDirPath := tmpDir()
	_ = os.MkdirAll(tmpDirPath, 0755)
	archivePath := filepath.Join(tmpDirPath, asset)

	if err := downloadFile(dlURL, archivePath, cfg.Gist.ProxyURL); err != nil {
		Log.Addf("[引擎升级] 直连下载失败，尝试 gh-proxy 加速: %v", err)
		if err2 := downloadFile("https://gh-proxy.org/"+dlURL, archivePath, ""); err2 != nil {
			return fmt.Errorf("下载失败: %v / %v", err, err2)
		}
	}

	extracted := filepath.Join(tmpDirPath, "engine_new")
	_ = os.RemoveAll(extracted)
	_ = os.MkdirAll(extracted, 0755)
	if strings.HasSuffix(asset, ".zip") {
		err = unzip(archivePath, extracted)
	} else {
		err = untargz(archivePath, extracted)
	}
	if err != nil {
		return fmt.Errorf("解压失败: %v", err)
	}
	newBin := filepath.Join(extracted, "cfst")
	if _, err := os.Stat(newBin); err != nil {
		return fmt.Errorf("解压包中未找到 cfst 二进制")
	}

	// 备份 → 替换 → 校验 → 失败回滚
	bak := cur + ".bak"
	_ = os.Remove(bak)
	if _, err := os.Stat(cur); err == nil {
		if err := os.Rename(cur, bak); err != nil {
			return fmt.Errorf("备份旧引擎失败: %v", err)
		}
	}
	if err := copyFile(newBin, cur, 0755); err != nil {
		_ = os.Rename(bak, cur)
		return fmt.Errorf("安装新引擎失败（已回滚）: %v", err)
	}
	if v := engineCurrentVersion(); v != latest {
		_ = os.Remove(cur)
		_ = os.Rename(bak, cur)
		return fmt.Errorf("新引擎校验失败（得到 %s，已回滚）", v)
	}
	_ = os.Remove(bak)
	Log.Addf("[引擎升级] 成功升级到 %s", latest)
	return nil
}

func downloadFile(rawURL, dest, proxyURL string) error {
	cli, err := ghClient(proxyURL)
	if err != nil {
		return err
	}
	cli.Timeout = 10 * time.Minute
	resp, err := cli.Get(rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func untargz(path, dest string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		name := filepath.Base(hdr.Name)
		if hdr.Typeflag == tar.TypeReg && name == "cfst" {
			out, err := os.OpenFile(filepath.Join(dest, name), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0755)
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
}

func unzip(path, dest string) error {
	r, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := filepath.Base(f.Name)
		if name != "cfst.exe" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(filepath.Join(dest, name), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0755)
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			out.Close()
			rc.Close()
			return err
		}
		out.Close()
		rc.Close()
	}
	return nil
}
