import dotenv from "dotenv";

// Load .env file from current working directory or project root
dotenv.config({ path: process.cwd() + "/.env", override: true });
dotenv.config({ override: true }); // Load default .env if specific one not found

export const config = {
  // LLM Settings
  OPENROUTER_API_KEY:
    process.env.OPENROUTER_API_KEY ||
    (() => {
      throw new Error("OPENROUTER_API_KEY is not set");
    })(),
  MODEL_NAME: process.env.DAFC_MODEL || "google/gemini-2.5-pro-exp-03-25:free", // Allow overriding model via env
  API_BASE_URL: process.env.DAFC_API_BASE_URL || "https://openrouter.ai/api/v1",
  TEMPERATURE: 0.3,
  MAX_RETRIES: 5,
  BASE_DELAY: 1000, // ms

  // File Handling
  RESPONSE_FILE: "response.md",
  DAFC_IGNORE_FILE: ".dafcignore",
  DAFC_RULES_FILE: ".dafcr",
  GIT_IGNORE_FILE: ".gitignore",
  DEFAULT_IGNORE_DIRS: new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "out",
    "coverage",
  ]),
  DEFAULT_IGNORE_FILES: new Set([".DS_Store", "response.md", ".env"]),
  // Add file extensions you want to include by default
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
    /^\.?rc$/, // Config files like .env, .eslintrc
    /package\.json$/,
    /composer\.json$/,
    /Gemfile$/,
    /requirements\.txt$/,
    /go\.mod$/,
    /Cargo\.toml$/,
    /pom\.xml$/,
    /csproj$/, // Dependency files
  ],
  MAX_FILE_SIZE_BYTES: 1 * 1024 * 1024, // 1MB limit per file to avoid huge blobs

  // DAFC Constraints (Informational - not strictly enforced by tool yet)
  MAX_LINES_PER_FILE: 500,
  MAX_FILES: 50,
  TARGET_FILES: 10,
};

// Validate essential config
if (!config.OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY environment variable not set.");
  console.error("1. Get an API key from https://openrouter.ai/keys");
  console.error("2. Create a .env file in your project root with:");
  console.error("   OPENROUTER_API_KEY='your-key-here'");
  console.error("3. Or, set the environment variable directly:");
  console.error("   export OPENROUTER_API_KEY='your-key-here'");
  process.exit(1);
}
