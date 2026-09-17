# Dovee

A local coding IDE with an autonomous agent powered by **DeepSeek V4.1** (`deepseek-flash`).

File explorer, Monaco editor, terminal, and a tool-using agent that can read/write your repo and run commands — all on your machine. The API key never leaves the server.

## Setup

```bash
npm install
```

Create `.env.local`:

```env
DEEPSEEK_API_KEY=sk-...
```

Get a key at [platform.deepseek.com](https://platform.deepseek.com). You can also paste the key in **Settings** (saved to `~/.dovee/settings.json`).

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

## Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+S` | Save file |
| `Ctrl+P` | Go to file |
| `Ctrl+L` | Focus agent |
| `Ctrl+\`` | Toggle terminal |
| `Ctrl+,` | Settings |
| `Enter` | Send to agent |
| `Escape` | Stop generation |

## Agent tools

The agent calls DeepSeek with thinking + function calling and loops until the task is done:

- `read_file` / `list_directory` / `search_codebase`
- `write_file` / `apply_diff`
- `run_terminal`
- `get_diagnostics`

Default model: **deepseek-flash** (DeepSeek-V4.1-Flash). Switch to `deepseek-v4-pro` in Settings if you want.

Workspace is this folder until you change it in Settings.
