package main

import (
	"strings"
	"testing"
)

func TestIsNewerVersion(t *testing.T) {
	tests := []struct {
		current string
		latest  string
		want    bool
	}{
		{"0.1.0", "v0.2.0", true},
		{"0.2.0", "v0.2.0", false},
		{"0.2.1", "v0.2.0", false},
		{"1.0.0", "v1.0.1", true},
		{"1.9.9", "v2.0.0", true},
	}
	for _, tt := range tests {
		if got := isNewerVersion(tt.current, tt.latest); got != tt.want {
			t.Errorf("isNewerVersion(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
		}
	}
}

func TestAppReleaseEndpoint(t *testing.T) {
	if got := appReleaseEndpoint(""); !strings.HasSuffix(got, "/releases/latest") {
		t.Fatalf("latest endpoint = %q", got)
	}
	for _, tag := range []string{"0.3.2", "v0.3.2"} {
		got := appReleaseEndpoint(tag)
		if !strings.HasSuffix(got, "/releases/tags/v0.3.2") {
			t.Fatalf("tag endpoint for %q = %q", tag, got)
		}
	}
}
