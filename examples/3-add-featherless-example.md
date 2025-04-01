Okay, I understand the requirements. You want to make the DAFC CLI more flexible regarding the LLM provider by using standard OpenAI-compatible environment variables (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_API_BASE`), add a maximum context limit check, update the default model, and update the documentation accordingly, including an example for using Featherless.

Here are the instructions and the updated code for the necessary files:

**Instructions:**

1.  **Replace the content** of the following files with the code provided below:
    *   `src/config.ts`
    *   `src/utils.ts`
    *   `src/context.ts`
    *   `src/cli.ts`
    *   `src/llm.ts`
    *   `README.md`
    *   `install.sh`
2.  **Review** the changes, especially in `README.md` and `config.ts`, to ensure they match your expectations for defaults and instructions.
3.  **Rebuild** the CLI using `bun run build`.
4.  **Test** the `dafc ask`, `dafc context`, and `dafc init` commands. Ensure the environment variable changes and context limit work as expected.

---

**Updated Files:**

--- ./src/config.ts ---
```typescript
import dotenv from "dotenv";

// Load .env file from current working directory or project root
dotenv.config({ path: process.cwd() + "/.env", override: true });
dotenv.config({ override: true }); // Load default .env if specific one not found

export const config = {
  // LLM Settings - Uses OpenAI standard env variables where possible
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "", // Use standard OpenAI key name
  MODEL_NAME: process.env.OPENAI_MODEL || "google/gemini-2.5-pro-exp-03-25:free", // Default to large context model on OpenRouter
  API_BASE_URL: process.env.OPENAI_API_BASE || "https://openrouter.ai/api/v1", // Default to OpenRouter
  TEMPERATURE: 0.3,
  MAX_RETRIES: 5,
  BASE_DELAY: 1000, // ms

  // Context Handling
  MAX_CONTEXT_TOKENS: 900000, // Set a safety margin below 1M tokens for Gemini 2.5 Pro
  // Simple approximation: 1 token ~= 4 chars. Adjust if needed.
  APPROX_CHARS_PER_TOKEN: 4,
  RESPONSE_FILE: "response.md",
  DAFC_IGNORE_FILE: ".dafcignore",
  DAFC_RULES_FILE: ".dafcr",
  GIT_IGNORE_FILE: ".gitignore",
  DEFAULT_IGNORE_DIRS: new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "out",
    "coverage",
    "vendor", // Common dependency folder for other languages
    "__pycache__",
    ".venv",
    ".env", // Exclude virtual envs
  ]),
  DEFAULT_IGNORE_FILES: new Set([
    ".DS_Store",
    "response.md",
    "context.md", // Default context output file
    ".env", // Exclude environment file itself
    "*.lock", // Exclude lock files (package-lock.json, yarn.lock, etc.)
    "*.log", // Exclude log files
  ]),
  // Add file extensions you want to include by default
  DEFAULT_INCLUDE_PATTERNS: [
    /\.ts$/,
    /\.tsx$/,
    /\.js$/,
    /\.jsx$/,
    /\.py$/,
    /\.rb$/,
    /\.php$/,
    /\.go$/,
    /\.rs$/,
    /\.java$/,
    /\.cs$/,
    /\.html$/,
    /\.css$/,
    /\.scss$/,
    /\.less$/,
    /\.json$/,
    /\.yaml$/,
    /\.yml$/,
    /\.md$/,
    /\.txt$/,
    /Dockerfile$/,
    /docker-compose\.yml$/,
    /\.sql$/,
    /\.sh$/,
    /\.bash$/,
    /Makefile$/,
    /^\.?env/, // Include .env.example etc. but DEFAULT_IGNORE_FILES excludes .env
    /^\.?config/,
    /^\.?rc$/, // Config files like .eslintrc
    /package\.json$/,
    /composer\.json$/,
    /Gemfile$/,
    /requirements\.txt$/,
    /go\.mod$/,
    /Cargo\.toml$/,
    /pom\.xml$/,
    /csproj$/, // Dependency files
  ],
  MAX_FILE_SIZE_BYTES: 1 * 1024 * 1024, // 1MB limit per file to avoid huge blobs

  // DAFC Constraints (Informational - not strictly enforced by tool yet)
  MAX_LINES_PER_FILE: 500,
  MAX_FILES: 50,
  TARGET_FILES: 10,
};

