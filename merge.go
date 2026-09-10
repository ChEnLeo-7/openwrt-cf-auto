package main

import (
	"encoding/json"
	"os"
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
	Region  string
}

func (r ResultRow) EP() string {
	return r.IP + ":" + strconv.Itoa(r.Port)
}

type EntryMeta struct {
	EP      string  `json:"ep"`
	Region  string  `json:"region"`
	Latency float64 `json:"latency"`
	Speed   float64 `json:"speed"`
	Tag     string  `json:"tag"`
}

type ResultStats struct {
	TestedN int         `json:"tested_n"`
	Added   int         `json:"added"`
	Kept    int         `json:"kept"`
	Dropped int         `json:"dropped"`
	Time    string      `json:"time"`
	Content string      `json:"content"`
	Entries []EntryMeta `json:"entries"`
}

type appState struct {
	Ledgers map[string]map[string]int `json:"ledgers"`
}

func loadState() *appState {
	st := &appState{Ledgers: map[string]map[string]int{}}
	b, err := os.ReadFile(statePath())
	if err == nil {
		_ = json.Unmarshal(b, st)
	}
	if st.Ledgers == nil {
		st.Ledgers = map[string]map[string]int{}
	}
	return st
}

func saveState(st *appState) {
	b, _ := json.MarshalIndent(st, "", " ")
	_ = os.MkdirAll(dataDir(), 0755)
	_ = os.WriteFile(statePath(), b, 0600)
}

// parseExisting 提取旧结果文件中的上榜条目；兼容旧版内嵌账本（迁移用）
func parseExisting(content string) (order []string, tags map[string]string, legacyLedger map[string]int) {
	tags = map[string]string{}
	legacyLedger = map[string]int{}
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(strings.TrimRight(line, "\r"))
		if line == "" {
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
					legacyLedger[p[0]] = n
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
	return order, tags, legacyLedger
}

// renderTag 按用户模板渲染节点 # 后信息；空片段自动省略
func renderTag(r ResultRow, template string) string {
	spd := ""
	if r.Speed > 0 {
		spd = strconv.FormatFloat(r.Speed, 'f', 1, 64) + "MB/s"
	}
	out := strings.ReplaceAll(template, "{region}", r.Region)
	out = strings.ReplaceAll(out, "{latency}", strconv.FormatFloat(r.Latency, 'f', 0, 64))
	out = strings.ReplaceAll(out, "{speed}", spd)
	out = strings.ReplaceAll(out, "{date}", time.Now().Format("01-02"))
	var parts []string
	for _, seg := range strings.Split(out, "|") {
		seg = strings.TrimSpace(seg)
		if seg != "" {
			parts = append(parts, seg)
		}
	}
	if len(parts) == 0 {
		return "cf-auto"
	}
	return strings.Join(parts, " | ")
}

// mergeResults 合并本轮结果与历史榜；注释头只保留版本与更新日期
func mergeResults(oldContent string, rows []ResultRow, ledger map[string]int, cfg *Config) (string, ResultStats) {
	less := func(a, b ResultRow) bool {
		if cfg.Method == "bandwidth" {
			if a.Speed != b.Speed {
				return a.Speed > b.Speed
			}
			return a.Latency < b.Latency
		}
		return a.Latency < b.Latency
	}
	passing := make([]ResultRow, 0, len(rows))
	for _, r := range rows {
		if r.Latency > 0 {
			passing = append(passing, r)
		}
	}
	sort.Slice(passing, func(i, j int) bool { return less(passing[i], passing[j]) })

	selected := make([]ResultRow, 0, cfg.TopN)
	selectedEP := map[string]bool{}
	for _, r := range passing {
		if len(selected) >= cfg.TopN {
			break
		}
		if !selectedEP[r.EP()] {
			selected = append(selected, r)
			selectedEP[r.EP()] = true
		}
	}

	// 区域保护：每个选中地区至少保留 MinPerRegion 个
	if cfg.Region.Enabled && len(cfg.Region.Colos) > 0 {
		for _, colo := range cfg.Region.Colos {
			count := 0
			for _, r := range selected {
				if r.Region == colo {
					count++
				}
			}
			if count >= cfg.Region.MinPerRegion {
				continue
			}
			for _, r := range passing {
				if count >= cfg.Region.MinPerRegion {
					break
				}
				if r.Region != colo || selectedEP[r.EP()] {
					continue
				}
				selected = append(selected, r)
				selectedEP[r.EP()] = true
				count++
			}
		}
	}

	oldOrder, oldTags, legacy := parseExisting(oldContent)
	if len(ledger) == 0 && len(legacy) > 0 {
		ledger = legacy // 兼容旧版内嵌账本迁移
	}
	rowsByEP := map[string]ResultRow{}
	for _, r := range passing {
		rowsByEP[r.EP()] = r
	}
	keptEP := map[string]bool{}
	merged := make([]string, 0, cfg.MaxLines+8)
	added, kept := 0, 0
	for _, r := range selected {
		merged = append(merged, r.EP())
		keptEP[r.EP()] = true
		oldTags[r.EP()] = renderTag(r, cfg.TagTemplate)
		ledger[r.EP()] = 0
		added++
	}
	dropped := 0
	for _, ep := range oldOrder {
		if keptEP[ep] {
			continue
		}
		m := ledger[ep] + 1
		if m >= cfg.MissLimit {
			delete(ledger, ep)
			delete(oldTags, ep)
			dropped++
			continue
		}
		ledger[ep] = m
		merged = append(merged, ep)
		keptEP[ep] = true
		kept++
	}
	if len(merged) > cfg.MaxLines {
		merged = merged[:cfg.MaxLines]
	}

	var b strings.Builder
	b.WriteString("# cf-auto v" + Version + "\n")
	b.WriteString("# updated: " + time.Now().Format("2006-01-02 15:04:05") + "\n")
	var entries []EntryMeta
	for _, ep := range merged {
		b.WriteString(ep + "#" + oldTags[ep] + "\n")
		em := EntryMeta{EP: ep, Tag: oldTags[ep]}
		if r, ok := rowsByEP[ep]; ok {
			em.Region, em.Latency, em.Speed = r.Region, r.Latency, r.Speed
		}
		entries = append(entries, em)
	}
	return b.String(), ResultStats{
		TestedN: len(rows), Added: added, Kept: kept, Dropped: dropped,
		Time:    time.Now().Format("2006-01-02 15:04:05"),
		Entries: entries,
	}
}
