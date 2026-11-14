package app

import (
	"os"
	"strings"

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
