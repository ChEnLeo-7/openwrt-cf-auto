package main

import (
	"strings"
	"testing"
)

func TestExpandColoFilterCountryCode(t *testing.T) {
	got := expandColoFilter(" us ")
	if got == "US" || got == "" {
		t.Fatalf("country code was not expanded: %q", got)
	}
	for _, colo := range countryColos["US"] {
		if !strings.Contains(","+got+",", ","+colo+",") {
			t.Fatalf("expanded US filter misses %s: %q", colo, got)
		}
	}
}

func TestExpandColoFilterKeepsSingleColo(t *testing.T) {
	if got := expandColoFilter(" lax "); got != "LAX" {
		t.Fatalf("single colo = %q, want LAX", got)
	}
}
