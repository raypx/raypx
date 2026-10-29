package desktop

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/net/idna"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode/utf16"

	"github.com/pelletier/go-toml/v2"
)

type JSON = map[string]any

func Digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func ParseOrigin(raw string) (string, error) {
	invalid := errors.New("Server URL must be an HTTPS origin without credentials, path, query or fragment")
	if UTF16Length(raw) > 2048 || strings.ContainsAny(raw, "\\ \t\r\n#") {
		return "", invalid
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", invalid
	}
	loopback := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
	if u.Scheme != "https" && !(u.Scheme == "http" && loopback) {
		return "", invalid
	}
	for _, ch := range raw {
		if ch <= 32 || ch == 127 {
			return "", invalid
		}
	}
	hostname := strings.ToLower(u.Hostname())
	if net.ParseIP(hostname) == nil {
		var err error
		hostname, err = idna.Lookup.ToASCII(hostname)
		if err != nil {
			return "", invalid
		}
	}
	host := hostname
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if u.Port() != "" {
		host += ":" + u.Port()
	}
	if (u.Scheme == "https" && u.Port() == "443") || (u.Scheme == "http" && u.Port() == "80") {
		host = hostname
		if strings.Contains(host, ":") {
			host = "[" + host + "]"
		}
	}
	return u.Scheme + "://" + host, nil
}

type Config struct {
	APIURL      string `json:"apiUrl"`
	WebURL      string `json:"webUrl"`
	Scope       string `json:"-"`
	Directories JSON   `json:"-"`
}

var profileName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func ParseConfig(source []byte) (Config, error) {
	fail := func() (Config, error) { return Config{}, errors.New("Invalid desktop configuration") }
	if len(source) > 16*1024 {
		return fail()
	}
	var root JSON
	if toml.Unmarshal(source, &root) != nil {
		return fail()
	}
	for key := range root {
		if !strings.Contains("|base_url|web_url|profile|profiles|ai|connectors|", "|"+key+"|") {
			return fail()
		}
	}
	endpoints := func(table JSON) (string, string, error) {
		values := []string{"", ""}
		for i, key := range []string{"base_url", "web_url"} {
			if v, ok := table[key]; ok {
				raw, yes := v.(string)
				if !yes {
					return "", "", errors.New("Invalid server origin")
				}
				parsed, err := ParseOrigin(raw)
				if err != nil {
					return "", "", err
				}
				values[i] = parsed
			}
		}
		return values[0], values[1], nil
	}
	api, web, err := endpoints(root)
	if err != nil {
		return fail()
	}
	if ai, ok := root["ai"]; ok {
		if _, yes := ai.(map[string]any); !yes {
			return fail()
		}
	}
	profiles := map[string][2]string{}
	if raw, ok := root["profiles"]; ok {
		tables, yes := raw.(map[string]any)
		if !yes {
			return fail()
		}
		for name, raw := range tables {
			table, yes := raw.(map[string]any)
			if !yes || !profileName.MatchString(name) {
				return fail()
			}
			for key := range table {
				if key != "base_url" && key != "web_url" {
					return fail()
				}
			}
			a, w, err := endpoints(table)
			if err != nil {
				return fail()
			}
			profiles[name] = [2]string{a, w}
		}
	}
	if raw, ok := root["profile"]; ok {
		name, yes := raw.(string)
		selected, exists := profiles[name]
		if !yes || !exists {
			return fail()
		}
		if selected[0] != "" {
			api = selected[0]
			if selected[1] == "" {
				web = api
			}
		}
		if selected[1] != "" {
			web = selected[1]
		}
	}
	if api == "" {
		api = "https://raypx.pro"
	}
	if web == "" {
		web = api
	}
	dirs := JSON{}
	if raw, ok := root["connectors"]; ok {
		table, yes := raw.(map[string]any)
		if !yes {
			return fail()
		}
		for key, value := range table {
			name := map[string]string{"claude_config_dir": "claude", "codex_home": "codex"}[key]
			path, yes := value.(string)
			if name == "" || !yes || !filepath.IsAbs(path) {
				return fail()
			}
			dirs[name] = path
		}
	}
	for provider, name := range map[string]string{"claude": "CLAUDE_CONFIG_DIR", "codex": "CODEX_HOME"} {
		if _, ok := dirs[provider]; !ok {
			if path := os.Getenv(name); filepath.IsAbs(path) {
				dirs[provider] = path
			}
		}
	}
	return Config{api, web, Digest(api)[:32], dirs}, nil
}
func LoadConfig() (Config, error) {
	directory := os.Getenv("RAYPX_HOME")
	if directory == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return Config{}, errors.New("Unable to locate configuration")
		}
		directory = filepath.Join(home, ".raypx")
	}
	if !filepath.IsAbs(directory) {
		return Config{}, errors.New("RAYPX_HOME must be absolute")
	}
	if err := PrivateDirectory(directory); err != nil {
		return Config{}, err
	}
	file := filepath.Join(directory, "config.toml")
	if _, err := os.Stat(file); os.IsNotExist(err) {
		if err := AtomicWrite(file, []byte("# Raypx desktop connection\nbase_url = \"https://raypx.pro\"\n")); err != nil {
			return Config{}, err
		}
	}
	data, err := ReadBounded(file, 16*1024)
	if err != nil {
		return Config{}, errors.New("Unable to read desktop configuration")
	}
	return ParseConfig(data)
}
func ReadBounded(path string, limit int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > limit {
		return nil, errors.New("File exceeds limit")
	}
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, errors.New("Unable to read bounded file")
	}
	return data, nil
}
func PrivateDirectory(path string) error {
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	return os.Chmod(path, 0700)
}
func AtomicWrite(path string, data []byte) error {
	if err := PrivateDirectory(filepath.Dir(path)); err != nil {
		return err
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return err
	}
	name := fmt.Sprintf("%s.%x.tmp", path, random)
	f, err := os.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer os.Remove(name)
	_, writeErr := f.Write(data)
	syncErr := f.Sync()
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	if syncErr != nil {
		return syncErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, path)
}

type Preferences struct {
	mu     sync.Mutex
	file   string
	raw    JSON
	status string
}

func OpenPreferences(directory string) *Preferences {
	p := &Preferences{file: filepath.Join(directory, "preferences.json"), status: "missing"}
	if _, err := os.Stat(p.file); !os.IsNotExist(err) {
		p.status = "unreadable"
		if b, err := ReadBounded(p.file, 4096); err == nil && json.Unmarshal(b, &p.raw) == nil && p.raw != nil {
			p.status = "read"
		}
	}
	return p
}
func (p *Preferences) Snapshot() JSON {
	p.mu.Lock()
	defer p.mu.Unlock()
	return JSON{"status": p.status, "raw": clone(p.raw)}
}
func (p *Preferences) Read() JSON { p.mu.Lock(); defer p.mu.Unlock(); return clone(p.raw) }
func (p *Preferences) Save(input JSON) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	next := clone(p.raw)
	if next == nil {
		next = JSON{}
	}
	for k, v := range input {
		next[k] = v
	}
	b, err := json.Marshal(next)
	if err != nil || len(b) > 4096 || AtomicWrite(p.file, b) != nil {
		return false
	}
	p.raw = next
	p.status = "read"
	return true
}
func clone(input JSON) JSON {
	if input == nil {
		return nil
	}
	b, _ := json.Marshal(input)
	var out JSON
	_ = json.Unmarshal(b, &out)
	return out
}

func UTF16Length(value string) int { return len(utf16.Encode([]rune(value))) }
