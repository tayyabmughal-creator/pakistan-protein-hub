"""Take a database backup.

    python manage.py backup_database
    python manage.py backup_database --output-dir /var/backups/paknutrition
    python manage.py backup_database --keep 30

Uses ``pg_dump`` custom format (``-Fc``), which is compressed and lets
``pg_restore`` do a selective or parallel restore. SQLite is supported so local
development can rehearse the same workflow, but production must be PostgreSQL.

The credential is passed through the environment, never on the command line —
arguments are visible to every user on the box via ``ps``.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

DEFAULT_DIR = Path.home() / "paknutrition-backups"


class Command(BaseCommand):
    help = "Back up the configured database to a timestamped file."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default=os.environ.get("BACKUP_DIR", str(DEFAULT_DIR)),
            help=f"Where to write the backup (default: {DEFAULT_DIR}).",
        )
        parser.add_argument(
            "--keep",
            type=int,
            default=14,
            help="How many backups to retain; older ones are deleted (default: 14).",
        )
        parser.add_argument(
            "--label",
            default="",
            help="Optional label in the filename, e.g. 'pre-migration'.",
        )

    def handle(self, *args, **options):
        config = settings.DATABASES["default"]
        engine = config["ENGINE"]

        output_dir = Path(options["output_dir"]).expanduser()
        output_dir.mkdir(parents=True, exist_ok=True)

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        label = f".{options['label']}" if options["label"] else ""

        if "postgresql" in engine:
            target = output_dir / f"paknutrition{label}.{stamp}.dump"
            self._dump_postgres(config, target)
        elif "sqlite" in engine:
            target = output_dir / f"db{label}.{stamp}.sqlite3"
            self._dump_sqlite(config, target)
        else:
            raise CommandError(f"No backup support for database engine {engine!r}.")

        size_mb = target.stat().st_size / (1024 * 1024)
        self.stdout.write(self.style.SUCCESS(f"Backup written: {target} ({size_mb:.1f} MB)"))

        if size_mb < 0.001:
            raise CommandError(
                "Backup file is essentially empty. Treat this as a failed backup "
                "and investigate before relying on it."
            )

        self._prune(output_dir, keep=options["keep"])
        self.stdout.write(
            "Verify it restores before you need it: "
            f"python manage.py restore_database {target} --into-scratch-db"
        )
        return str(target)

    def _dump_postgres(self, config, target: Path):
        if not shutil.which("pg_dump"):
            raise CommandError("pg_dump is not installed or not on PATH.")

        command = [
            "pg_dump",
            "--host", config.get("HOST") or "localhost",
            "--port", str(config.get("PORT") or "5432"),
            "--username", config["USER"],
            "--dbname", config["NAME"],
            "--format", "custom",
            "--no-owner",
            "--no-acl",
            "--file", str(target),
        ]

        # Credentials go through the environment. On the command line they would
        # be readable by anyone who can run `ps`.
        env = {**os.environ, "PGPASSWORD": config.get("PASSWORD") or ""}

        self.stdout.write(f"Backing up {config['NAME']} from {config.get('HOST') or 'localhost'}…")
        result = subprocess.run(command, env=env, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            target.unlink(missing_ok=True)
            raise CommandError(f"pg_dump failed:\n{result.stderr.strip()}")

    def _dump_sqlite(self, config, target: Path):
        import sqlite3

        source = Path(config["NAME"])
        if not source.exists():
            raise CommandError(f"SQLite database not found at {source}.")

        # sqlite3's backup API takes a consistent snapshot of a live database.
        # Copying the file with cp can capture a torn write.
        with sqlite3.connect(str(source)) as src, sqlite3.connect(str(target)) as dst:
            src.backup(dst)

    def _prune(self, output_dir: Path, *, keep: int):
        if keep <= 0:
            return
        for pattern in ("paknutrition*.dump", "db*.sqlite3"):
            backups = sorted(
                output_dir.glob(pattern),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for stale in backups[keep:]:
                stale.unlink()
                self.stdout.write(f"Pruned old backup: {stale.name}")
