package desktop

import "testing"

func TestRendererPolicyNeedsNoEngineOrProfile(t *testing.T) {
	config, err := ParseConfig(nil)
	if err != nil {
		t.Fatal(err)
	}
	methods := map[string]bool{"files.list": true, "roots.register": true, "host.authorize": true, "observed.remote": true, "agents.local.list": true, "instance.begin": true}
	for _, method := range []string{"roots.register", "host.authorize", "observed.remote", "unknown", "files/list"} {
		if _, err := rendererParams(config, methods, method, JSON{}); err == nil {
			t.Fatalf("accepted %s", method)
		}
	}
	if _, err := rendererParams(config, methods, "files.list", JSON{}); err != nil {
		t.Fatal(err)
	}
	if _, err := rendererParams(config, methods, "agents.local.list", JSON{"accountId": "foreign-owner"}); err == nil {
		t.Fatal("accepted another owner")
	}
	input := JSON{"origin": "https://foreign.example"}
	value, err := rendererParams(config, methods, "instance.begin", input)
	if err != nil || value.(map[string]any)["origin"] != config.APIURL {
		t.Fatal("did not bind configured origin")
	}
	if input["origin"] != "https://foreign.example" {
		t.Fatal("mutated caller's input")
	}
}
