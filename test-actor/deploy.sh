#!/usr/bin/env bash

target="src/orchestrator"
placeholder="placeholder12345"

# Function to restore .gitignore
restore_gitignore() {
    sed -i '' "s|^${placeholder}$|${target}|" .gitignore
}

# Trap EXIT, INT (Ctrl+C), and TERM signals to ensure cleanup
trap restore_gitignore EXIT INT TERM

# Since `apify-push` ignores files/folders listed in .gitignore,
# we temporarily replace src/orchestrator with a placeholder.
sed -i '' "s|^${target}$|${placeholder}|" .gitignore

apify push
