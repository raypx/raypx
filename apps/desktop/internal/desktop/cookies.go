package desktop

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Keys interface {
	Get(string) ([]byte, error)
	Set(string, []byte) error
}
type Cookie struct {
	Name     string   `json:"name"`
	Value    string   `json:"value"`
	Domain   string   `json:"domain"`
	Path     string   `json:"path"`
	Secure   bool     `json:"secure"`
	HTTPOnly bool     `json:"httpOnly"`
	SameSite string   `json:"sameSite"`
	Expires  *float64 `json:"expirationDate,omitempty"`
}
type CookieChange struct {
	Cookie Cookie
	Remove bool
}

var authName = regexp.MustCompile(`^(?:__Secure-)?better-auth\.[a-zA-Z0-9_.-]+$`)

func ParseCookie(origin *url.URL, raw string, now time.Time) (*CookieChange, error) {
	bad := errors.New("Invalid API session cookie")
	if UTF16Length(raw) > 16384 {
		return nil, bad
	}
	parts := strings.Split(raw, ";")
	pair := strings.SplitN(parts[0], "=", 2)
	if len(pair) != 2 || !authName.MatchString(strings.TrimSpace(pair[0])) {
		return nil, nil
	}
	// ParseSetCookie removes surrounding quotes. The native cookie policy
	// validates the raw value instead, matching the retained Rust host.
	if strings.Contains(strings.TrimSpace(pair[1]), `"`) {
		return nil, bad
	}
	c, err := http.ParseSetCookie(raw)
	if err != nil {
		return nil, bad
	}
	fields := map[string]string{}
	for _, field := range parts[1:] {
		name, value, _ := strings.Cut(strings.TrimSpace(field), "=")
		fields[strings.ToLower(name)] = strings.TrimSpace(value)
	}
	host := strings.ToLower(origin.Hostname())
	if d, ok := fields["domain"]; ok {
		d = strings.TrimPrefix(strings.ToLower(d), ".")
		if d == "" || (host != d && !strings.HasSuffix(host, "."+d)) {
			return nil, bad
		}
	}
	path := fields["path"]
	if path == "" {
		path = "/"
	}
	if path != "/" && !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/rpc/") {
		return nil, bad
	}
	if strings.ContainsAny(path, " \t\r\n?#\\") {
		return nil, bad
	}
	if (origin.Scheme == "https" || strings.HasPrefix(c.Name, "__Secure-")) && (!c.Secure || !c.HttpOnly) {
		return nil, bad
	}
	same := "no_restriction"
	if s, ok := fields["samesite"]; ok {
		switch strings.ToLower(s) {
		case "none":
		case "lax":
			same = "lax"
		case "strict":
			same = "strict"
		default:
			return nil, bad
		}
	}
	var expiration *float64
	if raw, ok := fields["expires"]; ok {
		date, err := http.ParseTime(raw)
		if err != nil {
			return nil, bad
		}
		n := float64(date.Unix())
		expiration = &n
	}
	if raw, ok := fields["max-age"]; ok {
		if !regexp.MustCompile(`^-?\d+$`).MatchString(raw) {
			return nil, bad
		}
		age, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || age > 9007199254740991 || age < -9007199254740991 {
			return nil, bad
		}
		n := float64(now.Unix()) + float64(age)
		expiration = &n
	}
	if !(&CookieJar{origin: origin}).valid(Cookie{c.Name, c.Value, host, path, c.Secure, c.HttpOnly, same, expiration}) {
		return nil, bad
	}
	return &CookieChange{Cookie: Cookie{c.Name, c.Value, host, path, c.Secure, c.HttpOnly, same, expiration}, Remove: expiration != nil && *expiration <= float64(now.Unix())}, nil
}

type CookieJar struct {
	mu       sync.Mutex
	origin   *url.URL
	file     string
	key      []byte
	values   []Cookie
	poisoned bool
	Recovery string
}

func OpenCookies(directory, origin string, keys Keys) (*CookieJar, error) {
	parsed, err := ParseOrigin(origin)
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(parsed)
	jar := &CookieJar{origin: u, file: filepath.Join(directory, "session-v2.enc"), values: []Cookie{}}
	if err := PrivateDirectory(directory); err != nil {
		return nil, errors.New("Unable to open secure session directory")
	}
	cleanQuarantine(directory)
	name := Digest(jar.file)
	encoded, err := keys.Get(name)
	if err != nil {
		jar.Recovery = "temporary"
		return jar, nil
	}
	key, err := base64.StdEncoding.DecodeString(string(encoded))
	missing := len(encoded) == 0
	reset := !missing && (err != nil || len(key) != 32)
	if missing || reset {
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
	}
	if data, err := ReadBounded(jar.file, 512*1024); err == nil {
		if missing || jar.decode(data, key) != nil {
			reset = true
		}
	} else if !os.IsNotExist(err) {
		if _, exists := os.Stat(jar.file); exists == nil {
			reset = true
		} else {
			jar.Recovery = "temporary"
			return jar, nil
		}
	}
	if reset {
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
		if _, err := os.Stat(jar.file); err == nil {
			if os.Rename(jar.file, jar.file+".corrupt-"+strconv.FormatInt(time.Now().UnixNano(), 10)) != nil {
				jar.Recovery = "temporary"
				return jar, nil
			}
		}
		jar.values = []Cookie{}
		jar.Recovery = "reset"
		cleanQuarantine(directory)
	}
	if missing || reset {
		encoded = []byte(base64.StdEncoding.EncodeToString(key))
		if keys.Set(name, encoded) != nil {
			jar.Recovery = "temporary"
			jar.values = []Cookie{}
			return jar, nil
		}
		read, err := keys.Get(name)
		if err != nil || string(read) != string(encoded) {
			jar.Recovery = "temporary"
			jar.values = []Cookie{}
			return jar, nil
		}
	}
	jar.key = key
	return jar, nil
}

