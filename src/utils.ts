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
