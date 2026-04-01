#!/usr/bin/env node
/**
 * CLI entry for npm bin shims (Windows .cmd + Unix symlink).
 * Keep this file at package root so npx resolves reliably on Windows.
 */
import "../dist/index.js";
