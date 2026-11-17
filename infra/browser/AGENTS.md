# Browser broker

Private Bun service for isolated, temporary agent-browser sessions. The API owns
Space membership, approval and Run fences. This broker owns live browser state
only. A session exposes a bounded viewport and separately gated member input.
Field inspection exposes labels and names only. Agent input only fills named
fields under a current inspection token, and member takeover invalidates it.
Keep the broker and agent-browser streaming ports private and isolate browser
network egress. Browser processes receive no Raypx or broker credentials.
