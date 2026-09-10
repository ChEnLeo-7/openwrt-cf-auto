package main

import "testing"

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
