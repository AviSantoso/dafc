#!/usr/bin/env bun
import { Command, Option } from "commander";
import { writeFile, watch } from "fs/promises";
import { join, relative, resolve } from "path";
import clipboard from "clipboardy";
import { gatherContext, ContextTooLargeError } from "./context"; // Import error type
import { queryLLM } from "./llm";
import {
  createIgnoreFilter,
  readFileContent,
  debounce,
  isAllowedPath,
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

program
  .command("ask <prompt>")
  .description("Ask the LLM a question using the current directory's context.")
  .option("--debug", "Show debug information including config")
  .action(async (prompt: string, opts: { debug?: boolean }) => {
    console.log("DAFC - Dumb as Fuck Coder");
    console.log("--------------------------");

    if (opts.debug) {
      console.log("\nConfig:");
      console.log(JSON.stringify(config, null, 2));
      console.log("--------------------------\n");
    }

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