// Validate essential config
if (!config.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable not set.");
  console.error("This tool requires an API key for an OpenAI-compatible service.");
  console.error("1. Obtain an API key (e.g., from OpenRouter, OpenAI, Featherless).");
  console.error("2. Create a .env file in your project root with:");
  console.error("   OPENAI_API_KEY='your-key-here'");
  console.error("   # Optional: Override model and API endpoint");
  console.error("   # OPENAI_MODEL='openai/gpt-4o'");
  console.error("   # OPENAI_API_BASE='https://api.openai.com/v1'");
  console.error("3. Or, set the environment variable directly:");
  console.error("   export OPENAI_API_KEY='your-key-here'");
  process.exit(1);
}
```

--- ./src/utils.ts ---
```typescript
import { readFile } from "fs/promises";
import { join } from "path";
import ignore, { type Ignore } from "ignore";
import { config } from "./config";

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
    // console.debug("Loaded .gitignore rules");
  }

  // Load .dafcignore
  const dafcignoreContent = await readFileContent(
    join(rootDir, config.DAFC_IGNORE_FILE)
  );
  if (dafcignoreContent) {
    ig.add(dafcignoreContent);
    // console.debug("Loaded .dafcignore rules");
  }

  return ig;
}

export function isAllowedPath(relativePath: string, ig: Ignore): boolean {
  try {
    // Normalize path for ignore matching (remove leading slash if present)
    const normalizedPath = relativePath.replace(/^[\/\\]/, "");
    const isIgnored = ig.ignores(normalizedPath);
    // console.debug(`Path: ${normalizedPath}, Ignored: ${isIgnored}`); // Debugging
    return !isIgnored;
  } catch (error) {
    console.warn(`Error checking path ${relativePath}: ${error}`);
    return false;
  }
}

export function isAllowedExtension(filename: string): boolean {
  // Ignore files starting with '.' unless explicitly allowed (like .env.example, .rc files)
  if (
    filename.startsWith(".") &&
    !config.DEFAULT_INCLUDE_PATTERNS.some((pattern) => pattern.test(filename))
  ) {
    // console.debug(`Skipping hidden file: ${filename}`); // Debugging
    return false;
  }
  const allowed = config.DEFAULT_INCLUDE_PATTERNS.some((pattern) =>
    pattern.test(filename)
  );
  // if (!allowed) console.debug(`Skipping disallowed extension: ${filename}`); // Debugging
  return allowed;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // Handle potential edge case where i might be out of bounds for sizes array
  const sizeIndex = Math.min(i, sizes.length - 1);
  return (
    parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(dm)) +
    " " +
    sizes[sizeIndex]
  );
}

// Simple debounce function
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
      timeout = null; // Clear timeout after execution
    }, wait);
  };
}

