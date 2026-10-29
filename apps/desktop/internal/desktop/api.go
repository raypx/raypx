package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type API struct {
	Origin   *url.URL
	Client   *http.Client
	Cookies  *CookieJar
	mu       sync.Mutex
	requests map[string]context.CancelFunc
	active   int
}

func NewAPI(origin string, cookies *CookieJar) *API {
	u, _ := url.Parse(origin)
	return &API{Origin: u, Cookies: cookies, Client: &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, requests: map[string]context.CancelFunc{}}
}

var authPaths = strings.Fields("/api/auth/get-session /api/auth/sign-in/email /api/auth/sign-up/email /api/auth/sign-out /api/auth/send-verification-email /api/auth/verify-email /api/auth/request-password-reset /api/auth/reset-password /api/auth/update-user /api/auth/list-sessions /api/auth/revoke-session /api/auth/revoke-other-sessions")
var rpcPaths = strings.Fields("/rpc/account/get /rpc/devices/register /rpc/devices/refreshGrant /rpc/devices/list /rpc/devices/revoke /rpc/tasks/list /rpc/tasks/get /rpc/approvals/list /rpc/relay/ticket /rpc/observed/list /rpc/observed/get /rpc/jobs/list /rpc/jobs/create /rpc/jobs/update /rpc/jobs/remove /rpc/jobs/run /rpc/jobs/history /rpc/memory/list /rpc/memory/get /rpc/memory/create /rpc/memory/update /rpc/memory/archive /rpc/memory/delete /rpc/memory/history /rpc/memory/restore /rpc/memory/resolve")

func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func ValidateAPI(origin *url.URL, input JSON, native bool) (*http.Request, error) {
	bad := errors.New("Invalid API request")
	path, ok := input["path"].(string)
	if !ok || UTF16Length(path) > 16384 || !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") {
		return nil, bad
	}
	method, ok := input["method"].(string)
	if !ok || (method != "GET" && method != "POST") {
		return nil, bad
	}
	u, err := origin.Parse(path)
	if err != nil || u.Host != origin.Host || u.Scheme != origin.Scheme || u.Fragment != "" {
		return nil, errors.New("API path is not permitted")
	}
	rpc := contains(rpcPaths, u.EscapedPath()) || native && contains([]string{"/rpc/hosts/authorize", "/rpc/hosts/revoke"}, u.EscapedPath())
	if !contains(authPaths, u.EscapedPath()) && !rpc {
		return nil, errors.New("API path is not permitted")
	}
	if rpc && method != "POST" {
		return nil, bad
	}
	body := ""
	if value, yes := input["body"]; yes {
		var valid bool
		body, valid = value.(string)
		if !valid || len(body) > 256*1024 {
			return nil, bad
		}
	}
	request, err := http.NewRequest(method, u.String(), strings.NewReader(body))
	if err != nil {
		return nil, bad
	}
	headers, ok := input["headers"].(map[string]any)
	if !ok || len(headers) > 32 {
		return nil, bad
	}
	for name, v := range headers {
		value, ok := v.(string)
		if !ok || !contains([]string{"accept", "accept-language", "content-type"}, strings.ToLower(name)) || UTF16Length(value) > 1024 || strings.ContainsAny(value, "\r\n") {
			return nil, bad
		}
		request.Header.Set(name, value)
	}
	if id, ok := input["id"]; ok {
		value, ok := id.(string)
		if !ok || len(value) != 36 || strings.Trim(value, "0123456789abcdef-") != "" {
			return nil, bad
		}
	}
	request.Header.Set("Origin", "views://main")
	return request, nil
}
func (a *API) Cancel(id string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if cancel := a.requests[id]; cancel != nil {
		cancel()
	}
	return true
}
func (a *API) Request(parent context.Context, input JSON, native bool) (JSON, error) {
	request, err := ValidateAPI(a.Origin, input, native)
	if err != nil {
		return nil, err
	}
	cookie, err := a.Cookies.Header(request.URL)
	if err != nil {
		return nil, err
	}
	if cookie != "" {
		request.Header.Set("Cookie", cookie)
	}
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	id, _ := input["id"].(string)
	a.mu.Lock()
	if a.active >= 128 || id != "" && a.requests[id] != nil {
		a.mu.Unlock()
		return nil, errors.New("API transport busy or duplicate identity")
	}
	a.active++
	if id != "" {
		a.requests[id] = cancel
	}
	a.mu.Unlock()
	defer func() { a.mu.Lock(); a.active--; delete(a.requests, id); a.mu.Unlock() }()
	response, err := a.Client.Do(request.WithContext(ctx))
	if err != nil {
		return nil, errors.New("API request failed")
	}
	defer response.Body.Close()
	changes := []CookieChange{}
	headers := response.Header.Values("Set-Cookie")
	if len(headers) > 32 {
		return nil, errors.New("Too many API response cookies")
	}
	for _, raw := range headers {
		change, err := ParseCookie(a.Origin, raw, time.Now())
		if err != nil {
			return nil, err
		}
		if change != nil {
			changes = append(changes, *change)
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := a.Cookies.Apply(changes); err != nil {
		return nil, err
	}
	if response.ContentLength > LineLimit {
		return nil, errors.New("API response exceeds limit")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, LineLimit+1))
	if err != nil || len(data) > LineLimit {
		return nil, errors.New("API response exceeds limit")
	}
	out := JSON{}
	for _, key := range []string{"content-type", "retry-after", "x-request-id"} {
		if v := response.Header.Get(key); v != "" {
			out[key] = v
		}
	}
	return JSON{"status": response.StatusCode, "headers": out, "body": strings.ToValidUTF8(string(data), "�")}, nil
}
func (a *API) RPC(ctx context.Context, procedure string, input any) (any, error) {
	body, err := json.Marshal(JSON{"json": input})
	if err != nil {
		return nil, err
	}
	response, err := a.Request(ctx, JSON{"path": "/rpc/" + strings.ReplaceAll(procedure, ".", "/"), "method": "POST", "headers": JSON{"content-type": "application/json"}, "body": string(body)}, true)
	if err != nil {
		return nil, err
	}
	status := response["status"].(int)
	var envelope JSON
	err = json.Unmarshal([]byte(response["body"].(string)), &envelope)
	if status == 401 {
		return nil, errors.New("AUTH_REQUIRED")
	}
	if status >= 300 && status < 400 {
		return nil, errors.New("Invalid native API response")
	}
	if status == 404 {
		value, _ := envelope["json"].(map[string]any)
		_, defined := value["defined"].(bool)
		if err != nil || !defined {
			return nil, errors.New("MISSING_PROCEDURE")
		}
	}
	if err != nil {
		return nil, errors.New("Invalid native API response")
	}
	for _, key := range []string{"meta", "maps", "blobs"} {
		if v, ok := envelope[key]; ok {
			list, ok := v.([]any)
			if !ok || len(list) > 0 {
				return nil, errors.New("Unsupported native API serialization")
			}
		}
	}
	if status >= 400 {
		value, _ := envelope["json"].(map[string]any)
		code, _ := value["code"].(string)
		if contains([]string{"NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"}, code) {
			return nil, errors.New(code)
		}
		return nil, errors.New("Native API request failed")
	}
	if value, ok := envelope["json"]; ok {
		return value, nil
	}
	return nil, errors.New("Invalid native API response")
}
