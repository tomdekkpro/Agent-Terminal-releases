<p align="center">
  <img src="resources/icon-256.png" alt="Agent Terminal" width="128" />
</p>

<h1 align="center">Agent Terminal</h1>

<p align="center">
  AI-powered terminal with multi-agent support, task management (ClickUp &amp; Jira), Insights chat, and git worktree workflows.
</p>

<p align="center">
  <a href="https://github.com/tomdekkpro/Agent-Terminal/releases/latest">
    <img src="https://img.shields.io/github/v/release/tomdekkpro/Agent-Terminal?style=flat-square" alt="Latest Release" />
  </a>
  <a href="https://github.com/tomdekkpro/Agent-Terminal/releases/latest">
    <img src="https://img.shields.io/github/downloads/tomdekkpro/Agent-Terminal/total?style=flat-square" alt="Downloads" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
</p>

<img width="1182" height="795" alt="image" src="https://github.com/user-attachments/assets/84d0bbde-9ce2-4bac-884e-d97c78cfb30a" />
---

## Features

- **Multi-project terminals** — Organize terminals by project with tabbed navigation and split panes
- **Multi-agent support** — Plug-in architecture for AI agents: Claude, GitHub Copilot, Gemini, Aider, and Qwen — each with model selection and usage tracking
- **Insights (AI Chat)** — Chat with any supported agent from a dedicated view with session history and model selection
- **Code Review** — Automated PR code review with severity ratings, findings grouped by file, and configurable review intervals
- **QC Testing** — Quality check view for running and tracking test results
- **Task management** — Unified provider system supporting **ClickUp** and **Jira** — pick tasks, create branches, track status, and post comments
- **Time tracking** — Start/stop timer per terminal, automatically synced to your task manager
- **Team collaboration** — Shared workspace features for team-based workflows
- **Copilot usage tracking** — Monitor GitHub Copilot session turns, model info, and context window data
- **Git worktree support** — Isolate task work in dedicated worktrees, auto-cleanup on completion
- **Task completion flow** — Create PR, push to remote, or merge locally when done
- **Mobile remote control** — Control your terminal from your phone via QR code pairing
- **Usage tracking** — Monitor API usage across all providers with a built-in usage indicator
- **Service status** — Monitor the availability of configured services at a glance
- **Auto-update** — Get notified and update to the latest version from GitHub Releases
- **Terminal persistence** — All terminals (agent and plain shell) restore automatically on restart

## Download

Get the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows | [Agent-Terminal-Setup.exe](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| macOS (Intel) | [Agent-Terminal.dmg](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| macOS (Apple Silicon) | [Agent-Terminal-arm64.dmg](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| Linux (AppImage) | [Agent-Terminal.AppImage](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |
| Linux (Debian) | [agent-terminal.deb](https://github.com/Dekkpro/Agent-Terminal/releases/latest) |

### macOS Installation Note

The app is not code-signed with an Apple Developer certificate. macOS Gatekeeper may block it on first launch. To open:

1. Open the `.dmg` and drag **Agent Terminal** to **Applications**
2. Open **Terminal** and run:
   ```bash
   xattr -cr /Applications/Agent\ Terminal.app
   ```
3. Launch the app normally

Alternatively: right-click the app → **Open** → click **Open** in the dialog.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Terminals view | `Ctrl+T` |
| Sessions view | `Ctrl+K` |
| QC Testing view | `Ctrl+Q` |
| Insights (Chat) view | `Ctrl+I` |
| Code Review view | `Ctrl+R` |
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

### Task Manager (ClickUp / Jira)

1. Open **Settings** (`Ctrl+S`)
2. Select a provider — **ClickUp** or **Jira**
3. Enter the required credentials (API token, Team/Project ID, etc.)
4. Test the connection
5. Tasks will appear in the Tasks view (`Ctrl+K`)

### Insights (AI Chat)

1. Open **Insights** (`Ctrl+I`)
2. Select a provider — **Claude**, **GitHub Copilot**, **Gemini**, **Aider**, or **Qwen**
3. Choose a model from the provider's available models
4. Start a conversation — sessions are saved and can be resumed from the sidebar

### Code Review

1. Open **Code Review** (`Ctrl+R`)
2. Reviews run automatically on a configurable interval or on-demand
3. PRs are analyzed for critical issues, bugs, suggestions, and code quality
4. Findings are grouped by file with severity ratings and inline code references

### AI Agents

Agent Terminal supports multiple AI agent providers through a plug-in system. Each agent can be invoked directly in a terminal session:

| Agent | CLI Requirement | Capabilities |
|-------|----------------|--------------|
| Claude | `claude` CLI | Chat, code generation, session resume |
| GitHub Copilot | `gh copilot` | Chat, usage tracking |
| Gemini | `gemini` CLI | Chat, code generation |
| Aider | `aider` CLI | Code editing, git integration |
| Qwen | `qwen` CLI | Chat, code generation |

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
│   │   ├── task-manager-handlers.ts   # Unified task manager (ClickUp / Jira)
│   │   ├── git-handlers.ts
│   │   ├── insights-handlers.ts
│   │   ├── code-review-handlers.ts
│   │   ├── qc-handlers.ts
│   │   ├── team-handlers.ts
│   │   ├── usage-handlers.ts
│   │   ├── service-status-handlers.ts
│   │   ├── project-handlers.ts
│   │   ├── settings-handlers.ts
│   │   └── providers/                 # Plug-in providers
│   │       ├── clickup.ts             # ClickUp task provider
│   │       ├── jira.ts                # Jira task provider
│   │       ├── agent-registry.ts      # Agent discovery & registry
│   │       ├── agent-types.ts         # IAgentProvider interface
│   │       └── agents/                # AI agent implementations
│   │           ├── claude-agent.ts
│   │           ├── copilot-agent.ts
│   │           ├── gemini-agent.ts
│   │           ├── aider-agent.ts
│   │           └── qwen-agent.ts
│   ├── terminal/        # PTY management & persistence
│   ├── insights/        # AI chat executor & session storage
│   ├── qc/              # QC testing logic
│   ├── team/            # Team collaboration
│   ├── usage/           # API & Copilot usage tracking services
│   ├── analytics/       # Analytics & telemetry
│   └── project/         # Project data store
├── renderer/            # React frontend
│   ├── App.tsx          # Root component & shortcuts
│   ├── components/
│   │   ├── terminal/    # TerminalView, TerminalPanel
│   │   ├── layout/      # Sidebar, ProjectTabBar
│   │   ├── tasks/       # TasksView (multi-provider)
│   │   ├── insights/    # InsightsView, ChatMessage, ModelSelector, SessionSidebar
│   │   ├── code-review/ # CodeReviewView — automated PR review
│   │   ├── qc/          # QCView — quality check testing
│   │   ├── team/        # Team collaboration UI
│   │   ├── status/      # Service status indicators
│   │   ├── usage/       # UsageIndicator
│   │   ├── project/     # Project settings & management
│   │   ├── settings/    # SettingsView
│   │   └── updates/     # UpdateNotification
│   ├── stores/          # Zustand stores
│   └── hooks/           # Global event listeners
├── preload/             # Context isolation bridge
└── shared/              # Types, constants, utilities
```

## License

MIT &copy; Tom
