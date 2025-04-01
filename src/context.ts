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
        `Context limit (${config.MAX_CONTEXT_TOKENS} tokens) exceeded by rules file (${config.DAFC_RULES_FILE}) alone. Estimated tokens: ${totalEstimatedTokens}.`
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
              totalEstimatedTokens +
                estimatedFileTokens +
                fileBoilerplateTokens >
              config.MAX_CONTEXT_TOKENS
            ) {
              throw new ContextTooLargeError(
                `Context limit (${config.MAX_CONTEXT_TOKENS} tokens) exceeded while adding file: ${relativePath}. Current estimated tokens: ${totalEstimatedTokens}. File estimated tokens: ${estimatedFileTokens}. Aborting.`
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
      console.error(
        `\n❌ An unexpected error occurred during context scan:`,
        error
      );
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
