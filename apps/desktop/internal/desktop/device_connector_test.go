package desktop

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

type deviceUI struct {
	path          string
	accept        bool
	dialogErr     error
	pairs, grants []DeviceConfirmation
	beforeDialog  func()
	picks         int
}

func (*deviceUI) IsVisible() bool                  { return true }
func (*deviceUI) Hide() bool                       { return true }
func (u *deviceUI) PickDirectory() (string, error) { u.picks++; return u.path, nil }
func (*deviceUI) OpenExternal(string) error        { return nil }
func (u *deviceUI) ConfirmDevicePairing(value DeviceConfirmation) (bool, error) {
	u.pairs = append(u.pairs, value)
	if u.beforeDialog != nil {
		u.beforeDialog()
	}
	return u.accept, u.dialogErr
}
func (u *deviceUI) ConfirmDeviceDirectoryGrant(value DeviceConfirmation) (bool, error) {
	u.grants = append(u.grants, value)
	if u.beforeDialog != nil {
		u.beforeDialog()
	}
	return u.accept, u.dialogErr
}

func confirmationFixture() JSON {
	return JSON{
		"serverOrigin": "https://raypx.com", "accountId": "member", "accountLabel": "Member", "spaceLabel": "Space",
		"deviceName": "Machine", "spaceId": "space", "deviceId": "device", "path": "/native/selected",
		"confirmationId": "private-confirmation", "expiresAt": time.Now().Add(time.Minute).UTC().Format(time.RFC3339Nano),
	}
}

func TestDeviceConnectorRequiresNativeConfirmationWithTrustedLabels(t *testing.T) {
	for _, grant := range []bool{false, true} {
		for _, accept := range []bool{false, true} {
			t.Run(map[bool]string{false: "pair", true: "grant"}[grant]+map[bool]string{false: " cancel", true: " accept"}[accept], func(t *testing.T) {
				ui := &deviceUI{path: "/native/selected", accept: accept}
				calls := []JSON{}
				config, _ := ParseConfig(nil)
				desktop, err := New(config, t.TempDir(), Options{Client: &testNative{}, DeviceNative: func(_ context.Context, input JSON) (JSON, error) {
					calls = append(calls, input)
					switch input["action"] {
					case "pair_prepare", "grant_prepare":
						return confirmationFixture(), nil
					case "pair_confirm":
						return JSON{"paired": true, "deviceId": "device"}, nil
					case "grant_confirm":
						return JSON{"granted": true, "deviceId": "device", "grantId": "grant"}, nil
					case "confirmation_cancel":
						return JSON{"cancelled": true}, nil
					}
					return nil, errors.New("unexpected action")
				}})
				if err != nil {
					t.Fatal(err)
				}
				defer desktop.Close()
				desktop.UI = ui
				method := "pair_device_connector"
				input := JSON{"code": "PAIR-CODE", "serverOrigin": "https://attacker.invalid", "spaceLabel": "Spoofed"}
				if grant {
					method = "grant_device_directory"
					input = JSON{"spaceId": "space", "deviceId": "device", "path": "/attacker", "serverOrigin": "https://attacker.invalid"}
				}
				result, err := desktop.Request(context.Background(), method, input)
				if err != nil || result != accept {
					t.Fatalf("result = %v, err = %v", result, err)
				}
				expected := JSON{"action": "pair_prepare", "serverOrigin": config.APIURL, "code": "PAIR-CODE"}
				dialogs := ui.pairs
				if grant {
					expected = JSON{"action": "grant_prepare", "serverOrigin": config.APIURL, "spaceId": "space", "deviceId": "device", "path": "/native/selected"}
					dialogs = ui.grants
				}
				if !reflect.DeepEqual(calls[0], expected) || len(dialogs) != 1 || dialogs[0].AccountLabel != "Member" || dialogs[0].SpaceLabel != "Space" || dialogs[0].ServerOrigin != config.APIURL {
					t.Fatalf("untrusted metadata reached native confirmation: %#v %#v", calls, dialogs)
				}
				if grant && dialogs[0].Directory != "/native/selected" {
					t.Fatal("native picked path replaced")
				}
				if accept && (len(calls) != 3 || len(calls[1]) != 2 || calls[1]["confirmationId"] != "private-confirmation") {
					t.Fatalf("confirmation was not single-token: %#v", calls)
				}
				if !accept && len(calls) != 2 {
					t.Fatalf("dismissed dialog authorized work: %#v", calls)
				}
				if calls[len(calls)-1]["action"] != "confirmation_cancel" {
					t.Fatal("pending confirmation retained after dialog")
				}
			})
		}
	}
}

