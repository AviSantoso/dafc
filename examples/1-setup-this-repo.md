Okay, let's restructure this project into a more user-friendly CLI tool named `dafc` and prepare it for release.

Here's the plan:

1.  **Merge Core Logic:** Combine the context gathering (`get_context.ts`) and LLM interaction (`llm.ts`) into a single flow triggered by the main command.
2.  **Implement `.dafcignore`:** Add support for this file alongside `.gitignore`.
3.  **Create CLI Structure:** Use a library like `commander` (or Bun's built-in features if sufficient) to create three main commands:
    *   `dafc ask "<prompt>"`: Gathers context, includes `.dafcr` rules, sends prompt + context to LLM, streams output, saves to `response.md`. This is the primary command.
    *   `dafc context`: Gathers and prints the context (including `.dafcr`) to the console. Useful for debugging what the LLM sees.
    *   `dafc init`: Creates default `.dafcr` and `.dafcignore` files in the current directory to help users get started.
4.  **Refactor Code:** Organize the code into logical modules (e.g., `context.ts`, `llm.ts`, `cli.ts`).
5.  **Installation Script:** Create an `install.sh` script for easy installation on Linux/macOS.
6.  **GitHub Actions:** Set up a basic GitHub Actions workflow to build binaries on release tags.
7.  **Update Documentation:** Revise `README.md` to reflect the new CLI usage and installation process.

Here are the proposed file changes and new files:

**1. Update `package.json`**

We need dependencies for CLI argument parsing (`commander`) and handling ignore files (`ignore`). We'll also add a `bin` entry to tell npm/bun how to link the `dafc` command.

--- ./package.json ---
```json
{
  "name": "dafc-cli",
  "version": "0.1.0",
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
    "openai": "^4.52.7"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^20.14.10"
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
  "homepage": "[YOUR_REPO_URL_HERE]",
  "repository": {
    "type": "git",
    "url": "git+[YOUR_REPO_URL_HERE].git"
  },
  "bugs": {
    "url": "[YOUR_REPO_URL_HERE]/issues"
  },
  "author": "[YOUR_NAME_OR_ORG]",
  "license": "MIT"
}
```

*Action:* Replace `[YOUR_REPO_URL_HERE]`, `[YOUR_NAME_OR_ORG]` placeholders.

**2. Create `src/` directory and move/refactor code**

Let's organize the source files.

*   Move `llm.ts` to `src/llm.ts`
*   Move `get_context.ts` to `src/context.ts`
*   Create `src/cli.ts` as the main entry point.
*   Create `src/config.ts` for constants.
*   Create `src/utils.ts` for helper functions.

**3. New File: `src/config.ts`**

--- ./src/config.ts ---
```typescript
import dotenv from "dotenv";

// Load .env file from current working directory or project root
dotenv.config({ path: process.cwd() + '/.env', override: true });
dotenv.config({ override: true }); // Load default .env if specific one not found

export const config = {
  // LLM Settings
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  MODEL_NAME: process.env.OPENAI_MODEL || "google/gemini-2.5-pro-exp-03-25:free", // Allow overriding model via env
  API_BASE_URL: "https://openrouter.ai/api/v1",
  API_REFERER: process.env.DAFC_REFERER || "https://github.com/your-repo/dafc-cli", // CHANGE THIS
  API_TITLE: "DAFC CLI",
  TEMPERATURE: 0.3,
  MAX_RETRIES: 3,
  BASE_DELAY: 1000, // ms

  // File Handling
  RESPONSE_FILE: "response.md",
  DAFC_IGNORE_FILE: ".dafcignore",
  DAFC_RULES_FILE: ".dafcr",
  GIT_IGNORE_FILE: ".gitignore",
  DEFAULT_IGNORE_DIRS: new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'out', 'coverage']),
  DEFAULT_IGNORE_FILES: new Set(['.DS_Store', 'response.md', '.env']), // Add context.txt if you keep it
  // Add file extensions you want to include by default
  DEFAULT_INCLUDE_PATTERNS: [
    /\.ts$/, /\.tsx$/, /\.js$/, /\.jsx$/,
    /\.py$/, /\.rb$/, /\.php$/, /\.go$/, /\.rs$/, /\.java$/, /\.cs$/,
    /\.html$/, /\.css$/, /\.scss$/, /\.less$/,
    /\.json$/, /\.yaml$/, /\.yml$/,
    /\.md$/, /\.txt$/,
    /Dockerfile$/, /docker-compose\.yml$/,
    /\.sql$/,
    /\.sh$/, /\.bash$/,
    /Makefile$/,
    /^\.?env/, /^\.?config/, /^\.?rc$/, // Config files like .env, .eslintrc
    /package\.json$/, /composer\.json$/, /Gemfile$/, /requirements\.txt$/, /go\.mod$/, /Cargo\.toml$/, /pom\.xml$/, /csproj$/ // Dependency files
  ],
  MAX_FILE_SIZE_BYTES: 1 * 1024 * 1024, // 1MB limit per file to avoid huge blobs

  // DAFC Constraints (Informational - not strictly enforced by tool yet)
  MAX_LINES_PER_FILE: 500,
  MAX_FILES: 50,
  TARGET_FILES: 10,
};

// Validate essential config
if (!config.OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY environment variable not set.");
  console.error("1. Get an API key from https://openrouter.ai/keys");
  console.error("2. Create a .env file in your project root with:");
  console.error("   OPENROUTER_API_KEY='your-key-here'");
  console.error("3. Or, set the environment variable directly:");
  console.error("   export OPENROUTER_API_KEY='your-key-here'");
  process.exit(1);
}
```
*Action:* Update `API_REFERER` with your actual repository URL.

**4. New File: `src/utils.ts`**

--- ./src/utils.ts ---
```typescript
import { readFile } from "fs/promises";
import { join } from "path";
import ignore, { Ignore } from 'ignore';
import { config } from './config';

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // File not found is okay
    }
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
    return null;
  }
}

export async function createIgnoreFilter(rootDir: string): Promise<Ignore> {
    const ig = ignore();

    // Add default directory ignores
    config.DEFAULT_IGNORE_DIRS.forEach(dir => ig.add(dir + '/'));
    // Add default file ignores
    config.DEFAULT_IGNORE_FILES.forEach(file => ig.add(file));

    // Load .gitignore
    const gitignoreContent = await readFileContent(join(rootDir, config.GIT_IGNORE_FILE));
    if (gitignoreContent) {
        ig.add(gitignoreContent);
        // console.debug("Loaded .gitignore rules");
    }

    // Load .dafcignore
    const dafcignoreContent = await readFileContent(join(rootDir, config.DAFC_IGNORE_FILE));
    if (dafcignoreContent) {
        ig.add(dafcignoreContent);
        // console.debug("Loaded .dafcignore rules");
    }

    return ig;
}

export function isAllowedPath(relativePath: string, ig: Ignore): boolean {
    // Normalize path for ignore matching (relative, no leading slash)
    const normalizedPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    const isIgnored = ig.ignores(normalizedPath);
    // if (isIgnored) console.debug(`Ignoring: ${normalizedPath}`);
    return !isIgnored;
}

export function isAllowedExtension(filename: string): boolean {
    return config.DEFAULT_INCLUDE_PATTERNS.some(pattern => pattern.test(filename));
}

export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
```

**5. Refactor: `src/context.ts`** (Replaces `get_context.ts`)

--- ./src/context.ts ---
```typescript
import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import { Ignore } from 'ignore';
import { config } from './config';
import { readFileContent, isAllowedPath, isAllowedExtension, formatBytes } from './utils';

interface FileInfo {
  path: string;
  content: string;
  lines: number;
  size: number;
}

export async function gatherContext(rootDir: string = ".", ig: Ignore): Promise<{ context: string; files: FileInfo[]; rules: string | null }> {
  const files: FileInfo[] = [];
  let totalSize = 0;

  async function walkDirectory(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(rootDir, fullPath);

      // Skip if ignored
      if (!isAllowedPath(relativePath, ig)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walkDirectory(fullPath);
      } else if (entry.isFile()) {
        // Check extension
        if (!isAllowedExtension(entry.name)) {
          // console.debug(`Skipping ${relativePath}: Disallowed extension`);
          continue;
        }

        try {
          const fileStat = await stat(fullPath);
          if (fileStat.size > config.MAX_FILE_SIZE_BYTES) {
              console.warn(`Skipping ${relativePath}: File size (${formatBytes(fileStat.size)}) exceeds limit (${formatBytes(config.MAX_FILE_SIZE_BYTES)})`);
              continue;
          }
          if (fileStat.size === 0) {
              // console.debug(`Skipping ${relativePath}: File is empty`);
              continue; // Skip empty files
          }

          const content = await readFileContent(fullPath);
          if (content !== null) {
            const lines = content.split('\n').length;
            files.push({ path: relativePath, content, lines, size: fileStat.size });
            totalSize += fileStat.size;
          }
        } catch (e: any) {
          console.error(`Error processing file ${relativePath}: ${e.message}`);
        }
      }
    }
  }

  console.log(`Starting context scan from root: ${rootDir}`);
  await walkDirectory(rootDir);

  // Sort files by path for consistent context
  files.sort((a, b) => a.path.localeCompare(b.path));

  const contextBlocks: string[] = [];
  contextBlocks.push(`[START PROJECT CONTEXT]`);
  contextBlocks.push(`Root Directory: ${rootDir === '.' ? process.cwd() : rootDir}`);
  contextBlocks.push(`Total Files Included: ${files.length}`);
  contextBlocks.push(`Total Size Included: ${formatBytes(totalSize)}`);
  contextBlocks.push(`Timestamp: ${new Date().toISOString()}`);
  contextBlocks.push(`---`);

  contextBlocks.push(`[START FILES]`);
  for (const file of files) {
    contextBlocks.push(`[START FILE]
File: ${file.path}
Lines: ${file.lines}
Size: ${formatBytes(file.size)}
Content:
\`\`\`${file.path.split('.').pop()}
${file.content}
\`\`\`
[END FILE]`);
  }
  contextBlocks.push(`[END FILES]`);

  // Add .dafcr rules if they exist
  const rules = await readFileContent(join(rootDir, config.DAFC_RULES_FILE));
  if (rules) {
    console.log(`Including rules from ${config.DAFC_RULES_FILE}`);
    contextBlocks.push(`---`);
    contextBlocks.push(`[START RULES]
File: ${config.DAFC_RULES_FILE}
Content:
\`\`\`
${rules}
\`\`\`
[END RULES]`);
  } else {
    console.log(`No ${config.DAFC_RULES_FILE} found, proceeding without custom rules.`);
  }

  contextBlocks.push(`[END PROJECT CONTEXT]`);

  console.log(`Context gathered: ${files.length} files, ${formatBytes(totalSize)}.`);

  return { context: contextBlocks.join('\n\n'), files, rules };
}
```

**6. Refactor: `src/llm.ts`** (Replaces `llm.ts`)

--- ./src/llm.ts ---
```typescript
import { writeFile } from "fs/promises";
import OpenAI from "openai";
import { config } from './config';
import { sleep } from './utils';

