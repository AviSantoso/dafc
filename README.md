# DAFC (The Fuck?) - Dumb as Fuck Coding Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
**DAFC** is a tool and a methodology designed to leverage the massive context windows of modern Large Language Models (LLMs) like Gemini 2.5 Pro. Instead of complex context management, DAFC lets you dump your *entire* (but small!) codebase into the LLM prompt for querying, code generation, analysis, and more.

**Read the full philosophy and background in the introductory blog post:**
`[LINK_TO_BLOG_POST]` (<- *Link this to your actual blog post*)

---

## Core Idea: Constraints Unlock Full Context

The "Dumb as Fuck Coding" methodology hinges on keeping projects simple and constrained:

* **Max 500 Lines / File:** Keeps individual units manageable.
* **Max ~50 Files (Aim for ~10):** Limits overall scope.
* **Max 5 Database Tables (Aim for 3, excluding users):** Simplifies the data model.

By adhering to these rules, the *entire* codebase often fits within the LLM's context window, allowing for reliable "one-shot" interactions where the LLM has full visibility. This forces modularity and naturally leads to building small, focused micro-APIs.

## Features

* **Context Gathering:** Recursively scans your project directory for relevant files (respects `.gitignore` and `.dafcignore`).
* **Context Formatting:** Bundles file paths and content into a single context block (Markdown or XML).
* **LLM Interaction:** Sends the generated context + your prompt to an LLM endpoint (initially configured for OpenRouter).
    * Includes configurable exponential backoff for retries.
* **Response Handling:** Saves the LLM's streaming response to `response.md` in the current directory.
* **Customizable Prompts:** Uses a `.dafcr` file to inject system prompts, rules, or other instructions (like visual briefs) into the LLM request. See example: `[LINK_TO_DAFC_V0_RULES]` (<- *Link this to your rules/example .dafcr file*)

## Installation

Currently, the tool is run directly using Bun.

1.  **Clone the repository:**
    ```bash
    git clone [YOUR_REPO_URL]
    cd [YOUR_REPO_DIRECTORY]
    ```
2.  **Install dependencies:**
    ```bash
    bun install
    ```

## Configuration

1.  **API Keys:** The tool requires access to an LLM API. Currently, it uses OpenRouter. You'll need to configure your API key.
    *(Suggestion: Specify HOW to configure the key, e.g., via environment variables)*
    ```bash
    # Example: Set environment variable (adjust based on actual implementation)
    export OPENROUTER_API_KEY='your_api_key_here'
    ```
2.  **`.dafcr` File (Optional):** Create a `.dafcr` file in your project's root directory to provide custom system prompts or instructions to the LLM. See `[LINK_TO_DAFC_V0_RULES]` for an example structure.
3.  **`.dafcignore` File (Optional):** Create a `.dafcignore` file (similar syntax to `.gitignore`) to specify additional files or patterns the context gatherer should ignore.

## Usage

Run the tool from your project's root directory using Bun:

```bash
# General usage
bun run llm.ts "Your natural language query or instruction here"

# Example: Ask for help running the project
bun run llm.ts "I don't know how to run this, pls help"
# Or assuming 'dafc' alias/CLI installed later:
# dafc "I don't know how to run this, pls help"

# Example: Ask for a feature implementation
bun run llm.ts "Implement user authentication using JWT and store user data in the SQLite database."
```

The LLM's response, potentially including full code files in Markdown format, will be saved to `response.md`.

## How It Works (Diagram)

Here's a high-level overview of the tool's process:

`[DIAGRAM_OF_DAFC_TOOL_FLOW]` (<- *Embed or link to the diagram*)

## Future Plans

* Package the tool as an easy-to-install CLI application (`dafc`).
* Support for more LLM providers and configuration options.
* _Potentially add more features based on user feedback._

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.
*(Consider adding more specific contribution guidelines later: coding style, testing requirements, etc.)*

## Disclaimer

This tool sends your code (excluding ignored files) to external Large Language Models.
* **Do not use this tool if your codebase contains sensitive information** (secrets, PII, etc.) that should not leave your environment. Standard security practices apply: keep secrets out of your code and use `.gitignore` / `.dafcignore` appropriately.
* Use this tool responsibly and at your own risk. LLM outputs may contain errors or security vulnerabilities – always review generated code carefully.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.