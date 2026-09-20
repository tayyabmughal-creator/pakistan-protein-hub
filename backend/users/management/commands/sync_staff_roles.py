"""Create the staff role groups.

    python manage.py sync_staff_roles
    python manage.py sync_staff_roles --assign owner@example.com=Owner

Idempotent. Run after deploying a change to users/capabilities.py.

Roles are Django Groups so they show up in the Django admin and in
``user.groups``; the capabilities each one grants live in code, because a
permission model editable through a web form is a permission model that can be
escalated through a web form.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError

from users.capabilities import ALL_ROLES, ROLE_CAPABILITIES, ROLE_DESCRIPTIONS

User = get_user_model()


class Command(BaseCommand):
    help = "Create the staff role groups defined in users/capabilities.py."

    def add_arguments(self, parser):
        parser.add_argument(
            "--assign",
            action="append",
            default=[],
            metavar="EMAIL=ROLE",
            help="Give a user a role, e.g. --assign ops@example.com=Fulfilment",
        )
        parser.add_argument("--list", action="store_true", help="Show roles and who holds them.")

    def handle(self, *args, **options):
        for role in ALL_ROLES:
            group, created = Group.objects.get_or_create(name=role)
            verb = "Created" if created else "Present"
            self.stdout.write(
                f"  {verb:8} {role:<12} {len(ROLE_CAPABILITIES[role]):>2} capabilities "
                f"— {ROLE_DESCRIPTIONS[role]}"
            )

        for assignment in options["assign"]:
            if "=" not in assignment:
                raise CommandError(f"Expected EMAIL=ROLE, got {assignment!r}")
            email, _, role = assignment.partition("=")
            self._assign(email.strip(), role.strip())

        if options["list"]:
            self._list()

        return "ok"

    def _assign(self, email, role):
        if role not in ALL_ROLES:
            raise CommandError(f"Unknown role {role!r}. Choose from: {', '.join(ALL_ROLES)}")

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No user with email {email!r}")

        group = Group.objects.get(name=role)
        user.groups.add(group)

        # A role is useless without staff access; granting one and leaving the
        # flag off produces an account that looks authorised and is not.
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=["is_staff"])
            self.stdout.write(self.style.WARNING(f"  Marked {email} as staff."))

        self.stdout.write(self.style.SUCCESS(f"  {email} is now {role}."))

    def _list(self):
        self.stdout.write("")
        for role in ALL_ROLES:
            holders = list(
                User.objects.filter(groups__name=role).values_list("email", flat=True)
            )
            self.stdout.write(f"  {role:<12} {', '.join(holders) if holders else '(nobody)'}")

        orphans = User.objects.filter(is_staff=True, is_superuser=False, groups__isnull=True)
        if orphans.exists():
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    f"  {orphans.count()} staff account(s) have no role and can see nothing: "
                    + ", ".join(orphans.values_list("email", flat=True)[:10])
                )
            )
