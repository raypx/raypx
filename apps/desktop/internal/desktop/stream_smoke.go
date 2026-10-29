//go:build native_smoke

package desktop

import "context"

func (e *EventStream) ResetMetrics() { e.mu.Lock(); e.maximum = e.bytes; e.mu.Unlock() }
func (e *EventStream) Metrics() (int, int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.bytes, e.maximum
}
func (e *EventStream) Flush(ctx context.Context) error {
	for {
		e.mu.Lock()
		empty := e.bytes == 0
		changed := e.changed
		e.mu.Unlock()
		if empty {
			return nil
		}
		select {
		case <-changed:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
