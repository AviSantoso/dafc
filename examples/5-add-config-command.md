Okay, let's implement global and project-level configuration management using `.env`-style files. We'll use standard user configuration directories for global settings and the project's root for local settings. We'll avoid SQLite for now as `.env` files are simpler for this use case.

Here are the steps and the updated code:

**1. Install Dependencies:**

First, you need to add packages to handle user configuration directories and opening files in the default editor.

```bash
bun add env-paths open @types/open
```

**2. Update `package.json`:**

Add the new dependencies.

--- ./package.json ---
```json
{
  "name": "@wagn/dafc",
  "version": "0.1.5",
  "description": "Dumb as Fuck Coding Tool - Leverage large context LLMs by sending (small) codebases.",
  "type": "module",
  "bin": {
    "dafc": "./dafc"
  },
  "scripts": {
    "build": "bun build ./src/cli.ts --compile --outfile dafc",
    "dev": "bun run ./src/cli.ts",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "dotenv": "^16.4.5",
    "ignore": "^5.3.1",
    "openai": "^4.52.7",
    "clipboardy": "^4.0.0",
    "env-paths": "^3.0.0",
    "open": "^10.1.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^20.14.10",
    "@types/open": "^6.2.1"
  },
  "peerDependencies": {
    "typescript": "^5.0.0"
  },
  "files": [
    "dafc",
    "src/",
    "LICENSE",
    "README.md"
  ],
  "keywords": [
    "llm",
    "ai",
    "cli",
    "codegen",
    "context",
    "gemini",
    "openai",
    "developer-tool"
  ],
  "homepage": "https://github.com/AviSantoso/dafc",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/AviSantoso/dafc.git"
  },
  "bugs": {
    "url": "https://github.com/AviSantoso/dafc/issues"
  },
  "author": "Avi Santoso",
  "license": "MIT"
}
```

**3. Update Utility Functions (`src/utils.ts`):**

Add functions to get configuration paths and open files in the editor.

--- ./src/utils.ts ---
```ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import ignore, { type Ignore } from "ignore";
import envPaths from "env-paths";
import open from "open";
import { config } from "./config";

// --- File System & Paths ---

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readFileContent(
  filePath: string
): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return null; // File not found is okay
    }
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
    return null;
  }
}

export async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    // Ignore EEXIST error (directory already exists)
    if (error.code !== "EEXIST") {
      throw error; // Re-throw other errors
    }
  }
}

export function getGlobalConfigPath(): string {
  const paths = envPaths("dafc", { suffix: "" }); // Use 'dafc' as the app name
  return join(paths.config, config.GLOBAL_CONFIG_FILE);
}

export function getProjectConfigPath(rootDir: string = "."): string {
  return join(rootDir, config.PROJECT_CONFIG_FILE);
}

// --- Ignore Logic ---

export async function createIgnoreFilter(rootDir: string): Promise<Ignore> {
  const ig = ignore();

  // Add default directory ignores
  config.DEFAULT_IGNORE_DIRS.forEach((dir) => ig.add(dir + "/"));
  // Add default file ignores
  config.DEFAULT_IGNORE_FILES.forEach((file) => ig.add(file));

  // Load .gitignore
  const gitignoreContent = await readFileContent(
    join(rootDir, config.GIT_IGNORE_FILE)
  );
  if (gitignoreContent) {
    ig.add(gitignoreContent);
  }

  // Load .dafcignore
  const dafcignoreContent = await readFileContent(
    join(rootDir, config.DAFC_IGNORE_FILE)
  );
  if (dafcignoreContent) {
    ig.add(dafcignoreContent);
  }

  return ig;
}

export function isAllowedPath(relativePath: string, ig: Ignore): boolean {
  try {
    const normalizedPath = relativePath.replace(/^[\/\\]/, "");
    return !ig.ignores(normalizedPath);
  } catch (error) {
    console.warn(`Error checking path ${relativePath}: ${error}`);
    return false;
  }
}

export function isAllowedExtension(filename: string): boolean {
  if (
    filename.startsWith(".") &&
    !config.DEFAULT_INCLUDE_PATTERNS.some((pattern) => pattern.test(filename))
  ) {
    return false;
  }
  return config.DEFAULT_INCLUDE_PATTERNS.some((pattern) =>
    pattern.test(filename)
  );
}

// --- Formatting & Misc ---

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, sizes.length - 1);
  return (
    parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(dm)) +
    " " +
    sizes[sizeIndex]
  );
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / config.APPROX_CHARS_PER_TOKEN);
}

// --- Editor ---

export async function openFileInEditor(filePath: string): Promise<void> {
  try {
    console.log(`Attempting to open ${filePath} in your default editor...`);
    await open(filePath);
  } catch (error: any) {
    console.error(`❌ Failed to open file in editor: ${error.message}`);
    console.error(
      `Please open the file manually: ${filePath}`
    );
  }
}

```