const openai = new OpenAI({
  baseURL: config.API_BASE_URL,
  apiKey: config.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": config.API_REFERER,
    "X-Title": config.API_TITLE,
  },
});

export async function queryLLM(
  context: string,
  userPrompt: string,
  systemPrompt: string | null
): Promise<void> {

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Combine context and user prompt
  const combinedContent = context
    ? `Project Context:\n${context}\n\nUser Request:\n${userPrompt}`
    : userPrompt;

  messages.push({ role: "user", content: combinedContent });

  let attempt = 0;
  while (attempt < config.MAX_RETRIES) {
    try {
      console.log(
        `\nSending request to ${config.MODEL_NAME}${
          attempt > 0 ? ` (attempt ${attempt + 1}/${config.MAX_RETRIES})` : ""
        }...`
      );
      const startTime = Date.now();

      const stream = await openai.chat.completions.create({
        model: config.MODEL_NAME,
        messages,
        temperature: config.TEMPERATURE,
        stream: true,
      });

      let fullResponse = "";
      process.stdout.write("\nLLM Response: ");

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        process.stdout.write(content); // Stream to console
        fullResponse += content;
      }

      // Write complete response to file
      await writeFile(config.RESPONSE_FILE, fullResponse, "utf-8");
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n\n✅ Response stream complete (${elapsed}s).`);
      console.log(`   Full response saved to ${config.RESPONSE_FILE}`);
      console.log("-".repeat(40));
      return; // Success - exit the retry loop

    } catch (error: any) {
      console.error("\n❌ LLM API Error:");

      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        const errorMsg = error.response.data?.error?.message || error.message;
        console.error(`Message: ${errorMsg}`);

        if (error.response.status === 401) {
          console.error("\nAuthentication Failed. Please verify:");
          console.error("1. Your OPENROUTER_API_KEY in .env or environment is correct.");
          console.error("2. You have sufficient credits on OpenRouter.");
          console.error("3. The model name is correct and available.");
          process.exit(1); // Don't retry auth errors
        }
        if (error.response.status === 402) {
             console.error("\nPayment Required. Check your OpenRouter credits.");
             process.exit(1);
        }
        if (error.response.status === 429) {
             console.error("\nRate Limited. Please wait before trying again.");
             // Exponential backoff will handle retry delay
        }

      } else if (error.code === 'ENOTFOUND' || error.message.includes("fetch failed")) {
        console.error("Network error - Could not reach API endpoint. Check connection and API_BASE_URL.");
      }
       else {
        console.error(error.message);
      }

      attempt++;
      if (attempt >= config.MAX_RETRIES) {
        console.error(`\nFailed after ${config.MAX_RETRIES} attempts. Exiting.`);
        process.exit(1);
      }

      const delay = config.BASE_DELAY * Math.pow(2, attempt -1); // Exponential backoff
      console.log(`\nRetrying in ${delay / 1000} seconds...`);
      await sleep(delay);
    }
  }
}
```

**7. New File: `src/cli.ts`** (Main Entry Point)

--- ./src/cli.ts ---
```typescript
#!/usr/bin/env bun
import { Command } from 'commander';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { gatherContext } from './context';
import { queryLLM } from './llm';
import { createIgnoreFilter, readFileContent } from './utils';
import { config } from './config';
// Dynamically import package.json to get version
import pkg from '../package.json';

const program = new Command();

program
  .name('dafc')
  .version(pkg.version)
  .description('DAFC CLI - Interact with LLMs using your entire codebase as context.');

program
  .command('ask <prompt>')
  .description('Ask the LLM a question using the current directory\'s context.')
  .action(async (prompt: string) => {
    console.log('DAFC - Dumb as Fuck Coder');
    console.log('--------------------------');
    const rootDir = process.cwd();
    try {
      const ig = await createIgnoreFilter(rootDir);
      const { context, files, rules } = await gatherContext(rootDir, ig);

      if (files.length === 0) {
          console.warn("Warning: No files were included in the context. Check your include patterns and ignore files.");
          // Optionally exit or proceed with only prompt + rules
      }

      await queryLLM(context, prompt, rules);
    } catch (error: any) {
      console.error(`\n❌ An unexpected error occurred: ${error.message}`);
      if (error.stack) {
          console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('context')
  .description('Gather context and print it to stdout (what the LLM sees).')
  .action(async () => {
    console.log('Gathering context...');
    const rootDir = process.cwd();
     try {
        const ig = await createIgnoreFilter(rootDir);
        const { context, files } = await gatherContext(rootDir, ig);

        if (files.length === 0) {
            console.warn("Warning: No files were included in the context. Check your include patterns and ignore files.");
        } else {
            console.log("\n--- START CONTEXT ---");
            console.log(context);
            console.log("--- END CONTEXT ---");
        }
     } catch (error: any) {
        console.error(`\n❌ Error gathering context: ${error.message}`);
        process.exit(1);
     }
  });

program
  .command('init')
  .description('Initialize DAFC config files (.dafcignore, .dafcr) in the current directory.')
  .action(async () => {
    const rootDir = process.cwd();
    const dafcignorePath = join(rootDir, config.DAFC_IGNORE_FILE);
    const dafcrPath = join(rootDir, config.DAFC_RULES_FILE);

    const defaultDafcignore = `# DAFC Ignore File
# Add files/directories specific to DAFC context generation to ignore
# Syntax is the same as .gitignore

# Example: Ignore large data files or build artifacts not caught by .gitignore
# data/
# *.log
# temp/

# Ignore the response file itself
${config.RESPONSE_FILE}
`;

    const defaultDafcr = `[START SYSTEM PROMPT]
You are an expert software engineer. You are helping a user with their codebase.
The user has provided their entire project context below.
Analyze the code and the user's request carefully.
Provide concise, accurate, and actionable responses.
If generating code, ensure it matches the project's style and conventions.
If the request is unclear, ask clarifying questions.
Think step-by-step before generating the final response.
Output the response in Markdown format. For code blocks, specify the language.
[END SYSTEM PROMPT]

[START INSTRUCTIONS]
- Adhere to the DAFC principles: keep code simple, modular, and within limits (e.g., <500 lines/file if possible).
- Focus on minimum viable functionality.
- Ensure code is clear, readable, and self-documenting.
- If refactoring is needed (e.g., splitting large files), provide clear instructions and the refactored code.
- Return full code for modified or new files in separate Markdown code blocks like the example below.
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
      // Check if files exist
      const dafcignoreExists = await readFileContent(dafcignorePath);
      const dafcrExists = await readFileContent(dafcrPath);

      if (dafcignoreExists === null) {
        await writeFile(dafcignorePath, defaultDafcignore, 'utf-8');
        console.log(`✅ Created default ${config.DAFC_IGNORE_FILE}`);
      } else {
        console.log(`ℹ️ ${config.DAFC_IGNORE_FILE} already exists, skipping.`);
      }

      if (dafcrExists === null) {
        await writeFile(dafcrPath, defaultDafcr, 'utf-8');
        console.log(`✅ Created default ${config.DAFC_RULES_FILE}`);
      } else {
        console.log(`ℹ️ ${config.DAFC_RULES_FILE} already exists, skipping.`);
      }

      console.log("\nInitialization complete. You can customize these files.");
      console.log(`- Edit ${config.DAFC_IGNORE_FILE} to exclude more files/folders from the context.`);
      console.log(`- Edit ${config.DAFC_RULES_FILE} to provide custom instructions or system prompts to the LLM.`);

    } catch (error: any) {
      console.error(`\n❌ Error initializing config files: ${error.message}`);
      process.exit(1);
    }
  });

