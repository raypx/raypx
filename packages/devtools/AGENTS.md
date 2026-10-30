# @raypx/devtools

Development-only page diagnostics shared by Web and Desktop. The browser entry
mounts inside their Router, Query, language and theme providers; `/vite` registers
the official Vite DevTools custom renderer. `/renderer` shares only a page-local
mount target with the React bridge. `/snapshot` projects allowlisted metadata.

Never serialize query keys/hashes, query data, loader data, URLs, errors or native
state. Never send diagnostics to the dev server or other tabs. Production imports
must be eliminated through `import.meta.env.DEV`. No native clipboard interface.
Use existing UI primitives and bilingual development-only copy. Dispose subscriptions
and portal targets on unmount and HMR. Tests live in `tests/unit` and `tests/component`.

Run this workspace's check/test, the explicit `e2e:devtools` browser gate and root verify.
