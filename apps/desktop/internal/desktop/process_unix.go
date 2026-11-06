//go:build !windows

package desktop

import "os/exec"

func Command(binary string, args ...string) *exec.Cmd { return exec.Command(binary, args...) }
