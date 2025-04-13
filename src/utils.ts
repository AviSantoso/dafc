import { readFile, mkdir } from "fs/promises";
import { join } from "path";
import ignore, { type Ignore } from "ignore";
import envPaths from "env-paths";
import open from "open";
import { config } from "./config";

// --- File System & Paths ---

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

export async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    // Ignore EEXIST error (directory already exists)
    if (error.code !== "EEXIST") {
      throw error; // Re-throw other errors
    }
  }
}

export function getGlobalConfigPath(): string {
  const paths = envPaths("dafc", { suffix: "" }); // Use 'dafc' as the app name
  return join(paths.config, config.GLOBAL_CONFIG_FILE);
}

export function getProjectConfigPath(rootDir: string = "."): string {
  return join(rootDir, config.PROJECT_CONFIG_FILE);
}

// --- Ignore Logic ---

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
  }

  // Load .dafcignore
  const dafcignoreContent = await readFileContent(
    join(rootDir, config.DAFC_IGNORE_FILE)
  );
  if (dafcignoreContent) {
    ig.add(dafcignoreContent);
  }

  return ig;
}

export function isAllowedPath(relativePath: string, ig: Ignore): boolean {
  try {
    const normalizedPath = relativePath.replace(/^[\/\\]/, "");
    return !ig.ignores(normalizedPath);
  } catch (error) {
    console.warn(`Error checking path ${relativePath}: ${error}`);
    return false;
  }
}

export function isAllowedExtension(filename: string): boolean {
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

// --- Formatting & Misc ---

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, sizes.length - 1);
  return (
    parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(dm)) +
    " " +
    sizes[sizeIndex]
  );
}

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
      timeout = null;
    }, wait);
  };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / config.APPROX_CHARS_PER_TOKEN);
}

// --- Editor ---

export async function openFileInEditor(filePath: string): Promise<void> {
  try {
    console.log(`Attempting to open ${filePath} in your default editor...`);
    await open(filePath);
  } catch (error: any) {
    console.error(`❌ Failed to open file in editor: ${error.message}`);
    console.error(`Please open the file manually: ${filePath}`);
  }
}
