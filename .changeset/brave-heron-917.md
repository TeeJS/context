---
"@neuledge/context": patch
---

Falling back from better-sqlite3 to the sql.js (WebAssembly) engine now prints a warning instead of happening silently, and `context serve` reports which SQLite engine it is using. Set `CONTEXT_REQUIRE_NATIVE_SQLITE=1` to make startup fail instead of falling back, for deployments that must never run the in-memory engine.
