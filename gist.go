package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type ghFile struct {
	Content   string `json:"content"`
	Truncated bool   `json:"truncated"`
}

type ghGist struct {
	Files map[string]ghFile `json:"files"`
}

func ghClient(proxyURL string) (*http.Client, error) {
	tr := &http.Transport{}
	if proxyURL != "" {
		u, err := url.Parse(proxyURL)
		if err != nil {
			return nil, fmt.Errorf("代理地址无效: %v", err)
		}
		tr.Proxy = http.ProxyURL(u)
	}
	return &http.Client{Timeout: 60 * time.Second, Transport: tr}, nil
}

func gistGetFile(token, gistID, filename, proxyURL string) (string, error) {
	cli, err := ghClient(proxyURL)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest("GET", "https://api.github.com/gists/"+gistID, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "cf-auto")
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := cli.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("GitHub API %d: %s", resp.StatusCode, trunc(string(body), 200))
	}
	var g ghGist
	if err := json.Unmarshal(body, &g); err != nil {
		return "", err
	}
	f, ok := g.Files[filename]
	if !ok {
		return "", nil
	}
	if f.Truncated {
		return "", fmt.Errorf("文件过大被 GitHub 截断，请换文件名或减少行数")
	}
	return f.Content, nil
}

func gistPatchFile(token, gistID, filename, content, proxyURL string) error {
	cli, err := ghClient(proxyURL)
	if err != nil {
		return err
	}
	payload := map[string]interface{}{
		"files": map[string]map[string]string{
			filename: {"content": content},
		},
	}
	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("PATCH", "https://api.github.com/gists/"+gistID, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "cf-auto")
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return fmt.Errorf("GitHub API %d: %s", resp.StatusCode, trunc(string(body), 200))
	}
	return nil
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
