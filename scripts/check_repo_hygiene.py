#!/usr/bin/env python3
"""Repository hygiene and secret scanner for Pak Nutrition.

Blocks the classes of content that have leaked from this repository before:
database dumps, PII exports, credential files and inline secrets. Also catches
NUL-corrupted source files, which shipped a binary ``robots.txt`` to crawlers
and made five files unparseable by TypeScript.

Usage:
    python scripts/check_repo_hygiene.py              # scan tracked files
    python scripts/check_repo_hygiene.py --staged     # scan staged changes (pre-commit)
    python scripts/check_repo_hygiene.py --all        # scan tracked + untracked

Exit status is 1 when anything is found, so it works as a CI gate and as a
pre-commit hook. Install the hook with: python scripts/install_git_hooks.py
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------
# Filename rules — content that must never be tracked regardless of contents.
# --------------------------------------------------------------------------

FORBIDDEN_PATH_PATTERNS: list[tuple[str, str]] = [
    (r"\.sqlite3?$", "SQLite database"),
    (r"\.sqlite3-journal$", "SQLite journal"),
    (r"(^|/)[^/]*\.db$", "database file"),
    (r"\.(sql|dump)(\.gz)?$", "database dump"),
    (r"(^|/)data\.json$", "Django dumpdata export (has leaked PII and JWTs)"),
    (r"(^|/)(prod|production)_?data\.json$", "production data export"),
    (r"_(export|dump)\.json$", "data export"),
    (r"[-_](export|report)\.csv$", "data export"),
    (r"\.(pem|key|p12|pfx|jks|keystore|ppk)$", "private key / certificate"),
    (r"(^|/)id_(rsa|ed25519|ecdsa)(\.|$)", "SSH private key"),
    (r"(^|/)service-account[^/]*\.json$", "service account credentials"),
    (r"(^|/)secrets?\.(json|ya?ml)$", "secrets file"),
    (r"(^|/)\.env$", "environment file"),
    (r"(^|/)\.env\.(?!.*example)[^/]+$", "environment file"),
    (r"\.pyc$", "compiled Python bytecode"),
]

# Paths that look forbidden but are legitimately tracked.
PATH_ALLOWLIST: list[str] = [
    r"\.env[^/]*\.example$",
    r"(^|/)example\.env$",
]

# --------------------------------------------------------------------------
# Content rules — inline secrets.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class SecretRule:
    name: str
    pattern: re.Pattern[str]


SECRET_RULES: list[SecretRule] = [
    SecretRule(
        "Django SECRET_KEY assigned a literal value",
        re.compile(r"""SECRET_KEY\s*[:=]\s*['"](?!\s*$)(?!.*(?:os\.|env|getenv|<|\$\{))[^'"]{16,}['"]"""),
    ),
    SecretRule(
        "Django insecure key marker",
        re.compile(r"django-insecure-[A-Za-z0-9!@#$%^&*(\-_=+)]{20,}"),
    ),
    SecretRule("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    SecretRule("JWT token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    SecretRule("AWS access key id", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    SecretRule("Slack token", re.compile(r"\bxox[abprs]-[0-9A-Za-z-]{10,}")),
    SecretRule("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    SecretRule("Stripe secret key", re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b")),
    SecretRule("Twilio account SID", re.compile(r"\bAC[0-9a-fA-F]{32}\b")),
    SecretRule("Expo access token", re.compile(r"EXPO_PUSH_ACCESS_TOKEN\s*[:=]\s*['\"][^'\"]{12,}['\"]")),
    SecretRule(
        "Brevo / SMTP relay password assigned a literal value",
        re.compile(r"""EMAIL_HOST_PASSWORD\s*[:=]\s*['"][^'"]{6,}['"]"""),
    ),
    SecretRule(
        "Safepay credential assigned a literal value",
        re.compile(r"""SAFEPAY_(?:API_KEY|SHARED_SECRET|WEBHOOK_SECRET)\s*[:=]\s*['"][^'"]{8,}['"]"""),
    ),
    SecretRule(
        "Database password assigned a literal value",
        re.compile(r"""(?:POSTGRES_PASSWORD|DB_PASSWORD)\s*[:=]\s*['"][^'"]{4,}['"]"""),
    ),
    SecretRule("PBKDF2 password hash", re.compile(r"pbkdf2_sha256\$\d+\$[A-Za-z0-9+/]{16,}\$")),
]

# Files exempt from content scanning: they legitimately describe the patterns.
CONTENT_SCAN_EXEMPT: list[str] = [
    r"^scripts/check_repo_hygiene\.py$",
    r"^SECURITY_REMEDIATION\.md$",
    r"^IMPLEMENTATION_BASELINE\.md$",
    r"(^|/)package-lock\.json$",
    r"(^|/)bun\.lockb$",
    r"^frontend/node_modules/",
    r"^backend/\.venv/",
]

TEXT_SUFFIXES = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yml", ".yaml", ".toml",
    ".ini", ".cfg", ".md", ".txt", ".sh", ".env", ".html", ".css", ".conf",
}

MAX_SCAN_BYTES = 2_000_000

# An inline pragma silences one line. Use it only for values that are provably
# not secrets (test fixtures, documented placeholders) and say why next to it.
ALLOW_PRAGMA = re.compile(r"repo-hygiene:\s*allow")


def _matches_any(path: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, path) for pattern in patterns)


def _git(*args: str) -> list[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return [line for line in result.stdout.splitlines() if line.strip()]


def collect_paths(mode: str) -> list[str]:
    if mode == "staged":
        return _git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    if mode == "all":
        return _git("ls-files", "--cached", "--others", "--exclude-standard")
    return _git("ls-files")


@dataclass
class Finding:
    path: str
    kind: str
    detail: str
    line: int | None = None

    def render(self) -> str:
        location = f"{self.path}:{self.line}" if self.line else self.path
        return f"  [{self.kind}] {location}\n      {self.detail}"


def check_paths(paths: list[str]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        if _matches_any(path, PATH_ALLOWLIST):
            continue
        for pattern, description in FORBIDDEN_PATH_PATTERNS:
            if re.search(pattern, path):
                findings.append(
                    Finding(path, "forbidden-file", f"{description} must not be committed")
                )
                break
    return findings


def _read_text(full_path: Path) -> str | None:
    try:
        if full_path.stat().st_size > MAX_SCAN_BYTES:
            return None
        raw = full_path.read_bytes()
    except OSError:
        return None
    if b"\x00" in raw:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def check_contents(paths: list[str]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        if _matches_any(path, CONTENT_SCAN_EXEMPT):
            continue
        full_path = REPO_ROOT / path
        if not full_path.is_file():
            continue
        if full_path.suffix and full_path.suffix not in TEXT_SUFFIXES:
            continue
        text = _read_text(full_path)
        if text is None:
            continue
        lines = text.splitlines()
        for line_number, line in enumerate(lines, start=1):
            if len(line) > 2000:
                continue
            # The pragma may sit on the line itself or on the line above it.
            previous = lines[line_number - 2] if line_number >= 2 else ""
            if ALLOW_PRAGMA.search(line) or ALLOW_PRAGMA.search(previous):
                continue
            for rule in SECRET_RULES:
                if rule.pattern.search(line):
                    findings.append(Finding(path, "secret", rule.name, line_number))
                    break
    return findings


def check_nul_bytes(paths: list[str]) -> list[Finding]:
    """Source files made entirely of NUL bytes are corrupt, not binary assets."""
    findings: list[Finding] = []
    source_suffixes = TEXT_SUFFIXES | {".d.ts"}
    for path in paths:
        full_path = REPO_ROOT / path
        if not full_path.is_file() or full_path.suffix not in source_suffixes:
            continue
        try:
            raw = full_path.read_bytes()
        except OSError:
            continue
        if raw and not raw.strip(b"\x00"):
            findings.append(
                Finding(path, "corrupt-file", f"file is {len(raw)} NUL bytes with no content")
            )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--staged", action="store_true", help="scan staged changes only")
    group.add_argument("--all", action="store_true", help="scan tracked and untracked files")
    args = parser.parse_args()

    mode = "staged" if args.staged else "all" if args.all else "tracked"
    paths = collect_paths(mode)
    if not paths:
        print(f"repo-hygiene: nothing to scan ({mode}).")
        return 0

    findings = check_paths(paths) + check_contents(paths) + check_nul_bytes(paths)

    if not findings:
        print(f"repo-hygiene: OK — {len(paths)} file(s) scanned ({mode}).")
        return 0

    print(f"repo-hygiene: {len(findings)} problem(s) found ({mode}).\n", file=sys.stderr)
    for finding in findings:
        print(finding.render(), file=sys.stderr)
    print(
        "\nRefusing to pass. Databases, data exports, credentials and corrupt files"
        "\nmust not enter this repository. If a match is a false positive, add a"
        "\nnarrow exemption in scripts/check_repo_hygiene.py and say why.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
