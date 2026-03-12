#!/usr/bin/env bash
set -euo pipefail

# x402 Payments Skill — Stellar Edition
# Auto-installer for Claude Code, Codex CLI, and Cursor

REPO="https://github.com/ASGCompute/x402-payments-skill.git"
SKILL_DIR="x402-payments"
TEMP_DIR=$(mktemp -d)

cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

echo "🌟 x402 Payments Skill — Stellar Edition"
echo "========================================="
echo ""

# Clone to temp
echo "📦 Downloading skill..."
git clone --depth 1 --quiet "$REPO" "$TEMP_DIR/repo" 2>/dev/null || {
  echo "❌ Failed to clone repository. Check your internet connection."
  exit 1
}

installed=false

# Claude Code
if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then
  DEST="$HOME/.claude/skills/$SKILL_DIR"
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$DEST"
  cp -r "$TEMP_DIR/repo/$SKILL_DIR" "$DEST"
  echo "✅ Installed to ~/.claude/skills/$SKILL_DIR"
  installed=true
fi

# Codex CLI
if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then
  DEST="$HOME/.codex/skills/$SKILL_DIR"
  mkdir -p "$HOME/.codex/skills"
  rm -rf "$DEST"
  cp -r "$TEMP_DIR/repo/$SKILL_DIR" "$DEST"
  echo "✅ Installed to ~/.codex/skills/$SKILL_DIR"
  installed=true
fi

# Cursor / Windsurf — copy .cursorrules to current project
if [ -f ".cursorrules" ] || command -v cursor &>/dev/null || [ -d ".cursor" ]; then
  cp "$TEMP_DIR/repo/.cursorrules" ./.cursorrules
  mkdir -p ".claude/skills"
  rm -rf ".claude/skills/$SKILL_DIR"
  cp -r "$TEMP_DIR/repo/$SKILL_DIR" ".claude/skills/$SKILL_DIR"
  echo "✅ Installed .cursorrules + .claude/skills/$SKILL_DIR to current project"
  installed=true
fi

# Gemini CLI
if [ -d "$HOME/.gemini" ] || command -v gemini &>/dev/null; then
  DEST="$HOME/.gemini/skills/$SKILL_DIR"
  mkdir -p "$HOME/.gemini/skills"
  rm -rf "$DEST"
  cp -r "$TEMP_DIR/repo/$SKILL_DIR" "$DEST"
  echo "✅ Installed to ~/.gemini/skills/$SKILL_DIR"
  installed=true
fi

if [ "$installed" = false ]; then
  # Fallback: install to Claude Code location
  DEST="$HOME/.claude/skills/$SKILL_DIR"
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$DEST"
  cp -r "$TEMP_DIR/repo/$SKILL_DIR" "$DEST"
  echo "✅ No AI tools detected. Installed to ~/.claude/skills/$SKILL_DIR"
  echo "   Move to your preferred location if needed."
fi

echo ""
echo "🚀 Done! Ask your AI agent:"
echo '   "Build an x402 server on Stellar that charges $0.001 per request"'
echo '   "Create an agent client that pays USDC for API calls on Stellar"'
echo ""
