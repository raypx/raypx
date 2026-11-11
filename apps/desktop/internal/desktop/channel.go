package desktop

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const LineLimit = 8 * 1024 * 1024
const bootstrapLimit = 64 * 1024

type SessionKey func(profileDirectory string, create bool) ([]byte, error)
type NativeClient interface {
	Status() JSON
	Features() JSON
	Start() bool
	ReplaceOwner() bool
	Channel(context.Context) (any, error)
	Native(context.Context, JSON) (any, error)
	Close()
}
type nativeAddress struct {
	Socket string `json:"socket"`
	Port   int    `json:"port"`
}
type binding struct {
	Version    string        `json:"version"`
	Protocol   int           `json:"protocolVersion"`
	Capability string        `json:"nativeCapability"`
	Address    nativeAddress `json:"nativeAddress"`
	Features   JSON          `json:"features"`
	Recovery   any           `json:"recovery"`
}

// DaemonClient runs a finite CLI bootstrap, then holds only a narrow native capability.
// Business JSON and renderer events never pass through this client.
type DaemonClient struct {
	cli        CLIConfig
	config     Config
	pageOrigin string
	key        SessionKey
	lifetime   context.Context
	cancel     context.CancelFunc
	start      sync.Mutex
	mu         sync.Mutex
	binding    *binding
	client     *http.Client
	status     JSON
	features   JSON
}

func NewDaemonClient(cli CLIConfig, config Config, pageOrigin string, key SessionKey) *DaemonClient {
	ctx, cancel := context.WithCancel(context.Background())
	return &DaemonClient{cli: cli, config: config, pageOrigin: pageOrigin, key: key, lifetime: ctx, cancel: cancel, status: JSON{"status": "starting"}, features: JSON{"localTerminalApprovals": false}}
}
func (c *DaemonClient) Status() JSON   { c.mu.Lock(); defer c.mu.Unlock(); return clone(c.status) }
func (c *DaemonClient) Features() JSON { c.mu.Lock(); defer c.mu.Unlock(); return clone(c.features) }
func (c *DaemonClient) fail(code string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.status = JSON{"status": "error", "code": code, "message": code}
	c.features = JSON{"localTerminalApprovals": false}
}

type boundedOutput struct {
	bytes.Buffer
	limit int
}

func (o *boundedOutput) Write(p []byte) (int, error) {
	if len(p) > o.limit-o.Len() {
		return 0, errors.New("CLI output exceeds limit")
	}
	return o.Buffer.Write(p)
}

