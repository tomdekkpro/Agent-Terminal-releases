<p align="center">
  <img src="resources/icon-256.png" alt="Agent Terminal" width="128" />
</p>

<h1 align="center">Agent Terminal</h1>

<p align="center">
  AI-powered terminal with Insights chat, ClickUp integration, time tracking, and git worktree support.
</p>

<p align="center">
  <a href="https://github.com/Dekkpro/Agent-Terminal/releases/latest">
    <img src="https://img.shields.io/github/v/release/Dekkpro/Agent-Terminal?style=flat-square" alt="Latest Release" />
  </a>
  <a href="https://github.com/Dekkpro/Agent-Terminal/releases/latest">
    <img src="https://img.shields.io/github/downloads/Dekkpro/Agent-Terminal/total?style=flat-square" alt="Downloads" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
</p>

---

## Features

- **Multi-project terminals** — Organize terminals by project with tabbed navigation and split panes
- **Insights (AI Chat)** — Chat with Claude or GitHub Copilot from a dedicated view with session history and model selection
- **ClickUp integration** — Pick tasks, create branches, track status, and post comments directly from the terminal
- **Time tracking** — Start/stop timer per terminal, automatically synced to ClickUp
- **Git worktree support** — Isolate task work in dedicated worktrees, auto-cleanup on completion
- **Task completion flow** — Create PR, push to remote, or merge locally when done
- **Mobile remote control** — Control your terminal from your phone via QR code pairing
- **Usage tracking** — Monitor API usage with a built-in usage indicator
- **Auto-update** — Get notified and update to the latest version from GitHub Releases
- **Terminal persistence** — Sessions restore automatically on restart
- **Claude AI mode** — Invoke Claude directly in the terminal for AI-assisted development

## Download

Get the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows | [Agent-Terminal-Setup.exe](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| macOS (Intel) | [Agent-Terminal.dmg](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| macOS (Apple Silicon) | [Agent-Terminal-arm64.dmg](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| Linux (AppImage) | [Agent-Terminal.AppImage](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| Linux (Debian) | [agent-terminal.deb](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Terminals view | `Ctrl+T` |
| ClickUp view | `Ctrl+K` |
| Insights view | `Ctrl+I` |
| Settings view | `Ctrl+S` |
| New terminal | `Ctrl+N` |
| Switch project 1–9 | `Ctrl+1` – `Ctrl+9` |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- npm 9+

### Development

```bash
# Clone the repository
git clone https://github.com/Dekkpro/Agent-Terminal.git
cd Agent-Terminal

# Install dependencies
npm install

# Start in development mode (with HMR)
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Package for your platform
npm run package:win     # Windows (.exe)
npm run package:mac     # macOS (.dmg)
npm run package:linux   # Linux (.AppImage, .deb)
```

### Release

```bash
# Bump version, tag, and push to trigger CI/CD
./scripts/release.sh patch   # or minor | major
git push origin Develop --tags
```

The GitHub Actions workflow builds for all platforms and publishes to [Releases](https://github.com/Dekkpro/Agent-Terminal/releases) automatically.

## Configuration

### ClickUp

1. Open **Settings** (`Ctrl+S`)
2. Enter your ClickUp API token, Team ID, and List ID
3. Test the connection
4. Tasks will appear in the ClickUp view (`Ctrl+K`)

### Insights (AI Chat)

1. Open **Insights** (`Ctrl+I`)
2. Select a provider — **Claude** (requires `claude` CLI) or **GitHub Copilot** (requires `gh copilot`)
3. Choose a model (Opus, Sonnet, or Haiku for Claude)
4. Start a conversation — sessions are saved and can be resumed from the sidebar

### Terminal

Customize font family, font size, cursor style, scrollback buffer, and theme in Settings > Terminal.

## Tech Stack

- **Electron 40** — Desktop framework
- **React 19** + **TypeScript 5** — UI
- **Zustand 5** — State management
- **xterm.js 6** — Terminal emulation
- **Tailwind CSS 4** — Styling
- **Vite 7** + **electron-vite 5** — Build tooling
- **electron-builder 26** — Packaging & distribution
- **electron-updater 6** — Auto-updates

## Project Structure

```
src/
├── main/                # Electron main process
│   ├── index.ts         # Window creation, tray, menu
│   ├── updater.ts       # Auto-update logic
│   ├── ipc/             # IPC handlers
│   │   ├── terminal-handlers.ts
│   │   ├── clickup-handlers.ts
│   │   ├── git-handlers.ts
│   │   ├── insights-handlers.ts
│   │   ├── usage-handlers.ts
│   │   ├── project-handlers.ts
│   │   └── settings-handlers.ts
│   ├── terminal/        # PTY management & persistence
│   ├── insights/        # AI chat executor & session storage
│   ├── usage/           # API usage tracking service
│   └── project/         # Project data store
├── renderer/            # React frontend
│   ├── App.tsx          # Root component & shortcuts
│   ├── components/
│   │   ├── terminal/    # TerminalView, TerminalPanel
│   │   ├── layout/      # Sidebar, ProjectTabBar
│   │   ├── clickup/     # ClickUpView
│   │   ├── insights/    # InsightsView, ChatMessage, ModelSelector, SessionSidebar
│   │   ├── usage/       # UsageIndicator
│   │   ├── settings/    # SettingsView
│   │   └── updates/     # UpdateNotification
│   ├── stores/          # Zustand stores
│   └── hooks/           # Global event listeners
├── preload/             # Context isolation bridge
└── shared/              # Types, constants, utilities
```

## License

MIT &copy; Tom
