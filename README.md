# DAFC (The Fuck?) CLI - Dumb as Fuck Coding Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/%40wagn%2Fdafc.svg)](https://badge.fury.io/js/%40wagn%2Fdafc)


**DAFC** is a command-line tool and a methodology designed to leverage the massive context windows of modern Large Language Models (LLMs) like Gemini 1.5 Pro. Instead of complex context management, DAFC lets you easily dump your *entire* (but small!) codebase into the LLM prompt for querying, code generation, analysis, and more.

**Read the full philosophy and background in the [introductory blog post](https://avisantoso.com/gemini-and-context-windows).**

## Core Idea: Constraints Unlock Full Context

The "Dumb as Fuck Coding" methodology hinges on keeping projects simple and constrained:

*   **Max ~500 Lines Per File (Aim for ~300):** Keeps individual units manageable.
*   **Max ~50 Files (Aim for ~10):** Limits overall scope.
*   **Max ~5 Database Tables (Aim for 3):** Simplifies the data model. NOTE: Does not include users table.

By adhering to these rules, the *entire* relevant codebase often fits within the LLM's context window. DAFC CLI automates gathering this context, checks if it exceeds a configured limit, and interacts with the LLM.

## Features

*   **Simple CLI Interface:** Easy-to-use commands (`ask`, `context`, `config`, `init`).
*   **Automatic Context Gathering:** Recursively scans your project, respects `.gitignore` and `.dafcignore`, and includes relevant files.
*   **Context Limit Check:** Estimates token count and throws an error if it exceeds the configured maximum (`MAX_CONTEXT_TOKENS`).
*   **Layered Configuration:** Uses global (`~/.config/dafc/config.env`), project (`./.env`), and environment variables for flexible settings (Env > Project > Global).
*   **Easy Config Editing:** `dafc config` command to open config files in your default editor.
*   **Customizable Rules:** Uses a `.dafcr` file to inject system prompts or specific instructions into the LLM request.
*   **Flexible LLM Backend:** Configurable via config files/env vars to use any OpenAI-compatible API (OpenRouter, Featherless, OpenAI, Google AI Studio, etc.). Defaults to OpenRouter with `google/gemini-1.5-pro-latest`.
*   **LLM Interaction:** Sends context + prompt to the configured LLM. Includes streaming output and retries.
*   **Response Handling:** Streams the LLM's response to your console and saves the full response to `response.md`.
*   **Easy Installation:** Shell script, package managers (npm, yarn, bun).

## Installation

### Using the Install Script (Linux/macOS)

1.  Make sure you have **Bun** ([install instructions](https://bun.sh/docs/installation)) and **Git** installed.
2.  Run the following command in your terminal. Installs to `/usr/local/bin` by default:
    ```bash
    curl -fsSL https://raw.githubusercontent.com/AviSantoso/dafc/main/install.sh | sudo bash
    ```
    *   **NOTE:** Uses `sudo` for default install location. Review the script if needed.
    *   Alternatively, modify the `INSTALL_DIR` variable in the script before running, or install via package manager.

3.  Follow any on-screen instructions, especially regarding adding the installation directory to your PATH if needed.
4.  Restart your terminal or source your shell profile (`source ~/.bashrc`, `source ~/.zshrc`, etc.).
5.  Verify installation: `dafc --version`

### Using NPM/Yarn/Bun Package Managers

1.  Install globally with your preferred package manager:
    ```bash
    # Using npm
    npm install -g @wagn/dafc

    # Using yarn
    yarn global add @wagn/dafc

    # Using bun
    bun install -g @wagn/dafc
    ```

2.  Verify installation:
    ```bash
    dafc --version
    ```

### Manual Installation / From Source

1.  Ensure **Bun** and **Git** are installed.
2.  Clone the repository:
    ```bash
    git clone https://github.com/AviSantoso/dafc
    cd dafc
    ```
3.  Install dependencies:
    ```bash
    bun install --frozen-lockfile
    ```
4.  Build the executable:
    ```bash
    bun run build
    ```
5.  Move the generated `dafc` executable to a directory in your PATH (e.g., `/usr/local/bin`, `~/.local/bin`, `~/.bun/bin`).
    ```bash
    # Example:
    mv ./dafc ~/.local/bin/
    # Ensure ~/.local/bin is in your PATH
    ```

## Configuration

DAFC uses a layered configuration system:

1.  **Environment Variables (Highest Priority):** Any setting prefixed with `OPENAI_` or other config keys (e.g., `TEMPERATURE`, `MAX_CONTEXT_TOKENS`) set in your shell environment will override all other settings.
    ```bash
    export OPENAI_API_KEY='your-key-here'
    export OPENAI_MODEL='anthropic/claude-3.5-sonnet'
    ```

2.  **Project `.env` File (Medium Priority):** Create a `.env` file in your project's root directory. Settings here override the global config. This is the recommended place for project-specific LLM choices or API keys.
    ```dotenv
    # .env (in your project root)
    OPENAI_API_KEY='project-specific-key-maybe'
    OPENAI_MODEL='openai/gpt-4o'
    ```
    *   Use `dafc config` to easily create or edit this file.

3.  **Global Config File (Lowest Priority):** A global file stores default settings for all projects. Located at:
    *   Linux/macOS: `~/.config/dafc/config.env`
    *   Windows: `%APPDATA%\dafc\Config\config.env` (e.g., `C:\Users\YourUser\AppData\Roaming\dafc\Config\config.env`)
    ```dotenv
    # ~/.config/dafc/config.env (Example)
    OPENAI_API_KEY='your-default-openrouter-key'
    OPENAI_MODEL='google/gemini-1.5-pro-latest'
    OPENAI_API_BASE='https://openrouter.ai/api/v1'
    ```
    *   Use `dafc config --global` to easily create or edit this file.

**Key Configuration Variables:**

*   `OPENAI_API_KEY` (Required): Your API key for the chosen service.
*   `OPENAI_MODEL`: The specific LLM model identifier (e.g., `google/gemini-1.5-pro-latest`, `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`).
*   `OPENAI_API_BASE`: The base URL for the LLM API endpoint (e.g., `https://openrouter.ai/api/v1`, `https://api.openai.com/v1`, `https://api.featherless.ai/v1`).
*   `TEMPERATURE`: LLM creativity/randomness (0.0-2.0).
*   `MAX_CONTEXT_TOKENS`: Safety limit for context size (default ~900k).
*   `MAX_FILE_SIZE_BYTES`: Skip files larger than this (default 1MB).

**Example Setups:**

*   **OpenRouter (Default):** Set `OPENAI_API_KEY` in global or project config. `OPENAI_API_BASE` defaults to OpenRouter. Choose a model via `OPENAI_MODEL`.
*   **OpenAI:** Set `OPENAI_API_KEY`, `OPENAI_MODEL` (e.g., `gpt-4o`), and `OPENAI_API_BASE='https://api.openai.com/v1'`.
*   **Featherless:** Set `OPENAI_API_KEY`, `OPENAI_MODEL` (e.g., `openai/deepseek-ai/DeepSeek-V3-0324`), and `OPENAI_API_BASE='https://api.featherless.ai/v1'`.
*   **Google AI Studio:** Set `OPENAI_API_KEY`, `OPENAI_MODEL` (e.g., `gemini-1.5-pro-latest`), and `OPENAI_API_BASE='https://generativelanguage.googleapis.com/v1beta'`. *Note: Google's API might require specific formatting or headers not fully tested.*

**Initialize Helper Files:**

Run `dafc init` in your project's root directory. This creates:
*   `.dafcignore`: Add file/directory patterns (like `.gitignore`) to exclude from the context sent to the LLM.
*   `.dafcr`: Define custom system prompts or rules for the LLM.

## Usage

Run `dafc` commands from your project's root directory.

**1. Ask the LLM (`dafc ask <prompt>` or `dafc <prompt>`)**

The primary command. Gathers context, checks limits, includes rules from `.dafcr`, sends to LLM, streams response.

```bash
# Ask a question (default command is 'ask')
dafc "How does the authentication logic in user.ts work?"

# Request code generation
dafc ask "Generate a new API endpoint in routes/items.ts to delete an item by ID."

# Ask for refactoring help
dafc a "Refactor the main function in cli.ts to be more modular." # Using alias

# Get help running the project
dafc "What are the steps to run this project locally?"
```

Response streams to terminal, saved to `response.md`. Aborts if `MAX_CONTEXT_TOKENS` exceeded. Use `--debug` to see resolved config.

**2. Manage Context (`dafc context`)**

View, save, copy, or watch the gathered context. Respects `MAX_CONTEXT_TOKENS`.

```bash
# Print context to console (default)
dafc context

# Save context to context.md
dafc context --save

# Save context to a specific file
dafc context -s my_context.txt # Using alias

# Copy context to clipboard
dafc context --copy

# Save to context.md AND copy
dafc context --save --copy

# Save to context.md and watch for file changes, updating automatically
# Press Ctrl+C to stop.
dafc context --save --watch

# Save to specific file and watch
dafc context -s specific_context.txt -w
```

*   `-s, --save [filename]`: Saves context. Defaults to `context.md` if no filename given.
*   `--copy`: Copies context to clipboard.
*   `-w, --watch`: Requires `--save`. Monitors project and updates saved file on changes.

**3. Edit Configuration (`dafc config`)**

Opens the relevant configuration file in your default text editor.

```bash
# Edit the project-specific .env file (creates if needed)
dafc config

# Edit the global config file (creates if needed)
dafc config --global
dafc config -g # Using alias
```

**4. Initialize Helper Files (`dafc init`)**

Creates `.dafcignore` and `.dafcr` with default templates if they don't exist.

```bash
dafc init
```

## How It Works

**`dafc ask "prompt"`**

1.  Loads config (Env > Project `.env` > Global `config.env`).
2.  Reads `.gitignore` and `.dafcignore`.
3.  Scans current directory recursively for allowed files.
4.  Filters out ignored/empty/oversized files.
5.  Estimates total token count (files + boilerplate).
6.  **Aborts if `MAX_CONTEXT_TOKENS` exceeded.**
7.  Reads rules from `.dafcr` (if exists).
8.  Formats context block (file contents, paths, sizes, etc.).
9.  Sends `[System Prompt from .dafcr (if any)] + [User Message (Context Block + User Prompt)]` to the configured LLM API.
10. Streams response to `stdout` and saves full response to `response.md`.

## Contributing

Contributions welcome! Please submit pull requests or open issues.

## Disclaimer

This tool sends your code (excluding ignored files) to external LLMs.
*   **Do not use with sensitive codebases.** Keep secrets out of code, use ignore files, and manage API keys securely.
*   Use at your own risk. **Always review LLM-generated code carefully.**

## License

MIT License - see [LICENSE](LICENSE.md).