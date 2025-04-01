#!/bin/bash

# DAFC CLI Installer Script

set -e # Exit immediately if a command exits with a non-zero status.

REPO_URL="https://github.com/AviSantoso/dafc" # Replace with your actual repo URL
INSTALL_DIR="/usr/local/bin"    # Default install location (requires sudo)
# Alternative: INSTALL_DIR="$HOME/.local/bin" # User-local install (ensure $HOME/.local/bin is in PATH)
# Alternative: INSTALL_DIR="$HOME/.bun/bin"   # Install alongside bun itself

echo "DAFC CLI Installer"
echo "=================="

# --- Helper Functions ---
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

ensure_dir_exists() {
    if [ ! -d "$1" ]; then
        echo "Creating installation directory: $1"
        # Use sudo if installing to system location
        if [[ "$1" == /usr/local/* ]] || [[ "$1" == /opt/* ]]; then
            sudo mkdir -p "$1"
            sudo chown "$(whoami)" "$1" # Temporarily own to avoid sudo later if possible
        else
             mkdir -p "$1"
        fi
    fi
     # Check if directory is writable
    if [ ! -w "$1" ]; then
        echo "Error: Installation directory $1 is not writable."
        echo "Try running the script with sudo, or choose a different INSTALL_DIR like $HOME/.local/bin"
        exit 1
    fi
}

add_to_path_instructions() {
    local dir_to_add="$1"
    echo ""
    echo "IMPORTANT: Ensure '$dir_to_add' is in your system's PATH."
    echo "You might need to add it to your shell configuration file (e.g., ~/.bashrc, ~/.zshrc, ~/.profile):"
    echo ""
    echo "  export PATH=\"$dir_to_add:\$PATH\""
    echo ""
    echo "After adding it, restart your terminal or run 'source ~/.your_shell_rc_file'."
}


# --- Pre-flight Checks ---
echo "Checking prerequisites..."

# 1. Check for Bun
if ! command_exists bun; then
    echo "Error: Bun runtime is not installed or not found in PATH."
    echo "Please install Bun first: https://bun.sh/docs/installation"
    exit 1
fi
echo "✅ Bun found: $(bun --version)"

# 2. Check for Git (needed for cloning)
if ! command_exists git; then
    echo "Error: Git is not installed or not found in PATH."
    echo "Please install Git."
    exit 1
fi
echo "✅ Git found"

# 3. Check for sudo if needed for default install dir
if [[ "$INSTALL_DIR" == /usr/local/* ]] || [[ "$INSTALL_DIR" == /opt/* ]]; then
    if ! command_exists sudo; then
        echo "Warning: sudo command not found, but needed for default install directory ($INSTALL_DIR)."
        echo "Attempting without sudo, but may fail. Consider changing INSTALL_DIR."
    fi
fi


# --- Installation ---
TEMP_DIR=$(mktemp -d)
echo "Cloning repository into temporary directory: $TEMP_DIR"
git clone --depth 1 "$REPO_URL" "$TEMP_DIR"
cd "$TEMP_DIR"

echo "Installing dependencies..."
bun install --frozen-lockfile # Use lockfile for reproducibility

echo "Building executable..."
bun run build # This runs the build script in package.json

# Check if build was successful
if [ ! -f "./dafc" ]; then
    echo "Error: Build failed. Executable 'dafc' not found."
    cd ..
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Build successful."

# Ensure installation directory exists and is writable
ensure_dir_exists "$INSTALL_DIR"

INSTALL_PATH="$INSTALL_DIR/dafc"
echo "Installing 'dafc' to $INSTALL_PATH..."

# Use sudo if installing to system location
if [[ "$INSTALL_DIR" == /usr/local/* ]] || [[ "$INSTALL_DIR" == /opt/* ]]; then
    sudo mv ./dafc "$INSTALL_PATH"
    sudo chmod +x "$INSTALL_PATH"
else
    mv ./dafc "$INSTALL_PATH"
    chmod +x "$INSTALL_PATH"
fi

# --- Cleanup ---
echo "Cleaning up temporary files..."
cd ..
rm -rf "$TEMP_DIR"

# --- Post-installation ---
echo ""
echo "✅ DAFC CLI installed successfully to $INSTALL_PATH!"
echo ""
echo "You can now use the 'dafc' command."
echo "Try running: dafc --version"
echo "Or get started: dafc init"

# Check if install dir is likely in PATH
if ! command_exists dafc; then
     add_to_path_instructions "$INSTALL_DIR"
fi

echo ""
echo "Remember to set your OPENAI_API_KEY environment variable!"
echo "See README for details."
echo ""

exit 0
