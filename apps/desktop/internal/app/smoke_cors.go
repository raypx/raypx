//go:build native_smoke

package app

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"sync"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func smokeCors(ctx context.Context, input host.JSON) (any, error) {
	origin := func(name string) (string, error) {
		raw, _ := input[name].(string)
		parsed, err := host.ParseOrigin(raw)
		if err != nil {
			return "", err
		}
		u, _ := url.Parse(parsed)
		if u.Scheme != "http" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1") || u.Port() == "0" {
			return "", errors.New("CORS fixture must be HTTP loopback")
		}
		return parsed, nil
	}
	a, err := origin("originA")
	if err != nil {
		return nil, err
	}
	b, err := origin("originB")
	if err != nil {
		return nil, err
	}
	if a == b {
		return nil, errors.New("CORS fixtures must be distinct")
	}
	window := mygo.NewWindow(mygo.WindowOptions{Title: "Raypx CORS acceptance", URL: "about:blank", Hidden: true, SkipTaskbar: true})
	defer window.Destroy()
	window.Page().OnWillNavigate(func(e *mygo.NavigateEvent) {
		u, err := url.Parse(e.URL)
		if err != nil || u.Scheme+"://"+u.Host != a {
			e.PreventDefault()
		}
	})
	loaded := make(chan struct{})
	var once sync.Once
	window.Page().OnDidFinishLoad(func() {
		if window.Page().URL() == a+"/__raypx_cors/page" {
			once.Do(func() { close(loaded) })
		}
	})
	if err := window.Page().LoadURL(a + "/__raypx_cors/page"); err != nil {
		return nil, err
	}
	select {
	case <-loaded:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	script := fmt.Sprintf(`const read=async url=>{const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('fixture status');return response.text()};const same=await read(%q+'/__raypx_cors/same');const allowed=await read(%q+'/__raypx_cors/allowed');let blocked=false;try{await read(%q+'/__raypx_cors/denied')}catch{blocked=true}return {sameOrigin:same==='same-origin',allowedCors:allowed==='allowed-cors',blockedCors:blocked,origin:location.origin,cspMeta:!!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),error:null}`, a, b, b)
	return window.Page().EvalContext(ctx, script)
}
