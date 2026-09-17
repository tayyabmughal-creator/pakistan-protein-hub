"""Re-verify payments that never reached a final state.

A webhook that was never delivered — or was delivered while the server was
restarting — leaves the customer charged and the order never created. Nothing in
the request/response path can notice that, because the request that would have
noticed is the one that went missing.

This command asks the provider directly about every transaction still sitting at
INITIATED past a grace period, and settles or fails it accordingly. It is safe
to run repeatedly: settlement is idempotent.

Run it on a schedule (every 15 minutes is reasonable) and after any incident:

    python manage.py reconcile_payments
    python manage.py reconcile_payments --dry-run
    python manage.py reconcile_payments --older-than 60 --limit 500
"""

from django.core.management.base import BaseCommand

from payments.models import PaymentTransaction
from payments.services import reconcile_pending, verify_session


class Command(BaseCommand):
    help = "Re-verify unsettled payment transactions against the provider."

    def add_arguments(self, parser):
        parser.add_argument(
            "--older-than",
            type=int,
            default=15,
            metavar="MINUTES",
            help="Only check transactions older than this many minutes (default: 15).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=200,
            help="Maximum transactions to check in one run (default: 200).",
        )
        parser.add_argument(
            "--provider",
            default=PaymentTransaction.PROVIDER_SAFEPAY,
            help="Provider key to reconcile (default: SAFEPAY).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be checked without contacting the provider.",
        )

    def handle(self, *args, **options):
        provider = options["provider"]
        older_than = options["older_than"]
        limit = options["limit"]

        if options["dry_run"]:
            from django.utils import timezone

            cutoff = timezone.now() - timezone.timedelta(minutes=older_than)
            pending = PaymentTransaction.objects.filter(
                provider=provider,
                status=PaymentTransaction.STATUS_INITIATED,
                created_at__lt=cutoff,
            ).select_related("session")[:limit]

            count = 0
            for txn in pending:
                count += 1
                self.stdout.write(
                    f"  would verify {txn.provider_reference} "
                    f"(expected {txn.expected_amount} {txn.expected_currency}, "
                    f"created {txn.created_at:%Y-%m-%d %H:%M})"
                )
            self.stdout.write(self.style.WARNING(f"Dry run: {count} transaction(s) would be checked."))
            return

        summary = reconcile_pending(
            provider_key=provider, older_than_minutes=older_than, limit=limit
        )

        self.stdout.write(
            "Checked {checked}: settled {settled}, failed {failed}, "
            "mismatch {mismatch}, unverifiable {unverifiable}.".format(**summary)
        )
        if summary["settled"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{summary['settled']} payment(s) settled that the webhook never delivered."
                )
            )
        if summary["mismatch"]:
            self.stdout.write(
                self.style.ERROR(
                    f"{summary['mismatch']} payment(s) held for review — amount or currency "
                    "did not match. Investigate these before shipping anything."
                )
            )
