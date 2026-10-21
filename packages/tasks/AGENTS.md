# @raypx/tasks

Shared remote Agent task and approval views for Web and Desktop.
The root exports pure state helpers; /client exports DOM components and visibility-aware relay subscriptions.
Applications inject the API client, account identity and native settings. No native, database,
authentication or CLI implementation imports. Never display raw exception messages or render
agent content as HTML. User mutation retries retain their idempotency ID.
Run this workspace check/test and the repository verification gate.