// Make 'ask' the default command if no other command is specified
// This requires checking if args indicate a command or just a prompt
const args = process.argv.slice(2);
const knownCommands = program.commands.map(cmd => cmd.name());

// If the first argument is not a known command and not help/version flags, assume it's a prompt for 'ask'
if (args.length > 0 && !knownCommands.includes(args[0]) && args[0] !== '-h' && args[0] !== '--help' && args[0] !== '-v' && args[0] !== '--version') {
    // Prepend 'ask' to the arguments to trigger the ask command
    process.argv.splice(2, 0, 'ask');
} else if (args.length === 0) {
    // Show help if no arguments are given
    process.argv.push('--help');
}


program.parse(process.argv);
```

**8. New File: `install.sh`** (For Linux/macOS)

--- ./install.sh ---
```bash
#!/bin/bash

# DAFC CLI Installer Script

set -e # Exit immediately if a command exits with a non-zero status.

REPO_URL="[YOUR_REPO_URL_HERE]" # Replace with your actual repo URL
INSTALL_DIR="/usr/local/bin"    # Default install location (requires sudo)
# Alternative: INSTALL_DIR="$HOME/.local/bin" # User-local install (ensure $HOME/.local/bin is in PATH)
# Alternative: INSTALL_DIR="$HOME/.bun/bin"   # Install alongside bun itself

