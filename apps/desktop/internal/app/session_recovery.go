package app

import (
	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func recoverDesktopSession(window *mygo.Window, desktop *host.Desktop) bool {
	choice, err := mygo.Dialog.Message(mygo.MessageOptions{
		Parent: window, Title: "Raypx",
		Message: "Recover saved sign-in / 恢复登录存储",
		Buttons: []string{"Retry / 重试", "Reset saved sign-in / 重置登录存储", "Cancel / 取消"}, CancelButton: 2,
	})
	if err != nil || choice.Button == 2 {
		return false
	}
	if choice.Button == 0 {
		return desktop.Client.Refresh()
	}
	if choice.Button != 1 {
		return false
	}
	confirm, err := mygo.Dialog.Message(mygo.MessageOptions{
		Parent: window, Title: "Raypx",
		Message: "Remove saved sign-ins for every server in this profile? Projects, tasks, device identity and preferences are preserved. / 清除当前 profile 所有服务器的登录存储？项目、任务、设备身份和偏好会保留。",
		Buttons: []string{"Reset / 重置", "Cancel / 取消"}, CancelButton: 1,
	})
	if err != nil || confirm.Button != 0 {
		return false
	}
	if desktop.Client.ResetSessions() {
		return true
	}
	_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: window, Title: "Raypx", Type: mygo.MessageError, Message: "Sign-in storage recovery failed. Try again. / 登录存储恢复失败，请重试。"})
	return false
}
