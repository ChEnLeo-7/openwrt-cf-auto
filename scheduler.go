package main

import (
	"sync"
	"time"
)

type ScheduleStatus struct {
	Enabled       bool   `json:"enabled"`
	IntervalHours int    `json:"interval_hours"`
	Running       bool   `json:"running"`
	LastRun       string `json:"last_run"`
	NextRun       string `json:"next_run"`
	LastOK        bool   `json:"last_ok"`
}

var (
	resultMu    sync.RWMutex
	lastRunAt   time.Time
	lastOK      bool
	running     bool
	lastResult  ResultStats
)

func tryRun() (bool, error) {
	schedMu2.Lock()
	if running {
		schedMu2.Unlock()
		return false, errRunning
	}
	running = true
	schedMu2.Unlock()

	go func() {
		defer func() {
			schedMu2.Lock()
			running = false
			schedMu2.Unlock()
		}()
		err := RunOnce(cur())
		resultMu.Lock()
		lastRunAt = time.Now()
		lastOK = err == nil
		resultMu.Unlock()
		if err != nil {
			Log.Addf("优选异常结束: %v", err)
		}
	}()
	return true, nil
}

var errRunning = &staticError{"优选正在运行中"}

type staticError struct{ s string }

func (e *staticError) Error() string { return e.s }

var schedMu2 sync.Mutex

func scheduleLoop() {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for range tick.C {
		cfg := cur()
		if !cfg.Schedule.Enabled {
			continue
		}
		resultMu.RLock()
		last := lastRunAt
		isRunning := running
		resultMu.RUnlock()
		if isRunning {
			continue
		}
		if !last.IsZero() && time.Since(last) < time.Duration(cfg.Schedule.IntervalHours)*time.Hour {
			continue
		}
		Log.Addf("[定时更新] 到期，自动触发（间隔 %d 小时）", cfg.Schedule.IntervalHours)
		tryRun()
	}
}

func scheduleStatus(cfg *Config) ScheduleStatus {
	resultMu.RLock()
	last := lastRunAt
	isRunning := running
	ok := lastOK
	resultMu.RUnlock()
	st := ScheduleStatus{
		Enabled:       cfg.Schedule.Enabled,
		IntervalHours: cfg.Schedule.IntervalHours,
		Running:       isRunning,
		LastOK:        ok,
	}
	if last.IsZero() {
		st.LastRun = "从未"
		next := time.Now().Add(30 * time.Second)
		st.NextRun = next.Format("01-02 15:04")
		if cfg.Schedule.Enabled {
			st.LastRun = "从未（启动后自动首跑）"
		}
	} else {
		st.LastRun = last.Format("01-02 15:04")
		st.NextRun = last.Add(time.Duration(cfg.Schedule.IntervalHours) * time.Hour).Format("01-02 15:04")
	}
	return st
}
