package desktop

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

const LineLimit = 8 * 1024 * 1024
const CreditBytes = 1024 * 1024

type EventStream struct {
	dispatch     chan struct{}
	subscription uint64
	mu           sync.Mutex
	send         func(JSON) error
	sequence     uint64
	outstanding  map[uint64]int
	bytes        int
	maximum      int
	changed      chan struct{}
	Observe      func(JSON)
}

func NewEvents() *EventStream {
	return &EventStream{dispatch: make(chan struct{}, 1), outstanding: map[uint64]int{}, changed: make(chan struct{})}
}
func (e *EventStream) wake() { close(e.changed); e.changed = make(chan struct{}) }
func (e *EventStream) Subscribe(send func(JSON) error) func() {
	e.mu.Lock()
	e.send = send
	e.subscription++
	e.outstanding = map[uint64]int{}
	e.bytes = 0
	e.wake()
	generation := e.subscription
	e.mu.Unlock()
	return func() {
		e.mu.Lock()
		defer e.mu.Unlock()
		if e.subscription == generation {
			e.send = nil
			e.outstanding = map[uint64]int{}
			e.bytes = 0
			e.wake()
		}
	}
}
func (e *EventStream) Acknowledge(sequence uint64) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if sequence > e.sequence {
		return false
	}
	for id, n := range e.outstanding {
		if id <= sequence {
			e.bytes -= n
			delete(e.outstanding, id)
		}
	}
	e.wake()
	return true
}
func (e *EventStream) Send(ctx context.Context, event JSON) error {
	select {
	case e.dispatch <- struct{}{}:
		defer func() { <-e.dispatch }()
	case <-ctx.Done():
		return ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if e.Observe != nil {
		e.Observe(event)
	}
	data, err := json.Marshal(event)
	if err != nil || len(data) > LineLimit {
		return errors.New("Local event exceeds limit")
	}
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		e.mu.Lock()
		if e.send == nil {
			e.mu.Unlock()
			return nil
		}
		changed := e.changed
		if e.bytes == 0 || e.bytes+len(data) <= CreditBytes {
			e.sequence++
			id := e.sequence
			e.outstanding[id] = len(data)
			e.bytes += len(data)
			if e.bytes > e.maximum {
				e.maximum = e.bytes
			}
			send := e.send
			subscription := e.subscription
			e.mu.Unlock()
			if err := send(JSON{"sequence": id, "event": event}); err != nil {
				e.mu.Lock()
				if e.subscription != subscription {
					e.mu.Unlock()
					return nil
				}
				e.send = nil
				e.bytes = 0
				e.outstanding = map[uint64]int{}
				e.wake()
				e.mu.Unlock()
			}
			return nil
		}
		e.mu.Unlock()
		select {
		case <-changed:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

type response struct {
	value any
	err   error
}
type process struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	ctx       context.Context
	cancel    context.CancelFunc
	done      chan struct{}
	writeSlot chan struct{}
}
type Engine struct {
	closed         atomic.Bool
	Binary         string
	Args           []string
	Version        string
	Daemon         bool
	Events         *EventStream
	mu             sync.Mutex
	start          sync.Mutex
	child          *process
	pending        map[string]chan response
	status         JSON
	features       JSON
	serial         atomic.Uint64
	generation     uint64
	lifetime       context.Context
	lifetimeCancel context.CancelFunc
	statusCancel   context.CancelFunc
}

func NewEngine(binary, version string, args []string, daemon bool, events *EventStream) *Engine {
	ctx, cancel := context.WithCancel(context.Background())
	return &Engine{Binary: binary, Version: version, Args: args, Daemon: daemon, Events: events, pending: map[string]chan response{}, status: JSON{"status": "starting"}, features: JSON{"localTerminalApprovals": false}, lifetime: ctx, lifetimeCancel: cancel}
}
func (e *Engine) Status() JSON   { e.mu.Lock(); defer e.mu.Unlock(); return clone(e.status) }
func (e *Engine) Features() JSON { e.mu.Lock(); defer e.mu.Unlock(); return clone(e.features) }

// A stopped process may finish reading after its replacement has started.
// Fence status and pending-request mutations under the same generation lock.
func (e *Engine) updateStatus(value JSON, generation uint64, failure string, preserveMismatch bool) bool {
	e.mu.Lock()
	if generation != 0 && generation != e.generation {
		e.mu.Unlock()
		return false
	}
	if value["status"] == "ready" && (e.closed.Load() || e.status["status"] == "error") {
		e.mu.Unlock()
		return false
	}
	if preserveMismatch && e.status["code"] == "HOST_VERSION_MISMATCH" && value["code"] != "HOST_VERSION_MISMATCH" {
		e.mu.Unlock()
		return false
	}
	if e.statusCancel != nil {
		e.statusCancel()
	}
	ctx, cancel := context.WithTimeout(e.lifetime, 2*time.Second)
	e.statusCancel = cancel
	e.status = value
	if failure != "" {
		for id, ch := range e.pending {
			ch <- response{err: errors.New(failure)}
			delete(e.pending, id)
		}
	}
	e.mu.Unlock()
	defer cancel()
	_ = e.Events.Send(ctx, JSON{"version": 1, "event": "engine.status", "data": value})
	return true
}
func (e *Engine) setStatus(value JSON)      { e.updateStatus(value, 0, "", false) }
func (e *Engine) fail(message, code string) { e.failGeneration(0, message, code) }
func (e *Engine) failGeneration(generation uint64, message, code string) {
	status := JSON{"status": "error", "message": message}
	if code != "" {
		status["code"] = code
	}
	e.updateStatus(status, generation, message, generation != 0)
}
func (e *Engine) Start() bool { e.start.Lock(); defer e.start.Unlock(); return e.startLocked() }
func (e *Engine) startLocked() bool {
	if e.closed.Load() {
		return false
	}
	e.Stop()
	e.setStatus(JSON{"status": "starting"})
	if !filepath.IsAbs(e.Binary) {
		e.fail("Bundled CLI path must be absolute", "")
		return false
	}
	args := []string{"stdio"}
	if e.Daemon {
		args = []string{"daemon", "proxy"}
	}
	args = append(args, e.Args...)
	ctx, cancel := context.WithCancel(e.lifetime)
	cmd := Command(e.Binary, args...)
	in, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		e.fail("CLI stdin unavailable", "")
		return false
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		_ = in.Close()
		cancel()
		e.fail("CLI stdout unavailable", "")
		return false
	}
	cmd.Stderr = io.Discard
	if cmd.Start() != nil {
		_ = in.Close()
		_ = out.Close()
		cancel()
		e.fail("Bundled CLI could not start", "")
		return false
	}
	p := &process{cmd: cmd, stdin: in, ctx: ctx, cancel: cancel, done: make(chan struct{}), writeSlot: make(chan struct{}, 1)}
	e.mu.Lock()
	if e.closed.Load() {
		e.mu.Unlock()
		cancel()
		_ = in.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return false
	}
	e.generation++
	generation := e.generation
	e.child = p
	e.mu.Unlock()
	go func() {
		scanner := bufio.NewScanner(out)
		scanner.Buffer(make([]byte, 64*1024), LineLimit+1)
		scanner.Split(protocolLine)
		for scanner.Scan() {
			e.mu.Lock()
			current := generation == e.generation
			e.mu.Unlock()
			if !current || ctx.Err() != nil {
				break
			}
			line := scanner.Bytes()
			if len(bytes.Trim(line, " \t\r\v\f")) == 0 {
				continue
			}
			var packet JSON
			if json.Unmarshal(line, &packet) != nil || packet["version"] != float64(1) {
				e.failGeneration(generation, "Invalid local engine protocol", "")
				cancel()
				break
			}
			if event, ok := packet["event"].(string); ok {
				if event == "engine.status" {
					data, _ := packet["data"].(map[string]any)
					if data["code"] == "HOST_VERSION_MISMATCH" {
						e.failGeneration(generation, "The previous execution owner must be stopped before upgrading", "HOST_VERSION_MISMATCH")
					}
				} else if e.Events.Send(ctx, packet) != nil {
					cancel()
					break
				}
			} else if id, ok := packet["id"].(string); ok {
				e.mu.Lock()
				var ch chan response
				if generation == e.generation {
					ch = e.pending[id]
					delete(e.pending, id)
				}
				e.mu.Unlock()
				if ch != nil {
					r := response{value: packet["result"]}
					if raw, exists := packet["error"]; exists {
						v, _ := raw.(map[string]any)
						code, _ := v["code"].(string)
						if code == "" || len(code) > 128 {
							code = "LOCAL_ERROR"
						}
						r.err = errors.New(code)
					}
					ch <- r
				}
			} else {
				e.failGeneration(generation, "Invalid local engine response", "")
				cancel()
				break
			}
		}
		if scanner.Err() != nil {
			e.failGeneration(generation, "Invalid or oversized local engine protocol line", "")
		}
		cancel()
	}()
	go func() {
		<-ctx.Done()
		_ = in.Close()
		select {
		case <-p.done:
		case <-time.After(3 * time.Second):
			_ = cmd.Process.Kill()
		}
	}()
	go func() {
		_ = cmd.Wait()
		close(p.done)
		cancel()
		e.failGeneration(generation, "Local engine exited; retry to restart", "")
	}()
	probe, stop := context.WithTimeout(e.lifetime, 10*time.Second)
	defer stop()
	info, err := e.Request(probe, "runtime.info", JSON{})
	v, _ := info.(map[string]any)
	if err != nil || v["version"] != e.Version || v["protocolVersion"] != float64(1) || (e.Daemon && v["owner"] != "daemon") {
		mismatch := e.Status()["code"] == "HOST_VERSION_MISMATCH"
		e.Stop()
		if mismatch {
			e.fail("The previous execution owner must be stopped before upgrading", "HOST_VERSION_MISMATCH")
		} else {
			e.fail("Bundled CLI version does not match Desktop", "")
		}
		return false
	}
	features, _ := v["features"].(map[string]any)
	e.mu.Lock()
	current := generation == e.generation && ctx.Err() == nil && !e.closed.Load()
	if current {
		e.features = JSON{"localTerminalApprovals": features["localTerminalApprovals"] == true}
	}
	e.mu.Unlock()
	if !current || !e.updateStatus(JSON{"status": "ready"}, generation, "", false) {
		e.Stop()
		return false
	}
	return true
}
func protocolLine(data []byte, atEOF bool) (int, []byte, error) {
	if index := bytes.IndexByte(data, '\n'); index >= 0 {
		if index+1 > LineLimit {
			return 0, nil, errors.New("protocol line exceeds limit")
		}
		return index + 1, data[:index], nil
	}
	if len(data) > LineLimit {
		return 0, nil, errors.New("protocol line exceeds limit")
	}
	if atEOF && len(data) > 0 {
		return 0, nil, errors.New("protocol line is not terminated")
	}
	return 0, nil, nil
}
func (e *Engine) Request(parent context.Context, method string, params any) (any, error) {
	timeout := 86410 * time.Second
	if method == "runtime.info" {
		timeout = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	id := fmt.Sprintf("desktop-%d", e.serial.Add(1))
	data, err := json.Marshal(JSON{"version": 1, "id": id, "method": method, "params": params})
	if err != nil || len(data)+1 > LineLimit {
		return nil, errors.New("Local request exceeds limit")
	}
	data = append(data, '\n')
	ch := make(chan response, 1)
	e.mu.Lock()
	p := e.child
	if p == nil || p.ctx.Err() != nil || e.closed.Load() || len(e.pending) >= 64 {
		e.mu.Unlock()
		return nil, errors.New("Local engine unavailable or busy")
	}
	e.pending[id] = ch
	e.mu.Unlock()
	defer func() { e.mu.Lock(); delete(e.pending, id); e.mu.Unlock() }()
	timer := time.NewTimer(10 * time.Second)
	defer timer.Stop()
	// Waiting writers own no goroutine. At most one write can block in the OS
	// for a process, and closing its stdin cancels that write on every platform.
	select {
	case p.writeSlot <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-p.ctx.Done():
		return nil, errors.New("Local engine stopped")
	case <-timer.C:
		return nil, errors.New("Local engine input timed out")
	}
	if err := ctx.Err(); err != nil {
		<-p.writeSlot
		return nil, err
	}
	if p.ctx.Err() != nil {
		<-p.writeSlot
		return nil, errors.New("Local engine stopped")
	}
	written := make(chan error, 1)
	go func() { _, err := p.stdin.Write(data); <-p.writeSlot; written <- err }()
	stopWrite := func() { p.cancel(); _ = p.stdin.Close(); <-written }
	select {
	case err := <-written:
		if err != nil {
			p.cancel()
			return nil, errors.New("Local engine input failed")
		}
	case <-timer.C:
		stopWrite()
		return nil, errors.New("Local engine input timed out")
	case <-ctx.Done():
		stopWrite()
		return nil, ctx.Err()
	case <-p.ctx.Done():
		stopWrite()
		return nil, errors.New("Local engine stopped")
	}
	select {
	case r := <-ch:
		return r.value, r.err
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-p.ctx.Done():
		return nil, errors.New("Local engine stopped")
	}
}
func (e *Engine) Stop() {
	e.mu.Lock()
	e.generation++
	p := e.child
	e.child = nil
	if p != nil {
		p.cancel()
	}
	if e.statusCancel != nil {
		e.statusCancel()
	}
	e.features = JSON{"localTerminalApprovals": false}
	for id, ch := range e.pending {
		ch <- response{err: errors.New("Local engine stopped")}
		delete(e.pending, id)
	}
	e.mu.Unlock()
	if p != nil {
		_ = p.stdin.Close()
		select {
		case <-p.done:
		case <-time.After(4 * time.Second):
			_ = p.cmd.Process.Kill()
		}
	}
}
func (e *Engine) ReplaceOwner() bool {
	e.start.Lock()
	defer e.start.Unlock()
	if e.closed.Load() || !e.Daemon || e.Status()["code"] != "HOST_VERSION_MISMATCH" {
		return false
	}
	e.Stop()
	ctx, cancel := context.WithTimeout(e.lifetime, 30*time.Second)
	defer cancel()
	cmd := Command(e.Binary, append([]string{"daemon", "restart"}, e.Args...)...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if cmd.Start() != nil {
		return false
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			return false
		}
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		<-done
		return false
	}
	return e.startLocked()
}
func (e *Engine) Close() {
	e.closed.Store(true)
	e.lifetimeCancel()
	e.Stop()
	e.start.Lock()
	defer e.start.Unlock()
	e.Stop()
}
