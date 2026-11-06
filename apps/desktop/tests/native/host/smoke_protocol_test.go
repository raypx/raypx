//go:build native_smoke

package tests

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"testing"
	"time"

	app "raypx.local/desktop/internal/app"
	host "raypx.local/desktop/internal/desktop"
)

func TestSmokeProtocolPreservesMachineCodesWithoutExposingPrivateErrors(t *testing.T) {
	for _, row := range []struct{ method, failure, expected string }{
		{"engineRequest", "CONTEXT_NOT_FOUND", "CONTEXT_NOT_FOUND"},
		{"engineRequest", "private file: /users/example/secret", "Native smoke operation failed: engineRequest"},
		{"eval", "PRIVATE_VALUE", "Native smoke operation failed: eval"},
	} {
		t.Run(row.failure, func(t *testing.T) {
			client, server := net.Pipe()
			t.Cleanup(func() { client.Close(); server.Close() })
			client.SetDeadline(time.Now().Add(5 * time.Second))
			go app.ServeSmoke(server, "isolated-test-token", func(context.Context, string, host.JSON) (any, error) {
				return nil, errors.New(row.failure)
			})
			if err := json.NewEncoder(client).Encode(host.JSON{"id": "probe", "token": "isolated-test-token", "method": row.method}); err != nil {
				t.Fatal(err)
			}
			var response host.JSON
			if err := json.NewDecoder(client).Decode(&response); err != nil {
				t.Fatal(err)
			}
			if response["id"] != "probe" || response["ok"] != false || response["error"] != row.expected {
				t.Fatal("Smoke protocol changed the failure contract")
			}
		})
	}
}
