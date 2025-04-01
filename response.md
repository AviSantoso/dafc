Okay, I can help expand the `context` command with the requested features (`--save`, `--watch`, `--copy`) and update the README.

Here are the steps and the updated code:

**1. Install Dependencies:**

You need to add the `clipboardy` package for clipboard access. Run this in your terminal:

```bash
bun add clipboardy
```

**2. Update Code Files:**

Here are the modified files with the new functionality. I'm providing the full content for clarity and easy replacement.

--- ./src/cli.ts ---
```typescript
#!/usr/bin/env bun
import { Command, Option } from "commander";
import { writeFile, watch } from "fs/promises";
import { join, resolve } from "path";
import clipboard from "clipboardy";
import { gatherContext } from "./context";
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
          "Warning: No files were included in the context. Check your include patterns and ignore files."
        );
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
            "Warning: No files were included in the context. Check your include patterns and ignore files."
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
        const watcher = watch(rootDir, { recursive: true });
        for await (const event of watcher) {
          // Basic check: ignore changes to the output file itself and common noisy dirs
          const eventPath = resolve(rootDir, event.filename || "");
          const savePath = resolve(rootDir, opts.save);
          if (
            eventPath === savePath ||
            event.filename?.startsWith(".git") ||
            event.filename?.includes("node_modules")
          ) {
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

# Ignore the response file itself
${config.RESPONSE_FILE}

# Ignore default context output file
context.md
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
  // Normalize path for ignore matching (relative, no leading slash)
  const normalizedPath = relativePath.startsWith("/")
    ? relativePath.substring(1)
    : relativePath;
  // Also test the path with a leading slash for directory patterns like /node_modules/
  const isIgnored =
    ig.ignores(normalizedPath) || ig.ignores(`/${normalizedPath}`);
  // if (isIgnored) console.debug(`Ignoring: ${normalizedPath}`);
  return !isIgnored;
}

export function isAllowedExtension(filename: string): boolean {
  // Ignore files starting with '.' unless explicitly allowed (like .env, .rc)
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

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
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
```

--- ./package.json ---
```json
{
  "name": "dafc-cli",
  "version": "0.1.1",
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
    "clipboardy": "^4.0.0"
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
*(Note: Bumped version to 0.1.1 and added `clipboardy`)*

**3. Update README:**

Add the following section under the `dafc context` description in your `README.md`:

--- ./README.md (Additions) ---
```md
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
```

*(Rest of the README remains the same)*

**4. Rebuild the Executable:**

After saving the changes, rebuild your CLI tool:

```bash
bun run build
```

If you installed it globally (e.g., in `/usr/local/bin`), you might need to move the newly built `dafc` executable there again (potentially using `sudo`).

Now you should have the enhanced `context` command with the `--save`, `--watch`, and `--copy` options! Remember to test the different flag combinations. The file watcher uses Bun's built-in `fs.watch`, which should work reasonably well, but keep an eye out for any platform inconsistencies if they arise.