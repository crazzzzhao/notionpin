# Nopin development

Nopin is an Electron and React app for viewing and editing Notion tasks on macOS. For features, installation, and Notion setup, see the [product README](../../README.md).

## Requirements

- macOS 13 Ventura or newer
- Node.js 22.12 or newer
- npm

## Run locally

```bash
git clone https://github.com/crazzzzhao/notionpin.git nopin
cd nopin/notion-pin/electron-app
npm ci
npm run dev
```

The development process opens the desktop app and watches for source changes. Keep the terminal running; press `Control + C` to stop it.

## Check changes

```bash
npm run check
```

This runs formatting checks, lint, TypeScript checks, and unit tests.

To build and test the desktop window's collapse and expand behavior:

```bash
npm run test:window
```

The window test uses a temporary profile and synthetic tasks. It does not use your saved Notion credentials.

## Build macOS packages

```bash
# Apple Silicon
npm run build:mac:arm64 -- --publish never

# Intel
npm run build:mac:x64 -- --publish never
```

Build output is written to `dist/`, which is excluded from Git. The default packages have no Developer ID signature or Apple notarization; see the [first-launch instructions](../../README.md#first-launch-on-macos).

## App icon

Edit `build/icon.svg`, then regenerate the PNG and ICNS files on macOS:

```bash
npm run icon:mac
```
