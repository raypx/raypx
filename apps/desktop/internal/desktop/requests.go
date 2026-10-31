package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
)

func (d *Desktop) RendererParams(method string, params any) (any, error) {
	if method == "" || len(method) > 128 || strings.Trim(method, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.") != "" || !d.methods[method] || strings.HasPrefix(method, "host.") || method == "observed.remote" || method == "approvals.local.watch" || method == "roots.register" || (strings.HasPrefix(method, "agents.") && !strings.HasPrefix(method, "agents.local.") && !contains([]string{"agents.projects", "agents.capabilities", "agents.configure"}, method)) {
		return nil, errors.New("Local method is not permitted")
	}
	b, err := json.Marshal(params)
	if err != nil || len(b) > LineLimit {
		return nil, errors.New("Local request exceeds limit")
	}
	if input, ok := params.(map[string]any); ok {
		input = clone(input)
		if strings.HasPrefix(method, "agents.local.") {
			if id, exists := input["accountId"]; exists && id != "device:local-workspace:v1" {
				return nil, errors.New("Local workspace owner is invalid")
			}
		}
		if strings.HasPrefix(method, "connectors.") {
			input["configDirs"] = d.Config.Directories
		}
		return input, nil
	}
	return params, nil
}

func (d *Desktop) Request(ctx context.Context, method string, input JSON) (any, error) {
	ctx, finish, err := d.admit(ctx)
	if err != nil {
		return nil, err
	}
	defer finish()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if input == nil {
		input = JSON{}
	}
	switch method {
	case "get_runtime":
		return d.Runtime(), nil
	case "api_fetch":
		return d.API.Request(ctx, input, false)
	case "api_cancel":
		id, _ := input["id"].(string)
		return d.API.Cancel(id), nil
	case "get_analytics_preferences":
		return d.Preferences.Read()["analytics"], nil
	case "save_analytics_preferences":
		return d.Preferences.Save(JSON{"analytics": input}), nil
	case "save_preferences":
		return d.Preferences.Save(input), nil
	case "hide_window":
		if d.UI == nil || !d.Tray.Load() {
			return false, nil
		}
		ok := d.UI.Hide()
		d.Visible(false)
		return ok, nil
	case "open_external":
		raw, _ := input["url"].(string)
		u, err := urlForExternal(raw)
		if err != nil {
			return nil, err
		}
		if d.UI == nil {
			return nil, errors.New("Native shell unavailable")
		}
		return true, d.UI.OpenExternal(u)
	case "pick_directory":
		if d.UI == nil {
			return nil, errors.New("Directory picker unavailable")
		}
		path, err := d.UI.PickDirectory()
		if err != nil {
			return nil, err
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if path == "" {
			return nil, nil
		}
		if !filepath.IsAbs(path) {
			return nil, errors.New("Invalid directory selection")
		}
		return d.Engine.Request(ctx, "roots.register", JSON{"path": path})
	case "restart_engine":
		var ok bool
		if input["replaceOwner"] == true {
			ok = d.Engine.ReplaceOwner()
		} else {
			ok = d.Engine.Start()
		}
		d.UpdateLease()
		return ok, nil
	case "control_session":
		id, _ := input["accountId"].(string)
		return d.session(ctx, id)
	case "control_attach":
		return d.attach(ctx, input)
	case "control_detach":
		d.control.Lock()
		id := d.account
		d.control.Unlock()
		if id != "" {
			if _, err := d.controlRequest(ctx, "host.detach", JSON{"accountId": id}); err != nil {
				return nil, err
			}
		}
		return true, nil
	case "control_info", "control_enable", "control_revoked", "terminal_settings", "terminal_configure":
		mapped := map[string]string{"control_info": "host.info", "control_enable": "host.enable", "control_revoked": "host.revoked", "terminal_settings": "host.terminal.settings", "terminal_configure": "host.terminal.configure"}[method]
		return d.controlRequest(ctx, mapped, input)
	case "local_request":
		name, _ := input["method"].(string)
		params, err := d.RendererParams(name, input["params"])
		if err != nil {
			return nil, err
		}
		if name == "connectors.install" {
			p, _ := params.(map[string]any)
			if p["recoverModified"] == true {
				return d.repair(ctx, p)
			}
		}
		return d.Engine.Request(ctx, name, params)
	}
	return nil, errors.New("Desktop method is not permitted")
}
