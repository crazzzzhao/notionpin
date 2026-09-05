# NotionPin Open-Source Release Design

Date: 2026-09-04  
Status: Design approved; written specification awaiting user review  
Repository: `https://github.com/crazzzzhao/notionpin`  
Target platforms: macOS Apple Silicon (`arm64`) and macOS Intel (`x64`)

## Objective

Prepare the existing Electron application as a free, open-source macOS application that can be downloaded from GitHub Releases. Remove all billing behavior, protect local Notion credentials, make the project pass its quality gates, produce architecture-specific DMG files, and keep every change local until the repository owner explicitly authorizes a push.

The application remains Electron/React/TypeScript for this release. A SwiftUI rewrite is outside this design and may be considered only after this release candidate has been validated.

## Goals

- Remove all billing, subscription, purchase, plan, entitlement, Pro badge, and paywall code.
- Allow every user to edit supported Notion task fields without a local payment check.
- Preserve the existing Notion connection, field-mapping, task-query, and task-editing behavior.
- Verify that no local credential is present in source files, build inputs, Git history, or release artifacts.
- Correct application metadata and publish the source under the MIT License.
- Make type checking, linting, automated tests, production builds, and macOS packaging reproducible.
- Add local GitHub Actions definitions for CI and tag-triggered release builds.
- Produce separate unsigned DMG files for `arm64` and `x64`, with SHA-256 checksums.
- Validate the application locally without transmitting the user's real Notion token during the smoke test.
- Stop before any `git push`, Git tag push, GitHub Release creation, or artifact upload.

## Non-goals

- Rewriting the application in Swift or SwiftUI.
- Adding a hosted backend, account system, payment provider, analytics, or telemetry.
- Implementing automatic updates in the first open-source release.
- Signing or notarizing the macOS application without an Apple Developer Program account.
- Publishing non-macOS packages.
- Rewriting Git history automatically if a credential is found.

## Current-State Findings That Affect the Work

- The Git remote is `https://github.com/crazzzzhao/notionpin.git`, and the active branch is `master`.
- The working tree already contains user changes in `src/renderer/src/main.tsx`, a new `browserPreloadShim.ts`, and tracked `.DS_Store` files. These changes must be preserved or deliberately incorporated; unrelated work must not be discarded.
- The repository currently fails TypeScript and ESLint checks.
- The standard `npm run build` fails because it includes the failing type check, even though a direct `electron-vite build` can emit bundles.
- No automated test script or GitHub Actions workflow is present.
- The README and application metadata still contain Electron template values.
- No open-source license is present.
- Production dependency auditing reports high-severity advisories, including advisories through Electron and the unused `electron-updater` dependency.
- Both BrowserWindows disable renderer sandboxing. Navigation and `window.open` handling are not consistently restricted.
- The local billing implementation is a simulation and can be changed directly from the renderer, so it is not a secure payment system.

## Credential and Privacy Boundary

Credential inspection must be local and non-disclosing.

1. Scan tracked files, untracked files, ignored configuration candidates, every local Git ref, and Git history for high-confidence credential patterns.
2. Inspect the Electron store location only to determine whether an encrypted token field exists, whether it is outside the repository, and whether its stored representation is encrypted or merely encoded.
3. Never print, copy into logs, hash for publication, place in a test fixture, or include the plaintext token in a command argument.
4. Do not make a real Notion request during the isolated smoke test. Use a temporary Electron user-data directory with no user configuration.
5. Inspect packaged application contents for configuration files, credential-shaped strings, source caches, and unintended local paths before accepting the artifacts.
6. If a likely real credential is found in Git history, stop release preparation, report only its location and affected revision, and recommend rotation before any push. Do not rewrite history without a separate explicit authorization.
7. GitHub workflow files must not contain application credentials. The release workflow may use only GitHub's ephemeral repository token supplied at runtime.

## Billing Removal

Delete the billing feature as a complete vertical slice:

