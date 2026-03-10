import React from "react";
import { render } from "ink";
import { config } from "./config.js";
import {
  resolveGlobs,
  buildContext,
  estimateTokens,
  buildIgnoreFilter,
} from "./context.js";
import { watchGlobs } from "./watcher.js";
import { App } from "./ui.js";
import type { Message } from "./llm.js";

const SYSTEM_PROMPT = `
<persona>
You are an expert software assistant helping the user explore and understand their codebase.
You have a deep understanding of codebases and common architectural patterns.
Act like a guide to the user's codebase.
</persona>
<task>
You are tasked with helping the user explore and understand their codebase in a consultative manner.
The user is attempting to understand the codebase from a functional and high level point of view.
</task>
<rules>
- Reply concisely and clearly.
- Respond using plaintext / minimally formatted markdown.
- Always reference specific files and line numbers when relevant.
- Do not suggest implementation details unless the user has explicitly asked for them.
</rules>`;

async function main() {
  const allArgs = process.argv.slice(2);
  const ignoreGitignore = allArgs.includes("--ignore-gitignore");
  const debug = allArgs.includes("--debug");
  const patterns = allArgs.filter(
    (p) => p !== "--ignore-gitignore" && p !== "--debug",
  );

  if (patterns.length === 0) {
    console.error("Usage: dafc <glob> [<glob> ...]");
    console.error('Example: dafc "src/**/*.ts" "README.md"');
    process.exit(1);
  }

  if (!config.OPENROUTER_API_KEY) {
    console.error("Error: OPENROUTER_API_KEY is not set.");
    console.error(
      "Set it in your environment or in a .env file in the current directory.",
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const filter = await buildIgnoreFilter(cwd, ignoreGitignore);

  const files = await resolveGlobs(patterns, cwd, filter);
  const contextXml = await buildContext(files, cwd);
  const tokenCount = estimateTokens(contextXml);

  if (debug) {
    process.stderr.write(`[debug] patterns: ${patterns.join(", ")}\n`);
    process.stderr.write(`[debug] files (${files.length}):\n`);
    for (const f of files) process.stderr.write(`  ${f}\n`);
    process.stderr.write(`[debug] tokens: ~${tokenCount}\n`);
  }

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextXml },
    {
      role: "assistant",
      content: "I'm ready to help you explore this codebase.",
    },
  ];

  let updater:
    | ((context: string, fileCount: number, tokenCount: number) => void)
    | null = null;

  const registerUpdater = (
    fn: (context: string, fileCount: number, tokenCount: number) => void,
  ) => {
    updater = fn;
  };

  // chokidar still needs basic glob ignores; the filter handles gitignore semantics
  const watcherIgnore = ["**/node_modules/**", "**/.git/**"];

  const watcher = watchGlobs(
    patterns,
    cwd,
    async () => {
      try {
        const newFiles = await resolveGlobs(patterns, cwd, filter);
        const newContext = await buildContext(newFiles, cwd);
        const newTokenCount = estimateTokens(newContext);
        if (updater) {
          updater(newContext, newFiles.length, newTokenCount);
        }
      } catch {
        // swallow watch errors silently
      }
    },
    watcherIgnore,
  );

  const { waitUntilExit } = render(
    React.createElement(App, {
      patterns,
      initialFileCount: files.length,
      initialTokenCount: tokenCount,
      initialMessages: messages,
      initialContext: contextXml,
      cwd,
      registerUpdater,
    }),
  );

  await waitUntilExit();
  await watcher.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
