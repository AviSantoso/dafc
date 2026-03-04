import React from "react";
import { render } from "ink";
import { config } from "./config.js";
import { resolveGlobs, buildContext } from "./context.js";
import { watchGlobs } from "./watcher.js";
import { App } from "./ui.js";
import type { Message } from "./llm.js";

const SYSTEM_PROMPT = `You are an expert software assistant helping the user explore and understand their codebase.
Reply concisely and clearly. Always reference specific files and line numbers when relevant.`;

async function main() {
  const patterns = process.argv.slice(2);

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

  const files = await resolveGlobs(patterns, cwd);
  const contextXml = await buildContext(files, cwd);

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextXml },
    {
      role: "assistant",
      content: "I'm ready to help you explore this codebase.",
    },
  ];

  let updater: ((context: string, fileCount: number) => void) | null = null;

  const registerUpdater = (
    fn: (context: string, fileCount: number) => void,
  ) => {
    updater = fn;
  };

  const watcher = watchGlobs(patterns, cwd, async () => {
    try {
      const newFiles = await resolveGlobs(patterns, cwd);
      const newContext = await buildContext(newFiles, cwd);
      if (updater) {
        updater(newContext, newFiles.length);
      }
    } catch {
      // swallow watch errors silently
    }
  });

  const { waitUntilExit } = render(
    React.createElement(App, {
      patterns,
      initialFileCount: files.length,
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