- Remove `BillingTab.tsx` and `BillingPopover.tsx`.
- Remove all imports, rendered controls, Pro labels, plan descriptions, simulated purchase actions, and billing-specific styling.
- Remove `BillingPlan`, `Entitlement`, `BillingAPI`, and related renderer/global declarations.
- Remove the preload `billingAPI` bridge.
- Remove the `billing:getEntitlement`, `billing:setEntitlement`, `billing:resetEntitlement`, and `billing:canEdit` IPC handlers.
- Remove entitlement defaults and entitlement fields from the Electron store schema.
- Remove the paywall check from `notion:updateTask`; input validation, Notion connection errors, and field-mapping errors remain in place.
- Remove obsolete entitlement data from the local store without deleting the Notion token, database identifiers, database URL, field mapping, or window preferences.
- Add a repository-wide automated check that fails if shipping source reintroduces the removed billing identifiers or user-facing billing language.

After removal, task updates follow this flow:

```text
React task editor
  -> constrained preload API
  -> validated Electron IPC handler
  -> local Notion service
  -> Notion HTTPS API
```

There is no payment or entitlement branch in this flow.

## Application Metadata and Repository Hygiene

- Set the product name to `NotionPin`.
- Set the bundle identifier to `com.crazzzzhao.notionpin`.
- Replace template author, description, homepage, window title, executable name, and artifact names with project-specific values.
- Add an MIT `LICENSE` file.
- Replace the template README with practical English and Chinese documentation covering setup, Notion integration prerequisites, development, testing, building, architecture selection, unsigned-app launch instructions, privacy, and known limitations.
- Remove tracked `.DS_Store` files and keep them ignored.
- Remove unused duplicate UI source outside the configured renderer source tree.
- Remove template update URLs and the unused `electron-updater` dependency.
- Do not include runtime user data, local Electron store contents, logs, caches, build output, or credentials in Git.

## Electron Security Design

- Retain `contextIsolation: true` and `nodeIntegration: false`.
- Enable renderer sandboxing unless a verified preload incompatibility requires a narrower documented exception. Both windows must use the same secure defaults.
- Restrict navigation so production windows stay on the packaged local application and development windows stay on the configured local development origin.
- Deny new Electron windows. External opening must pass through one shared validator that accepts only `https:` URLs on `notion.so` or its subdomains.
- Apply the same external-link policy to both the main and settings windows.
- Validate IPC sender frames before handling privileged operations.
- Validate IPC payload shapes and bounds in the main process instead of trusting renderer TypeScript types.
- Retain the restrictive Content Security Policy. Remote Google Fonts may remain only if the release build and privacy documentation explicitly account for the request; otherwise bundle or remove the font.
- Remove unused camera, microphone, Documents, and Downloads permission descriptions from macOS packaging metadata.
- If `safeStorage` encryption is unavailable, do not silently persist a plaintext-equivalent Base64 token for a public release. Return a clear configuration error instead.

## Local Configuration Compatibility

Renaming the application can change Electron's user-data directory. The implementation must detect the existing legacy application-data directory and preserve the user's current Notion connection without exposing it.

- Migrate only when the new configuration is absent and a legacy configuration exists.
- Copy or transform configuration entirely on device.
- Strip the obsolete entitlement field during migration.
- Do not overwrite a newer configuration.
- Do not log configuration values.
- Preserve encrypted token material, database identifiers, database URL, field mapping, and window preferences.
- Verify migration behavior with synthetic fixtures, never with the real token.

## Automated Tests

Add a small test suite focused on release-critical pure behavior:

- Database ID parsing accepts supported Notion URLs, compact IDs, and UUIDs, and rejects malformed input.
- External-link validation accepts only HTTPS Notion hosts and rejects deceptive hosts, non-HTTPS schemes, malformed URLs, and unrelated domains.
- IPC payload validation rejects invalid resize values, invalid update fields, invalid page identifiers, and malformed settings objects.
- Configuration migration preserves allowed fields, removes entitlement data, and does not overwrite an existing destination.
- A billing-removal guard confirms that shipping source and UI no longer contain the removed billing interfaces, handlers, or labels.

