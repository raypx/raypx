package app

import (
	"fmt"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func (b *nativeUI) ConfirmDevicePairing(confirmation host.DeviceConfirmation) (bool, error) {
	return confirmDeviceConnector(confirmation, false, nativeLanguage(b.desktop), func(options mygo.MessageOptions) (mygo.MessageResult, error) {
		options.Parent = b.window
		return mygo.Dialog.Message(options)
	})
}

func (b *nativeUI) ConfirmDeviceDirectoryGrant(confirmation host.DeviceConfirmation) (bool, error) {
	return confirmDeviceConnector(confirmation, true, nativeLanguage(b.desktop), func(options mygo.MessageOptions) (mygo.MessageResult, error) {
		options.Parent = b.window
		return mygo.Dialog.Message(options)
	})
}

func confirmDeviceConnector(
	confirmation host.DeviceConfirmation,
	grant bool,
	language string,
	message func(mygo.MessageOptions) (mygo.MessageResult, error),
) (bool, error) {
	accept, cancel := "Connect device", "Cancel"
	body := fmt.Sprintf("Connect this machine to Space “%s” as %s?\n\nServer: %s\n\nCommands run on your machine with your OS permissions. This is not sandbox isolation.", confirmation.SpaceLabel, confirmation.AccountLabel, confirmation.ServerOrigin)
	if grant {
		accept = "Grant directory"
		body = fmt.Sprintf("Grant Space “%s” access to this directory as %s?\n\nDirectory: %s\nDevice: %s\nServer: %s\n\nCommands run on your machine with your OS permissions. This is not sandbox isolation.", confirmation.SpaceLabel, confirmation.AccountLabel, confirmation.Directory, confirmation.DeviceName, confirmation.ServerOrigin)
	}
	if language == "zh" {
		accept, cancel = "连接设备", "取消"
		body = fmt.Sprintf("以 %s 的身份将本机连接到空间“%s”？\n\n服务器：%s\n\n命令使用你的系统权限在本机运行，不受沙箱隔离。", confirmation.AccountLabel, confirmation.SpaceLabel, confirmation.ServerOrigin)
		if grant {
			accept = "授权目录"
			body = fmt.Sprintf("以 %s 的身份允许空间“%s”访问此目录？\n\n目录：%s\n设备：%s\n服务器：%s\n\n命令使用你的系统权限在本机运行，不受沙箱隔离。", confirmation.AccountLabel, confirmation.SpaceLabel, confirmation.Directory, confirmation.DeviceName, confirmation.ServerOrigin)
		}
	}
	result, err := message(mygo.MessageOptions{
		Title: "Raypx", Type: mygo.MessageWarning, Message: body,
		Buttons: []string{accept, cancel}, DefaultButton: 1, CancelButton: 1,
	})
	return err == nil && result.Button == 0, err
}
