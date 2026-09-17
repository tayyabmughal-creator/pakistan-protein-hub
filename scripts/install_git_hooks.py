#!/usr/bin/env python3
"""Install Pak Nutrition's local Git hooks.

Run once per clone:

    python scripts/install_git_hooks.py

Installs a pre-commit hook that runs the repository hygiene and secret scanner
against staged changes. Hooks are per-clone and cannot be committed, which is
why CI runs the same scanner as the authoritative gate — the hook only gives
faster feedback.
"""

from __future__ import annotations

import stat
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

PRE_COMMIT = """#!/bin/sh
# Installed by scripts/install_git_hooks.py — do not edit by hand.
python3 "$(git rev-parse --show-toplevel)/scripts/check_repo_hygiene.py" --staged || {
    echo ""
    echo "Commit blocked by repo-hygiene. Fix the findings above, or use"
    echo "  git commit --no-verify"
    echo "only if you are certain and can explain why in the commit message."
    exit 1
}
"""


def main() -> int:
    result = subprocess.run(
        ["git", "rev-parse", "--git-path", "hooks"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        print("Not a Git repository — nothing to install.", file=sys.stderr)
        return 1

    hooks_dir = (REPO_ROOT / result.stdout.strip()).resolve()
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_path = hooks_dir / "pre-commit"

    if hook_path.exists() and "check_repo_hygiene" not in hook_path.read_text():
        backup = hook_path.with_suffix(".pre-hygiene.bak")
        backup.write_text(hook_path.read_text())
        print(f"Existing pre-commit hook backed up to {backup}")

    hook_path.write_text(PRE_COMMIT)
    hook_path.chmod(hook_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(f"Installed pre-commit hook at {hook_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
