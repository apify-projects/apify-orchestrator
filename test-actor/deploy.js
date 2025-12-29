#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const target = "src/orchestrator";
const placeholder = "placeholder12345";

const gitignorePath = ".gitignore";

const gitignoreOriginalContent = readFileSync(gitignorePath, "utf-8");

function restoreGitignore() {
    writeFileSync(gitignorePath, gitignoreOriginalContent, "utf-8");
}

const patchedGitignoreContent = gitignoreOriginalContent.replace(target, placeholder);

writeFileSync(gitignorePath, patchedGitignoreContent, "utf-8");

try {
    execSync("apify push", { stdio: "inherit" });
} catch (error) {
    console.error("Error during apify push:", error);
} finally {
    restoreGitignore();
}
