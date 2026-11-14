package desktop

import (
	"context"
	"time"
)

func (d *Desktop) Visible(value bool) {
	if d.stopped.Load() {
		return
	}
	d.lease.Lock()
	d.visible = value
	d.lease.Unlock()
	d.UpdateLease()
}
func (d *Desktop) UpdateLease() {
	d.lease.Lock()
	defer d.lease.Unlock()
	if d.stopped.Load() || d.Client.Status()["status"] != "ready" {
		return
	}
	defer func() { go d.pollDeviceGrants() }()
	if d.UI != nil {
		d.visible = d.UI.IsVisible()
	}
	ctx, cancel := context.WithTimeout(d.lifetime, 4*time.Second)
	defer cancel()
	_, _ = d.Client.Native(ctx, JSON{"action": "visible", "active": d.visible})
}