/**
 * Estimates the number of tokens in a given text.
 * Uses a simple character-based approximation.
 * @param text The text to estimate tokens for.
 * @returns The estimated number of tokens.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / config.APPROX_CHARS_PER_TOKEN);
}
```

--- ./src/context.ts ---
```typescript
import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import type { Ignore } from "ignore";
import { config } from "./config";
import {
  readFileContent,
  isAllowedPath,
  isAllowedExtension,
  formatBytes,
  estimateTokens,
} from "./utils";

interface FileInfo {
  path: string;
  content: string;
  lines: number;
  size: number;
  estimatedTokens: number;
}

export class ContextTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextTooLargeError";
  }
}

export async function gatherContext(
  rootDir: string = ".",
  ig: Ignore
): Promise<{ context: string; files: FileInfo[]; rules: string | null }> {
  const files: FileInfo[] = [];
  let totalSize = 0;
  let totalEstimatedTokens = 0;

  // Estimate tokens for the base structure/boilerplate text
  const boilerplateText = `[START PROJECT CONTEXT]
Root Directory: ${rootDir === "." ? process.cwd() : rootDir}
Total Files Included: XXXXX
Total Size Included: XXXXX
Timestamp: ${new Date().toISOString()}
---
[START FILES]
[END FILES]
---
[START RULES]
File: ${config.DAFC_RULES_FILE}
Content:
\`\`\`
RULES_PLACEHOLDER
\`\`\`
[END RULES]
[END PROJECT CONTEXT]`;
  totalEstimatedTokens += estimateTokens(boilerplateText);

  // Add tokens for rules file if it exists
  const rulesPath = join(rootDir, config.DAFC_RULES_FILE);
  const rulesContent = await readFileContent(rulesPath);
  if (rulesContent) {
    totalEstimatedTokens += estimateTokens(rulesContent);
    // Check limit early if rules file is huge
    if (totalEstimatedTokens > config.MAX_CONTEXT_TOKENS) {
      throw new ContextTooLargeError(
        `Context limit (${
          config.MAX_CONTEXT_TOKENS
        } tokens) exceeded by rules file (${config.DAFC_RULES_FILE}) alone. Estimated tokens: ${totalEstimatedTokens}.`
      );
    }
  }

  async function walkDirectory(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(rootDir, fullPath);

      // Skip if ignored
      if (!isAllowedPath(relativePath, ig)) {
        // console.debug(`Ignoring path: ${relativePath}`);
        continue;
      }

      if (entry.isDirectory()) {
        await walkDirectory(fullPath);
      } else if (entry.isFile()) {
        // Check extension
        if (!isAllowedExtension(entry.name)) {
          continue;
        }

        try {
          const fileStat = await stat(fullPath);
          if (fileStat.size > config.MAX_FILE_SIZE_BYTES) {
            console.warn(
              `Skipping ${relativePath}: File size (${formatBytes(
                fileStat.size
              )}) exceeds limit (${formatBytes(config.MAX_FILE_SIZE_BYTES)})`
            );
            continue;
          }
          if (fileStat.size === 0) {
            continue; // Skip empty files
          }

          const content = await readFileContent(fullPath);
          if (content !== null) {
            const lines = content.split("\n").length;
            const estimatedFileTokens = estimateTokens(content);
            const fileBoilerplateTokens = estimateTokens(`[START FILE]
File: ${relativePath}
Lines: ${lines}
Size: ${formatBytes(fileStat.size)}
Content:
\`\`\`${relativePath.split(".").pop()}

\`\`\`
[END FILE]`);

            // Check token limit BEFORE adding the file
            if (
              totalEstimatedTokens + estimatedFileTokens + fileBoilerplateTokens >
              config.MAX_CONTEXT_TOKENS
            ) {
              throw new ContextTooLargeError(
                `Context limit (${
                  config.MAX_CONTEXT_TOKENS
                } tokens) exceeded while adding file: ${relativePath}. Current estimated tokens: ${totalEstimatedTokens}. File estimated tokens: ${estimatedFileTokens}. Aborting.`
              );
            }

            // Add file info and update totals
            files.push({
              path: relativePath,
              content,
              lines,
              size: fileStat.size,
              estimatedTokens: estimatedFileTokens,
            });
            totalSize += fileStat.size;
            totalEstimatedTokens += estimatedFileTokens + fileBoilerplateTokens;
          }
        } catch (e: any) {
          // If the error is ContextTooLargeError, rethrow it
          if (e instanceof ContextTooLargeError) {
            throw e;
          }
          console.error(`Error processing file ${relativePath}: ${e.message}`);
        }
      }
    }
  }

  console.log(`Starting context scan from root: ${rootDir}`);
  console.log(
    `Max context limit set to approximately ${config.MAX_CONTEXT_TOKENS} tokens.`
  );

  // Wrap walkDirectory in a try...catch to handle the ContextTooLargeError
  try {
    await walkDirectory(rootDir);
  } catch (error) {
    if (error instanceof ContextTooLargeError) {
      console.error(`\n❌ ${error.message}`);
      console.error(
        "Consider excluding more files/directories using .gitignore or .dafcignore, or simplifying your project."
      );
    } else {
      console.error(`\n❌ An unexpected error occurred during context scan:`, error);
    }
    // Re-throw the specific error for the CLI to handle exit
    throw error;
  }


  // Sort files by path for consistent context
  files.sort((a, b) => a.path.localeCompare(b.path));

  const contextBlocks: string[] = [];
  contextBlocks.push(`[START PROJECT CONTEXT]`);
  contextBlocks.push(
    `Root Directory: ${rootDir === "." ? process.cwd() : rootDir}`
  );
  contextBlocks.push(`Total Files Included: ${files.length}`);
  contextBlocks.push(`Total Size Included: ${formatBytes(totalSize)}`);
  contextBlocks.push(`Total Estimated Tokens: ${totalEstimatedTokens}`); // Add token count
  contextBlocks.push(`Timestamp: ${new Date().toISOString()}`);
  contextBlocks.push(`---`);

  contextBlocks.push(`[START FILES]`);
  for (const file of files) {
    contextBlocks.push(`[START FILE]
File: ${file.path}
Lines: ${file.lines}
Size: ${formatBytes(file.size)}
Content:
\`\`\`${file.path.split(".").pop() || ""}
${file.content}
\`\`\`
[END FILE]`);
  }
  contextBlocks.push(`[END FILES]`);

  // Add .dafcr rules if they exist (rulesContent already fetched)
  if (rulesContent) {
    console.log(`Including rules from ${config.DAFC_RULES_FILE}`);
    contextBlocks.push(`---`);
    contextBlocks.push(`[START RULES]
File: ${config.DAFC_RULES_FILE}
Content:
\`\`\`
${rulesContent}
\`\`\`
[END RULES]`);
  } else {
    console.log(
      `No ${config.DAFC_RULES_FILE} found, proceeding without custom rules.`
    );
  }

  contextBlocks.push(`[END PROJECT CONTEXT]`);

  console.log(
    `Context gathered: ${files.length} files, ${formatBytes(
      totalSize
    )}, ~${totalEstimatedTokens} tokens.`
  );

  return { context: contextBlocks.join("\n\n"), files, rules: rulesContent };
}
```

--- ./src/cli.ts ---
```typescript
#!/usr/bin/env bun
import { Command, Option } from "commander";
import { writeFile, watch } from "fs/promises";
import { join, resolve } from "path";
import clipboard from "clipboardy";
import { gatherContext, ContextTooLargeError } from "./context"; // Import error type
import { queryLLM } from "./llm";
import { createIgnoreFilter, readFileContent, debounce } from "./utils";
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

program
  .command("ask <prompt>")
  .description("Ask the LLM a question using the current directory's context.")
  .action(async (prompt: string) => {
    console.log("DAFC - Dumb as Fuck Coder");
    console.log("--------------------------");
    const rootDir = process.cwd();
    try {
      const ig = await createIgnoreFilter(rootDir);
      const { context, files, rules } = await gatherContext(rootDir, ig);

      if (files.length === 0) {
        console.warn(
          "Warning: No files were included in the context. Check your include patterns and ignore files (.gitignore, .dafcignore)."
        );
        // Proceeding with only prompt + rules might still be useful
      }

      await queryLLM(context, prompt, rules);
    } catch (error: any) {
      // Handle specific context too large error
      if (error instanceof ContextTooLargeError) {
        // Message already logged by gatherContext
        process.exit(1);
      }
      // Handle other errors
      console.error(`\n❌ An unexpected error occurred: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command("context")
  .description("Gather context and print, save, copy, or watch it.")
  .addOption(
    new Option(
      "-s, --save [outputFile]",
      "Save context to a file (default: context.md)"
    ).argParser((value) => value || "context.md") // Set default if flag exists but no value
  )
  .option(
    "-w, --watch",
    "Watch for file changes and update the saved context file (requires --save)"
  )
  .option("-c, --copy", "Copy the context to the clipboard")
  .action(async (opts: { save?: string; watch?: boolean; copy?: boolean }) => {
    const rootDir = process.cwd();
    console.log("Gathering context...");

    const performGatherAndOutput = async (
      isInitialRun = true
    ): Promise<string | null> => {
      try {
        const ig = await createIgnoreFilter(rootDir); // Recreate filter in case ignores change
        const { context, files } = await gatherContext(rootDir, ig);

        if (files.length === 0 && isInitialRun) {
          console.warn(
            "Warning: No files were included in the context. Check your include patterns and ignore files (.gitignore, .dafcignore)."
          );
        }

        // Handle output based on flags
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

        // Copy only on initial run or if not watching
        if (opts.copy && (isInitialRun || !opts.watch)) {
          await clipboard.write(context);
          console.log("✅ Context copied to clipboard.");
        }

        // Print to stdout only if no other action is taken or if not watching
        if (!opts.save && !opts.copy && !opts.watch) {
          console.log("\n--- START CONTEXT ---");
          console.log(context);
          console.log("--- END CONTEXT ---");
        }
        return context; // Return context for potential reuse
      } catch (error: any) {
         // Handle specific context too large error
        if (error instanceof ContextTooLargeError) {
            // Message already logged by gatherContext
            if (!opts.watch) process.exit(1); // Exit if not watching
            return null; // Indicate error in watch mode
        }
        // Handle other errors
        console.error(`\n❌ Error gathering context: ${error.message}`);
        if (!opts.watch) process.exit(1); // Exit if not watching
        return null; // Indicate error in watch mode
      }
    };

    // Initial context generation and output
    await performGatherAndOutput(true);

    // Handle watching if requested
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
      ); // Debounce regeneration

      try {
        const igForWatch = await createIgnoreFilter(rootDir); // Initial ignore filter for watcher
        const watcher = watch(rootDir, { recursive: true });
        for await (const event of watcher) {
          const eventFilename = event.filename || "";
          const eventPath = resolve(rootDir, eventFilename);
          const savePath = resolve(rootDir, opts.save);

          // Basic check: ignore changes to the output file itself
          if (eventPath === savePath) {
            continue;
          }

          // More robust check using the ignore filter
          // Need relative path for ignore check
          const relativeEventPath = relative(rootDir, eventPath);
          if (!isAllowedPath(relativeEventPath, igForWatch)) {
             // console.log(`Ignoring change in ignored path: ${relativeEventPath}`); // Debug
             continue;
          }

          // console.log(`Detected ${event.eventType} in ${event.filename}`); // Debug logging
          debouncedRegenerate();
        }
      } catch (error: any) {
        console.error(`\n❌ File watcher error: ${error.message}`);
        process.exit(1);
      }
    }
  });

program
  .command("init")
  .description(
    "Initialize DAFC config files (.dafcignore, .dafcr) in the current directory."
  )
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
# vendor/
# __pycache__/
# *.lock
# *.log

# Ignore the response file itself
${config.RESPONSE_FILE}

# Ignore default context output file
context.md

# Ignore environment file
.env
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
Adhere to the DAFC principles: keep code simple, modular, and within limits (e.g., <500 lines/file if possible).
[END SYSTEM PROMPT]

[START INSTRUCTIONS]
- Focus on minimum viable functionality.
- Ensure code is clear, readable, and self-documenting.
- If refactoring is needed (e.g., splitting large files), provide clear instructions and the refactored code.
- Return full code for modified or new files in separate Markdown code blocks like the example below. Do not skip lines or sections.
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
      console.log(
        `- Edit ${config.DAFC_IGNORE_FILE} to exclude more files/folders from the context.`
      );
      console.log(
        `- Edit ${config.DAFC_RULES_FILE} to provide custom instructions or system prompts to the LLM.`
      );
    } catch (error: any) {
      console.error(`\n❌ Error initializing config files: ${error.message}`);
      process.exit(1);
    }
  });

// Make 'ask' the default command if no other command is specified
// This requires checking if args indicate a command or just a prompt
const args = process.argv.slice(2);
const knownCommands = program.commands.map((cmd) => cmd.name());

// If the first argument is not a known command and not help/version flags, assume it's a prompt for 'ask'
if (
  args.length > 0 &&
  !knownCommands.includes(args[0]) &&
  args[0] !== "-h" &&
  args[0] !== "--help" &&
  args[0] !== "-v" &&
  args[0] !== "--version" &&
  !args[0].startsWith("-") // Ensure it's not an option for the default command
) {
  // Prepend 'ask' to the arguments to trigger the ask command
  process.argv.splice(2, 0, "ask");
} else if (args.length === 0) {
  // Show help if no arguments are given
  program.help(); // Use commander's help display
}

program.parse(process.argv);
```

--- ./src/llm.ts ---
```typescript
import { writeFile } from "fs/promises";
import OpenAI from "openai";
import { config } from "./config";
import { sleep } from "./utils";

// Ensure API key is present before initializing OpenAI client
if (!config.OPENAI_API_KEY) {
  console.error("FATAL: OPENAI_API_KEY is not configured. Exiting.");
  process.exit(1);
}

const openai = new OpenAI({
  baseURL: config.API_BASE_URL,
  apiKey: config.OPENAI_API_KEY, // Use the configured API key
  defaultHeaders: {
    // Add headers recommended by OpenRouter
    "HTTP-Referer": "https://github.com/AviSantoso/dafc", // Replace with your app URL or repo
    "X-Title": "DAFC CLI", // Replace with your app name
  },
});

export async function queryLLM(
  context: string,
  userPrompt: string,
  systemPrompt: string | null // Allow system prompt to be null
): Promise<void> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  // Add system prompt if provided
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Combine context and user prompt for the user message
  // Ensure context isn't accidentally empty causing double newlines
  const userMessageContent = context
    ? `Project Context:\n${context}\n\n---\n\nUser Request:\n${userPrompt}`
    : `User Request:\n${userPrompt}`;

  messages.push({ role: "user", content: userMessageContent });

  let attempt = 0;
  while (attempt < config.MAX_RETRIES) {
    try {
      console.log(
        `\nSending request to model '${config.MODEL_NAME}' via ${config.API_BASE_URL}${
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

      // Check for OpenAI specific error structure first
      if (error instanceof OpenAI.APIError) {
        console.error(`Status: ${error.status}`);
        console.error(`Type: ${error.type}`);
        console.error(`Code: ${error.code}`);
        console.error(`Message: ${error.message}`);

        if (error.status === 401) {
          console.error("\nAuthentication Failed. Please verify:");
          console.error(
            "1. Your OPENAI_API_KEY in .env or environment is correct for the service at OPENAI_API_BASE."
          );
          console.error("2. You have sufficient credits/permissions.");
          console.error("3. The model name is correct and available via the endpoint.");
          process.exit(1); // Don't retry auth errors
        }
        if (error.status === 402) {
          console.error("\nPayment Required. Check your account credits/billing.");
          process.exit(1);
        }
        if (error.status === 429) {
          console.error("\nRate Limited or Quota Exceeded. Please wait before trying again or check your limits.");
          // Exponential backoff will handle retry delay
        }
        if (error.status === 400 && error.code === 'context_length_exceeded') {
             console.error("\nContext Length Exceeded. The model cannot handle the amount of context provided.");
             console.error("Try excluding more files/directories or simplifying your request.");
             process.exit(1); // Don't retry context length errors
        }

      } else if (error.code === "ENOTFOUND" || error.message.includes("fetch failed")) {
        // Handle generic network errors
        console.error(
          `Network error - Could not reach API endpoint (${config.API_BASE_URL}). Check connection and OPENAI_API_BASE.`
        );
      } else {
        // Handle other unexpected errors
        console.error(`An unexpected error occurred: ${error.message}`);
         if (error.stack) {
            console.error(error.stack);
         }
      }

      attempt++;
      if (attempt >= config.MAX_RETRIES) {
        console.error(
          `\nFailed after ${config.MAX_RETRIES} attempts. Exiting.`
        );
        process.exit(1);
      }

      const delay = config.BASE_DELAY * Math.pow(2, attempt); // Exponential backoff
      console.log(`\nRetrying in ${delay / 1000} seconds...`);
      await sleep(delay);
    }
  }
}
```

--- ./README.md ---
```md
# DAFC (The Fuck?) CLI - Dumb as Fuck Coding Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/npm/v/dafc-cli)](https://www.npmjs.com/package/dafc-cli) <!-- Assuming you publish to npm -->

**DAFC** is a command-line tool and a methodology designed to leverage the massive context windows of modern Large Language Models (LLMs) like Gemini 2.5 Pro. Instead of complex context management, DAFC lets you easily dump your *entire* (but small!) codebase into the LLM prompt for querying, code generation, analysis, and more.

**Read the full philosophy and background in the [introductory blog post](https://avisantoso.com/gemini-and-context-windows).**

## Core Idea: Constraints Unlock Full Context

The "Dumb as Fuck Coding" methodology hinges on keeping projects simple and constrained:

*   **Max ~500 Lines Per File (Aim for ~300):** Keeps individual units manageable.
*   **Max ~50 Files (Aim for ~10):** Limits overall scope.
*   **Max ~5 Database Tables (Aim for 3):** Simplifies the data model. NOTE: Does not include users table.

By adhering to these rules, the *entire* relevant codebase often fits within the LLM's context window. DAFC CLI automates gathering this context, checks if it exceeds a configured limit, and interacts with the LLM.

## Features

*   **Simple CLI Interface:** Easy-to-use commands (`ask`, `context`, `init`).
*   **Automatic Context Gathering:** Recursively scans your project, respects `.gitignore` and `.dafcignore`, and includes relevant files.
*   **Context Limit Check:** Estimates token count and throws an error if it exceeds the configured maximum (`MAX_CONTEXT_TOKENS` in `src/config.ts`, defaults ~900k).
*   **Customizable Rules:** Uses a `.dafcr` file to inject system prompts or specific instructions into the LLM request.
*   **Flexible LLM Backend:** Configurable via environment variables to use any OpenAI-compatible API (OpenRouter, Featherless, OpenAI, etc.). Defaults to OpenRouter with `google/gemini-1.5-pro-latest`.
*   **LLM Interaction:** Sends context + prompt to the configured LLM. Includes streaming output and retries.
*   **Response Handling:** Streams the LLM's response to your console and saves the full response to `response.md`.
*   **Easy Installation:** Shell script for Linux/macOS.

## Installation

### Using the Install Script (Linux/macOS)

1.  Make sure you have **Bun** ([install instructions](https://bun.sh/docs/installation)) and **Git** installed.
2.  Run the following command in your terminal:

    ```bash
    # Installs to /usr/local/bin by default, may require sudo
    curl -fsSL https://raw.githubusercontent.com/AviSantoso/dafc/main/install.sh | bash
    # Or, if you prefer sudo explicitly:
    # curl -fsSL https://raw.githubusercontent.com/AviSantoso/dafc/main/install.sh | sudo bash
    ```
    *Note: The script attempts to install without `sudo` first if installing to `/usr/local/bin`, but might prompt if permissions require it.*

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

DAFC uses environment variables for configuration, typically loaded from a `.env` file in your project's root directory.

1.  **API Key (Required):** DAFC needs an API key for an OpenAI-compatible service.
    *   Get a key from your chosen provider (e.g., [OpenRouter](https://openrouter.ai/keys), [Featherless](https://console.featherless.ai/signin), [OpenAI](https://platform.openai.com/api-keys)).
    *   Set it as an environment variable. The recommended way is to create a `.env` file in your **project's root directory**:

        ```dotenv
        # .env - Example for OpenRouter (Default)
        OPENAI_API_KEY='your-openrouter-key-here'

        # --- Optional Overrides ---

        # Override the default model (defaults to google/gemini-1.5-pro-latest)
        # OPENAI_MODEL='anthropic/claude-3.5-sonnet'

        # Override the API endpoint (defaults to OpenRouter)
        # OPENAI_API_BASE='https://openrouter.ai/api/v1'
        ```

        **Example for Featherless:**
        ```dotenv
        # .env - Example for Featherless
        OPENAI_API_KEY='your-featherless-key-here'
        OPENAI_MODEL='openai/deepseek-ai/DeepSeek-V3-0324' # Or other model supported by Featherless
        OPENAI_API_BASE='https://api.featherless.ai/v1'
        ```

        **Example for OpenAI:**
         ```dotenv
        # .env - Example for OpenAI
        OPENAI_API_KEY='your-openai-key-here'
        OPENAI_MODEL='gpt-4o' # Or other OpenAI model
        OPENAI_API_BASE='https://api.openai.com/v1'
        ```

    *   Alternatively, export the variables in your shell: `export OPENAI_API_KEY='your-key-here'` etc.

2.  **Initialize Project (Optional but Recommended):** Run `dafc init` in your project's root directory. This creates:
    *   `.dafcignore`: Add file/directory patterns (like `.gitignore`) to exclude from the context sent to the LLM. Useful for excluding large files, logs, or irrelevant build artifacts not covered by `.gitignore`.
    *   `.dafcr`: Define custom system prompts or rules for the LLM. Edit this file to tailor the LLM's behavior (e.g., specify coding style, desired output format).

## Usage

Run `dafc` commands from your project's root directory.

**1. Ask the LLM (`dafc ask <prompt>` or `dafc <prompt>`)**

This is the primary command. It gathers context, checks against the token limit, includes rules from `.dafcr`, sends everything + your prompt to the configured LLM, and streams the response.

```bash
# Ask a question about the code (default command is 'ask')
dafc "How does the authentication logic in user.ts work?"

# Request code generation
dafc ask "Generate a new API endpoint in routes/items.ts to delete an item by ID. Use the existing database connection."

# Ask for refactoring help
dafc "Refactor the main function in cli.ts to be more modular."

# Get help running the project
dafc "What are the steps to run this project locally?"
```

The LLM response will be streamed to your terminal and saved completely in `response.md`. If the gathered context exceeds the configured limit (`MAX_CONTEXT_TOKENS`), the command will abort with an error before contacting the LLM.

**2. View and Manage Context (`dafc context`)**

See exactly what context is being gathered, save it, copy it, or watch for changes. This command also respects the `MAX_CONTEXT_TOKENS` limit.

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

**3. Initialize Config Files (`dafc init`)**

Creates `.dafcignore` and `.dafcr` with default templates if they don't exist.

```bash
dafc init
```

## How It Works

**`dafc ask "prompt"`:**
    *   Reads `.env` for configuration (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_API_BASE`).
    *   Reads `.gitignore` and `.dafcignore`.
    *   Scans the current directory recursively for allowed file types.
    *   Filters out ignored files/directories.
    *   Reads file contents (skipping very large or empty files).
    *   Estimates token count for each file and boilerplate text.
    *   **Throws an error and aborts if `MAX_CONTEXT_TOKENS` is exceeded.**
    *   Reads rules from `.dafcr` (if it exists).
    *   Formats file contents and rules into a single context block.
    *   Sends `[System Prompt from .dafcr (if any)] + [User Message (Context Block + User Prompt)]` to the configured LLM via the specified API endpoint.
    *   Streams the response to `stdout` and saves the full response to `response.md`.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## Disclaimer

This tool sends your code (excluding ignored files) to external Large Language Models via the configured API endpoint.
*   **Do not use this tool if your codebase contains sensitive information** (secrets, PII, etc.) that should not leave your environment. Standard security practices apply: keep secrets out of your code and use `.gitignore` / `.dafcignore` appropriately. Use a `.env` file for API keys and ensure it's listed in your ignore files.
*   Use this tool responsibly and at your own risk. LLM outputs may contain errors or security vulnerabilities – **always review generated code carefully.**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
```

--- ./install.sh ---
```sh
#!/bin/bash

# DAFC CLI Installer Script

set -e # Exit immediately if a command exits with a non-zero status.

REPO_URL="https://github.com/AviSantoso/dafc"
INSTALL_DIR="/usr/local/bin"    # Default install location
# Alternative: INSTALL_DIR="$HOME/.local/bin" # User-local install (ensure $HOME/.local/bin is in PATH)
# Alternative: INSTALL_DIR="$HOME/.bun/bin"   # Install alongside bun itself

# --- Helper Functions ---
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if we can write to the directory, attempting sudo if needed
ensure_writable_dir() {
    local dir="$1"
    # Check if it exists, create if not
    if [ ! -d "$dir" ]; then
        echo "Creating installation directory: $dir"
        if [[ "$dir" == /usr/local/* ]] || [[ "$dir" == /opt/* ]]; then
            # Try without sudo first, maybe user has permissions
            if ! mkdir -p "$dir" 2>/dev/null; then
                echo "Attempting to create directory with sudo..."
                if ! command_exists sudo; then
                     echo "Error: sudo command not found, cannot create system directory $dir."
                     echo "Please create it manually or choose a different INSTALL_DIR."
                     exit 1
                fi
                sudo mkdir -p "$dir"
                # Temporarily own to avoid sudo for mv if possible, might fail
                sudo chown "$(whoami)" "$dir" 2>/dev/null || true
            fi
        else
            mkdir -p "$dir" # Create user directory directly
        fi
    fi

    # Check writability
    if [ ! -w "$dir" ]; then
        echo "Installation directory $dir exists but is not writable."
        if [[ "$dir" == /usr/local/* ]] || [[ "$dir" == /opt/* ]]; then
             echo "Attempting to gain write access with sudo..."
             if ! command_exists sudo; then
                 echo "Error: sudo command not found, cannot write to $dir."
                 echo "Please ensure $dir is writable or run this script with sudo."
                 exit 1
             fi
             # Try changing ownership temporarily again
             sudo chown "$(whoami)" "$dir" 2>/dev/null || true
             # Final check after attempting chown
             if [ ! -w "$dir" ]; then
                 echo "Error: Still cannot write to $dir even after attempting sudo chown."
                 echo "Please check permissions for $dir or run this script with sudo."
                 exit 1
             fi
        else
            echo "Error: Installation directory $dir is not writable."
            echo "Please check permissions for $dir."
            exit 1
        fi
    fi
    echo "✅ Installation directory $dir is ready."
}


add_to_path_instructions() {
    local dir_to_add="$1"
    echo ""
    echo "IMPORTANT: Ensure '$dir_to_add' is in your system's PATH."
    echo "You might need to add it to your shell configuration file (e.g., ~/.bashrc, ~/.zshrc, ~/.profile, ~/.config/fish/config.fish):"
    echo ""
    echo "  # Example for bash/zsh:"
    echo "  export PATH=\"$dir_to_add:\$PATH\""
    echo ""
    echo "  # Example for fish:"
    echo "  fish_add_path $dir_to_add"
    echo ""
    echo "After adding it, restart your terminal or run 'source ~/.your_shell_rc_file' (or equivalent)."
}


# --- Start Installation ---
echo "DAFC CLI Installer"
echo "=================="
echo "Target installation directory: $INSTALL_DIR"

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
EXECUTABLE_NAME="dafc" # Match the outfile in package.json build script
if [ ! -f "./$EXECUTABLE_NAME" ]; then
    echo "Error: Build failed. Executable '$EXECUTABLE_NAME' not found in $TEMP_DIR."
    cd ..
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Build successful: $EXECUTABLE_NAME found."

# Ensure installation directory exists and is writable
ensure_writable_dir "$INSTALL_DIR"

INSTALL_PATH="$INSTALL_DIR/$EXECUTABLE_NAME"
echo "Installing '$EXECUTABLE_NAME' to $INSTALL_PATH..."

# Move the executable - use sudo only if absolutely necessary (checked by ensure_writable_dir)
if [[ "$INSTALL_DIR" == /usr/local/* ]] || [[ "$INSTALL_DIR" == /opt/* ]]; then
    # If ensure_writable_dir succeeded without sudo, direct mv might work
    if ! mv "./$EXECUTABLE_NAME" "$INSTALL_PATH" 2>/dev/null; then
        echo "Attempting to move executable with sudo..."
        sudo mv "./$EXECUTABLE_NAME" "$INSTALL_PATH"
        sudo chmod +x "$INSTALL_PATH" # Ensure executable permission with sudo
    else
         chmod +x "$INSTALL_PATH" # Ensure executable permission without sudo
    fi
else
    mv "./$EXECUTABLE_NAME" "$INSTALL_PATH"
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
echo "You should now be able to use the 'dafc' command."
echo "Try running: dafc --version"
echo "Or get started: dafc init"

# Check if install dir is likely in PATH by trying to run the command
if ! command_exists dafc; then
     add_to_path_instructions "$INSTALL_DIR"
fi

echo ""
echo "IMPORTANT: Remember to set your OPENAI_API_KEY environment variable!"
echo "Create a .env file in your project directory or export it."
echo "See README.md for details and examples for different LLM providers."
echo ""

exit 0
```