**4. Update Configuration Loading (`src/config.ts`):**

Modify how configuration is loaded to layer global, project, and environment variables.

--- ./src/config.ts ---
```ts
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { getGlobalConfigPath, getProjectConfigPath } from "./utils"; // Import path helpers

// --- Configuration Constants ---
const GLOBAL_CONFIG_FILE = "config.env";
const PROJECT_CONFIG_FILE = ".env"; // Standard project env file

// --- Default Values ---
const defaults = {
  MODEL_NAME: "google/gemini-2.5-pro-exp-03-25:free",
  API_BASE_URL: "https://openrouter.ai/api/v1",
  TEMPERATURE: 0.3,
  MAX_RETRIES: 5,
  BASE_DELAY: 1000, // ms
  MAX_CONTEXT_TOKENS: 900000,
  APPROX_CHARS_PER_TOKEN: 4,
  RESPONSE_FILE: "response.md",
  DAFC_IGNORE_FILE: ".dafcignore",
  DAFC_RULES_FILE: ".dafcr",
  GIT_IGNORE_FILE: ".gitignore",
  GLOBAL_CONFIG_FILE: GLOBAL_CONFIG_FILE,
  PROJECT_CONFIG_FILE: PROJECT_CONFIG_FILE,
  DEFAULT_IGNORE_DIRS: new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "out",
    "coverage",
    "vendor",
    "__pycache__",
    ".venv",
    ".env", // Exclude project .env itself from context scan
    GLOBAL_CONFIG_FILE, // Exclude global config from context scan
  ]),
  DEFAULT_IGNORE_FILES: new Set([
    ".DS_Store",
    "response.md",
    "context.md",
    "*.lock",
    "*.log",
  ]),
  DEFAULT_INCLUDE_PATTERNS: [
    /\.ts$/, /\.tsx$/, /\.js$/, /\.jsx$/, /\.py$/, /\.rb$/, /\.php$/,
    /\.go$/, /\.rs$/, /\.java$/, /\.cs$/, /\.html$/, /\.css$/, /\.scss$/,
    /\.less$/, /\.json$/, /\.yaml$/, /\.yml$/, /\.md$/, /\.txt$/,
    /Dockerfile$/, /docker-compose\.yml$/, /\.sql$/, /\.sh$/, /\.bash$/,
    /Makefile$/, /^\.?env/, /^\.?config/, /^\.?rc$/, /package\.json$/,
    /composer\.json$/, /Gemfile$/, /requirements\.txt$/, /go\.mod$/,
    /Cargo\.toml$/, /pom\.xml$/, /csproj$/,
  ],
  MAX_FILE_SIZE_BYTES: 1 * 1024 * 1024, // 1MB
  // DAFC Constraints (Informational)
  MAX_LINES_PER_FILE: 500,
  MAX_FILES: 50,
  TARGET_FILES: 10,
};

// --- Configuration Loading Function ---
function loadConfig() {
  // 1. Load Global Config File (if exists)
  const globalConfigPath = getGlobalConfigPath();
  let globalConfig = {};
  try {
    const globalContent = readFileSync(globalConfigPath, "utf-8");
    globalConfig = dotenv.parse(globalContent);
    // console.debug("Loaded global config:", globalConfigPath);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Warning: Could not read global config file ${globalConfigPath}: ${error.message}`
      );
    }
    // else { console.debug("Global config file not found:", globalConfigPath); }
  }

  // 2. Load Project Config File (.env) (if exists)
  const projectConfigPath = getProjectConfigPath(process.cwd());
  let projectConfig = {};
  try {
    const projectContent = readFileSync(projectConfigPath, "utf-8");
    projectConfig = dotenv.parse(projectContent);
    // console.debug("Loaded project config:", projectConfigPath);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Warning: Could not read project config file ${projectConfigPath}: ${error.message}`
      );
    }
    // else { console.debug("Project config file (.env) not found in:", process.cwd()); }
  }

  // 3. Environment Variables (highest priority)
  const envVars = process.env;

  // 4. Merge configurations (Env > Project > Global > Defaults)
  const mergedConfig = {
    ...defaults,
    ...globalConfig,
    ...projectConfig,
    ...envVars, // Environment variables override file configs
    // Ensure specific types are maintained if necessary (e.g., numbers)
    TEMPERATURE: parseFloat(
      envVars.TEMPERATURE ||
        (projectConfig as any).TEMPERATURE ||
        (globalConfig as any).TEMPERATURE ||
        String(defaults.TEMPERATURE)
    ),
    MAX_RETRIES: parseInt(
      envVars.MAX_RETRIES ||
        (projectConfig as any).MAX_RETRIES ||
        (globalConfig as any).MAX_RETRIES ||
        String(defaults.MAX_RETRIES),
      10
    ),
    BASE_DELAY: parseInt(
      envVars.BASE_DELAY ||
        (projectConfig as any).BASE_DELAY ||
        (globalConfig as any).BASE_DELAY ||
        String(defaults.BASE_DELAY),
      10
    ),
    MAX_CONTEXT_TOKENS: parseInt(
      envVars.MAX_CONTEXT_TOKENS ||
        (projectConfig as any).MAX_CONTEXT_TOKENS ||
        (globalConfig as any).MAX_CONTEXT_TOKENS ||
        String(defaults.MAX_CONTEXT_TOKENS),
      10
    ),
    MAX_FILE_SIZE_BYTES: parseInt(
      envVars.MAX_FILE_SIZE_BYTES ||
        (projectConfig as any).MAX_FILE_SIZE_BYTES ||
        (globalConfig as any).MAX_FILE_SIZE_BYTES ||
        String(defaults.MAX_FILE_SIZE_BYTES),
      10
    ),
    // Keep sets as sets
    DEFAULT_IGNORE_DIRS: defaults.DEFAULT_IGNORE_DIRS,
    DEFAULT_IGNORE_FILES: defaults.DEFAULT_IGNORE_FILES,
    DEFAULT_INCLUDE_PATTERNS: defaults.DEFAULT_INCLUDE_PATTERNS,
  };

  // Ensure OPENAI_API_KEY is present
  if (!mergedConfig.OPENAI_API_KEY) {
    console.error("❌ Error: OPENAI_API_KEY is not set.");
    console.error(
      "  Please set it in your environment, project .env file, or global config file."
    );
    console.error(`  Global config location: ${globalConfigPath}`);
    console.error("  Run 'dafc config --global' or 'dafc config' to edit.");
    process.exit(1);
  }

  return mergedConfig;
}

