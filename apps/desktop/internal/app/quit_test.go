package app

import (
	"context"
	"errors"
	"testing"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func TestConfirmQuit(t *testing.T) {
	for _, scenario := range []struct {
		name                     string
		status                   host.JSON
		buttons, choice, dialogs int
		stop, stopped, quit      bool
	}{
		{name: "no tasks", status: host.JSON{"count": 0.0}, quit: true},
		{name: "keep running", buttons: 3, choice: 0, dialogs: 1, quit: true},
		{name: "stop and exit", buttons: 3, choice: 1, dialogs: 1, stop: true, stopped: true, quit: true},
		{name: "stay", buttons: 3, choice: 2, dialogs: 1},
		{name: "stay when stop fails", buttons: 3, choice: 1, dialogs: 2, stop: true},
		{name: "unknown count", status: host.JSON{}, buttons: 2, choice: 0, dialogs: 1, quit: true},
		{name: "dismiss unknown count", status: host.JSON{}, buttons: 2, choice: 1, dialogs: 1},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			stops, dialogs := 0, 0
			request := func(_ context.Context, input host.JSON) (any, error) {
				switch input["action"] {
				case "quit_tasks":
					if scenario.status != nil {
						return scenario.status, nil
					}
					return host.JSON{"count": 2.0, "confirmation": "selected"}, nil
				case "stop_quit_tasks":
					stops++
					if input["confirmation"] != "selected" {
						t.Fatal("wrong task confirmation")
					}
					if scenario.stopped {
						return host.JSON{"stopped": true}, nil
					}
					return nil, errors.New("host unavailable")
				default:
					t.Fatalf("unexpected request %v", input)
					return nil, nil
				}
			}
			message := func(options mygo.MessageOptions) (mygo.MessageResult, error) {
				dialogs++
				if dialogs == 1 && (len(options.Buttons) != scenario.buttons || options.CancelButton != scenario.buttons-1) {
					t.Fatalf("unexpected choices %#v", options)
				}
				if dialogs == 2 && options.Type != mygo.MessageError {
					t.Fatal("task stop failure was not reported")
				}
				return mygo.MessageResult{Button: scenario.choice}, nil
			}
			if quit := confirmQuit(request, message, "zh"); quit != scenario.quit {
				t.Fatalf("quit = %v", quit)
			}
			if dialogs != scenario.dialogs || (stops == 1) != scenario.stop || stops > 1 {
				t.Fatalf("got %d dialogs and %d stop requests", dialogs, stops)
			}
		})
	}
}
