package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	host "raypx.local/desktop/internal/desktop"
)

func fixture(t *testing.T, name string) []host.JSON {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("../../fixtures/native", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []host.JSON
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}
func TestSharedConnectionFixtures(t *testing.T) {
	for _, row := range fixture(t, "config") {
		t.Run(row["name"].(string), func(t *testing.T) {
			config, err := host.ParseConfig([]byte(row["source"].(string)))
			if row["invalid"] == true {
				if err == nil {
					t.Fatal("accepted invalid config")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			expected := row["expected"].(map[string]any)
			if config.APIURL != expected["apiUrl"] || config.WebURL != expected["webUrl"] {
				t.Fatalf("fixture differs: %v", config)
			}
		})
	}
}
