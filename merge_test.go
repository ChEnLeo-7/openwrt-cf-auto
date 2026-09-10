package main

import (
	"strings"
	"testing"
)

func TestRenderTagOmitsEmptySegments(t *testing.T) {
	r := ResultRow{IP: "1.1.1.1", Port: 443, Latency: 48.4}
	got := renderTag(r, "cf-auto | {region} | {latency}ms | {speed}")
	if got != "cf-auto | 48ms" {
		t.Fatalf("renderTag = %q", got)
	}
}

func TestRegionMinimumAddsProtectedEntries(t *testing.T) {
	cfg := defaultConfig()
	cfg.TopN = 1
	cfg.MaxLines = 10
	cfg.Region.Enabled = true
	cfg.Region.Colos = []string{"SIN", "NRT"}
	cfg.Region.MinPerRegion = 1
	rows := []ResultRow{
		{IP: "1.1.1.1", Port: 443, Latency: 10, Region: "SIN"},
		{IP: "2.2.2.2", Port: 443, Latency: 20, Region: "NRT"},
	}
	_, stats := mergeResults("", rows, map[string]int{}, cfg)
	if len(stats.Entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(stats.Entries))
	}
}

func TestOverwriteIgnoresOldBoard(t *testing.T) {
	cfg := defaultConfig()
	cfg.ResultMode = "overwrite"
	cfg.TopN = 1
	cfg.MaxLines = 10
	cfg.MissLimit = 3
	old := "# CF-Auto-Top v0.1.0\n# Updated: 2026-09-10\n5.5.5.5:443#old\n6.6.6.6:443#old2\n"
	ledger := map[string]int{"5.5.5.5:443": 2, "6.6.6.6:443": 1}
	rows := []ResultRow{
		{IP: "1.1.1.1", Port: 443, Latency: 10},
		{IP: "2.2.2.2", Port: 443, Latency: 20},
	}
	content, stats := mergeResults(old, rows, ledger, cfg)
	if len(stats.Entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(stats.Entries))
	}
	if stats.Entries[0].EP != "1.1.1.1:443" {
		t.Fatalf("first entry = %+v", stats.Entries[0])
	}
	for _, ep := range []string{"5.5.5.5:443", "6.6.6.6:443"} {
		if _, ok := ledger[ep]; ok {
			t.Fatalf("ledger should drop %s in overwrite mode", ep)
		}
	}
	if stats.Kept != 0 || stats.Dropped != 0 {
		t.Fatalf("kept/dropped should be zero in overwrite, got %d/%d", stats.Kept, stats.Dropped)
	}
	if !containsLine(content, "1.1.1.1:443") || containsLine(content, "5.5.5.5:443") {
		t.Fatalf("unexpected content:\n%s", content)
	}
}

func TestMergeRetainsQualifiedOldAndEvictsAfterLimit(t *testing.T) {
	cfg := defaultConfig()
	cfg.ResultMode = "merge"
	cfg.TopN = 1
	cfg.MaxLines = 10
	cfg.MissLimit = 2
	old := "# CF-Auto-Top v0.1.0\n5.5.5.5:443#old\n6.6.6.6:443#old2\n"
	// 5.5.5.5 本轮仍达标（但排 TopN 之外）→ 保留靠后；6.6.6.6 本轮缺席第 2 轮 → 淘汰
	rows := []ResultRow{
		{IP: "1.1.1.1", Port: 443, Latency: 10},
		{IP: "5.5.5.5", Port: 443, Latency: 30},
	}
	ledger := map[string]int{"5.5.5.5:443": 1, "6.6.6.6:443": 1}
	content, stats := mergeResults(old, rows, ledger, cfg)
	if stats.Kept != 1 || stats.Dropped != 1 {
		t.Fatalf("kept/dropped = %d/%d, want 1/1", stats.Kept, stats.Dropped)
	}
	order := entryOrder(content)
	if len(order) != 2 || order[0] != "1.1.1.1" || order[1] != "5.5.5.5" {
		t.Fatalf("order = %v", order)
	}
	if ledger["5.5.5.5:443"] != 0 {
		t.Fatalf("qualified old entry should reset miss counter, got %d", ledger["5.5.5.5:443"])
	}
}

func containsLine(s, sub string) bool {
	for _, l := range strings.Split(s, "\n") {
		if ep := strings.SplitN(strings.TrimSpace(l), "#", 2)[0]; ep == sub {
			return true
		}
	}
	return false
}

func entryOrder(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		l = strings.TrimSpace(l)
		if l == "" || l[0] == '#' {
			continue
		}
		if i := strings.Index(l, ":"); i > 0 {
			out = append(out, l[:i])
		}
	}
	return out
}
