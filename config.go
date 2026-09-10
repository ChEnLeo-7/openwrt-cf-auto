package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

type TierCfg struct {
	Enabled       bool   `json:"enabled"`
	IntervalHours int    `json:"interval_hours"`
	Time          string `json:"time"`
	Colos         string `json:"colos"`
	Filename      string `json:"filename"`
}

type CfstCfg struct {
	TL        int    `json:"tl"`
	TLL       int    `json:"tll"`
	DN        int    `json:"dn"`
	DT        int    `json:"dt"`
	URL       string `json:"url"`
	ExtraArgs string `json:"extra_args"`
}

type GistCfg struct {
	Token    string `json:"token"`
	ID       string `json:"id"`
	Filename string `json:"filename"`
	ProxyURL string `json:"proxy_url"`
}

type Config struct {
	Listen    string   `json:"listen"`
	Sources   []string `json:"sources"`
	Ports     []int    `json:"ports"`
	TopN      int      `json:"top_n"`
	MaxLines  int      `json:"max_lines"`
	MissLimit int      `json:"miss_limit"`
	Tiers     struct {
		Hourly TierCfg `json:"hourly"`
		Deep   TierCfg `json:"deep"`
		Region TierCfg `json:"region"`
	} `json:"tiers"`
	Cfst CfstCfg `json:"cfst"`
	Gist GistCfg `json:"gist"`
}

func isWindows() bool { return runtime.GOOS == "windows" }

func defaultConfigPath() string {
	if isWindows() {
		return "config.dev.json"
	}
	return "/etc/cf-auto/config.json"
}

func dataDir() string {
	if isWindows() {
		return "."
	}
	return "/etc/cf-auto"
}

func tmpDir() string {
	if isWindows() {
		return filepath.Join(os.TempDir(), "cfauto")
	}
	return "/tmp/cfauto"
}

func cfstPath() string {
	p := "vendor/windows-amd64/cfst.exe"
	if isWindows() {
		if abs, err := filepath.Abs(p); err == nil {
			return abs
		}
		return p
	}
	return "/usr/bin/cfst"
}

func defaultConfig() *Config {
	c := &Config{
		Listen:    ":7800",
		Sources:   []string{},
		Ports:     []int{443},
		TopN:      10,
		MaxLines:  25,
		MissLimit: 3,
	}
	c.Cfst = CfstCfg{
		TL:  300,
		TLL: 0,
		DN:  10,
		DT:  8,
		URL: "https://speed.cloudflare.com/__down?bytes=25000000",
	}
	c.Tiers.Hourly = TierCfg{Enabled: true, IntervalHours: 1, Filename: ""}
	c.Tiers.Deep = TierCfg{Enabled: false, Time: "03:30", Filename: ""}
	c.Tiers.Region = TierCfg{Enabled: false, IntervalHours: 3, Colos: "SIN,NRT,KIX", Filename: ""}
	c.Gist = GistCfg{Token: "", ID: "", Filename: "CF-Auto-Top.txt", ProxyURL: ""}
	return c
}

func LoadConfig(path string) (*Config, error) {
	c := defaultConfig()
	data, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(data, c); err != nil {
			return nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	c.normalize()
	if err := SaveConfig(path, c); err != nil {
		return c, err
	}
	return c, nil
}

func (c *Config) normalize() {
	if c.Listen == "" {
		c.Listen = ":7800"
	}
	if len(c.Ports) == 0 {
		c.Ports = []int{443}
	}
	if c.TopN <= 0 {
		c.TopN = 10
	}
	if c.MaxLines < c.TopN {
		c.MaxLines = c.TopN + 10
	}
	if c.MissLimit <= 0 {
		c.MissLimit = 3
	}
	if c.Cfst.TL <= 0 {
		c.Cfst.TL = 300
	}
	if c.Cfst.TLL < 0 {
		c.Cfst.TLL = 0
	}
	if c.Cfst.DN <= 0 {
		c.Cfst.DN = 10
	}
	if c.Cfst.DT <= 0 {
		c.Cfst.DT = 8
	}
	if c.Cfst.URL == "" {
		c.Cfst.URL = "https://speed.cloudflare.com/__down?bytes=25000000"
	}
	if c.Gist.Filename == "" {
		c.Gist.Filename = "CF-Auto-Top.txt"
	}
	if c.Tiers.Hourly.IntervalHours <= 0 {
		c.Tiers.Hourly.IntervalHours = 1
	}
	if c.Tiers.Region.IntervalHours <= 0 {
		c.Tiers.Region.IntervalHours = 3
	}
	if c.Tiers.Deep.Time == "" {
		c.Tiers.Deep.Time = "03:30"
	}
}

func (c *Config) tierFilename(tier string) string {
	fn := c.Gist.Filename
	if t, ok := map[string]TierCfg{"hourly": c.Tiers.Hourly, "deep": c.Tiers.Deep, "region": c.Tiers.Region}[tier]; ok && t.Filename != "" {
		fn = t.Filename
	}
	return fn
}

func SaveConfig(path string, c *Config) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
