# Debug Console — Shlav A Mega

A built-in mobile-first debug console. No `chrome://inspect` needed.

## How to open

**Three options:**

1. **Tap the top-right corner of the screen 5 times within 3 seconds.** The activator is a tiny 40×40 invisible div in the absolute top-right corner. If you have trouble triggering it (the dark/study/help buttons sit in the same area and take precedence), use option 2 or 3.
2. **`?debug=1` URL parameter**: navigate to `https://eiasash.github.io/Geriatrics/?debug=1` once. A floating 🐞 button appears bottom-right and stays for the rest of your browser session (cleared on tab close — `sessionStorage`, not `localStorage`).
3. **Ctrl+Shift+D** keyboard shortcut (desktop).

Manual fallback from DevTools: `__debug.show()`

After the panel has been opened once, the 🐞 button persists for the session — no need to re-tap or re-add `?debug=1`.

## What it shows

| Section | Contents |
|---|---|
| **Header** | App name + APP_VERSION, SW state, URL, user agent, screen size + DPR, memory usage |
| **State** | Current `tab`, `libSec`, `qi`, `pool` size, open chapter (`grsChOpen` / `hazChOpen` / `harChOpen`) |
| **⚠️ Errors** | Last 10 uncaught errors + unhandled promise rejections, with file/line/col + first 5 stack frames |
| **📝 Console** | Last 50 `console.log/info/warn/error/debug` calls, color-coded by level |
| **🌐 Network** | Last 20 `fetch()` calls — status, ms, URL. `ERR` prefix for failures |
| **👆 Actions** | Last 30 user clicks — selector + onclick function name (e.g. `#nav-library → openLibrary()`) |

## How to report a bug

1. Open the panel (5 taps top-right)
2. Tap **📋 Copy** — the report is now on your clipboard, formatted as plain text with `=== SECTION ===` headers
3. Paste into your chat with Claude, or into a GitHub issue
4. Tap **✕ Close** when done

The report is concatenated to `=== END REPORT ===` so the receiving end knows it's complete.

## Privacy

The report includes:
- App version, SW state, URL
- User agent string, screen size, memory usage
- Your last 30 clicks (button selectors and function names — no text input contents)
- Recent network calls (URLs only — no request/response bodies)
- Recent console output (whatever the app logged)
- Errors with stack traces

The report does **NOT** include:
- Question content, answer keys, study notes, drugs, flashcards
- Patient or clinical data (the app doesn't have any)
- Saved progress, FSRS scheduling state, study history
- localStorage/IndexedDB contents
- Supabase auth tokens or API keys

## Disable

There is no off switch — the gesture is intentionally hidden so it doesn't trigger accidentally. If you find that you're activating it by accident, file a bug and we'll narrow the corner zone.

## API (DevTools console)

```js
__debug.show()    // open the panel
__debug.report()  // log the full report to console; also returns it as a string
__debug.buffer    // raw access to {logs, errors, network, actions}
__debug.clear()   // empty all four buffers
```

## Implementation

Lives at the very top of `shlav-a-mega.html` in the first `<script>` block, so wrappers install before any other code runs. ~7 KB inline. Same module ports to Pnimit (`src/debug/console.js`) and Mishpacha — keep changes in sync.
