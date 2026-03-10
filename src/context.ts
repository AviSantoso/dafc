import fg from "fast-glob";
import ignore from "ignore";
import { readFile } from "fs/promises";
import { join } from "path";

export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

async function readLines(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

export async function buildIgnoreFilter(
  cwd: string,
  ignoreGitignore: boolean,
): Promise<(file: string) => boolean> {
  const ig = ignore().add(["node_modules", ".git"]);

  if (!ignoreGitignore) {
    const gitignoreLines = await readLines(join(cwd, ".gitignore"));
    if (gitignoreLines.length) ig.add(gitignoreLines);
  }

  const dafcignoreLines = await readLines(join(cwd, ".dafcignore"));
  if (dafcignoreLines.length) ig.add(dafcignoreLines);

  return (file: string) => !ig.ignores(file.replace(/^\.\//, ""));
}

export async function resolveGlobs(
  patterns: string[],
  cwd: string,
  filter: (file: string) => boolean,
): Promise<string[]> {
  const files = await fg(patterns, {
    cwd,
    dot: true,
    ignore: ["node_modules/**", ".git/**"],
  });
  return files.filter(filter).sort();
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
    indent: string = "",
  ): string[] {
    const lines: string[] = [];
    for (const key of Object.keys(node).sort()) {
      if (node[key] === null) {
        lines.push(indent + key);
      } else {
        lines.push(indent + key + "/");
        lines.push(
          ...render(node[key] as Record<string, unknown>, indent + "  "),
        );
      }
    }
    return lines;
  }

  return render(tree).join("\n");
}

export async function buildContext(
  files: string[],
  cwd: string,
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
