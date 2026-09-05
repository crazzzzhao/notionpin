# Nopin window motion and corner repair

## Scope and approved direction

The user approved fixing the diagnosed collapse/expand defects directly and
reported exposed layers at the four window corners. Keep the current macOS-only
Electron UI, branding, native material, and Notion behavior. Do not publish or
replace the existing GitHub release as part of this repair.

## Design

- One native macOS window owns the outer rounded contour, shadow, and vibrancy.
  Remove the conflicting 10px body radius, 16px root radius, root mask, CSS
  backdrop blur, and duplicate outer shadow. Internal cards keep their own radii.
- Start native resizing when the user requests it. Keep the task content mounted
  and use a 150ms opacity transition alongside resizing, without scaling text or
  waiting for CSS transition events. Collapsed content is inert and hidden from
  accessibility, but retains its query, filter, and scroll state.
- Use explicit desired collapsed state, serialize native requests, and retain
  the latest intent on rapid clicks. Recover from failed IPC without disabling
  the control permanently. Reduced motion skips native and CSS animation.
- Track the expanded height independently from collapsed bounds. Persist one
  state snapshot 200ms after resizing, debounce position/size changes during
  dragging, and flush safely on close. Never save every animation frame or block
  the native completion acknowledgement on synchronous storage.

## Alternatives considered

Changing only the CSS curve leaves the native handoff and persistence defects.
A custom JavaScript per-frame native resize loop adds IPC and layout work.
Keeping native resizing while simplifying content transitions is the smallest
change that addresses both the measured stutter and the corner mismatch.

## Verification and implementation order

1. Add testable native state/persistence and renderer intent coordinators.
2. Update IPC, content motion, and the single-owner outer surface.
3. Cover rapid reversals, failed requests, reduced motion, resize persistence,
   remembered height, and missing native completion events in tests.
4. Build and run with an isolated profile; measure real button transitions,
   inspect native window corners in expanded/collapsed/resized states, and check
   formatting, lint, types, tests, and production build.

No real Notion tokens, data, or installed applications are modified by tests.
