import React from "react";
import { render } from "ink";
import { config } from "./config.js";
import { resolveGlobs, buildContext, estimateTokens, readIgnorePatterns } from "./context.js";
import { watchGlobs } from "./watcher.js";
import { App } from "./ui.js";
import type { Message } from "./llm.js";

const SYSTEM_PROMPT = `You are an expert software assistant helping the user explore and understand their codebase.
Reply concisely and clearly. Always reference specific files and line numbers when relevant.`;

async function main() {
  const allArgs = process.argv.slice(2);
  const ignoreGitignore = allArgs.includes("--ignore-gitignore");
  const patterns = allArgs.filter((p) => p !== "--ignore-gitignore");

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
  const ignorePatterns = await readIgnorePatterns(cwd, ignoreGitignore);

  const files = await resolveGlobs(patterns, cwd, ignorePatterns);
  const contextXml = await buildContext(files, cwd);
  const tokenCount = estimateTokens(contextXml);

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextXml },
    {
      role: "assistant",
      content: "I'm ready to help you explore this codebase.",
    },
  ];

  let updater: ((context: string, fileCount: number, tokenCount: number) => void) | null = null;

  const registerUpdater = (
    fn: (context: string, fileCount: number, tokenCount: number) => void,
  ) => {
    updater = fn;
  };

  const watcher = watchGlobs(patterns, cwd, async () => {
    try {
      const newFiles = await resolveGlobs(patterns, cwd, ignorePatterns);
      const newContext = await buildContext(newFiles, cwd);
      const newTokenCount = estimateTokens(newContext);
      if (updater) {
        updater(newContext, newFiles.length, newTokenCount);
      }
    } catch {
      // swallow watch errors silently
    }
  }, ignorePatterns);

  const { waitUntilExit } = render(
    React.createElement(App, {
      patterns,
      initialFileCount: files.length,
      initialTokenCount: tokenCount,
      initialMessages: messages,
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
