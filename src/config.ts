import dotenv from "dotenv";

// Load .env file from current working directory or project root
dotenv.config({ path: process.cwd() + "/.env", override: true });
dotenv.config({ override: true }); // Load default .env if specific one not found

export const config = {
  // LLM Settings - Uses OpenAI standard env variables where possible
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "", // Use standard OpenAI key name
  MODEL_NAME:
    process.env.OPENAI_MODEL || "google/gemini-2.5-pro-exp-03-25:free", // Default to large context model on OpenRouter
  API_BASE_URL: process.env.OPENAI_API_BASE || "https://openrouter.ai/api/v1", // Default to OpenRouter
  TEMPERATURE: 0.3,
  MAX_RETRIES: 5,
  BASE_DELAY: 1000, // ms

  // Context Handling
  MAX_CONTEXT_TOKENS: 900000, // Set a safety margin below 1M tokens for Gemini 2.5 Pro
  // Simple approximation: 1 token ~= 4 chars. Adjust if needed.
  APPROX_CHARS_PER_TOKEN: 4,
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
    "vendor", // Common dependency folder for other languages
    "__pycache__",
    ".venv",
    ".env", // Exclude virtual envs
  ]),
  DEFAULT_IGNORE_FILES: new Set([
    ".DS_Store",
    "response.md",
    "context.md", // Default context output file
    ".env", // Exclude environment file itself
    "*.lock", // Exclude lock files (package-lock.json, yarn.lock, etc.)
    "*.log", // Exclude log files
  ]),
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
    /^\.?env/, // Include .env.example etc. but DEFAULT_IGNORE_FILES excludes .env
    /^\.?config/,
    /^\.?rc$/, // Config files like .eslintrc
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
if (!config.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable not set.");
  console.error(
    "This tool requires an API key for an OpenAI-compatible service."
  );
  console.error(
    "1. Obtain an API key (e.g., from OpenRouter, OpenAI, Featherless)."
  );
  console.error("2. Create a .env file in your project root with:");
  console.error("   OPENAI_API_KEY='your-key-here'");
  console.error("   # Optional: Override model and API endpoint");
  console.error("   # OPENAI_MODEL='openai/gpt-4o'");
  console.error("   # OPENAI_API_BASE='https://api.openai.com/v1'");
  console.error("3. Or, set the environment variable directly:");
  console.error("   export OPENAI_API_KEY='your-key-here'");
  process.exit(1);
}
