package desktop

import (
	"os/exec"
	"syscall"
)

func Command(binary string, args ...string) *exec.Cmd {
	cmd := exec.Command(binary, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return cmd
}
