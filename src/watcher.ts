import chokidar, { type FSWatcher } from "chokidar";

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, ms);
  }) as T;
}

export function watchGlobs(
  patterns: string[],
  cwd: string,
  onChange: () => void
): FSWatcher {
  const debouncedChange = debounce(onChange, 300);

  const watcher = chokidar.watch(patterns, {
    cwd,
    ignoreInitial: true,
    ignored: ["node_modules/**", ".git/**"],
  });

  watcher.on("add", debouncedChange);
  watcher.on("change", debouncedChange);
  watcher.on("unlink", debouncedChange);

  return watcher;
}
