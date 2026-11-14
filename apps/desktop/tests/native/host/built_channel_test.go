package tests

import (
	"context"
	"encoding/json"
	"golang.org/x/net/websocket"
	"os"
	host "raypx.local/desktop/internal/desktop"
	"strings"
	"testing"
	"time"
)

// Compiled CLI acceptance crosses the same finite bootstrap/private IPC boundary as MyGo.
func TestBuiltCLIUsesSeparateRendererChannel(t *testing.T) {
	binary := os.Getenv("RAYPX_MYGO_CLI")
	if binary == "" {
		t.Skip("explicit compiled CLI integration gate")
	}
	data := t.TempDir()
	t.Setenv("RAYPX_HOME", t.TempDir())
	args := []string{"--profile", "native-channel", "--data-dir", data}
	defer func() { _ = host.Command(binary, append([]string{"daemon", "stop"}, args...)...).Run() }()
	config, _ := host.ParseConfig(nil)
	client := host.NewDaemonClient(host.CLIConfig{Binary: binary, Version: "0.1.0", Args: args}, config, "mygo://"+config.Scope, nil)
	defer client.Close()
	if !client.Start() {
		t.Fatal(client.Status())
	}
	descriptor, err := client.Channel(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	channel := descriptor.(map[string]any)
	connection, err := websocket.Dial(channel["url"].(string), "", "mygo://"+config.Scope)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	connection.SetDeadline(time.Now().Add(10 * time.Second))
	if websocket.JSON.Send(connection, host.JSON{"type": "authenticate", "protocol": 1, "capability": channel["capability"]}) != nil {
		t.Fatal("authentication send failed")
	}
	request := func(method string, params host.JSON) (any, error) {
		id := "123e4567-e89b-42d3-a456-426614174000"
		if err := websocket.JSON.Send(connection, host.JSON{"type": "request", "id": id, "method": "local_request", "params": host.JSON{"method": method, "params": params}}); err != nil {
			return nil, err
		}
		for {
			var frame host.JSON
			if err := websocket.JSON.Receive(connection, &frame); err != nil {
				return nil, err
			}
			if frame["type"] == "event" {
				websocket.JSON.Send(connection, host.JSON{"type": "ack", "streamId": frame["streamId"], "sequence": frame["sequence"]})
			}
			if frame["id"] == id {
				if failure, ok := frame["error"].(map[string]any); ok {
					return nil, &channelError{failure["code"].(string)}
				}
				return frame["result"], nil
			}
		}
	}
	value, err := request("runtime.info", host.JSON{})
	if err != nil || value.(map[string]any)["owner"] != "daemon" {
		t.Fatal("fresh Desktop session channel did not start")
	}
	for _, method := range []string{"roots.register", "tools.run", "agents.local.execute", "instance.begin"} {
		if _, err := request(method, host.JSON{}); err == nil {
			t.Fatal("renderer acquired retired execution authority")
		}
	}
	raw, _ := json.Marshal(descriptor)
	if strings.Contains(string(raw), "nativeCapability") {
		t.Fatal("native capability escaped")
	}
}

type channelError struct{ code string }

func (e *channelError) Error() string { return e.code }