// Keep only recent, bounded recovery files belonging to this session format.
// Do not follow symlinks or remove another format's files.
func cleanQuarantine(directory string) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return
	}
	type item struct {
		path     string
		modified time.Time
	}
	files := []item{}
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "session-v2.enc.corrupt-") || !entry.Type().IsRegular() {
			continue
		}
		if info, err := entry.Info(); err == nil && info.Mode().IsRegular() {
			files = append(files, item{filepath.Join(directory, entry.Name()), info.ModTime()})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].modified.After(files[j].modified) })
	for index, file := range files {
		if index >= 3 || time.Since(file.modified) > 7*24*time.Hour {
			_ = os.Remove(file.path)
		}
	}
}
func MemoryCookies(origin string) *CookieJar {
	u, _ := url.Parse(origin)
	return &CookieJar{origin: u, values: []Cookie{}}
}
func (j *CookieJar) valid(c Cookie) bool {
	if !authName.MatchString(c.Name) || len(c.Value) > 16384 || c.Domain != j.origin.Hostname() || strings.ContainsAny(c.Path, " \t\r\n?#\\") || (c.Path != "/" && !strings.HasPrefix(c.Path, "/api/") && !strings.HasPrefix(c.Path, "/rpc/")) {
		return false
	}
	for _, v := range []byte(c.Value) {
		if !(v == 0x21 || v >= 0x23 && v <= 0x2b || v >= 0x2d && v <= 0x3a || v >= 0x3c && v <= 0x5b || v >= 0x5d && v <= 0x7e) {
			return false
		}
	}
	return (!(j.origin.Scheme == "https" || strings.HasPrefix(c.Name, "__Secure-")) || c.Secure && c.HTTPOnly) && (c.SameSite == "lax" || c.SameSite == "strict" || c.SameSite == "no_restriction")
}
func (j *CookieJar) decode(data, key []byte) error {
	bad := errors.New("Invalid encrypted session")
	if len(data) < 30 || data[0] != 2 {
		return bad
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return bad
	}
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, data[1:13], data[13:], []byte(j.origin.Scheme+"://"+j.origin.Host))
	if err != nil {
		return bad
	}
	defer clear(plain)
	var cookies []Cookie
	if json.Unmarshal(plain, &cookies) != nil || len(cookies) > 32 {
		return bad
	}
	for _, c := range cookies {
		if !j.valid(c) {
			return bad
		}
	}
	j.values = cookies
	return nil
}
func (j *CookieJar) Header(u *url.URL) (string, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.poisoned {
		return "", errors.New("Native session storage unavailable; restart required")
	}
	if u.Scheme != j.origin.Scheme || u.Host != j.origin.Host {
		return "", errors.New("Invalid API origin")
	}
	values := []string{}
	path := u.Path
	if path == "" {
		path = "/"
	}
	for _, c := range j.values {
		if (c.Expires == nil || *c.Expires > float64(time.Now().Unix())) && strings.HasPrefix(path, c.Path) && (!c.Secure || u.Scheme == "https") {
			values = append(values, c.Name+"="+c.Value)
		}
	}
	return strings.Join(values, "; "), nil
}
func (j *CookieJar) Apply(changes []CookieChange) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.poisoned {
		return errors.New("Native session storage unavailable; restart required")
	}
	if len(changes) == 0 {
		return nil
	}
	next := append([]Cookie{}, j.values...)
	for _, change := range changes {
		filtered := []Cookie{}
		for _, c := range next {
			if !(c.Name == change.Cookie.Name && (c.Path == change.Cookie.Path || change.Remove && strings.HasPrefix(change.Cookie.Path, c.Path))) {
				filtered = append(filtered, c)
			}
		}
		next = filtered
		if !change.Remove {
			next = append(next, change.Cookie)
		}
	}
	if len(next) > 32 {
		return errors.New("Invalid API session cookies")
	}
	for _, c := range next {
		if !j.valid(c) {
			return errors.New("Invalid API session cookies")
		}
	}
	if j.key != nil {
		persistent := []Cookie{}
		for _, c := range next {
			if c.Expires != nil && *c.Expires > float64(time.Now().Unix()) {
				persistent = append(persistent, c)
			}
		}
		plain, err := json.Marshal(persistent)
		if err != nil || len(plain) > 256*1024 {
			return errors.New("Invalid API session cookies")
		}
		defer clear(plain)
		block, _ := aes.NewCipher(j.key)
		gcm, _ := cipher.NewGCM(block)
		nonce := make([]byte, 12)
		if _, err = rand.Read(nonce); err == nil {
			bytes := append([]byte{2}, nonce...)
			bytes = append(bytes, gcm.Seal(nil, nonce, plain, []byte(j.origin.Scheme+"://"+j.origin.Host))...)
			err = AtomicWrite(j.file, bytes)
		}
		if err != nil {
			j.poisoned = true
			return errors.New("Unable to persist API session; restart required")
		}
	}
	j.values = next
	return nil
}
