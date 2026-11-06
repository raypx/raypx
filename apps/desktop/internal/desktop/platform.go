package desktop

import (
	"errors"
	"net/url"
	"runtime"
	"strings"
)

func platformName() string {
	if runtime.GOOS == "windows" {
		return "win32"
	}
	return runtime.GOOS
}

// TrustedPageURL limits native calls to this server's bundled page origin.
// platform is a Go GOOS name; WebView2 maps custom schemes on Windows only.
func TrustedPageURL(raw, scope string, development bool, platform string) bool {
	if len(scope) != 32 || strings.Trim(scope, "0123456789abcdef") != "" {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || u.Opaque != "" {
		return false
	}
	if u.Scheme == "mygo" && u.Host == scope {
		return true
	}
	if platform == "windows" && u.Scheme == "http" && u.Host == scope+".mygo.localhost" {
		return true
	}
	return development && u.Scheme == "http" && u.Host == "localhost:1420"
}

func urlForExternal(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || len(raw) > 8192 || strings.ContainsAny(raw, "\r\n\\") || u.User != nil || u.Hostname() == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", errors.New("Invalid external URL")
	}
	return u.String(), nil
}
