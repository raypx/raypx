package desktop

import (
	"context"
	"errors"
	"strings"
)

func (d *Desktop) session(ctx context.Context, account string) (bool, error) {
	generation := d.generation.Add(1)
	d.control.Lock()
	defer d.control.Unlock()
	if generation != d.generation.Load() {
		return false, nil
	}
	if account != "" {
		if err := d.verifyAccount(ctx, account); err != nil {
			return false, err
		}
	}
	if generation != d.generation.Load() {
		return false, nil
	}
	var id any = account
	if account == "" {
		id = nil
	}
	if _, err := d.Engine.Request(ctx, "host.session", JSON{"accountId": id, "apiUrl": d.Config.APIURL}); err != nil {
		return false, err
	}
	if d.account != account {
		d.authorizationError = false
	}
	d.account = account
	return true, nil
}

func (d *Desktop) verifyAccount(ctx context.Context, account string) error {
	value, err := d.API.RPC(ctx, "account/get", JSON{})
	if err != nil {
		return err
	}
	profile, _ := value.(map[string]any)
	if profile["id"] != account {
		return errors.New("AUTH_REQUIRED")
	}
	return nil
}

func (d *Desktop) controlRequest(ctx context.Context, method string, input JSON) (any, error) {
	if strings.HasPrefix(method, "host.terminal.") {
		d.control.Lock()
		defer d.control.Unlock()
	}
	input = clone(input)
	input["apiUrl"] = d.Config.APIURL
	value, err := d.Engine.Request(ctx, method, input)
	if err != nil {
		return nil, err
	}
	if method == "host.info" {
		d.control.Lock()
		defer d.control.Unlock()
		info, _ := value.(map[string]any)
		if info["authorized"] == true || info["connected"] == true {
			d.authorizationError = false
		}
		if d.authorizationError {
			info["error"] = "AUTH_REQUIRED"
		}
	}
	return value, nil
}

func (d *Desktop) attach(ctx context.Context, input JSON) (any, error) {
	account, _ := input["accountId"].(string)
	if account == "" || input["apiUrl"] != d.Config.APIURL {
		return nil, errors.New("AUTH_REQUIRED")
	}
	d.control.Lock()
	selected := d.account
	d.control.Unlock()
	if selected != account {
		if _, err := d.session(ctx, account); err != nil {
			return nil, err
		}
	}
	generation := d.generation.Load()
	d.control.Lock()
	selected = d.account
	d.control.Unlock()
	if selected != account {
		return nil, errors.New("AUTH_REQUIRED")
	}
	value, err := d.controlRequest(ctx, "host.info", JSON{"accountId": account})
	if err != nil {
		return nil, err
	}
	info, _ := value.(map[string]any)
	binding, _ := info["binding"].(map[string]any)
	grant, _ := input["grant"].(map[string]any)
	if info["authorized"] == true && binding["deviceId"] == grant["deviceId"] && binding["epoch"] == grant["epoch"] {
		return info, nil
	}
	if err := d.verifyAccount(ctx, account); err != nil {
		return nil, err
	}
	authorization, err := d.API.RPC(ctx, "hosts/authorize", JSON{"deviceId": grant["deviceId"], "epoch": grant["epoch"]})
	d.control.Lock()
	current := d.account == account && d.generation.Load() == generation
	if err != nil && err.Error() == "AUTH_REQUIRED" {
		d.authorizationError = true
	}
	d.control.Unlock()
	if err != nil {
		if err.Error() == "MISSING_PROCEDURE" && current {
			return d.controlRequest(ctx, "host.legacy", JSON{"accountId": account, "grant": grant})
		}
		return nil, err
	}
	if !current {
		a, _ := authorization.(map[string]any)
		_, _ = d.API.RPC(ctx, "hosts/revoke", JSON{"credential": a["credential"]})
		return nil, errors.New("AUTH_REQUIRED")
	}
	return d.controlRequest(ctx, "host.authorize", JSON{"accountId": account, "authorization": authorization})
}

// RefreshGrant asks the independently owned daemon to renew its current grant.
func (d *Desktop) RefreshGrant(ctx context.Context) (bool, error) {
	d.control.Lock()
	account := d.account
	d.control.Unlock()
	if account == "" {
		return false, nil
	}
	value, err := d.controlRequest(ctx, "host.refresh", JSON{"accountId": account})
	return value == true, err
}
