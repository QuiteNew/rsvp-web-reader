# Keyboard shortcuts — design & progress

**Status: DONE. All four steps implemented, hand-tested, and committed. v1 scope complete.** Later additions are listed at the end.

## Design (agreed, implemented as described below)

Scope for v1: reading controls only. Nothing in the sidebar/app chrome.

Keymap (same everywhere it applies):
- **Space** — Play/Pause
- **← / →** — Skip backward/forward (uses whatever skip-word-count is set in Settings)
- **R** — Restart
- **Esc** — Stop (ends session, shows edit view) — works in both windows
- **F** — Toggle Focus mode — **main window only**, deliberately not bound in the detached window (it has no sidebar/header to hide, nothing for it to do there)

Mechanism: shortcuts are bound directly on each window itself (`self.bind(...)` on `RSVPApp` for the main window, separately on `DetachedTranscriptWindow`) — not `bind_all()`. Tk automatically includes a toplevel's own bindings in the lookup chain for all its descendants, so this fires regardless of which child widget has focus, fully scoped to that one window.

Guard: every shortcut handler checks `_shortcut_should_fire()` first — `False` whenever the currently focused widget's `winfo_class()` is `"Entry"` or `"Text"` (CTkEntry/CTkTextbox wrap plain tkinter widgets internally for actual keyboard input, so `focus_get()` returns that inner widget while typing). This keeps typing in the search box, a rename field, or the paste/edit box unaffected.

## Status by step

**Step 1 — main window (Space/←/→/R): DONE, tested, committed (2026-09-24).**
- `gui/components/canvas.py`: renamed `_handle_pause_toggle` → `toggle_pause`, `_handle_restart` → `restart` (and, in step 4, `_handle_stop` → `stop`) — pure renames, made public so `gui/app.py` can call them directly.
- `gui/app.py`: `_bind_shortcuts()` (called once at the end of `__init__`), `_shortcut_should_fire()`, and thin per-shortcut handler methods.

**Step 2 — same three (Space/←/→/R) in the detached window: DONE, tested, committed.**
- `gui/components/detached_window.py`: mirrored `_bind_shortcuts()` / `_shortcut_should_fire()`, calling straight into this class's own existing private handlers (no rename needed — they were already only ever called from within this class).

**Step 3 — Focus mode (F), main window only: DONE, tested, committed.**
- `gui/app.py`: `<f>`/`<F>` bound in `_bind_shortcuts()`, calling `_toggle_focus_mode()`.
- **Bug found and fixed along the way:** `Canvas.set_maximized()` and `CanvasToolbar.set_maximized()` (which swap the maximize button's icon between `"< >"` and `"> <"`) already existed but were never called from anywhere — dead code, pre-dating this session's work. So the toolbar button's icon never updated on focus-mode toggle, whether triggered by the button itself or the new F key. Fixed with one line in `_toggle_focus_mode()`: `self.canvas.set_maximized(self._focus_mode)`.

**Step 4 — Stop (Esc), both windows: DONE, tested, committed.**

This was the one genuine feature addition, not just a rebind: the detached window had no Stop capability at all before this (no button, no handler). Building it in surfaced three real bugs, all fixed:

1. **Both `Canvas.stop()` (renamed from `_handle_stop`) and the new `DetachedTranscriptWindow._handle_stop()` initially ran unconditionally** whenever a transcript was current, with no check for whether a session was actually active. Since both unconditionally set the edit box to `transcript.raw_text`, and `raw_text` is empty for a never-submitted draft, this silently wiped the box the moment Esc was pressed while sitting in a blank draft. **Fix:** guard both methods to only act when the reader is genuinely what's on screen — `Canvas.stop()` checks `not self._input_currently_shown` and that the transcript isn't the one currently off in the detached window; `DetachedTranscriptWindow._handle_stop()` checks `not is_stopped and raw_text.strip()`. This also incidentally fixed the identical latent bug in the Stop **button** itself (same underlying method, same fix) — it was already exploitable by clicking Stop while on the edit screen, Esc just made it far easier to trigger by accident.
2. **A transcript that got corrupted into an invalid state** (`is_stopped=True` with empty `raw_text`) by bug #1, while testing happened before the fix landed, kept behaving oddly afterward. Not a code bug — just stale bad data on that one transcript from mid-session testing. No fix needed beyond not reusing that particular transcript.
3. **`DetachedTranscriptWindow.close()`'s draft-capture condition didn't match `Canvas._handle_detached_closed()`'s persist condition.** `close()` only captured the box's live text when `not raw_text.strip()`; `_handle_detached_closed()` persisted whatever it was given whenever `is_stopped or not raw_text.strip()`. A transcript that's stopped-but-not-empty (exactly the state Esc leaves one in) fell through `close()`'s capture with `draft_text=""`, but `_handle_detached_closed()` still treated `is_stopped` as reason enough to persist that empty string into `raw_text` — wiping the very text Esc had just preserved, on window close. **Fix:** aligned `close()`'s capture condition to match `_handle_detached_closed()`'s exactly (`is_stopped or not raw_text.strip()`).

## Later additions (present in the code, added after the steps above)

- **B** — toggle a bookmark at the current word. Bound in the main window and the detached window (`<b>`/`<B>`), routed through `Canvas.toggle_bookmark_here()` / `DetachedTranscriptWindow.toggle_bookmark_here()`.
- **C** — snap a horizontally panned flash back to centre, the keyboard twin of the small centre button next to the reader's horizontal scrollbar (part of the reader fit-and-scroll work, see `claude/reader-fit-and-scroll-design.md`). Bound (`<c>`/`<C>`) in the main window, the detached window and the selection preview window. The main window goes through `Canvas.center_pan()`, which routes to the detached reader while one is open, like pause and restart; the other two windows call their own `ReaderDisplay.center_pan()` directly. It does nothing when the flash is not panned, which is always the case unless the scrollbar is showing.
- **Selection preview window** (`gui/components/selection_preview_window.py`) has its own bindings: Space, ←, →, R, C, Esc. No F or B there.

## Known non-blocking item

**Not yet verified, flagged since step 1, never actually observed as a problem across all this testing:** whether a `CTkButton` that still has keyboard focus right after being clicked (e.g. just clicked Restart) could intercept Space for its own "activate me" behavior before the window-level binding sees it — a button's own class-level binding runs earlier in Tk's lookup chain than a window-level one. Worth testing deliberately at some point (click a toolbar button, immediately press Space, check whether the button's action fires again) but not treated as blocking since it's never actually surfaced.
