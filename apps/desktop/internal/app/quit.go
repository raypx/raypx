package app

import (
	"context"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func nativeLanguage(desktop *host.Desktop) string {
	locale, _ := desktop.Preferences.Read()["locale"].(string)
	if locale == "" || locale == "system" {
		preferred := mygo.App.PreferredLanguages()
		if len(preferred) > 0 {
			locale = preferred[0]
		} else {
			locale = os.Getenv("LANG")
		}
	}
	if strings.HasPrefix(strings.ToLower(locale), "zh") {
		return "zh"
	}
	return "en"
}

func confirmQuit(
	request func(context.Context, host.JSON) (any, error),
	message func(mygo.MessageOptions) (mygo.MessageResult, error),
	language string,
) bool {
	ctx := context.Background()
	result, err := request(ctx, host.JSON{"action": "quit_tasks"})
	status, _ := result.(host.JSON)
	count, hasCount := status["count"].(float64)
	confirmation, _ := status["confirmation"].(string)
	if err == nil && hasCount && count == 0 {
		return true
	}
	keep, stop, stay := "Keep Running and Quit", "Stop Tasks and Quit", "Cancel"
	unknown := "Couldn’t check for running tasks. Quit and leave any tasks running?"
	failed := "Couldn’t confirm that the tasks stopped. Try again before quitting."
	active := fmt.Sprintf("Active Agent tasks on this computer (%.0f)", count)
	if language == "zh" {
		keep, stop, stay = "后台继续并退出", "终止任务并退出", "取消退出"
		unknown = "无法确认是否有进行中的任务。退出并保留后台任务？"
		failed = "无法确认任务已终止。请重试后再退出。"
		active = fmt.Sprintf("本机有 %.0f 个 Agent 任务正在进行", count)
	}
	// An app-modal dialog also works when Quit is selected from a hidden window's tray.
	if err != nil || !hasCount || count < 1 || math.Trunc(count) != count || math.IsInf(count, 0) || confirmation == "" {
		choice, err := message(mygo.MessageOptions{
			Title: "Raypx", Type: mygo.MessageWarning, Message: unknown,
			Buttons: []string{keep, stay}, DefaultButton: 1, CancelButton: 1,
		})
		return err == nil && choice.Button == 0
	}
	// A modal dialog can pause window calls. Keep the native confirmation alive
	// independently of the window heartbeat while the user decides.
	dialogContext, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-dialogContext.Done():
				return
			case <-ticker.C:
				_, _ = request(dialogContext, host.JSON{"action": "notifications"})
			}
		}
	}()
	choice, err := message(mygo.MessageOptions{
		Title: "Raypx", Type: mygo.MessageQuestion, Message: active,
		Buttons: []string{keep, stop, stay}, DefaultButton: 0, CancelButton: 2, DestructiveButtons: []int{1},
	})
	cancel()
	if err != nil {
		return false
	}
	switch choice.Button {
	case 0:
		return true
	case 1:
		result, err := request(ctx, host.JSON{"action": "stop_quit_tasks", "confirmation": confirmation})
		status, _ := result.(host.JSON)
		if err == nil && status["stopped"] == true {
			return true
		}
		_, _ = message(mygo.MessageOptions{Title: "Raypx", Type: mygo.MessageError, Message: failed})
	}
	return false
}
