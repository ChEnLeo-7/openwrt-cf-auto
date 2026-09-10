package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type TierResult struct {
	Time     string `json:"time"`
	Content  string `json:"content"`
	TestedN  int    `json:"tested_n"`
	Added    int    `json:"added"`
	Kept     int    `json:"kept"`
	Dropped  int    `json:"dropped"`
	Filename string `json:"filename"`
}

var (
	lastResultMu sync.RWMutex
	lastResult   = map[string]TierResult{}

	schedMu        sync.Mutex
	lastRun        = map[string]time.Time{}
	running        = map[string]bool{}
	deepMarkerFile string
)

type TierStatus struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Running bool   `json:"running"`
	LastRun string `json:"last_run"`
	NextRun string `json:"next_run"`
	LastOK  bool   `json:"last_ok"`
}

func deepDue(cfg *Config) bool {
	t, err := time.Parse("15:04", cfg.Tiers.Deep.Time)
	if err != nil {
		return false
	}
	now := time.Now()
	due := time.Date(now.Year(), now.Month(), now.Day(), t.Hour(), t.Minute(), 0, 0, now.Location())
	if now.Before(due) {
		return false
	}
	if deepMarkerFile == "" {
		deepMarkerFile = filepath.Join(tmpDir(), "deep.last")
	}
	if b, err := os.ReadFile(deepMarkerFile); err == nil {
		if string(b) == due.Format("2006-01-02") {
			return false
		}
	}
	return true
}

func markDeepDone() {
	if deepMarkerFile == "" {
		deepMarkerFile = filepath.Join(tmpDir(), "deep.last")
	}
	_ = os.MkdirAll(filepath.Dir(deepMarkerFile), 0755)
	_ = os.WriteFile(deepMarkerFile, []byte(time.Now().Format("2006-01-02")), 0644)
}

func tierDue(cfg *Config, tier string) (bool, time.Time) {
	switch tier {
	case "deep":
		if deepDue(cfg) {
			return true, time.Now()
		}
		if t, err := time.Parse("15:04", cfg.Tiers.Deep.Time); err == nil {
			now := time.Now()
			nt := time.Date(now.Year(), now.Month(), now.Day(), t.Hour(), t.Minute(), 0, 0, now.Location())
			if nt.Before(now) {
				nt = nt.AddDate(0, 0, 1)
			}
			return false, nt
		}
		return false, time.Now().Add(time.Hour)
	default:
		var tc TierCfg
		if tier == "hourly" {
			tc = cfg.Tiers.Hourly
		} else {
			tc = cfg.Tiers.Region
		}
		last := lastRun[tier]
		if last.IsZero() {
			return true, time.Now().Add(30 * time.Second)
		}
		next := last.Add(time.Duration(tc.IntervalHours) * time.Hour)
		return !now().Before(next), next
	}
}

func now() time.Time { return time.Now() }

// tryRunTier 触发一档，若该档正在运行则跳过
func tryRunTier(cfg *Config, tier string, manual bool) (bool, error) {
	schedMu.Lock()
	if running[tier] {
		schedMu.Unlock()
		return false, fmt.Errorf("档位 [%s] 正在运行中", tier)
	}
	running[tier] = true
	schedMu.Unlock()

	go func() {
		defer func() {
			schedMu.Lock()
			running[tier] = false
			schedMu.Unlock()
		}()
		err := RunTier(tier, cfg)
		schedMu.Lock()
		lastRun[tier] = time.Now()
		schedMu.Unlock()
		if tier == "deep" && err == nil {
			markDeepDone()
		}
		if err != nil {
			Log.Addf("档位 [%s] 异常结束: %v", tier, err)
		}
	}()
	_ = manual
	return true, nil
}

func schedulerLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for range tick.C {
		cfg := cur()
		schedMu.Lock()
		var due []string
		for _, tier := range []string{"hourly", "deep", "region"} {
			var tc TierCfg
			switch tier {
			case "hourly":
				tc = cfg.Tiers.Hourly
			case "deep":
				tc = cfg.Tiers.Deep
			case "region":
				tc = cfg.Tiers.Region
			}
			if !tc.Enabled || running[tier] {
				continue
			}
			ok, _ := tierDue(cfg, tier)
			if ok {
				due = append(due, tier)
			}
		}
		schedMu.Unlock()
		for _, tier := range due {
			Log.Addf("[调度] 档位 [%s] 到期，自动触发", tier)
			tryRunTier(cfg, tier, false)
		}
	}
}

func statusSnapshot(cfg *Config) []TierStatus {
	schedMu.Lock()
	defer schedMu.Unlock()
	lastResultMu.RLock()
	defer lastResultMu.RUnlock()

	out := []TierStatus{}
	for _, tier := range []string{"hourly", "deep", "region"} {
		var tc TierCfg
		switch tier {
		case "hourly":
			tc = cfg.Tiers.Hourly
		case "deep":
			tc = cfg.Tiers.Deep
		case "region":
			tc = cfg.Tiers.Region
		}
		st := TierStatus{Name: tier, Enabled: tc.Enabled, Running: running[tier]}
		if lr, ok := lastRun[tier]; ok {
			st.LastRun = lr.Format("01-02 15:04")
		} else {
			st.LastRun = "从未"
		}
		if r, ok := lastResult[tier]; ok {
			st.LastOK = true
			_ = r
		}
		_, next := tierDue(cfg, tier)
		st.NextRun = next.Format("01-02 15:04")
		out = append(out, st)
	}
	return out
}
