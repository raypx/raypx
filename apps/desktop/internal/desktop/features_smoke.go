//go:build native_smoke

package desktop

const NativeSmoke = true

func compiledFeatures() []string { return []string{"native-smoke"} }
