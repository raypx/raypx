package desktop

import (
	"context"
	"errors"
	"path/filepath"
)

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
	case "get_channel":
		return d.Client.Channel(ctx)
	case "repair_connector":
		return d.repair(ctx, input)
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
		return d.Client.Native(ctx, JSON{"action": "pick", "path": path})
	case "recover_session":
		if d.RecoverSession == nil {
			return nil, errors.New("Session recovery unavailable")
		}
		return d.RecoverSession(), nil
	case "restart_engine":
		var ok bool
		if input["replaceOwner"] == true {
			ok = d.Client.ReplaceOwner()
		} else {
			ok = d.Client.Refresh()
		}
		d.UpdateLease()
		return ok, nil

	}
	return nil, errors.New("Desktop method is not permitted")
}
