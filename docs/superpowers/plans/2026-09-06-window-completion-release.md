# Window completion repair implementation plan

Approved spec: `../specs/2026-09-06-window-completion-release-design.md`.

1. Add focused tests to `notion-pin/electron-app/src/main/windowState.test.ts` for missing completion events, queued requests, intermediate/renewed resize events, early completion signals, timeout, and disposal. Run them against unchanged production code and record the expected failures.
2. Update only the native window controller: track the target height, observe a 100 ms quiet period after matching resize events, guard native completion against intermediate height, and clear observation timers on every exit. Keep native animation, serialized requests, the 1000 ms fallback, and 200 ms trailing persistence.
3. Run the complete checks and build; use disposable application profiles and the mock Keychain to run existing motion and layout checks. Record native resize/completion event counts only in the isolated test process to help diagnose CI differences. Do not change the 300 ms performance assertion.
4. Bump the package and lockfile to 1.0.4 (see post-tag findings below). Build both DMGs, compare bundled application code and icons, scan app-owned packaged files for local configuration and credential patterns, and verify architecture, metadata, signatures, and disk images.
5. Commit only scoped changes, push master, and create the new v1.0.4 tag without changing v1.0.1, v1.0.2 or v1.0.3. Wait for native Intel CI validation and Release creation; investigate failures without bypassing tests.
6. Verify public Release metadata, both DMG assets, checksum manifest and unsigned/non-notarized status wording. Report exact test results and any remaining limitations.

No credential values, real task fixtures, local account files, or unrelated user changes are part of the release.

## Post-tag validation findings

The v1.0.2 native Intel run passed all eight motion measurements, including the formerly failing sixth measurement at 46.9 ms. Native diagnostics confirmed one resize event and no completion event per measurement in that environment, matching the repaired fallback path. The run then failed one Settings highlight-alignment assertion at 200% zoom; no Release was created.

The UI code remains unchanged. Layout checks now observe a bounded quiet geometry period before applying the original alignment/clipping assertions and retain exact displacement diagnostics. Unit tests cover readiness, small accumulating movement, timeout, missing elements, and renderer failure; stable but incorrect geometry is not accepted as aligned. The layout-only phase keeps the disposable test window painting when occluded, while all preceding motion/performance measurements retain production-default background throttling. Fixed 300 ms response limits and alignment tolerances are unchanged.

The v1.0.3 tag run subsequently failed its first motion response at 672 ms. The older logger discarded failing measurement details, so that run cannot establish whether native processing or renderer scheduling caused the delay. Failed timings and native setBounds/resize timestamps are now retained before assertions. Packaged checks also avoid importing/downloading an unused development Electron executable.

Local layout diagnostics identified two readiness gaps: connected error/empty/loading screens also retain the animated filter rail, and an initial zero-sized highlight can appear stationary before it paints. The harness now observes the rail in every connected mode and requires nonzero control dimensions before starting the same bounded quiet period. It still rejects missing elements, persistent zero size, misalignment and overflow; neither response limits nor alignment tolerances were relaxed. Failed geometry can be sampled later for diagnosis without changing the original failure result. A local rapid-reversal failure did not reproduce with added diagnostics; its original cause remains unverified rather than being claimed as fixed.

The manually dispatched, non-publishing Intel preflight for commit 2c326ce (run 34022307648) passed all eight motion cases, rapid reversal, 20 Settings cases and 46 application cases. Motion starts ranged from 25.5 to 67.1 ms. Additional local coverage for zero-size readiness brings the unit suite to 83 passing tests and the full local packaged harness also passes. These runs validate the unchanged application code but do not prove every macOS machine or load condition behaves identically.

Manual branch dispatches now run the complete packaging gate without creating tags or Releases; diagnostic artifacts contain only disposable fixtures and are retained for three days. The final candidate advances to v1.0.4, keeping all previously pushed tags unchanged. Final tag validation must pass before publication.
