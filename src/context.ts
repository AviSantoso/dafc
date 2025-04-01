import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import type { Ignore } from "ignore";
import { config } from "./config";
import {
  readFileContent,
  isAllowedPath,
  isAllowedExtension,
  formatBytes,
} from "./utils";

interface FileInfo {
  path: string;
  content: string;
  lines: number;
  size: number;
}

export async function gatherContext(
  rootDir: string = ".",
  ig: Ignore
): Promise<{ context: string; files: FileInfo[]; rules: string | null }> {
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
            console.warn(
              `Skipping ${relativePath}: File size (${formatBytes(
                fileStat.size
              )}) exceeds limit (${formatBytes(config.MAX_FILE_SIZE_BYTES)})`
            );
            continue;
          }
          if (fileStat.size === 0) {
            // console.debug(`Skipping ${relativePath}: File is empty`);
            continue; // Skip empty files
          }

          const content = await readFileContent(fullPath);
          if (content !== null) {
            const lines = content.split("\n").length;
            files.push({
              path: relativePath,
              content,
              lines,
              size: fileStat.size,
            });
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
  contextBlocks.push(
    `Root Directory: ${rootDir === "." ? process.cwd() : rootDir}`
  );
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
\`\`\`${file.path.split(".").pop()}
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
    console.log(
      `No ${config.DAFC_RULES_FILE} found, proceeding without custom rules.`
    );
  }

  contextBlocks.push(`[END PROJECT CONTEXT]`);

  console.log(
    `Context gathered: ${files.length} files, ${formatBytes(totalSize)}.`
  );

  return { context: contextBlocks.join("\n\n"), files, rules };
}
