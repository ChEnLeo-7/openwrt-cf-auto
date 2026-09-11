package main

import (
	"fmt"
	"sync"
	"time"
)

type Ring struct {
	mu    sync.Mutex
	lines []string
	cap   int
}

var Log = NewRing(600)

func NewRing(capacity int) *Ring {
	return &Ring{cap: capacity}
}

func (r *Ring) Addf(format string, a ...interface{}) {
	r.Add(time.Now().Format("01-02 15:04:05") + " " + fmt.Sprintf(format, a...))
}

func (r *Ring) Add(s string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.lines) >= r.cap {
		r.lines = r.lines[len(r.lines)-r.cap+1:]
	}
	r.lines = append(r.lines, s)
	fmt.Println(s)
}

func (r *Ring) Snapshot(after int) ([]string, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := len(r.lines)
	if after >= n {
		after = n - 1
	}
	if after < -1 {
		after = -1
	}
	out := append([]string{}, r.lines[after+1:]...)
	return out, n - 1
}

func (r *Ring) All() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string{}, r.lines...)
}

func (r *Ring) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lines = nil
}
