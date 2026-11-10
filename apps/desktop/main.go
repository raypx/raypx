package main

import (
	"embed"
	"fmt"
	"os"

	"raypx.local/desktop/internal/app"
)

//go:embed all:generated/frontend generated/*.json resources/tray.png
var bundled embed.FS

func main() {
	if err := app.Run(bundled); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}
