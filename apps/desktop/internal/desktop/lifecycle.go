package desktop

import (
	"context"
	"errors"
	"time"
)

func (d *Desktop) Start() bool {
	if d.stopped.Load() {
		return false
	}
	ok := d.Engine.Start()
	d.UpdateLease()
	return ok
}

func (d *Desktop) Close() {
	d.closeOnce.Do(func() {
		// Closing the admission gate and adding requests share one lock, so
		// Wait cannot miss a caller that obtained the old Desktop pointer.
		d.admission.Lock()
		d.closing = true
		d.stopped.Store(true)
		d.cancel()
		d.admission.Unlock()
		finished := make(chan struct{})
		go func() {
			leaseDone := make(chan struct{})
			go func() { d.UpdateLease(); close(leaseDone) }()
			select {
			case <-leaseDone:
			case <-time.After(2 * time.Second):
			}
			d.Engine.Close()
			d.requests.Wait()
			if d.instance != nil {
				_, _ = d.instance.ExecContext(context.Background(), "ROLLBACK")
				_ = d.instance.Close()
				d.instance = nil
			}
			if d.database != nil {
				_ = d.database.Close()
			}
			close(finished)
		}()
		// Native dialogs and filesystem calls are not always interruptible.
		// Bound the GUI's wait, but retain its instance lock until every old
		// request has drained (or the entire process exits).
		select {
		case <-finished:
		case <-time.After(4 * time.Second):
		}
	})
}

func (d *Desktop) admit(parent context.Context) (context.Context, func(), error) {
	d.admission.Lock()
	defer d.admission.Unlock()
	if err := parent.Err(); err != nil {
		return nil, nil, err
	}
	if d.closing {
		return nil, nil, errors.New("Desktop is shutting down")
	}
	d.requests.Add(1)
	ctx, cancel := context.WithCancel(parent)
	stop := context.AfterFunc(d.lifetime, cancel)
	return ctx, func() { stop(); cancel(); d.requests.Done() }, nil
}
