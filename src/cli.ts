#!/usr/bin/env bun
import { Command } from "commander";
import { writeFile } from "fs/promises";
import { join } from "path";
import { gatherContext } from "./context";
import { queryLLM } from "./llm";
import { createIgnoreFilter, readFileContent } from "./utils";
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
  .description("Gather context and print it to stdout (what the LLM sees).")
  .action(async () => {
    console.log("Gathering context...");
    const rootDir = process.cwd();
    try {
      const ig = await createIgnoreFilter(rootDir);
      const { context, files } = await gatherContext(rootDir, ig);

      if (files.length === 0) {
        console.warn(
          "Warning: No files were included in the context. Check your include patterns and ignore files."
        );
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
  args[0] !== "--version"
) {
  // Prepend 'ask' to the arguments to trigger the ask command
  process.argv.splice(2, 0, "ask");
} else if (args.length === 0) {
  // Show help if no arguments are given
  process.argv.push("--help");
}

program.parse(process.argv);
