
# Dovee

A local coding IDE with an autonomous agent that works with **any compatible AI model provider** (for example: DeepSeek, OpenAI, etc.).
By default, Dovee uses **DeepSeek V4.1** (`deepseek-flash`), but you can provide your own API key for any supported model (configure in Settings).

File explorer, Monaco editor, terminal, and a tool-using agent that can read/write your repo and run commands — all on your machine. The API key never leaves the server.

## Setup

```bash
npm install
```


Create `.env.local`:

```env
DEEPSEEK_API_KEY=sk-...
```

Use an API key from any supported AI model provider (DeepSeek, OpenAI, or others). For DeepSeek, get a key at [platform.deepseek.com](https://platform.deepseek.com). You can also paste any supported key in **Settings** (saved to `~/.dovee/settings.json`).

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

## DeepSeek Harness

The official DeepSeek Harness is included as a companion developer UI for this
workspace. Start it with:

```bash
npm run harness
```

Open [http://127.0.0.1:3080](http://127.0.0.1:3080) after the server starts.
Use `npm run harness:open` if you want the command to open the browser
automatically. The Harness is a developer preview and uses its own local
configuration; Dovee continues to run on port 3100.

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

Default model: **deepseek-flash** (DeepSeek-V4.1-Flash).
You can switch supported models in Settings by changing the API key and selecting the model/provider you want to use.