var machineCode = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,127}$`)

// NativeError is a failure the daemon reported for one native operation. The channel
// itself is healthy; only a transport failure or a refused capability retires it.
type NativeError struct{ Code string }

func (e *NativeError) Error() string { return e.Code }

func finiteCLI(ctx context.Context, cli CLIConfig, args []string, input any) ([]byte, error) {
	if !filepath.IsAbs(cli.Binary) {
		return nil, errors.New("BUNDLED_CLI_REQUIRED")
	}
	encoded, err := json.Marshal(input)
	if err != nil || len(encoded) > bootstrapLimit {
		return nil, errors.New("INVALID_BOOTSTRAP")
	}
	cmd := Command(cli.Binary, append(args, cli.Args...)...)
	cmd.Stdin = bytes.NewReader(encoded)
	out := &boundedOutput{limit: bootstrapLimit}
	diagnostics := &boundedOutput{limit: bootstrapLimit}
	cmd.Stdout = out
	cmd.Stderr = diagnostics
	cmd.WaitDelay = 500 * time.Millisecond
	if cmd.Start() != nil {
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	stop := context.AfterFunc(ctx, func() { _ = cmd.Process.Kill() })
	defer stop()
	err = cmd.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		// Only a bounded machine code crosses this boundary; never CLI diagnostics.
		for _, line := range strings.Split(diagnostics.String(), "\n") {
			var failure struct {
				Code string `json:"code"`
			}
			if json.Unmarshal([]byte(line), &failure) == nil && machineCode.MatchString(failure.Code) {
				return nil, errors.New(failure.Code)
			}
		}
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	return out.Bytes(), nil
}
func (c *DaemonClient) bootstrap(input JSON, output any) error {
	ctx, cancel := context.WithTimeout(c.lifetime, 75*time.Second)
	defer cancel()
	raw, err := finiteCLI(ctx, c.cli, []string{"daemon", "desktop", "--json"}, input)
	if err != nil {
		return err
	}
	if json.Unmarshal(raw, output) != nil {
		return errors.New("INVALID_BOOTSTRAP")
	}
	return nil
}
func (c *DaemonClient) Start() bool {
	c.start.Lock()
	defer c.start.Unlock()
	if c.lifetime.Err() == nil && c.Status()["status"] == "ready" {
		return true
	}
	return c.startLocked()
}
func (c *DaemonClient) startLocked() bool {
	if c.lifetime.Err() != nil {
		return false
	}
	c.release()
	c.mu.Lock()
	c.status = JSON{"status": "starting"}
	c.mu.Unlock()
	fail := func(err error) bool {
		code := err.Error()
		if !machineCode.MatchString(code) {
			code = "HOST_UNAVAILABLE"
		}
		c.fail(code)
		return false
	}
	var prepare struct {
		CreateKey bool   `json:"createKey"`
		Profile   string `json:"profileDirectory"`
	}
	if err := c.bootstrap(JSON{"action": "prepare", "apiUrl": c.config.APIURL}, &prepare); err != nil {
		return fail(err)
	}
	if !filepath.IsAbs(prepare.Profile) {
		return fail(errors.New("INVALID_BOOTSTRAP"))
	}
	input := JSON{"action": "bootstrap", "protocol": 1, "apiUrl": c.config.APIURL, "pageOrigin": c.pageOrigin, "configDirs": c.config.Directories}
	if c.config.Directories == nil {
		delete(input, "configDirs")
	}
	if c.key != nil {
		if key, err := c.key(prepare.Profile, prepare.CreateKey); err == nil && len(key) == 32 {
			input["key"] = base64.StdEncoding.EncodeToString(key)
		}
	}
	var next binding
	if err := c.bootstrap(input, &next); err != nil {
		return fail(err)
	}
	if next.Version != c.cli.Version || next.Protocol != 1 || len(next.Capability) < 64 || len(next.Capability) > 200 {
		return fail(errors.New("HOST_VERSION_MISMATCH"))
	}
	address := next.Address
	if (address.Socket == "") == (address.Port == 0) || address.Port < 0 || address.Port > 65535 || (address.Socket != "" && (!filepath.IsAbs(address.Socket) || len(address.Socket) > 104)) {
		return fail(errors.New("INVALID_BOOTSTRAP"))
	}
	transport := &http.Transport{Proxy: nil, DisableKeepAlives: true, ResponseHeaderTimeout: 3 * time.Second}
	if address.Socket != "" {
		transport.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", address.Socket)
		}
	}
	client := &http.Client{Transport: transport, Timeout: 4 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	c.mu.Lock()
	c.binding = &next
	c.client = client
	c.features = next.Features
	c.status = JSON{"status": "ready", "sessionRecovery": next.Recovery}
	c.mu.Unlock()
	if c.lifetime.Err() != nil {
		c.release()
		return false
	}
	return true
}
func (c *DaemonClient) Native(parent context.Context, input JSON) (any, error) {
	ctx, cancel := context.WithTimeout(parent, 4*time.Second)
	defer cancel()
	stop := context.AfterFunc(c.lifetime, cancel)
	defer stop()
	c.mu.Lock()
	current, client := c.binding, c.client
	c.mu.Unlock()
	if current == nil || client == nil || c.lifetime.Err() != nil {
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	result, err := nativeRequest(ctx, client, current, input)
	var operation *NativeError
	if err != nil && !errors.As(err, &operation) && parent.Err() == nil && c.lifetime.Err() == nil {
		c.mu.Lock()
		if c.binding == current {
			c.status = JSON{"status": "error", "code": "HOST_UNAVAILABLE"}
		}
		c.mu.Unlock()
	}
	return result, err
}
func nativeRequest(ctx context.Context, client *http.Client, current *binding, input JSON) (any, error) {
	data, err := json.Marshal(input)
	if err != nil || len(data) > bootstrapLimit {
		return nil, errors.New("INVALID_NATIVE_REQUEST")
	}
	origin := "http://localhost"
	if current.Address.Port != 0 {
		origin = "http://127.0.0.1:" + strconv.Itoa(current.Address.Port)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", origin+"/desktop/native", bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	req.Header.Set("Authorization", "Bearer "+current.Capability)
	req.Header.Set("Content-Type", "application/json")
	response, err := client.Do(req)
	if err != nil {
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, bootstrapLimit+1))
	if err != nil || len(raw) > bootstrapLimit {
		return nil, errors.New("INVALID_NATIVE_RESPONSE")
	}
	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &envelope) != nil {
		return nil, errors.New("INVALID_NATIVE_RESPONSE")
	}
	if envelope.Error != nil {
		if machineCode.MatchString(envelope.Error.Code) {
			return nil, &NativeError{Code: envelope.Error.Code}
		}
		return nil, errors.New("INVALID_NATIVE_RESPONSE")
	}
	var value any
	if len(envelope.Result) == 0 || json.Unmarshal(envelope.Result, &value) != nil {
		return nil, errors.New("INVALID_NATIVE_RESPONSE")
	}
	return value, nil
}
func (c *DaemonClient) Channel(ctx context.Context) (any, error) {
	c.start.Lock()
	if c.Status()["status"] != "ready" && !c.startLocked() {
		c.start.Unlock()
		return nil, errors.New("HOST_UNAVAILABLE")
	}
	c.start.Unlock()
	return c.Native(ctx, JSON{"action": "channel"})
}
func (c *DaemonClient) release() {
	c.mu.Lock()
	current, client := c.binding, c.client
	c.binding = nil
	c.client = nil
	c.mu.Unlock()
	if current != nil && client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, _ = nativeRequest(ctx, client, current, JSON{"action": "release"})
		cancel()
		client.CloseIdleConnections()
	}
}
func (c *DaemonClient) ReplaceOwner() bool {
	c.start.Lock()
	defer c.start.Unlock()
	if c.lifetime.Err() != nil || c.Status()["code"] != "HOST_VERSION_MISMATCH" {
		return false
	}
	ctx, cancel := context.WithTimeout(c.lifetime, 75*time.Second)
	defer cancel()
	if _, err := finiteCLI(ctx, c.cli, []string{"daemon", "restart", "--json"}, nil); err != nil {
		return false
	}
	return c.startLocked()
}
func (c *DaemonClient) Close() { c.cancel(); c.start.Lock(); defer c.start.Unlock(); c.release() }
