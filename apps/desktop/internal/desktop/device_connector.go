package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

func (d *Desktop) runDeviceNative(parent context.Context, input JSON) (JSON, error) {
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	raw, err := finiteCLI(ctx, d.cli, []string{"device", "native", "--json"}, input)
	if err != nil {
		return nil, err
	}
	var result JSON
	if json.Unmarshal(raw, &result) != nil || result == nil {
		return nil, errors.New("INVALID_CONNECTOR_RESPONSE")
	}
	return result, nil
}

func displayText(input JSON, key string, limit int) (string, bool) {
	value, ok := input[key].(string)
	if !ok || value == "" || len(value) > limit || strings.IndexFunc(value, unicode.IsControl) >= 0 {
		return "", false
	}
	return value, true
}

func (d *Desktop) deviceConfirmation(result JSON) (DeviceConfirmation, string, error) {
	origin, ok := displayText(result, "serverOrigin", 2048)
	if !ok || origin != d.Config.APIURL {
		return DeviceConfirmation{}, "", errors.New("INVALID_CONNECTOR_RESPONSE")
	}
	account, accountOK := displayText(result, "accountLabel", 1024)
	space, spaceOK := displayText(result, "spaceLabel", 1024)
	confirmation, confirmationOK := displayText(result, "confirmationId", 256)
	expires, expiresOK := displayText(result, "expiresAt", 64)
	device, deviceOK := displayText(result, "deviceName", 1024)
	expiresAt, err := time.Parse(time.RFC3339Nano, expires)
	if !accountOK || !spaceOK || !confirmationOK || !expiresOK || !deviceOK || err != nil || !time.Now().Before(expiresAt) {
		return DeviceConfirmation{}, "", errors.New("INVALID_CONNECTOR_RESPONSE")
	}
	return DeviceConfirmation{ServerOrigin: origin, AccountLabel: account, SpaceLabel: space, DeviceName: device}, confirmation, nil
}

