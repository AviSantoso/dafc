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
      const safeConfig = {
        ...config,
        OPENAI_API_KEY: config.OPENAI_API_KEY ? "***" : "Not Set",
      };
      console.log(
        JSON.stringify(
          safeConfig,
          (key, value) => (value instanceof Set ? Array.from(value) : value), // Convert Sets for JSON
          2
        )
      );
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

    const defaultConfigContent = `# DAFC Configuration (${
      isGlobal ? "Global" : "Project"
    })
# Lines starting with # are comments.
# Add your settings below in KEY=VALUE format.

# --- Required ---
# Your API key for the LLM service
# OPENAI_API_KEY=your-api-key-here

# --- Optional Overrides ---
# Specify the model to use (default: ${config.OPENAI_MODEL})
# OPENAI_MODEL=google/gemini-1.5-pro-latest

# Specify the API endpoint base URL (default: ${config.OPENAI_API_BASE})
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
