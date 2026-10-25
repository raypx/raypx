/** Native evaluation avoids the SDK's new Function helper under the production CSP. */
export function createEvaluator(view: { executeJavascript(script: string): void; rpc?: unknown }) {
  const waiting = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const rpc = view.rpc as {
    addMessageListener(
      name: string,
      listener: (value: { id: string; ok: boolean; value?: unknown }) => void,
    ): void;
  };
  rpc.addMessageListener("raypxSmokeResult", (value) => {
    const pending = waiting.get(value.id);
    if (!pending) return;
    waiting.delete(value.id);
    clearTimeout(pending.timer);
    if (value.ok) pending.resolve(value.value);
    else pending.reject(new Error("Native smoke evaluation failed"));
  });
  return (script: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error("Native smoke evaluation timed out"));
      }, 5000);
      waiting.set(id, { resolve, reject, timer });
      view.executeJavascript(
        `void (async()=>{let value,ok=true;try{value=await(async()=>{${script}\n})();}catch{ok=false;}window.__electrobunHostBridge?.postMessage(JSON.stringify({type:"message",id:"raypxSmokeResult",payload:{id:${JSON.stringify(id)},ok,value}}));})();`,
      );
    });
}
