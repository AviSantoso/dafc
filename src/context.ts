import fg from "fast-glob";
import { readFile } from "fs/promises";
import { join } from "path";

export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

export async function readIgnorePatterns(
  cwd: string,
  ignoreGitignore: boolean
): Promise<string[]> {
  const patterns = ["node_modules/**", ".git/**"];

  if (!ignoreGitignore) {
    try {
      const gitignore = await readFile(join(cwd, ".gitignore"), "utf-8");
      for (const line of gitignore.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          patterns.push(trimmed);
        }
      }
    } catch {
      // no .gitignore
    }
  }

  try {
    const dafcignore = await readFile(join(cwd, ".dafcignore"), "utf-8");
    for (const line of dafcignore.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        patterns.push(trimmed);
      }
    }
  } catch {
    // no .dafcignore
  }

  return patterns;
}

export async function resolveGlobs(
  patterns: string[],
  cwd: string,
  ignorePatterns: string[]
): Promise<string[]> {
  const files = await fg(patterns, {
    cwd,
    dot: true,
    ignore: ignorePatterns,
  });
  return files.sort();
}

export function buildTree(files: string[]): string {
  const tree: Record<string, unknown> = {};

  for (const file of files) {
    const parts = file.split("/");
    let node = tree as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = null;
  }

  function render(
    node: Record<string, unknown>,
    indent: string = ""
  ): string[] {
    const lines: string[] = [];
    for (const key of Object.keys(node).sort()) {
      if (node[key] === null) {
        lines.push(indent + key);
      } else {
        lines.push(indent + key + "/");
        lines.push(...render(node[key] as Record<string, unknown>, indent + "  "));
      }
    }
    return lines;
  }

  return render(tree).join("\n");
}

export async function buildContext(
  files: string[],
  cwd: string
): Promise<string> {
  const tree = buildTree(files);
  const treeIndented = tree
    .split("\n")
    .map((l) => "    " + l)
    .join("\n");

  const fileBlocks: string[] = [];
  for (const file of files) {
    try {
      const content = await readFile(join(cwd, file), "utf-8");
      fileBlocks.push(`  <file path="${file}">\n${content}\n  </file>`);
    } catch {
      // skip unreadable files
    }
  }

  return `<context>\n  <tree>\n${treeIndented}\n  </tree>\n${fileBlocks.join("\n")}\n</context>`;
}
