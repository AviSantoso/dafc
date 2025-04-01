# DAFC (The Fuck?) CLI - Dumb as Fuck Coding Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**DAFC** is a command-line tool and a methodology designed to leverage the massive context windows of modern Large Language Models (LLMs) like Gemini 2.5 Pro. Instead of complex context management, DAFC lets you easily dump your *entire* (but small!) codebase into the LLM prompt for querying, code generation, analysis, and more.

**Read the full philosophy and background in the [introductory blog post](https://avisantoso.com/gemini-and-context-windows).**

## Core Idea: Constraints Unlock Full Context

The "Dumb as Fuck Coding" methodology hinges on keeping projects simple and constrained:

*   **Max ~500 Lines Per File (Aim for ~300):** Keeps individual units manageable.
*   **Max ~50 Files (Aim for ~10):** Limits overall scope.
*   **Max ~5 Database Tables (Aim for 3):** Simplifies the data model. NOTE: Does not include users table.

By adhering to these rules, the *entire* relevant codebase often fits within the LLM's context window. DAFC CLI automates gathering this context and interacting with the LLM.

## Features

*   **Simple CLI Interface:** Easy-to-use commands (`ask`, `context`, `init`).
*   **Automatic Context Gathering:** Recursively scans your project, respects `.gitignore` and `.dafcignore`, and includes relevant files.
*   **Customizable Rules:** Uses a `.dafcr` file to inject system prompts or specific instructions into the LLM request.
*   **LLM Interaction:** Sends context + prompt to an LLM (configured for OpenRouter, defaults to Gemini 2.5 Pro). Includes streaming output and retries.
*   **Response Handling:** Streams the LLM's response to your console and saves the full response to `response.md`.
*   **Easy Installation:** Shell script for Linux/macOS.

## Installation

### Using the Install Script (Linux/macOS)

1.  Make sure you have **Bun** ([install instructions](https://bun.sh/docs/installation)) and **Git** installed.
2.  Run the following command in your terminal:

    ```bash
    curl -fsSL https://raw.githubusercontent.com/AviSantoso/dafc/main/install.sh | sudo bash
    ```

3.  Follow any on-screen instructions, especially regarding adding the installation directory to your PATH if needed.
4.  Restart your terminal or source your shell profile (`source ~/.bashrc`, `source ~/.zshrc`, etc.).
5.  Verify installation: `dafc --version`

### Manual Installation / From Source

1.  Ensure **Bun** and **Git** are installed.
2.  Clone the repository:
    ```bash
    git clone https://github.com/AviSantoso/dafc
    cd dafc
    ```
3.  Install dependencies:
    ```bash
    bun install
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

1.  **API Key (Required):** DAFC needs an OpenRouter API key.
    *   Get a key from [https://openrouter.ai/keys](https://openrouter.ai/keys).
    *   Set it as an environment variable. The recommended way is to create a `.env` file in your **project's root directory** (the directory where you run `dafc`):
        ```dotenv
        # .env
        OPENROUTER_API_KEY='your-key-here'

        # Optional: Override the default model
        # DAFC_MODEL='anthropic/claude-3.5-sonnet'
        ```
    *   Alternatively, export it in your shell: `export OPENROUTER_API_KEY='your-key-here'`

2.  **Initialize Project (Optional but Recommended):** Run `dafc init` in your project's root directory. This creates:
    *   `.dafcignore`: Add file/directory patterns (like `.gitignore`) to exclude from the context sent to the LLM.
    *   `.dafcr`: Define custom system prompts or rules for the LLM. Edit this file to tailor the LLM's behavior.

## Usage

Run `dafc` commands from your project's root directory.

**1. Ask the LLM:**

This is the primary command. It gathers context, includes rules from `.dafcr`, sends everything + your prompt to the LLM, and streams the response.

```bash
# Ask a question about the code
dafc "How does the authentication logic in user.ts work?"

# Request code generation
dafc "Generate a new API endpoint in routes/items.ts to delete an item by ID. Use the existing database connection."

# Ask for refactoring help
dafc "Refactor the main function in cli.ts to be more modular."

# Get help running the project
dafc "What are the steps to run this project locally?"
```

The LLM response will be streamed to your terminal and saved completely in `response.md`.

**2. View and Manage Context:**

See exactly what context is being gathered and sent to the LLM, save it, copy it, or watch for changes.

```bash
# Print context to the console (default behavior)
dafc context

# Save context to the default file (context.md)
dafc context --save

# Save context to a specific file
dafc context --save my_project_context.md

# Copy context directly to the clipboard
dafc context --copy

# Save context to context.md AND copy it to the clipboard
dafc context --save --copy

# Save context to context.md and watch for file changes, updating the file automatically
# Press Ctrl+C to stop watching.
dafc context --save --watch

# Save context to a specific file and watch for changes
dafc context --save specific_context.txt --watch
```

*   `--save [filename]`: Saves the gathered context to the specified `filename`. If no filename is provided, it defaults to `context.md`.
*   `--copy`: Copies the gathered context to the system clipboard.
*   `--watch`: Requires `--save`. Monitors the project directory for file changes (respecting ignore rules) and automatically updates the saved context file. Useful for keeping a context file up-to-date while you code. `--copy` is ignored when `--watch` is active.

**3. Initialize Config Files:**

Creates `.dafcignore` and `.dafcr` with default templates if they don't exist.

```bash
dafc init
```

## How It Works

**`dafc ask "prompt"`:**
    *   Reads `.gitignore` and `.dafcignore`.
    *   Scans the current directory recursively for allowed file types.
    *   Filters out ignored files/directories.
    *   Reads file contents (skipping very large or empty files).
    *   Reads rules from `.dafcr` (if it exists).
    *   Formats file contents and rules into a single context block.
    *   Sends `[Context Block] + [User Prompt]` to the configured LLM via OpenRouter API.
    *   Streams the response to `stdout` and saves the full response to `response.md`.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## Disclaimer

This tool sends your code (excluding ignored files) to external Large Language Models (via OpenRouter).
*   **Do not use this tool if your codebase contains sensitive information** (secrets, PII, etc.) that should not leave your environment. Standard security practices apply: keep secrets out of your code and use `.gitignore` / `.dafcignore` appropriately. Use a `.env` file for API keys.
*   Use this tool responsibly and at your own risk. LLM outputs may contain errors or security vulnerabilities – **always review generated code carefully.**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