Tests must not require a Notion token or network access.

## Build and Release Automation

### Continuous integration

CI runs for pushes and pull requests and performs:

1. A clean dependency install from the lockfile.
2. Type checking.
3. ESLint and formatting checks.
4. Automated tests.
5. Production Electron bundle creation.
6. Production dependency audit with no high or critical advisories accepted.

### Release workflow

The release workflow is stored locally but is triggered only by a pushed tag matching `v*`. No tag will be created or pushed during this task.

For each architecture it must:

1. Install dependencies from the lockfile on a GitHub-hosted macOS runner.
2. Run the same quality gates as CI.
3. Build an unsigned DMG with automatic signing discovery disabled.
4. Name artifacts unambiguously:
   - `NotionPin-<version>-mac-arm64.dmg`
   - `NotionPin-<version>-mac-x64.dmg`
5. Generate a SHA-256 checksum file.
6. Attach the DMGs and checksum file to the matching GitHub Release using GitHub's ephemeral token.

The first release does not include automatic application updates.

## Manual Smoke-Test Plan

Run the application with an isolated temporary user-data directory so the user's real configuration is neither read nor transmitted.

Verify:

- The main window opens without a startup exception or blank screen.
- Header branding is `NotionPin` and no Pro or billing element is present.
- Expand, collapse, resize, and close controls work.
- The settings window opens and closes correctly.
- The disconnected state explains how to configure Notion without crashing.
- Connection and field-mapping forms render and validate locally.
- No unexpected external navigation, new window, permission prompt, or network request occurs during the isolated test.
- Renderer and main-process logs contain no uncaught errors.

The current Apple Silicon machine must actually launch the `arm64` packaged application. The `x64` package must be built and structurally inspected; it should also be launched under Rosetta when Rosetta is available. Without a real Intel Mac, the result must not be represented as physical Intel-hardware validation.

## Acceptance Criteria

The local release candidate is acceptable only when all of the following are true:

- No likely real credential is present in the working tree, Git history, or packaged artifacts.
- The user's real local token remains outside the repository and is never printed or transmitted by tests.
- No billing code, billing UI, entitlement state, simulated purchase behavior, or paywall remains in shipping source.
- `npm ci`, type checking, linting, formatting checks, tests, and the production build pass.
- Production dependency auditing has no high or critical advisory.
- Both architecture-specific DMGs and their SHA-256 checksums are generated successfully.
- The `arm64` package launches and completes the smoke-test checklist.
- The `x64` package passes the strongest runtime validation available on the current machine, with limitations reported explicitly.
- The package contains no local configuration or credential material.
- MIT License, README, metadata, CI, and release workflows are present and internally consistent.
- Final Git status and diff have been reviewed; only intended local commits exist.
- Nothing has been pushed, tagged remotely, or released.

## Error Handling and Stop Conditions

- Stop and report if a probable real credential is found in Git history or build artifacts.
- Stop and report if preserving existing user changes would require destructive replacement.
- Do not weaken a security check merely to make a build pass; document and resolve the incompatibility.
- If an advisory cannot be removed without a breaking dependency change, report the exact dependency path and residual risk rather than hiding the audit result.
- If unsigned packaging prevents normal launch, document the Gatekeeper behavior and distinguish expected unsigned-distribution friction from an application crash.
- If x64 runtime testing is impossible on the available hardware, complete build and structural validation and report the unverified boundary.

## Delivery Boundary

Implementation, validation, and local commits are authorized. Remote mutation is not authorized. The task ends with a local release candidate and a concise verification report. A later, explicit user instruction is required before running `git push`, pushing any tag, or creating a GitHub Release.