func TestDeviceConnectorRefusesChangedOrExpiredNativeMetadata(t *testing.T) {
	for _, scenario := range []struct{ key, value string }{
		{"serverOrigin", "https://attacker.invalid"}, {"accountLabel", "Member\nAllow all"},
		{"spaceLabel", ""}, {"deviceName", ""}, {"expiresAt", "2000-01-01T00:00:00Z"}, {"spaceId", "other-space"},
		{"deviceId", "other-device"}, {"path", "/other/path"},
	} {
		t.Run(scenario.key, func(t *testing.T) {
			ui := &deviceUI{path: "/native/selected", accept: true}
			calls := 0
			config, _ := ParseConfig(nil)
			desktop, err := New(config, t.TempDir(), Options{Client: &testNative{}, DeviceNative: func(_ context.Context, input JSON) (JSON, error) {
				if input["action"] == "confirmation_cancel" {
					return JSON{"cancelled": true}, nil
				}
				calls++
				result := confirmationFixture()
				result[scenario.key] = scenario.value
				return result, nil
			}})
			if err != nil {
				t.Fatal(err)
			}
			defer desktop.Close()
			desktop.UI = ui
			if _, err := desktop.Request(context.Background(), "grant_device_directory", JSON{"spaceId": "space", "deviceId": "device"}); err == nil {
				t.Fatal("invalid metadata accepted")
			}
			if calls != 1 || len(ui.grants) != 0 {
				t.Fatal("changed metadata prompted or authorized")
			}
		})
	}
}

