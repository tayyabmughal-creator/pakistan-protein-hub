"""Restore a database backup.

    # Rehearsal — restores into a scratch database, leaves the real one alone.
    python manage.py restore_database /path/to/backup.dump --into-scratch-db

    # The real thing. Destructive. Requires typing the database name back.
    python manage.py restore_database /path/to/backup.dump --force

**A backup that has never been restored is not a backup.** ``--into-scratch-db``
exists so the drill can be run on a schedule against production data without
risking production: it creates a throwaway database, restores into it, counts
the rows, and drops it.

The destructive path deliberately refuses to run unless the operator types the
target database name — restoring over a live database during an incident, onto
the wrong host, is a way to turn a bad day into an unrecoverable one.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

#: Tables whose row counts are reported after a restore. If these are zero, the
#: restore technically succeeded and the business data is still gone.
VERIFY_TABLES = (
    "users_user",
    "products_product",
    "orders_order",
    "orders_orderitem",
    "payments_paymenttransaction",
)


class Command(BaseCommand):
    help = "Restore a database backup, or rehearse the restore into a scratch database."

    def add_arguments(self, parser):
        parser.add_argument("backup", help="Path to the backup file.")
        parser.add_argument(
            "--into-scratch-db",
            action="store_true",
            help="Rehearse: restore into a temporary database, verify, then drop it.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Restore over the configured database. Destructive.",
        )
        parser.add_argument(
            "--scratch-name",
            default="",
            help="Name for the scratch database (default: <db>_restore_drill).",
        )

    def handle(self, *args, **options):
        backup = Path(options["backup"]).expanduser()
        if not backup.exists():
            raise CommandError(f"Backup not found: {backup}")

        config = settings.DATABASES["default"]
        if "postgresql" not in config["ENGINE"]:
            raise CommandError(
                "Restore is implemented for PostgreSQL only. Production must be "
                "PostgreSQL; for SQLite, copy the backup file over db.sqlite3."
            )

        if options["into_scratch_db"]:
            return self._rehearse(config, backup, options["scratch_name"])

        if not options["force"]:
            raise CommandError(
                "Refusing to restore over the live database without --force.\n"
                "To rehearse safely instead, use --into-scratch-db."
            )

        return self._restore_over_live(config, backup)

    # -- rehearsal ---------------------------------------------------------

    def _rehearse(self, config, backup: Path, scratch_name: str):
        scratch = scratch_name or f"{config['NAME']}_restore_drill"
        self.stdout.write(f"Restore drill: {backup.name} -> scratch database {scratch!r}")

        self._psql(config, f'DROP DATABASE IF EXISTS "{scratch}"', maintenance=True)
        self._psql(config, f'CREATE DATABASE "{scratch}"', maintenance=True)

        try:
            self._pg_restore(config, backup, dbname=scratch)
            counts = self._row_counts(config, scratch)

            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("Restore drill succeeded. Row counts:"))
            empty = []
            for table, count in counts.items():
                self.stdout.write(f"  {table:36} {count:>10,}")
                if count == 0:
                    empty.append(table)

            if empty:
                self.stdout.write("")
                self.stdout.write(
                    self.style.WARNING(
                        "These tables restored empty: " + ", ".join(empty) + ".\n"
                        "A restore that produces an empty database is a failed restore, "
                        "even though the command exited cleanly."
                    )
                )
            return counts
        finally:
            self._psql(config, f'DROP DATABASE IF EXISTS "{scratch}"', maintenance=True)
            self.stdout.write(f"Scratch database {scratch!r} dropped.")

    # -- destructive -------------------------------------------------------

    def _restore_over_live(self, config, backup: Path):
        target = config["NAME"]
        self.stdout.write(self.style.ERROR(f"About to REPLACE the contents of database {target!r}."))
        self.stdout.write(self.style.ERROR("Everything currently in it will be lost."))
        typed = input(f"Type the database name ({target}) to continue: ").strip()
        if typed != target:
            raise CommandError("Name did not match. Nothing was changed.")

        self.stdout.write("Taking a safety backup of the current state first…")
        from django.core.management import call_command

        call_command("backup_database", label="pre-restore")

        self._pg_restore(config, backup, dbname=target, clean=True)
        counts = self._row_counts(config, target)
        self.stdout.write(self.style.SUCCESS("Restore complete. Row counts:"))
        for table, count in counts.items():
            self.stdout.write(f"  {table:36} {count:>10,}")
        self.stdout.write("")
        self.stdout.write("Now run: python manage.py migrate --check   (schema must match the code)")
        return counts

    # -- helpers -----------------------------------------------------------

    def _env(self, config):
        return {**os.environ, "PGPASSWORD": config.get("PASSWORD") or ""}

    def _base_args(self, config):
        return [
            "--host", config.get("HOST") or "localhost",
            "--port", str(config.get("PORT") or "5432"),
            "--username", config["USER"],
        ]

    def _psql(self, config, sql: str, *, maintenance=False):
        if not shutil.which("psql"):
            raise CommandError("psql is not installed or not on PATH.")
        command = [
            "psql",
            *self._base_args(config),
            # CREATE/DROP DATABASE cannot run inside the database being changed.
            "--dbname", "postgres" if maintenance else config["NAME"],
            "--no-psqlrc",
            "--quiet",
            "--command", sql,
        ]
        result = subprocess.run(command, env=self._env(config), capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise CommandError(f"psql failed running {sql!r}:\n{result.stderr.strip()}")
        return result.stdout

    def _pg_restore(self, config, backup: Path, *, dbname: str, clean=False):
        if not shutil.which("pg_restore"):
            raise CommandError("pg_restore is not installed or not on PATH.")
        command = [
            "pg_restore",
            *self._base_args(config),
            "--dbname", dbname,
            "--no-owner",
            "--no-acl",
        ]
        if clean:
            command += ["--clean", "--if-exists"]
        command.append(str(backup))

        result = subprocess.run(command, env=self._env(config), capture_output=True, text=True, check=False)
        # pg_restore warns about things like missing roles and still succeeds;
        # a non-zero exit with no recognisable output is the real failure.
        if result.returncode != 0 and "errors ignored on restore" not in result.stderr:
            raise CommandError(f"pg_restore failed:\n{result.stderr.strip()}")
        if result.stderr.strip():
            self.stdout.write(self.style.WARNING(f"pg_restore notes:\n{result.stderr.strip()[:2000]}"))

    def _row_counts(self, config, dbname: str):
        counts = {}
        for table in VERIFY_TABLES:
            command = [
                "psql",
                *self._base_args(config),
                "--dbname", dbname,
                "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
                "--command", f"SELECT count(*) FROM {table}",
            ]
            result = subprocess.run(
                command, env=self._env(config), capture_output=True, text=True, check=False
            )
            counts[table] = int(result.stdout.strip()) if result.returncode == 0 else -1
        return counts