func (d *Desktop) pairDeviceConnector(ctx context.Context, input JSON) (any, error) {
	if !d.deviceConfirm.TryLock() {
		return nil, errors.New("DEVICE_CONFIRMATION_BUSY")
	}
	defer d.deviceConfirm.Unlock()
	ui, ok := d.UI.(DeviceConfirmationUI)
	if !ok {
		return nil, errors.New("NATIVE_CONFIRMATION_UNAVAILABLE")
	}
	code, valid := displayText(input, "code", 128)
	if !valid || strings.TrimSpace(code) != code {
		return nil, errors.New("INVALID_PAIRING_CODE")
	}
	result, err := d.deviceNative(ctx, JSON{"action": "pair_prepare", "serverOrigin": d.Config.APIURL, "code": code})
	if err != nil {
		return nil, err
	}
	confirmation, id, err := d.deviceConfirmation(result)
	if err != nil {
		return nil, err
	}
	defer d.cancelDeviceConfirmation(id)
	accepted, err := ui.ConfirmDevicePairing(confirmation)
	if err != nil {
		return nil, errors.New("NATIVE_CONFIRMATION_UNAVAILABLE")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !accepted {
		return false, nil
	}
	confirmed, err := d.deviceNative(ctx, JSON{"action": "pair_confirm", "confirmationId": id})
	if err != nil {
		return nil, err
	}
	if confirmed["paired"] != true {
		return nil, errors.New("INVALID_CONNECTOR_RESPONSE")
	}
	return true, nil
}

func (d *Desktop) grantDeviceDirectory(ctx context.Context, input JSON) (any, error) {
	if !d.deviceConfirm.TryLock() {
		return nil, errors.New("DEVICE_CONFIRMATION_BUSY")
	}
	defer d.deviceConfirm.Unlock()
	identity, err := d.deviceIdentity(ctx)
	if err != nil {
		return nil, err
	}
	accountID, _ := identity["accountId"].(string)
	return d.grantDeviceDirectoryConfirmed(ctx, input, accountID)
}

func (d *Desktop) deviceIdentity(ctx context.Context) (JSON, error) {
	value, err := d.Client.Native(ctx, JSON{"action": "device_connector_context"})
	if err != nil {
		return nil, errors.New("AUTH_REQUIRED")
	}
	identity, ok := value.(JSON)
	if !ok || identity["serverOrigin"] != d.Config.APIURL {
		return nil, errors.New("AUTH_REQUIRED")
	}
	if _, ok := displayText(identity, "accountId", 200); !ok {
		return nil, errors.New("AUTH_REQUIRED")
	}
	return identity, nil
}

func (d *Desktop) verifyDeviceIdentity(ctx context.Context, accountID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	identity, err := d.deviceIdentity(ctx)
	if err != nil || identity["accountId"] != accountID {
		return errors.New("AUTH_REQUIRED")
	}
	return nil
}

// Polling uses the existing native lifetime without opening a connector listener.
// Claiming a queued request conveys intent only; the picker and native dialog
// still authorize the exact directory against a freshly verified session.
func (d *Desktop) pollDeviceGrants() {
	if d.stopped.Load() || d.Client.Status()["status"] != "ready" {
		return
	}
	if _, ok := d.UI.(DeviceConfirmationUI); !ok {
		return
	}
	if !d.devicePoll.TryLock() {
		return
	}
	defer d.devicePoll.Unlock()
	if time.Now().Before(d.devicePollNext) {
		return
	}
	d.devicePollNext = time.Now().Add(5 * time.Second)
	if !d.deviceConfirm.TryLock() {
		return
	}
	defer d.deviceConfirm.Unlock()
	ctx, finish, err := d.admit(d.lifetime)
	if err != nil {
		return
	}
	defer finish()
	identity, err := d.deviceIdentity(ctx)
	if err != nil {
		return
	}
	accountID := identity["accountId"].(string)
	result, err := d.deviceNative(ctx, JSON{"action": "grant_request_claim", "serverOrigin": d.Config.APIURL, "accountId": accountID})
	if err != nil {
		return
	}
	request, ok := result["request"].(JSON)
	if !ok {
		return
	}
	if _, valid := displayText(request, "requestId", 200); !valid {
		return
	}
	_, _ = d.grantDeviceDirectoryConfirmed(ctx, request, accountID)
}

func (d *Desktop) grantDeviceDirectoryConfirmed(ctx context.Context, input JSON, accountID string) (any, error) {
	ui, ok := d.UI.(DeviceConfirmationUI)
	if !ok {
		return nil, errors.New("NATIVE_CONFIRMATION_UNAVAILABLE")
	}
	spaceID, spaceOK := displayText(input, "spaceId", 128)
	deviceID, deviceOK := displayText(input, "deviceId", 128)
	if !spaceOK || !deviceOK {
		return nil, errors.New("INVALID_DEVICE_SELECTION")
	}
	if err := d.verifyDeviceIdentity(ctx, accountID); err != nil {
		return nil, err
	}
	path, err := d.UI.PickDirectory()
	if err != nil {
		return nil, errors.New("DIRECTORY_PICKER_UNAVAILABLE")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if path == "" {
		return false, nil
	}
	if !filepath.IsAbs(path) || len(path) > 4096 || strings.IndexFunc(path, unicode.IsControl) >= 0 {
		return nil, errors.New("INVALID_DIRECTORY_SELECTION")
	}
	result, err := d.deviceNative(ctx, JSON{"action": "grant_prepare", "serverOrigin": d.Config.APIURL, "spaceId": spaceID, "deviceId": deviceID, "path": path})
	if err != nil {
		return nil, err
	}
	confirmation, id, err := d.deviceConfirmation(result)
	if err != nil {
		return nil, err
	}
	defer d.cancelDeviceConfirmation(id)
	if result["spaceId"] != spaceID || result["deviceId"] != deviceID || result["path"] != path {
		return nil, errors.New("INVALID_CONNECTOR_RESPONSE")
	}
	if result["accountId"] != accountID {
		return nil, errors.New("AUTH_REQUIRED")
	}
	confirmation.Directory = path
	if err := d.verifyDeviceIdentity(ctx, accountID); err != nil {
		return nil, err
	}
	accepted, err := ui.ConfirmDeviceDirectoryGrant(confirmation)
	if err != nil {
		return nil, errors.New("NATIVE_CONFIRMATION_UNAVAILABLE")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !accepted {
		return false, nil
	}
	if err := d.verifyDeviceIdentity(ctx, accountID); err != nil {
		return nil, err
	}
	confirmed, err := d.deviceNative(ctx, JSON{"action": "grant_confirm", "confirmationId": id})
	if err != nil {
		return nil, err
	}
	if confirmed["granted"] != true {
		return nil, errors.New("INVALID_CONNECTOR_RESPONSE")
	}
	return true, nil
}

func (d *Desktop) cancelDeviceConfirmation(id string) {
	ctx, cancel := context.WithTimeout(d.lifetime, 5*time.Second)
	defer cancel()
	_, _ = d.deviceNative(ctx, JSON{"action": "confirmation_cancel", "confirmationId": id})
}