func TestDeviceConnectorDismissedPickerAndCancelledDialogNeverConfirm(t *testing.T) {
	for _, path := range []string{"", "relative", "/native/selected\nother"} {
		config, _ := ParseConfig(nil)
		calls := 0
		desktop, err := New(config, t.TempDir(), Options{Client: &testNative{}, DeviceNative: func(context.Context, JSON) (JSON, error) { calls++; return confirmationFixture(), nil }})
		if err != nil {
			t.Fatal(err)
		}
		desktop.UI = &deviceUI{path: path, accept: true}
		_, _ = desktop.Request(context.Background(), "grant_device_directory", JSON{"spaceId": "space", "deviceId": "device"})
		desktop.Close()
		if calls != 0 {
			t.Fatal("invalid or dismissed native picker reached connector")
		}
	}
	config, _ := ParseConfig(nil)
	ctx, cancel := context.WithCancel(context.Background())
	calls := []string{}
	desktop, err := New(config, t.TempDir(), Options{Client: &testNative{}, DeviceNative: func(_ context.Context, input JSON) (JSON, error) {
		calls = append(calls, input["action"].(string))
		return confirmationFixture(), nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	desktop.UI = &deviceUI{accept: true, beforeDialog: cancel}
	if _, err := desktop.Request(ctx, "pair_device_connector", JSON{"code": "PAIR-CODE"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled request result = %v", err)
	}
	if !reflect.DeepEqual(calls, []string{"pair_prepare", "confirmation_cancel"}) {
		t.Fatal("cancelled dialog confirmed pairing")
	}
}

func TestDeviceConnectorConfirmationPreservesBoundedChineseLabels(t *testing.T) {
	config, _ := ParseConfig(nil)
	desktop := &Desktop{Config: config}
	metadata := confirmationFixture()
	label := strings.Repeat("空间", 90)
	metadata["accountLabel"], metadata["spaceLabel"], metadata["deviceName"] = label, label, label
	confirmation, _, err := desktop.deviceConfirmation(metadata)
	if err != nil || confirmation.AccountLabel != label || confirmation.SpaceLabel != label || confirmation.DeviceName != label {
		t.Fatal("valid Chinese labels were rejected or clipped")
	}
}

type deviceSessionNative struct {
	testNative
	identity func() JSON
}

func (n *deviceSessionNative) Native(ctx context.Context, input JSON) (any, error) {
	if input["action"] == "device_connector_context" {
		return n.identity(), nil
	}
	return n.testNative.Native(ctx, input)
}

func TestPendingDeviceGrantRequiresCurrentSessionThroughNativeConfirmation(t *testing.T) {
	for _, scenario := range []struct {
		name                             string
		endAtIdentity                    int
		switchAtIdentity                 int
		endAfterDialog                   bool
		accept                           bool
		claims, picks, dialogs, confirms int
	}{
		{name: "signed out", endAtIdentity: 1},
		{name: "signed out after claim", endAtIdentity: 2, claims: 1},
		{name: "signed out before dialog", endAtIdentity: 3, claims: 1, picks: 1},
		{name: "account changed after claim", switchAtIdentity: 2, claims: 1},
		{name: "account changed before dialog", switchAtIdentity: 3, claims: 1, picks: 1},
		{name: "signed out during dialog", endAfterDialog: true, accept: true, claims: 1, picks: 1, dialogs: 1},
		{name: "native decline", claims: 1, picks: 1, dialogs: 1},
		{name: "native accept", accept: true, claims: 1, picks: 1, dialogs: 1, confirms: 1},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			checks, claims, confirms := 0, 0, 0
			signedOut := false
			client := &deviceSessionNative{identity: func() JSON {
				checks++
				if signedOut || (scenario.endAtIdentity > 0 && checks >= scenario.endAtIdentity) {
					return nil
				}
				if scenario.switchAtIdentity > 0 && checks >= scenario.switchAtIdentity {
					return JSON{"serverOrigin": "https://raypx.com", "accountId": "another-member"}
				}
				return JSON{"serverOrigin": "https://raypx.com", "accountId": "member"}
			}}
			config, _ := ParseConfig(nil)
			desktop, err := New(config, t.TempDir(), Options{Client: client, DeviceNative: func(_ context.Context, input JSON) (JSON, error) {
				switch input["action"] {
				case "grant_request_claim":
					claims++
					if input["serverOrigin"] != config.APIURL || input["accountId"] != "member" {
						t.Fatal("poll used caller identity")
					}
					return JSON{"request": JSON{"requestId": "request", "spaceId": "space", "deviceId": "device"}}, nil
				case "grant_prepare":
					return confirmationFixture(), nil
				case "grant_confirm":
					confirms++
					return JSON{"granted": true}, nil
				case "confirmation_cancel":
					return JSON{"cancelled": true}, nil
				default:
					t.Fatalf("unexpected native connector action %v", input["action"])
					return nil, nil
				}
			}})
			if err != nil {
				t.Fatal(err)
			}
			defer desktop.Close()
			ui := &deviceUI{path: "/native/selected", accept: scenario.accept, beforeDialog: func() { signedOut = scenario.endAfterDialog }}
			desktop.UI = ui
			desktop.pollDeviceGrants()
			if claims != scenario.claims || ui.picks != scenario.picks || len(ui.grants) != scenario.dialogs || confirms != scenario.confirms {
				t.Fatalf("got claims=%d picks=%d dialogs=%d confirms=%d", claims, ui.picks, len(ui.grants), confirms)
			}
			// The existing native heartbeat may call again; one poll cannot duplicate
			// the native question or consume another request immediately.
			desktop.pollDeviceGrants()
			if claims != scenario.claims {
				t.Fatal("native polling exceeded its bound")
			}
		})
	}
}
