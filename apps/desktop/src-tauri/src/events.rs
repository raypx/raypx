use crate::{LINE_LIMIT, Result, fail};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tokio::sync::{Mutex as AsyncMutex, Notify};
use tokio_util::sync::CancellationToken;
const CREDIT: usize = 1024 * 1024;
type Sink = Arc<dyn Fn(Value) -> Result<()> + Send + Sync>;
#[derive(Default)]
struct State {
    generation: u64,
    sequence: u64,
    bytes: usize,
    maximum: usize,
    outstanding: BTreeMap<u64, usize>,
    sink: Option<Sink>,
}
#[derive(Default)]
pub struct Events {
    state: Mutex<State>,
    dispatch: AsyncMutex<()>,
    changed: Notify,
    observer: Mutex<Option<Sink>>,
}
impl Events {
    pub fn observe(&self, observer: Sink) {
        *self.observer.lock().unwrap() = Some(observer);
    }
    pub fn subscribe(&self, sink: Sink) -> Result<u64> {
        let mut state = self.state.lock().unwrap();
        state.generation += 1;
        state.bytes = 0;
        state.outstanding.clear();
        state.sink = Some(sink.clone());
        let generation = state.generation;
        sink(json!({"ready":true,"subscription":generation}))?;
        drop(state);
        self.changed.notify_waiters();
        Ok(generation)
    }
    pub fn unsubscribe(&self, generation: u64) {
        let mut state = self.state.lock().unwrap();
        if state.generation == generation {
            state.sink = None;
            state.bytes = 0;
            state.outstanding.clear();
        }
        drop(state);
        self.changed.notify_waiters();
    }
    pub fn acknowledge(&self, generation: u64, sequence: u64) -> bool {
        let mut state = self.state.lock().unwrap();
        if generation != state.generation || sequence > state.sequence {
            return false;
        }
        let retained = state.outstanding.split_off(&sequence.saturating_add(1));
        state.outstanding = retained;
        state.bytes = state.outstanding.values().sum();
        drop(state);
        self.changed.notify_waiters();
        true
    }
    #[cfg(feature = "native-smoke")]
    pub fn metrics(&self) -> (usize, usize) {
        let state = self.state.lock().unwrap();
        (state.bytes, state.maximum)
    }
    #[cfg(feature = "native-smoke")]
    pub async fn flush(&self, cancel: &CancellationToken) -> Result<()> {
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            if self.state.lock().unwrap().bytes == 0 {
                return Ok(());
            }
            tokio::select! {_ = changed => {}, _ = cancel.cancelled() => return fail("CANCELLED")}
        }
    }
    pub async fn send(&self, event: Value, cancel: &CancellationToken) -> Result<()> {
        if let Some(observer) = self.observer.lock().unwrap().clone() {
            let _ = observer(event.clone());
        }
        let _dispatch = tokio::select! { guard = self.dispatch.lock() => guard, _ = cancel.cancelled() => return fail("CANCELLED") };
        let size = serde_json::to_vec(&event)?.len();
        if size > LINE_LIMIT {
            return fail("EVENT_LIMIT");
        }
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            {
                let mut state = self.state.lock().unwrap();
                let Some(sink) = state.sink.clone() else {
                    return Ok(());
                };
                if state.bytes == 0 || state.bytes + size <= CREDIT {
                    state.sequence += 1;
                    let sequence = state.sequence;
                    let generation = state.generation;
                    state.outstanding.insert(sequence, size);
                    state.bytes += size;
                    state.maximum = state.maximum.max(state.bytes);
                    if sink(json!({"sequence":sequence,"event":event,"subscription":generation}))
                        .is_err()
                    {
                        state.sink = None;
                        state.outstanding.clear();
                        state.bytes = 0;
                        self.changed.notify_waiters();
                    }
                    return Ok(());
                }
            }
            tokio::select! { _ = changed => {}, _ = cancel.cancelled() => return fail("CANCELLED") }
        }
    }
}
