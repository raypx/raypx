package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"time"
)

func (d *Desktop) repair(parent context.Context, input JSON) (any, error) {
	provider, _ := input["provider"].(string)
	if !contains([]string{"claude", "codex"}, provider) {
		return nil, errors.New("INSTALLATION_FAILED")
	}
	encoded, _ := json.Marshal(JSON{"configDirs": d.Config.Directories})
	args := append([]string{"connectors", "repair", provider, string(encoded), "--json"}, d.Engine.Args...)
	cmd := Command(d.Engine.Binary, args...)
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, errors.New("INSTALLATION_FAILED")
	}
	cmd.Stderr = io.Discard
	if cmd.Start() != nil {
		return nil, errors.New("INSTALLATION_FAILED")
	}
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	done := make(chan response, 1)
	go func() {
		bytes, err := io.ReadAll(io.LimitReader(out, 256*1024+1))
		if len(bytes) > 256*1024 {
			_ = cmd.Process.Kill()
			err = errors.New("INSTALLATION_FAILED")
		}
		wait := cmd.Wait()
		if err == nil {
			err = wait
		}
		var value any
		if err == nil {
			err = json.Unmarshal(bytes, &value)
		}
		done <- response{value, err}
	}()
	select {
	case r := <-done:
		if r.err != nil {
			return nil, errors.New("INSTALLATION_FAILED")
		}
		return r.value, nil
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		<-done
		return nil, errors.New("INSTALLATION_TIMEOUT")
	}
}
