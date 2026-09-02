---
"@neuledge/context": patch
---

`context serve --http` now caps concurrent sessions (`CONTEXT_MAX_SESSIONS`, default 64) and closes sessions idle for longer than `CONTEXT_SESSION_IDLE_TIMEOUT` seconds (default 1800), so clients that disappear without closing their session no longer accumulate in memory. A first request that is not a valid `initialize` no longer leaves an orphaned transport behind.
