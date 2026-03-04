import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import envPaths from "env-paths";

const GLOBAL_CONFIG_FILE = ".env";
const PROJECT_CONFIG_FILE = ".env";

const paths = envPaths("dafc", { suffix: "" });

export function getGlobalConfigPath(): string {
  return join(paths.config, GLOBAL_CONFIG_FILE);
}

export function getProjectConfigPath(rootDir: string = "."): string {
  return join(rootDir, PROJECT_CONFIG_FILE);
}

function loadConfig() {
  const globalConfigPath = getGlobalConfigPath();
  let globalConfig: Record<string, string> = {};
  try {
    globalConfig = dotenv.parse(readFileSync(globalConfigPath, "utf-8"));
  } catch {}

  const projectConfigPath = getProjectConfigPath(process.cwd());
  let projectConfig: Record<string, string> = {};
  try {
    projectConfig = dotenv.parse(readFileSync(projectConfigPath, "utf-8"));
  } catch {}

  const env = process.env;

  const OPENROUTER_API_KEY =
    env.OPENROUTER_API_KEY ||
    projectConfig.OPENROUTER_API_KEY ||
    globalConfig.OPENROUTER_API_KEY ||
    "";

  const OPENAI_MODEL =
    env.OPENAI_MODEL ||
    projectConfig.OPENAI_MODEL ||
    globalConfig.OPENAI_MODEL ||
    "google/gemini-3-flash-preview";

  const OPENAI_API_BASE =
    env.OPENAI_API_BASE ||
    projectConfig.OPENAI_API_BASE ||
    globalConfig.OPENAI_API_BASE ||
    "https://openrouter.ai/api/v1";

  const TEMPERATURE = parseFloat(
    env.TEMPERATURE ||
      projectConfig.TEMPERATURE ||
      globalConfig.TEMPERATURE ||
      "0.7",
  );

  return { OPENROUTER_API_KEY, OPENAI_MODEL, OPENAI_API_BASE, TEMPERATURE };
}

export const config = loadConfig();
