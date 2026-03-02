<p align="center">
  <img src="icon-256.png" alt="Agent Terminal" width="128" />
</p>

<h1 align="center">Agent Terminal</h1>

<p align="center">
  AI-powered terminal with multi-agent support, task management (ClickUp &amp; Jira), Insights chat, and git worktree workflows.
</p>

<p align="center">
  <a href="https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest">
    <img src="https://img.shields.io/github/v/release/tomdekkpro/Agent-Terminal-releases?style=flat-square" alt="Latest Release" />
  </a>
  <a href="https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest">
    <img src="https://img.shields.io/github/downloads/tomdekkpro/Agent-Terminal-releases/total?style=flat-square" alt="Downloads" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
</p>

---
<img width="1912" height="1026" alt="image" src="https://github.com/user-attachments/assets/bf0f3258-40b1-4885-853d-8c904c70da8b" />

## Features

- **Multi-project terminals** — Organize terminals by project with tabbed navigation and split panes
- **Multi-agent support** — Plug-in architecture for AI agents: Claude, GitHub Copilot, Gemini, Aider, and Qwen — each with model selection and usage tracking
- **Insights (AI Chat)** — Chat with any supported agent from a dedicated view with session history and model selection
- **Task management** — Unified provider system supporting **ClickUp** and **Jira** — pick tasks, create branches, track status, and post comments
- **Time tracking** — Start/stop timer per terminal, automatically synced to your task manager
- **Copilot usage tracking** — Monitor GitHub Copilot session turns, model info, and context window data
- **Git worktree support** — Isolate task work in dedicated worktrees, auto-cleanup on completion
- **Enhanced git feedback** — Fetch shows commits behind upstream, Pull displays detailed results with notification bar
- **Task completion flow** — Create PR, push to remote, or merge locally when done
- **Mobile remote control** — Control your terminal from your phone via QR code pairing
- **Usage tracking** — Monitor API usage across all providers with a built-in usage indicator
- **Auto-update** — Get notified and update to the latest version from GitHub Releases
- **Terminal persistence** — Sessions restore automatically on restart

## Download

Get the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows | [Agent-Terminal-Setup.exe](https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest) |
| macOS (Intel) | [Agent-Terminal.dmg](https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest) |
| macOS (Apple Silicon) | [Agent-Terminal-arm64.dmg](https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest) |
| Linux (AppImage) | [Agent-Terminal.AppImage](https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest) |
| Linux (Debian) | [agent-terminal.deb](https://github.com/tomdekkpro/Agent-Terminal-releases/releases/latest) |

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Terminals view | `Ctrl+T` |
| Tasks view | `Ctrl+K` |
| Insights view | `Ctrl+I` |
| Settings view | `Ctrl+S` |
| New terminal | `Ctrl+N` |
| Switch project 1–9 | `Ctrl+1` – `Ctrl+9` |

## Installation

### Windows
1. Download `Agent-Terminal-Setup-x.x.x.exe`
2. Run the installer
3. Launch from the Start Menu or Desktop shortcut

### macOS
1. Download the `.dmg` for your chip (Intel or Apple Silicon)
2. Open the DMG and drag Agent Terminal to Applications
3. Launch from Applications

### Linux
**AppImage:**
```bash
chmod +x Agent-Terminal-x.x.x.AppImage
./Agent-Terminal-x.x.x.AppImage
```

**Debian/Ubuntu:**
```bash
sudo dpkg -i agent-terminal_x.x.x_amd64.deb
```

## Auto-Update

The app checks for updates automatically on startup. You can also check manually in **Settings > General > Check for Updates**.

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

## License

MIT &copy; Tom
