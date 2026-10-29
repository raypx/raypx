package app

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

var checking atomic.Bool

func checkUpdates(window *mygo.Window, desktop *host.Desktop, quit func()) {
	if !checking.CompareAndSwap(false, true) {
		return
	}
	defer checking.Store(false)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	update, err := mygo.Updater.Check(ctx)
	if err != nil || update == nil {
		_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: window, Title: "Raypx", Message: "No update is available, or the update service could not be reached. / 暂无更新，或无法连接更新服务。"})
		return
	}
	result, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: window, Title: "Raypx", Message: "Install Raypx " + update.Version + " and restart? / 安装更新并重新启动？", Buttons: []string{"Install / 安装", "Cancel / 取消"}, CancelButton: 1})
	if err != nil || result.Button != 0 {
		return
	}
	desktop.Close()
	if err := update.Install(ctx, nil); err != nil {
		_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: window, Title: "Raypx", Message: "Unable to install the signed update. Restart Raypx. / 无法安装签名更新，请重启。"})
		quit()
		return
	}
	mygo.App.Relaunch()
	quit()
}
