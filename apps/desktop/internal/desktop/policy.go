package desktop

import (
	"encoding/json"
	"errors"
	"strings"
)

func rendererParams(config Config, methods map[string]bool, method string, params any) (any, error) {
	if method == "" || len(method) > 128 || strings.Trim(method, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.") != "" || !methods[method] || strings.HasPrefix(method, "host.") || method == "observed.remote" || method == "approvals.local.watch" || method == "roots.register" || (strings.HasPrefix(method, "agents.") && !strings.HasPrefix(method, "agents.local.") && !contains([]string{"agents.projects", "agents.capabilities", "agents.configure", "agents.models.list", "agents.models.default", "agents.models.setDefault"}, method)) {
		return nil, errors.New("Local method is not permitted")
	}
	b, err := json.Marshal(params)
	if err != nil || len(b) > LineLimit {
		return nil, errors.New("Local request exceeds limit")
	}
	if input, ok := params.(map[string]any); ok {
		input = clone(input)
		if method == "instance.begin" {
			input["origin"] = config.APIURL
		}
		if strings.HasPrefix(method, "agents.local.") {
			if id, exists := input["accountId"]; exists && id != "device:local-workspace:v1" {
				return nil, errors.New("Local workspace owner is invalid")
			}
		}
		if strings.HasPrefix(method, "connectors.") {
			input["configDirs"] = config.Directories
		}
		return input, nil
	}
	return params, nil
}
