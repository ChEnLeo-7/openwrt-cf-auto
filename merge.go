package main

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

type ResultRow struct {
	IP      string
	Port    int
	Latency float64
	Speed   float64
}

func (r ResultRow) EP() string {
	return r.IP + ":" + strconv.Itoa(r.Port)
}

type entryMeta struct {
	Tag  string
	Miss int
}

func rowTag(r ResultRow, tier, colos string) string {
	parts := []string{"cf-auto"}
	if tier == "region" && colos != "" {
		parts = append(parts, colos)
	}
	parts = append(parts, fmt.Sprintf("%.0fms", r.Latency))
	if r.Speed > 0 {
		parts = append(parts, fmt.Sprintf("%.1fMbps", r.Speed))
	}
	return strings.Join(parts, " | ")
}

func parseExisting(content string) (order []string, tags map[string]string, ledger map[string]int) {
	tags = map[string]string{}
	ledger = map[string]int{}
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimRight(line, "\r")
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "#") && !strings.Contains(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "# ledger:") {
			body := strings.TrimPrefix(line, "# ledger:")
			for _, kv := range strings.Split(body, ";") {
				kv = strings.TrimSpace(kv)
				if kv == "" {
					continue
				}
				p := strings.SplitN(kv, "=", 2)
				if len(p) == 2 {
					n, _ := strconv.Atoi(p[1])
					ledger[p[0]] = n
				}
			}
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "#")
		if idx <= 0 {
			continue
		}
		ep := strings.TrimSpace(line[:idx])
		if ep == "" {
			continue
		}
		order = append(order, ep)
		tags[ep] = strings.TrimSpace(line[idx+1:])
	}
	return order, tags, ledger
}

// mergeResults merges this round's passing rows into the existing gist file
// content with decay-based eviction. Returns new file content and stats.
func mergeResults(oldContent string, rows []ResultRow, tier string, cfg *Config) (string, map[string]int, int, int, int) {
	colos := ""
	if tier == "region" {
		colos = cfg.Tiers.Region.Colos
	}

	passing := make([]ResultRow, 0, len(rows))
	passingIP := map[string]bool{}
	passingEP := map[string]bool{}
	for _, r := range rows {
		if r.Latency <= 0 {
			continue
		}
		passing = append(passing, r)
		passingIP[r.IP] = true
		passingEP[r.EP()] = true
	}
	if tier == "deep" {
		sort.Slice(passing, func(i, j int) bool {
			if passing[i].Speed != passing[j].Speed {
				return passing[i].Speed > passing[j].Speed
			}
			return passing[i].Latency < passing[j].Latency
		})
	} else {
		sort.Slice(passing, func(i, j int) bool {
			return passing[i].Latency < passing[j].Latency
		})
	}

	order, tags, ledger := parseExisting(oldContent)
	if ledger == nil {
		ledger = map[string]int{}
	}

	newTopCount := cfg.TopN
	if newTopCount > len(passing) {
		newTopCount = len(passing)
	}
	newTop := passing[:newTopCount]
	rest := passing[newTopCount:]

	merged := make([]string, 0, cfg.MaxLines+8)
	seen := map[string]bool{}
	added, kept := 0, 0

	for _, r := range newTop {
		merged = append(merged, r.EP())
		seen[r.EP()] = true
		tags[r.EP()] = rowTag(r, tier, colos)
		ledger[r.EP()] = 0
		added++
	}
	// 仍达标的旧上榜 IP：出现在本轮通过集合里（按 IP 匹配，端口以旧上榜为准）
	for _, ep := range order {
		if seen[ep] {
			continue
		}
		ip := ep[:strings.Index(ep, ":")]
		if passingIP[ip] {
			if _, ok := passingEP[ep]; ok {
				for _, r := range rest {
					if r.EP() == ep {
						tags[ep] = rowTag(r, tier, colos)
						break
					}
				}
			}
			merged = append(merged, ep)
			seen[ep] = true
			ledger[ep] = 0
			kept++
		}
	}
	// 未上榜但历史在册的：落榜计数，超限淘汰
	dropped := 0
	for _, ep := range order {
		if seen[ep] {
			continue
		}
		m := ledger[ep] + 1
		if m >= cfg.MissLimit {
			delete(ledger, ep)
			delete(tags, ep)
			dropped++
			continue
		}
		ledger[ep] = m
		merged = append(merged, ep)
		seen[ep] = true
		kept++
	}

	if len(merged) > cfg.MaxLines {
		merged = merged[:cfg.MaxLines]
	}

	var b strings.Builder
	b.WriteString("# cf-auto result v1\n")
	b.WriteString("# updated: " + time.Now().Format("2006-01-02 15:04:05") + " tier=" + tier + "\n")
	b.WriteString(fmt.Sprintf("# stats: total=%d added=%d kept=%d dropped=%d limit=%d\n", len(merged), added, kept, dropped, cfg.MaxLines))
	kvs := make([]string, 0, len(ledger))
	for ep, m := range ledger {
		kvs = append(kvs, ep+"="+strconv.Itoa(m))
	}
	sort.Strings(kvs)
	b.WriteString("# ledger: " + strings.Join(kvs, ";") + "\n")
	for _, ep := range merged {
		b.WriteString(ep + "#" + tags[ep] + "\n")
	}
	return b.String(), ledger, added, kept, dropped
}
