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
	if !d.stopped.Load() && d.UI != nil {
		d.visible = d.UI.IsVisible()
	}
	active := !d.stopped.Load() && d.visible && d.Engine.Status()["status"] == "ready" && d.Engine.Features()["localTerminalApprovals"] == true
	if !active && !d.active {
		return
	}
	d.active = active
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _ = d.Engine.Request(ctx, "approvals.local.watch", JSON{"active": active})
}