// --- Exported Config ---
export const config = loadConfig();

```

**5. Update CLI (`src/cli.ts`):**

Add the `config` command and its logic.

--- ./src/cli.ts ---
```ts
#!/usr/bin/env bun
import { Command, Option } from "commander";
import { writeFile, watch } from "fs/promises";
import { join, relative, resolve, dirname } from "path";
import clipboard from "clipboardy";
import { gatherContext, ContextTooLargeError } from "./context";
import { queryLLM } from "./llm";
import {
  createIgnoreFilter,
  readFileContent,
  debounce,
  isAllowedPath,
  getGlobalConfigPath,
  getProjectConfigPath,
  ensureDirExists,
  openFileInEditor,
} from "./utils";
import { config } from "./config";
// Dynamically import package.json to get version
import pkg from "../package.json";

const program = new Command();

program
  .name("dafc")
  .version(pkg.version)
  .description(
    "DAFC CLI - Interact with LLMs using your entire codebase as context."
  );

// --- Ask Command ---
program
  .command("ask <prompt>")
  .alias("a") // Add alias
  .description("Ask the LLM a question using the current directory's context.")
  .option("--debug", "Show debug information including final config")
  .action(async (prompt: string, opts: { debug?: boolean }) => {
    console.log("DAFC - Dumb as Fuck Coder");
    console.log("--------------------------");

    if (opts.debug) {
      console.log("\nResolved Config (Env > Project > Global > Defaults):");
      // Avoid logging sensitive keys directly if possible, maybe redact API key
      const safeConfig = { ...config, OPENAI_API_KEY: config.OPENAI_API_KEY ? '***' : 'Not Set' };
      console.log(JSON.stringify(safeConfig, (key, value) =>
        value instanceof Set ? Array.from(value) : value, // Convert Sets for JSON
      2));
      console.log("--------------------------\n");
    }

    const rootDir = process.cwd();
    try {
      const ig = await createIgnoreFilter(rootDir);
      const { context, files, rules } = await gatherContext(rootDir, ig);

      if (files.length === 0) {
        console.warn(
          "⚠️ Warning: No files were included in the context. Check include patterns and ignore files (.gitignore, .dafcignore)."
        );
      }

      await queryLLM(context, prompt, rules);
    } catch (error: any) {
      if (error instanceof ContextTooLargeError) {
        // Message already logged by gatherContext
        process.exit(1);
      }
      console.error(`\n❌ An unexpected error occurred: ${error.message}`);
      if (opts.debug && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// --- Context Command ---
program
  .command("context")
  .alias("c") // Add alias
  .description("Gather context and print, save, copy, or watch it.")
  .addOption(
    new Option(
      "-s, --save [outputFile]",
      "Save context to a file (default: context.md)"
    ).argParser((value) => value || "context.md")
  )
  .option(
    "-w, --watch",
    "Watch for file changes and update the saved context file (requires --save)"
  )
  .option("--copy", "Copy the context to the clipboard") // Changed short flag to avoid conflict
  .action(async (opts: { save?: string; watch?: boolean; copy?: boolean }) => {
    const rootDir = process.cwd();
    console.log("Gathering context...");

    const performGatherAndOutput = async (
      isInitialRun = true
    ): Promise<string | null> => {
      try {
        const ig = await createIgnoreFilter(rootDir);
        const { context, files } = await gatherContext(rootDir, ig);

        if (files.length === 0 && isInitialRun) {
          console.warn(
            "⚠️ Warning: No files were included in the context. Check include patterns and ignore files (.gitignore, .dafcignore)."
          );
        }

        if (opts.save) {
          const savePath = resolve(rootDir, opts.save);
          await writeFile(savePath, context, "utf-8");
          if (isInitialRun || !opts.watch) {
            console.log(`✅ Context saved to ${savePath}`);
          } else {
            console.log(
              `🔄 Context updated in ${savePath} at ${new Date().toLocaleTimeString()}`
            );
          }
        }

        if (opts.copy && (isInitialRun || !opts.watch)) {
          await clipboard.write(context);
          console.log("✅ Context copied to clipboard.");
        }

        if (!opts.save && !opts.copy && !opts.watch) {
          console.log("\n--- START CONTEXT ---");
          console.log(context);
          console.log("--- END CONTEXT ---");
        }
        return context;
      } catch (error: any) {
        if (error instanceof ContextTooLargeError) {
          if (!opts.watch) process.exit(1);
          return null;
        }
        console.error(`\n❌ Error gathering context: ${error.message}`);
        if (!opts.watch) process.exit(1);
        return null;
      }
    };

    await performGatherAndOutput(true);

    if (opts.watch) {
      if (!opts.save) {
        console.error(
          "❌ Error: --watch requires --save to specify an output file."
        );
        process.exit(1);
      }

      console.log(`\n👀 Watching for file changes in ${rootDir}...`);
      console.log("   Press Ctrl+C to stop.");

      const debouncedRegenerate = debounce(
        () => performGatherAndOutput(false),
        500
      );

      try {
        const igForWatch = await createIgnoreFilter(rootDir);
        const watcher = watch(rootDir, { recursive: true });
        for await (const event of watcher) {
          const eventFilename = event.filename || "";
          const eventPath = resolve(rootDir, eventFilename);
          const savePath = resolve(rootDir, opts.save);

          if (eventPath === savePath) continue; // Ignore changes to the output file

          const relativeEventPath = relative(rootDir, eventPath);
          if (!isAllowedPath(relativeEventPath, igForWatch)) continue; // Check against ignore rules

          debouncedRegenerate();
        }
      } catch (error: any) {
        console.error(`\n❌ File watcher error: ${error.message}`);
        process.exit(1);
      }
    }
  });

// --- Config Command ---
program
  .command("config")
  .description("Edit global or project-specific configuration.")
  .option("-g, --global", "Edit the global configuration file")
  .action(async (opts: { global?: boolean }) => {
    let configPath: string;
    let isGlobal = !!opts.global;

    if (isGlobal) {
      configPath = getGlobalConfigPath();
      console.log(`Editing global config: ${configPath}`);
    } else {
      configPath = getProjectConfigPath(process.cwd());
      console.log(`Editing project config: ${configPath}`);
    }

    const defaultConfigContent = `# DAFC Configuration (${isGlobal ? "Global" : "Project"})
# Lines starting with # are comments.
# Add your settings below in KEY=VALUE format.

# --- Required ---
# Your API key for the LLM service
# OPENAI_API_KEY=your-api-key-here

# --- Optional Overrides ---
# Specify the model to use (default: ${config.MODEL_NAME})
# OPENAI_MODEL=google/gemini-1.5-pro-latest

# Specify the API endpoint base URL (default: ${config.API_BASE_URL})
# OPENAI_API_BASE=https://openrouter.ai/api/v1

# Adjust LLM temperature (0.0 to 2.0, default: ${config.TEMPERATURE})
# TEMPERATURE=0.5

# Adjust max context tokens (default: ${config.MAX_CONTEXT_TOKENS})
# MAX_CONTEXT_TOKENS=900000

# Adjust max file size bytes (default: ${config.MAX_FILE_SIZE_BYTES})
# MAX_FILE_SIZE_BYTES=1048576
`;

    try {
      // Ensure directory exists for global config
      if (isGlobal) {
        await ensureDirExists(dirname(configPath));
      }

      // Check if file exists, create with defaults if not
      const currentContent = await readFileContent(configPath);
      if (currentContent === null) {
        console.log("Config file not found, creating with defaults...");
        await writeFile(configPath, defaultConfigContent, "utf-8");
      }

      // Open in editor
      await openFileInEditor(configPath);

    } catch (error: any) {
      console.error(`\n❌ Error managing config file: ${error.message}`);
      process.exit(1);
    }
  });

// --- Init Command ---
program
  .command("init")
  .description(
    "Initialize DAFC helper files (.dafcignore, .dafcr) in the current directory."
  )
  .action(async () => {
    const rootDir = process.cwd();
    const dafcignorePath = join(rootDir, config.DAFC_IGNORE_FILE);
    const dafcrPath = join(rootDir, config.DAFC_RULES_FILE);

    const defaultDafcignore = `# DAFC Ignore File (.dafcignore)
# Add file/directory patterns to exclude from LLM context, beyond .gitignore.
# Syntax is the same as .gitignore.

# Example: Ignore large data files, logs, specific build artifacts, etc.
# data/
# *.log
# temp/
# **/temp/
# vendor/
# __pycache__/
# *.lock
# *.log
# .env # Already ignored by default config, but good practice

# Ignore the default response and context output files
${config.RESPONSE_FILE}
context.md
`;

    const defaultDafcr = `[START SYSTEM PROMPT]
You are an expert software engineer assisting a user with their codebase.
The user has provided their project context below.
Analyze the code and the user's request carefully.
Provide concise, accurate, and actionable responses.
If generating code, match the project's style and conventions.
If the request is unclear, ask clarifying questions.
Think step-by-step. Output in Markdown. Specify language for code blocks.
Adhere to DAFC principles: keep code simple, modular, <500 lines/file.
[END SYSTEM PROMPT]

[START INSTRUCTIONS]
- Focus on minimum viable functionality.
- Ensure code is clear, readable, self-documenting.
- If refactoring is needed (e.g., splitting large files), provide clear instructions and the refactored code.
- Return full code for modified/new files in separate Markdown code blocks like the example. Do not skip lines.
[END INSTRUCTIONS]

[EXAMPLE OUTPUT FILE]
--- ./path/to/your/file.ts ---
\`\`\`typescript
// Full content of the file here
// ...
\`\`\`
[END EXAMPLE OUTPUT FILE]
`;

    try {
      const dafcignoreExists = await readFileContent(dafcignorePath);
      const dafcrExists = await readFileContent(dafcrPath);

      if (dafcignoreExists === null) {
        await writeFile(dafcignorePath, defaultDafcignore, "utf-8");
        console.log(`✅ Created default ${config.DAFC_IGNORE_FILE}`);
      } else {
        console.log(`ℹ️ ${config.DAFC_IGNORE_FILE} already exists, skipping.`);
      }

      if (dafcrExists === null) {
        await writeFile(dafcrPath, defaultDafcr, "utf-8");
        console.log(`✅ Created default ${config.DAFC_RULES_FILE}`);
      } else {
        console.log(`ℹ️ ${config.DAFC_RULES_FILE} already exists, skipping.`);
      }

      console.log("\nInitialization complete. You can customize these files.");
    } catch (error: any) {
      console.error(`\n❌ Error initializing helper files: ${error.message}`);
      process.exit(1);
    }
  });

// --- Default Command Handling ---
const args = process.argv.slice(2);
const knownCommands = program.commands.map((cmd) => cmd.name());
const knownAliases = program.commands.flatMap((cmd) => cmd.aliases()); // Get aliases

// If the first argument is not a known command or alias and not a flag, assume it's a prompt for 'ask'
if (
  args.length > 0 &&
  !knownCommands.includes(args[0]) &&
  !knownAliases.includes(args[0]) && // Check aliases too
  !args[0].startsWith("-")
) {
  process.argv.splice(2, 0, "ask"); // Prepend 'ask'
} else if (args.length === 0) {
  program.outputHelp(); // Show help if no args
}

program.parse(process.argv);

```

**6. Update `README.md`:**

Add documentation for the new `config` command.

--- ./README.md ---
```md
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
```

**7. Build and Test:**

1.  Rebuild the executable:
    ```bash
    bun run build
    ```
2.  Test the new commands:
    *   `./dafc config --global` (Should open or create the global config)
    *   `./dafc config` (Should open or create `./.env`)
    *   Set a variable in `./.env` (e.g., `OPENAI_MODEL=test-project-model`)
    *   Run `./dafc ask "test" --debug` and verify the `test-project-model` is shown in the resolved config.
    *   Unset the variable in `./.env` and set it in the global config.
    *   Run `./dafc ask "test" --debug` again and verify the global model is used.
    *   Set an environment variable (`export OPENAI_MODEL=test-env-model`)
    *   Run `./dafc ask "test" --debug` again and verify the environment variable takes precedence.

You now have a layered configuration system and commands to easily edit the global and project configuration files.