echo "DAFC CLI Installer"
echo "=================="

# --- Helper Functions ---
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

ensure_dir_exists() {
    if [ ! -d "$1" ]; then
        echo "Creating installation directory: $1"
        # Use sudo if installing to system location
        if [[ "$1" == /usr/local/* ]] || [[ "$1" == /opt/* ]]; then
            sudo mkdir -p "$1"
            sudo chown "$(whoami)" "$1" # Temporarily own to avoid sudo later if possible
        else
             mkdir -p "$1"
        fi
    fi
     # Check if directory is writable
    if [ ! -w "$1" ]; then
        echo "Error: Installation directory $1 is not writable."
        echo "Try running the script with sudo, or choose a different INSTALL_DIR like $HOME/.local/bin"
        exit 1
    fi
}

add_to_path_instructions() {
    local dir_to_add="$1"
    echo ""
    echo "IMPORTANT: Ensure '$dir_to_add' is in your system's PATH."
    echo "You might need to add it to your shell configuration file (e.g., ~/.bashrc, ~/.zshrc, ~/.profile):"
    echo ""
    echo "  export PATH=\"$dir_to_add:\$PATH\""
    echo ""
    echo "After adding it, restart your terminal or run 'source ~/.your_shell_rc_file'."
}


# --- Pre-flight Checks ---
echo "Checking prerequisites..."

# 1. Check for Bun
if ! command_exists bun; then
    echo "Error: Bun runtime is not installed or not found in PATH."
    echo "Please install Bun first: https://bun.sh/docs/installation"
    exit 1
fi
echo "✅ Bun found: $(bun --version)"

# 2. Check for Git (needed for cloning)
if ! command_exists git; then
    echo "Error: Git is not installed or not found in PATH."
    echo "Please install Git."
    exit 1
fi
echo "✅ Git found"

# 3. Check for sudo if needed for default install dir
if [[ "$INSTALL_DIR" == /usr/local/* ]] || [[ "$INSTALL_DIR" == /opt/* ]]; then
    if ! command_exists sudo; then
        echo "Warning: sudo command not found, but needed for default install directory ($INSTALL_DIR)."
        echo "Attempting without sudo, but may fail. Consider changing INSTALL_DIR."
    fi
fi


# --- Installation ---
TEMP_DIR=$(mktemp -d)
echo "Cloning repository into temporary directory: $TEMP_DIR"
git clone --depth 1 "$REPO_URL" "$TEMP_DIR"
cd "$TEMP_DIR"

echo "Installing dependencies..."
bun install --frozen-lockfile # Use lockfile for reproducibility

echo "Building executable..."
bun run build # This runs the build script in package.json

# Check if build was successful
if [ ! -f "./dafc" ]; then
    echo "Error: Build failed. Executable 'dafc' not found."
    cd ..
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Build successful."

# Ensure installation directory exists and is writable
ensure_dir_exists "$INSTALL_DIR"

INSTALL_PATH="$INSTALL_DIR/dafc"
echo "Installing 'dafc' to $INSTALL_PATH..."

# Use sudo if installing to system location
if [[ "$INSTALL_DIR" == /usr/local/* ]] || [[ "$INSTALL_DIR" == /opt/* ]]; then
    sudo mv ./dafc "$INSTALL_PATH"
    sudo chmod +x "$INSTALL_PATH"
else
    mv ./dafc "$INSTALL_PATH"
    chmod +x "$INSTALL_PATH"
fi

# --- Cleanup ---
echo "Cleaning up temporary files..."
cd ..
rm -rf "$TEMP_DIR"

# --- Post-installation ---
echo ""
echo "✅ DAFC CLI installed successfully to $INSTALL_PATH!"
echo ""
echo "You can now use the 'dafc' command."
echo "Try running: dafc --version"
echo "Or get started: dafc init"

# Check if install dir is likely in PATH
if ! command_exists dafc; then
     add_to_path_instructions "$INSTALL_DIR"
fi

echo ""
echo "Remember to set your OPENROUTER_API_KEY environment variable!"
echo "See README for details."
echo ""

exit 0
```
*Action:* Replace `[YOUR_REPO_URL_HERE]` with your actual repository URL. Make this script executable (`chmod +x install.sh`).

**9. New File: `.github/workflows/release.yml`**

--- ./.github/workflows/release.yml ---
```yaml
name: Release DAFC CLI

on:
  push:
    tags:
      - 'v*.*.*' # Trigger on version tags like v0.1.0

jobs:
  build-release:
    name: Build and Release Binaries
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        # Define build targets
        include:
          - os: ubuntu-latest
            target: linux-x64
            asset_name: dafc-linux-x64
          - os: macos-latest # Usually defaults to x64 on GitHub Actions runners
            target: macos-x64
            asset_name: dafc-macos-x64
          # Add macos-arm64 if you have runners or cross-compilation setup
          # - os: macos-latest # Requires specific runner or cross-compile setup
          #   target: macos-arm64
          #   asset_name: dafc-macos-arm64

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest # Or pin to a specific version

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build executable for ${{ matrix.target }}
        run: bun build ./src/cli.ts --compile --outfile ${{ matrix.asset_name }} --target ${{ matrix.target }}

      - name: Check if executable exists
        run: ls -l ${{ matrix.asset_name }}

      - name: Create Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref_name }} # Use the tag that triggered the workflow
          release_name: Release ${{ github.ref_name }}
          body: |
            Release of DAFC CLI version ${{ github.ref_name }}.
            Download the appropriate binary for your system below.
            See README.md for installation and usage instructions.
          draft: false
          prerelease: contains(github.ref_name, '-') # Mark as pre-release if tag contains '-' (e.g., v0.1.0-beta)

      - name: Upload Release Asset (${{ matrix.asset_name }})
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./${{ matrix.asset_name }}
          asset_name: ${{ matrix.asset_name }}
          asset_content_type: application/octet-stream

      # Optional: Upload install script (might need adjustment to download correct binary)
      # - name: Upload Install Script
      #   if: matrix.os == 'ubuntu-latest' # Only upload once
      #   uses: actions/upload-release-asset@v1
      #   env:
      #     GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      #   with:
      #     upload_url: ${{ steps.create_release.outputs.upload_url }}
      #     asset_path: ./install.sh
      #     asset_name: install.sh
      #     asset_content_type: application/x-shellscript
```

**10. Update `README.md`**

Rewrite the README significantly to reflect the new CLI structure, installation, and configuration.

--- ./README.md ---
```markdown
# DAFC CLI (vX.Y.Z) - Dumb as Fuck Coding Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/[YOUR_USERNAME]/[YOUR_REPO_NAME])](https://github.com/[YOUR_USERNAME]/[YOUR_REPO_NAME]/releases/latest)

**DAFC** is a command-line tool and a methodology designed to leverage the massive context windows of modern Large Language Models (LLMs) like Gemini 2.5 Pro. Instead of complex context management, DAFC lets you easily dump your *entire* (but small!) codebase into the LLM prompt for querying, code generation, analysis, and more.

**Read the full philosophy and background in the [introductory blog post](https://avisantoso.com/gemini-and-context-windows).**

---

## Core Idea: Constraints Unlock Full Context

The "Dumb as Fuck Coding" methodology hinges on keeping projects simple and constrained:

*   **Max ~500 Lines / File:** Keeps individual units manageable.
*   **Max ~50 Files (Aim for ~10):** Limits overall scope.
*   **Max ~5 Database Tables (Aim for 3, excluding users):** Simplifies the data model.

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
    curl -fsSL [RAW_INSTALL_SCRIPT_URL] | bash
    ```
    *(Replace `[RAW_INSTALL_SCRIPT_URL]` with the raw URL of your `install.sh` file on GitHub, e.g., `https://raw.githubusercontent.com/your-user/your-repo/main/install.sh`)*

3.  Follow any on-screen instructions, especially regarding adding the installation directory to your PATH if needed.
4.  Restart your terminal or source your shell profile (`source ~/.bashrc`, `source ~/.zshrc`, etc.).
5.  Verify installation: `dafc --version`

### Manual Installation / From Source

1.  Ensure **Bun** and **Git** are installed.
2.  Clone the repository:
    ```bash
    git clone [YOUR_REPO_URL]
    cd dafc-cli # Or your repo directory name
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

### From Releases

Download the pre-compiled binary for your system from the [Releases Page](https://github.com/[YOUR_USERNAME]/[YOUR_REPO_NAME]/releases/latest), make it executable (`chmod +x dafc-<os>-<arch>`), and move it into your PATH.

## Configuration

1.  **API Key (Required):** DAFC needs an OpenRouter API key.
    *   Get a key from [https://openrouter.ai/keys](https://openrouter.ai/keys).
    *   Set it as an environment variable. The recommended way is to create a `.env` file in your **project's root directory** (the directory where you run `dafc`):
        ```dotenv
        # .env
        OPENROUTER_API_KEY='your-key-here'

        # Optional: Override the default model
        # OPENAI_MODEL='anthropic/claude-3.5-sonnet'
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

**2. View Context:**

See exactly what context is being gathered and sent to the LLM (useful for debugging).

```bash
dafc context
```

**3. Initialize Config Files:**

Creates `.dafcignore` and `.dafcr` with default templates if they don't exist.

```bash
dafc init
```

## How It Works

1.  **`dafc ask "prompt"`:**
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

*(Consider adding more specific contribution guidelines later: coding style, testing requirements, etc.)*

## Disclaimer

This tool sends your code (excluding ignored files) to external Large Language Models (via OpenRouter).
*   **Do not use this tool if your codebase contains sensitive information** (secrets, PII, etc.) that should not leave your environment. Standard security practices apply: keep secrets out of your code and use `.gitignore` / `.dafcignore` appropriately. Use a `.env` file for API keys.
*   Use this tool responsibly and at your own risk. LLM outputs may contain errors or security vulnerabilities – **always review generated code carefully.**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
```
*Action:* Replace `[YOUR_USERNAME]/[YOUR_REPO_NAME]`, `[YOUR_REPO_URL]`, and `[RAW_INSTALL_SCRIPT_URL]` placeholders. Update the version number (`vX.Y.Z`) as needed.

**11. Final Steps:**

*   Delete the original `llm.ts` and `get_context.ts` from the root.
*   Delete `context.txt` (it's no longer generated by default).
*   Update the `LICENSE` file if necessary.
*   Create a `.env.example` file:
    ```dotenv
    # .env.example
    # Copy this file to .env and fill in your API key
    OPENROUTER_API_KEY='your-openrouter-api-key-here'
    # Optional: Specify a different model compatible with OpenRouter API
    # OPENAI_MODEL='google/gemini-flash-1.5'
    ```
*   Add `.env` to your main `.gitignore` file.
*   Test the commands: `bun run src/cli.ts --version`, `bun run src/cli.ts init`, `bun run src/cli.ts context`, `bun run src/cli.ts ask "hello"`
*   Test the build: `bun run build` and then run the executable `./dafc --version`.
*   Test the installation script locally if possible.
*   Commit changes, push, tag a release (e.g., `git tag v0.1.0`, `git push origin v0.1.0`) to trigger the GitHub Action.

This comprehensive refactoring creates a proper CLI tool, implements the requested features, and sets up a release process. Remember to replace all placeholders with your actual information.