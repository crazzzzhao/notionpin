# Window completion repair implementation plan

Approved spec: `../specs/2026-09-06-window-completion-release-design.md`.

1. Add focused tests to `notion-pin/electron-app/src/main/windowState.test.ts` for missing completion events, queued requests, intermediate/renewed resize events, early completion signals, timeout, and disposal. Run them against unchanged production code and record the expected failures.
2. Update only the native window controller: track the target height, observe a 100 ms quiet period after matching resize events, guard native completion against intermediate height, and clear observation timers on every exit. Keep native animation, serialized requests, the 1000 ms fallback, and 200 ms trailing persistence.
3. Run the complete checks and build; use disposable application profiles and the mock Keychain to run existing motion and layout checks. Record native resize/completion event counts only in the isolated test process to help diagnose CI differences. Do not change the 300 ms performance assertion.
4. Bump the package and lockfile to 1.0.2. Build both DMGs, compare bundled application code and icons, scan app-owned packaged files for local configuration and credential patterns, and verify architecture, metadata, signatures, and disk images.
5. Commit only scoped changes, push master, and create the new v1.0.2 tag without changing v1.0.1. Wait for native Intel CI validation and Release creation; investigate failures without bypassing tests.
6. Verify public Release metadata, both DMG assets, checksum manifest and unsigned/non-notarized status wording. Report exact test results and any remaining limitations.

No credential values, real task fixtures, local account files, or unrelated user changes are part of the release.
