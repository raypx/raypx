package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
)

const LineLimit = 8 * 1024 * 1024
const CreditBytes = 1024 * 1024

type EventStream struct {
	dispatch     chan struct{}
	subscription uint64
	mu           sync.Mutex
	send         func(JSON) error
	sequence     uint64
	outstanding  map[uint64]int
	bytes        int
	maximum      int
	changed      chan struct{}
	Observe      func(JSON)
}

func NewEvents() *EventStream {
	return &EventStream{dispatch: make(chan struct{}, 1), outstanding: map[uint64]int{}, changed: make(chan struct{})}
}
func (e *EventStream) wake() { close(e.changed); e.changed = make(chan struct{}) }
func (e *EventStream) Subscribe(send func(JSON) error) func() {
	e.mu.Lock()
	e.send = send
	e.subscription++
	e.outstanding = map[uint64]int{}
	e.bytes = 0
	e.wake()
	generation := e.subscription
	e.mu.Unlock()
	return func() {
		e.mu.Lock()
		defer e.mu.Unlock()
		if e.subscription == generation {
			e.send = nil
			e.outstanding = map[uint64]int{}
			e.bytes = 0
			e.wake()
		}
	}
}
func (e *EventStream) Acknowledge(sequence uint64) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if sequence > e.sequence {
		return false
	}
	for id, n := range e.outstanding {
		if id <= sequence {
			e.bytes -= n
			delete(e.outstanding, id)
		}
	}
	e.wake()
	return true
}
func (e *EventStream) Send(ctx context.Context, event JSON) error {
	select {
	case e.dispatch <- struct{}{}:
		defer func() { <-e.dispatch }()
	case <-ctx.Done():
		return ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if e.Observe != nil {
		e.Observe(event)
	}
	data, err := json.Marshal(event)
	if err != nil || len(data) > LineLimit {
		return errors.New("Local event exceeds limit")
	}
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		e.mu.Lock()
		if e.send == nil {
			e.mu.Unlock()
			return nil
		}
		changed := e.changed
		if e.bytes == 0 || e.bytes+len(data) <= CreditBytes {
			e.sequence++
			id := e.sequence
			e.outstanding[id] = len(data)
			e.bytes += len(data)
			if e.bytes > e.maximum {
				e.maximum = e.bytes
			}
			send := e.send
			subscription := e.subscription
			e.mu.Unlock()
			if err := send(JSON{"sequence": id, "event": event}); err != nil {
				e.mu.Lock()
				if e.subscription != subscription {
					e.mu.Unlock()
					return nil
				}
				e.send = nil
				e.bytes = 0
				e.outstanding = map[uint64]int{}
				e.wake()
				e.mu.Unlock()
			}
			return nil
		}
		e.mu.Unlock()
		select {
		case <-changed:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
