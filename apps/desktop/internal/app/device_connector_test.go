package app

import (
	"errors"
	"strings"
	"testing"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func TestDeviceConfirmationDialogsDefaultToCancelAndDiscloseHostPermissions(t *testing.T) {
	confirmation := host.DeviceConfirmation{ServerOrigin: "https://api.example.com", AccountLabel: "Member", SpaceLabel: "Space", DeviceName: "Machine", Directory: "/native/selected"}
	for _, language := range []string{"en", "zh"} {
		for _, grant := range []bool{false, true} {
			for _, choice := range []int{-1, 0, 1} {
				accepted, err := confirmDeviceConnector(confirmation, grant, language, func(options mygo.MessageOptions) (mygo.MessageResult, error) {
					if options.DefaultButton != 1 || options.CancelButton != 1 || len(options.Buttons) != 2 || options.Type != mygo.MessageWarning {
						t.Fatalf("unsafe native confirmation defaults: %#v", options)
					}
					for _, required := range []string{confirmation.ServerOrigin, confirmation.AccountLabel, confirmation.SpaceLabel} {
						if !strings.Contains(options.Message, required) {
							t.Fatalf("missing native context %q", required)
						}
					}
					if grant && (!strings.Contains(options.Message, confirmation.Directory) || !strings.Contains(options.Message, confirmation.DeviceName)) {
						t.Fatal("grant lacks exact device/directory")
					}
					warning := "not sandbox isolation"
					if language == "zh" {
						warning = "不受沙箱隔离"
					}
					if !strings.Contains(options.Message, warning) {
						t.Fatal("missing device permission disclosure")
					}
					return mygo.MessageResult{Button: choice}, nil
				})
				if err != nil || accepted != (choice == 0) {
					t.Fatalf("accepted = %v, err = %v", accepted, err)
				}
			}
		}
	}
	accepted, err := confirmDeviceConnector(confirmation, false, "en", func(mygo.MessageOptions) (mygo.MessageResult, error) {
		return mygo.MessageResult{Button: 0}, errors.New("dialog unavailable")
	})
	if accepted || err == nil {
		t.Fatal("dialog failure authorized pairing")
	}
}
