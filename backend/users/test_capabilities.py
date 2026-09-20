"""Authorisation: deny by default, and the API is what enforces it.

A hidden button is a usability choice. These tests are about what happens when
someone opens the network tab and calls the endpoint directly.
"""

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, APITestCase

from common.permissions import HasCapability, capability_required
from users.capabilities import (
    ALL_CAPABILITIES,
    CAP_CATALOG_EDIT,
    CAP_INVENTORY_ADJUST,
    CAP_ORDER_REFUND,
    CAP_ORDER_TRANSITION,
    CAP_ORDER_VIEW,
    CAP_STAFF_MANAGE,
    ROLE_CAPABILITIES,
    ROLE_FULFILMENT,
    ROLE_MANAGER,
    ROLE_MARKETING,
    ROLE_OWNER,
)
from users.models import User


def make_staff(email, role=None, *, is_superuser=False, is_active=True):
    user = User.objects.create_user(
        username=email, email=email, name=email.split("@")[0], password="pw"
    )
    user.is_staff = True
    user.is_superuser = is_superuser
    user.is_active = is_active
    user.save()
    if role:
        user.groups.add(Group.objects.get(name=role))
    return user


class RoleDefinitionTests(TestCase):
    def test_every_role_grants_only_known_capabilities(self):
        """A typo in the capability table would silently grant nothing."""
        for role, capabilities in ROLE_CAPABILITIES.items():
            unknown = capabilities - ALL_CAPABILITIES
            self.assertEqual(unknown, set(), f"{role} references unknown: {unknown}")

    def test_only_the_owner_can_manage_staff(self):
        """The capability that can grant every other one stays with the owner."""
        for role, capabilities in ROLE_CAPABILITIES.items():
            if role == ROLE_OWNER:
                self.assertIn(CAP_STAFF_MANAGE, capabilities)
            else:
                self.assertNotIn(CAP_STAFF_MANAGE, capabilities, f"{role} should not manage staff")

    def test_fulfilment_cannot_touch_money_or_prices(self):
        capabilities = ROLE_CAPABILITIES[ROLE_FULFILMENT]
        self.assertNotIn(CAP_ORDER_REFUND, capabilities)
        self.assertNotIn(CAP_CATALOG_EDIT, capabilities)
        # But can do the job it exists for.
        self.assertIn(CAP_ORDER_TRANSITION, capabilities)
        self.assertIn(CAP_INVENTORY_ADJUST, capabilities)

    def test_marketing_cannot_change_orders_or_stock(self):
        capabilities = ROLE_CAPABILITIES[ROLE_MARKETING]
        self.assertNotIn(CAP_ORDER_TRANSITION, capabilities)
        self.assertNotIn(CAP_ORDER_REFUND, capabilities)
        self.assertNotIn(CAP_INVENTORY_ADJUST, capabilities)
        self.assertIn(CAP_CATALOG_EDIT, capabilities)


class UserCapabilityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def test_a_staff_account_with_no_role_can_do_nothing(self):
        """Deny by default. Adding someone is not the same as authorising them."""
        user = make_staff("new@example.com")
        self.assertEqual(user.get_capabilities(), set())
        for capability in ALL_CAPABILITIES:
            self.assertFalse(user.has_capability(capability))

    def test_a_role_grants_exactly_its_capabilities(self):
        user = make_staff("packer@example.com", ROLE_FULFILMENT)
        self.assertEqual(user.get_capabilities(), ROLE_CAPABILITIES[ROLE_FULFILMENT])
        self.assertTrue(user.has_capability(CAP_ORDER_TRANSITION))
        self.assertFalse(user.has_capability(CAP_ORDER_REFUND))

    def test_two_roles_combine(self):
        user = make_staff("both@example.com", ROLE_FULFILMENT)
        user.groups.add(Group.objects.get(name=ROLE_MARKETING))
        user._capability_cache = None

        self.assertTrue(user.has_capability(CAP_ORDER_TRANSITION))  # from Fulfilment
        self.assertTrue(user.has_capability(CAP_CATALOG_EDIT))      # from Marketing

    def test_a_superuser_has_everything(self):
        user = make_staff("owner@example.com", is_superuser=True)
        self.assertEqual(user.get_capabilities(), set(ALL_CAPABILITIES))

    def test_removing_staff_access_removes_every_capability(self):
        """Revoking access must be one flag, not an audit of group memberships."""
        user = make_staff("leaver@example.com", ROLE_MANAGER)
        self.assertTrue(user.has_capability(CAP_ORDER_VIEW))

        user.is_staff = False
        user.save(update_fields=["is_staff"])

        self.assertFalse(user.has_capability(CAP_ORDER_VIEW))

    def test_deactivating_an_account_removes_every_capability(self):
        user = make_staff("suspended@example.com", ROLE_OWNER)
        user.is_active = False
        user.save(update_fields=["is_active"])

        self.assertFalse(user.has_capability(CAP_ORDER_VIEW))

    def test_a_deactivated_superuser_is_also_denied(self):
        user = make_staff("gone@example.com", is_superuser=True, is_active=False)
        self.assertFalse(user.has_capability(CAP_ORDER_VIEW))

    def test_a_customer_account_is_not_staff_and_has_nothing(self):
        customer = User.objects.create_user(
            username="c@example.com", email="c@example.com", name="C", password="pw"
        )
        self.assertFalse(customer.has_capability(CAP_ORDER_VIEW))


class PermissionClassTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def _check(self, permission_class, user, view, method="GET"):
        request = APIRequestFactory().generic(method, "/")
        request.user = user
        return permission_class().has_permission(request, view)

    def test_a_view_that_names_no_capability_denies_everyone(self):
        """Forgetting to name one must make a screen unreachable, not public."""

        class ViewWithoutCapability:
            pass

        owner = make_staff("owner@example.com", ROLE_OWNER)
        self.assertFalse(self._check(HasCapability, owner, ViewWithoutCapability()))

    def test_an_anonymous_caller_is_denied(self):
        from django.contrib.auth.models import AnonymousUser

        class View:
            required_capability = CAP_ORDER_VIEW

        self.assertFalse(self._check(HasCapability, AnonymousUser(), View()))

    def test_the_capability_is_what_decides(self):
        class View:
            required_capability = CAP_ORDER_REFUND

        manager = make_staff("m@example.com", ROLE_MANAGER)
        packer = make_staff("p@example.com", ROLE_FULFILMENT)

        self.assertTrue(self._check(HasCapability, manager, View()))
        self.assertFalse(self._check(HasCapability, packer, View()))

    def test_a_view_can_require_less_to_read_than_to_write(self):
        class View:
            required_capability = CAP_CATALOG_EDIT
            required_read_capability = CAP_ORDER_VIEW

        packer = make_staff("p2@example.com", ROLE_FULFILMENT)

        self.assertTrue(self._check(HasCapability, packer, View(), method="GET"))
        self.assertFalse(self._check(HasCapability, packer, View(), method="POST"))

    def test_the_inline_factory_behaves_the_same(self):
        permission = capability_required(CAP_INVENTORY_ADJUST)

        packer = make_staff("p3@example.com", ROLE_FULFILMENT)
        marketer = make_staff("mk@example.com", ROLE_MARKETING)

        self.assertTrue(self._check(permission, packer, object()))
        self.assertFalse(self._check(permission, marketer, object()))


class RoleSyncCommandTests(TestCase):
    def test_the_command_is_idempotent(self):
        call_command("sync_staff_roles", verbosity=0)
        before = Group.objects.count()
        call_command("sync_staff_roles", verbosity=0)
        self.assertEqual(Group.objects.count(), before)

    def test_assigning_a_role_also_grants_staff_access(self):
        """A role without the staff flag is an account that looks authorised."""
        call_command("sync_staff_roles", verbosity=0)
        user = User.objects.create_user(
            username="ops@example.com", email="ops@example.com", name="Ops", password="pw"
        )
        self.assertFalse(user.is_staff)

        call_command("sync_staff_roles", assign=["ops@example.com=Fulfilment"], verbosity=0)

        user.refresh_from_db()
        self.assertTrue(user.is_staff)
        self.assertTrue(user.has_capability(CAP_ORDER_TRANSITION))

    def test_an_unknown_role_is_refused(self):
        from django.core.management.base import CommandError

        call_command("sync_staff_roles", verbosity=0)
        User.objects.create_user(
            username="x@example.com", email="x@example.com", name="X", password="pw"
        )
        with self.assertRaises(CommandError):
            call_command("sync_staff_roles", assign=["x@example.com=Wizard"], verbosity=0)
