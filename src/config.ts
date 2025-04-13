import dotenv from "dotenv";
import { readFileSync } from "fs";
import { getGlobalConfigPath, getProjectConfigPath } from "./utils"; // Import path helpers
import { GLOBAL_CONFIG_FILE, PROJECT_CONFIG_FILE } from "./constants";

// --- Default Values ---
export const defaultConfig = {
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "google/gemini-2.5-pro-exp-03-25:free",
  OPENAI_API_BASE: "https://openrouter.ai/api/v1",
  TEMPERATURE: 0.3,
  MAX_RETRIES: 5,
  BASE_DELAY: 1000, // ms
  MAX_CONTEXT_TOKENS: 900000,
  APPROX_CHARS_PER_TOKEN: 4,
  RESPONSE_FILE: "response.md",
  DAFC_IGNORE_FILE: ".dafcignore",
  DAFC_RULES_FILE: ".dafcr",
  GIT_IGNORE_FILE: ".gitignore",
  GLOBAL_CONFIG_FILE: GLOBAL_CONFIG_FILE,
  PROJECT_CONFIG_FILE: PROJECT_CONFIG_FILE,
  DEFAULT_IGNORE_DIRS: new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "out",
    "coverage",
    "vendor",
    "__pycache__",
    ".venv",
    ".env", // Exclude project .env itself from context scan
    GLOBAL_CONFIG_FILE, // Exclude global config from context scan
  ]),
  DEFAULT_IGNORE_FILES: new Set([
    ".DS_Store",
    "response.md",
    "context.md",
    "*.lock",
    "*.log",
  ]),
  DEFAULT_INCLUDE_PATTERNS: [
    /\.ts$/,
    /\.tsx$/,
    /\.js$/,
    /\.jsx$/,
    /\.py$/,
    /\.rb$/,
    /\.php$/,
    /\.go$/,
    /\.rs$/,
    /\.java$/,
    /\.cs$/,
    /\.html$/,
    /\.css$/,
    /\.scss$/,
    /\.less$/,
    /\.json$/,
    /\.yaml$/,
    /\.yml$/,
    /\.md$/,
    /\.txt$/,
    /Dockerfile$/,
    /docker-compose\.yml$/,
    /\.sql$/,
    /\.sh$/,
    /\.bash$/,
    /Makefile$/,
    /^\.?env/,
    /^\.?config/,
    /^\.?rc$/,
    /package\.json$/,
    /composer\.json$/,
    /Gemfile$/,
    /requirements\.txt$/,
    /go\.mod$/,
    /Cargo\.toml$/,
    /pom\.xml$/,
    /csproj$/,
  ],
  MAX_FILE_SIZE_BYTES: 1 * 1024 * 1024, // 1MB
  // DAFC Constraints (Informational)
  MAX_LINES_PER_FILE: 500,
  MAX_FILES: 50,
  TARGET_FILES: 10,
};

// --- Configuration Loading Function ---
function loadConfig() {
  // 1. Load Global Config File (if exists)
  const globalConfigPath = getGlobalConfigPath();
  let globalConfig = {};
  try {
    const globalContent = readFileSync(globalConfigPath, "utf-8");
    globalConfig = dotenv.parse(globalContent);
    // console.debug("Loaded global config:", globalConfigPath);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Warning: Could not read global config file ${globalConfigPath}: ${error.message}`
      );
    }
    // else { console.debug("Global config file not found:", globalConfigPath); }
  }

  // 2. Load Project Config File (.env) (if exists)
  const projectConfigPath = getProjectConfigPath(process.cwd());
  let projectConfig = {};
  try {
    const projectContent = readFileSync(projectConfigPath, "utf-8");
    projectConfig = dotenv.parse(projectContent);
    // console.debug("Loaded project config:", projectConfigPath);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Warning: Could not read project config file ${projectConfigPath}: ${error.message}`
      );
    }
    // else { console.debug("Project config file (.env) not found in:", process.cwd()); }
  }

  // 3. Environment Variables (highest priority)
  const envVars = process.env;

  // 4. Merge configurations (Env > Project > Global > Defaults)
  const mergedConfig = {
    ...defaultConfig,
    ...globalConfig,
    ...projectConfig,
    ...envVars, // Environment variables override file configs
    // Ensure specific types are maintained if necessary (e.g., numbers)
    TEMPERATURE: parseFloat(
      envVars.TEMPERATURE ||
        (projectConfig as any).TEMPERATURE ||
        (globalConfig as any).TEMPERATURE ||
        String(defaultConfig.TEMPERATURE)
    ),
    MAX_RETRIES: parseInt(
      envVars.MAX_RETRIES ||
        (projectConfig as any).MAX_RETRIES ||
        (globalConfig as any).MAX_RETRIES ||
        String(defaultConfig.MAX_RETRIES),
      10
    ),
    BASE_DELAY: parseInt(
      envVars.BASE_DELAY ||
        (projectConfig as any).BASE_DELAY ||
        (globalConfig as any).BASE_DELAY ||
        String(defaultConfig.BASE_DELAY),
      10
    ),
    MAX_CONTEXT_TOKENS: parseInt(
      envVars.MAX_CONTEXT_TOKENS ||
        (projectConfig as any).MAX_CONTEXT_TOKENS ||
        (globalConfig as any).MAX_CONTEXT_TOKENS ||
        String(defaultConfig.MAX_CONTEXT_TOKENS),
      10
    ),
    MAX_FILE_SIZE_BYTES: parseInt(
      envVars.MAX_FILE_SIZE_BYTES ||
        (projectConfig as any).MAX_FILE_SIZE_BYTES ||
        (globalConfig as any).MAX_FILE_SIZE_BYTES ||
        String(defaultConfig.MAX_FILE_SIZE_BYTES),
      10
    ),
    // Keep sets as sets
    DEFAULT_IGNORE_DIRS: defaultConfig.DEFAULT_IGNORE_DIRS,
    DEFAULT_IGNORE_FILES: defaultConfig.DEFAULT_IGNORE_FILES,
    DEFAULT_INCLUDE_PATTERNS: defaultConfig.DEFAULT_INCLUDE_PATTERNS,
  };

  // Ensure OPENAI_API_KEY is present
  if (!mergedConfig.OPENAI_API_KEY) {
    console.error("❌ Error: OPENAI_API_KEY is not set.");
    console.error(
      "  Please set it in your environment, project .env file, or global config file."
    );
    console.error(`  Global config location: ${globalConfigPath}`);
    console.error("  Run 'dafc config --global' or 'dafc config' to edit.");
    process.exit(1);
  }

  return mergedConfig;
}

// --- Exported Config ---
export const config = loadConfig();
