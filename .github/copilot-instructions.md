# Copilot Instructions for Multilingual Edge Assistant

## Project Overview

**Tauri + React + TypeScript + Rust** desktop application that runs local language models with a chat UI. The app manages models in a `./models` directory and spawns child processes to run them, streaming tokens back to the frontend via Tauri IPC events.

### Architecture
- **Frontend** (`src/`): React + TypeScript with Tailwind CSS
  - `App.tsx`: Main state container managing models, messages, streaming, and model control
  - `components/`: ChatView (messages), Controls (start/stop/language), ModelList (model selection)
- **Backend** (`src-tauri/src/lib.rs`): Single `ModelManager` struct using Mutex for thread-safe state
  - Scans `./models` for `.gguf`, `.bin`, `.pt` files or directories
  - Spawns processes with optional `run.sh`/`run.bat` wrappers or falls back to Python mock
  - Emits "model-output" and "model-status" events to frontend
  - Tauri commands: `list_models`, `rescan_models`, `load_model`, `start_model`, `stop_model`, `run_prompt`

### Type Bridge
Message type (`src/App.tsx`): `{ id: string; role: "user" | "assistant" | "system"; text: string }`

## Build & Development

**Commands** (from `package.json`):
- `npm run dev`: Start Vite dev server (port 1420, HMR on 1421)
- `npm run build`: TypeScript check + Vite build
- `npm run tauri`: Tauri CLI access
- `npm run tauri dev`: Build + run with hot reload (watches `src/`, ignores `src-tauri/`)

**First Run**: Install Rust + cargo, then `npm install && npm run tauri dev`

## Key Patterns

### Frontend-Backend Communication
- Use `invoke("command_name", { param: value })` from `@tauri-apps/api/core`
- Backend returns `Result<T, String>` → Promise resolves with T or throws error message
- Example: `invoke<string[]>("list_models")` returns string array of model IDs
- Events: `listen<T>("event-name", callback)` for streaming results (e.g., "model-output")

### Model Discovery & Execution
- **Scanning**: Looks in `./models` for files with `.gguf|.bin|.pt` extensions OR directories
- **Running**: Tries in order:
  1. `<model_dir>/run.sh` or `run.bat` if model is a directory
  2. `./src-tauri/bin/llama.exe` if exists (assumed pre-built binary)
  3. Python mock (cross-platform fallback for dev/demo)
- **Streaming**: stdout/stderr lines are emitted as "model-output" events; child process managed with Mutex

### React Hooks & State
- `useState` for UI state (models, messages, language, running status)
- `useEffect` cleanup returns unlisten functions from `listen()` calls
- Message streaming: append tokens to last assistant message in state reducer
- Auto-scroll: use `useRef` + `useEffect` to scroll chat view on new messages

### Error Handling
- Frontend catches `invoke()` errors and appends to logs
- Rust returns `Result<T, String>` for all commands
- Always check `if selectedModel` before starting/prompting (null guard)

## Component Contracts

**ModelList**: Props = `{ models: string[]; selected?: string | null; onRefresh: () => void; onLoad: (id: string) => void }`
- Renders list of model IDs, highlights selected, has refresh & load buttons
- Call `onRefresh` → `invoke("rescan_models")`
- Call `onLoad(id)` → `invoke("load_model", { id })`

**ChatView**: Props = `{ messages: Message[]; onSend: (text: string) => void }`
- Maps messages by role (user/assistant/system) with distinct styles
- Auto-scrolls on message changes
- Form input calls `onSend(text)` on submit

**Controls**: Props = `{ running: boolean; onStart/onStop: () => void; language: string; setLanguage: (s: string) => void }`
- Buttons disabled based on running state
- Language dropdown: "auto" | "en" | "hi" | "es" | "zh" (UI only, backend integration pending)

## Extending the Project

**Adding a new Tauri command**:
1. Add `#[tauri::command] fn my_command(...) -> Result<T, String> { ... }` in `lib.rs`
2. Add to `generate_handler!([..., my_command])` in `run()`
3. Call from frontend: `invoke("my_command", { arg1: value })`

**Adding a React component**:
- Place in `src/components/`, export default, use TypeScript for prop types
- Import into `App.tsx` and pass state callbacks (e.g., `onLoad`, `onSend`)

**Adding styling**: Use Tailwind classes; custom CSS in `App.css` or component-level

## Testing & Debugging

- **Frontend**: Browser DevTools in Tauri window, console logs from React code
- **Backend**: Print to stdout (shows in Tauri window console), use `eprintln!()` for stderr
- **Mock mode**: Default Python mock runs without models; disable by setting real runner in `spawn_for_model()`
- **Process stdout**: Read in spawned thread; errors prefixed with "[ERR] " in event stream

## File References

- [Main frontend](src/App.tsx) — State, Tauri invocations, event listeners
- [Backend state machine](src-tauri/src/lib.rs) — ModelManager, process spawning, Tauri handlers
- [Build config](vite.config.ts) — Port 1420, watch exclusions
- [Project manifest](package.json) — Dependencies, Tauri version, scripts
