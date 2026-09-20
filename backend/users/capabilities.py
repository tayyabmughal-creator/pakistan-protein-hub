"""Who is allowed to do what.

Four roles, deliberately. Enfant has six plus a thirty-five item sidebar; a shop
with a counter, a stockroom and an owner does not need that, and every extra
role is one more thing to get wrong when someone joins.

Roles are *bundles of capabilities*, and code checks the capability, never the
role. ``if user.role == "Manager"`` spreads a policy decision across every view
that asks; ``if user.has_capability(CAP_ORDER_REFUND)`` keeps it here, where
changing who may refund is one line in one table.

Deny by default. A capability not listed for a role is denied, and a staff
account with no role can log in and see nothing.

Superusers bypass these checks. That is intentional and is the reason
``staff.manage`` exists as a separate capability: granting someone the ability
to create staff is a bigger decision than granting them any other one.
"""

# -- capabilities ----------------------------------------------------------
# Named for the thing being done, not the screen it happens on, so a redesign
# does not invalidate the permission model.

CAP_DASHBOARD_VIEW = "dashboard.view"
CAP_REPORTS_VIEW = "reports.view"

CAP_ORDER_VIEW = "order.view"
CAP_ORDER_TRANSITION = "order.transition"
CAP_ORDER_CANCEL = "order.cancel"
CAP_ORDER_REFUND = "order.refund"

CAP_RETURN_VIEW = "return.view"
CAP_RETURN_MANAGE = "return.manage"

CAP_PAYMENT_VIEW = "payment.view"
CAP_PAYMENT_REVIEW = "payment.review"

CAP_CATALOG_VIEW = "catalog.view"
CAP_CATALOG_EDIT = "catalog.edit"
CAP_CATALOG_PUBLISH = "catalog.publish"

CAP_INVENTORY_VIEW = "inventory.view"
CAP_INVENTORY_ADJUST = "inventory.adjust"
CAP_INVENTORY_RECEIVE = "inventory.receive"

CAP_CUSTOMER_VIEW = "customer.view"
CAP_CUSTOMER_EDIT = "customer.edit"

CAP_MARKETING_MANAGE = "marketing.manage"

CAP_AUDIT_VIEW = "audit.view"
CAP_STAFF_MANAGE = "staff.manage"

ALL_CAPABILITIES = frozenset(
    {
        CAP_DASHBOARD_VIEW, CAP_REPORTS_VIEW,
        CAP_ORDER_VIEW, CAP_ORDER_TRANSITION, CAP_ORDER_CANCEL, CAP_ORDER_REFUND,
        CAP_RETURN_VIEW, CAP_RETURN_MANAGE,
        CAP_PAYMENT_VIEW, CAP_PAYMENT_REVIEW,
        CAP_CATALOG_VIEW, CAP_CATALOG_EDIT, CAP_CATALOG_PUBLISH,
        CAP_INVENTORY_VIEW, CAP_INVENTORY_ADJUST, CAP_INVENTORY_RECEIVE,
        CAP_CUSTOMER_VIEW, CAP_CUSTOMER_EDIT,
        CAP_MARKETING_MANAGE,
        CAP_AUDIT_VIEW, CAP_STAFF_MANAGE,
    }
)

#: Shown next to each capability when assigning a role, so whoever grants it
#: knows what they are granting.
CAPABILITY_DESCRIPTIONS = {
    CAP_DASHBOARD_VIEW: "See the dashboard and its figures.",
    CAP_REPORTS_VIEW: "View and download reports.",
    CAP_ORDER_VIEW: "See orders and their details.",
    CAP_ORDER_TRANSITION: "Confirm, pack, ship and deliver orders.",
    CAP_ORDER_CANCEL: "Cancel an order and return its stock.",
    CAP_ORDER_REFUND: "Return money to a customer.",
    CAP_RETURN_VIEW: "See return requests.",
    CAP_RETURN_MANAGE: "Approve, reject and receive returns.",
    CAP_PAYMENT_VIEW: "See payment transactions.",
    CAP_PAYMENT_REVIEW: "Approve or fail a payment held for review.",
    CAP_CATALOG_VIEW: "See products, variants and brands.",
    CAP_CATALOG_EDIT: "Create and edit products, variants, brands and prices.",
    CAP_CATALOG_PUBLISH: "Publish or unpublish a product.",
    CAP_INVENTORY_VIEW: "See stock levels and movement history.",
    CAP_INVENTORY_ADJUST: "Write off damage and correct counts.",
    CAP_INVENTORY_RECEIVE: "Record stock arriving from a supplier.",
    CAP_CUSTOMER_VIEW: "See customer records and their orders.",
    CAP_CUSTOMER_EDIT: "Edit customer details.",
    CAP_MARKETING_MANAGE: "Manage promotions and homepage content.",
    CAP_AUDIT_VIEW: "Read the audit log.",
    CAP_STAFF_MANAGE: "Add staff and change what they can do.",
}

# -- roles -----------------------------------------------------------------

ROLE_OWNER = "Owner"
ROLE_MANAGER = "Manager"
ROLE_FULFILMENT = "Fulfilment"
ROLE_MARKETING = "Marketing"

ROLE_CAPABILITIES = {
    # The business owner. Everything, including adding staff.
    ROLE_OWNER: set(ALL_CAPABILITIES),

    # Runs the shop day to day. Everything except creating staff accounts and
    # changing what people can do — that stays with the owner, because it is the
    # capability that can grant every other one.
    ROLE_MANAGER: set(ALL_CAPABILITIES) - {CAP_STAFF_MANAGE},

    # Packs and ships. Needs to move orders and correct stock; has no business
    # setting prices or moving money.
    ROLE_FULFILMENT: {
        CAP_DASHBOARD_VIEW,
        CAP_ORDER_VIEW, CAP_ORDER_TRANSITION,
        CAP_RETURN_VIEW, CAP_RETURN_MANAGE,
        CAP_INVENTORY_VIEW, CAP_INVENTORY_ADJUST, CAP_INVENTORY_RECEIVE,
        CAP_CATALOG_VIEW,
        CAP_CUSTOMER_VIEW,
    },

    # Runs promotions and content. Reads orders for context, cannot change them,
    # and cannot touch money or stock.
    ROLE_MARKETING: {
        CAP_DASHBOARD_VIEW, CAP_REPORTS_VIEW,
        CAP_CATALOG_VIEW, CAP_CATALOG_EDIT, CAP_CATALOG_PUBLISH,
        CAP_MARKETING_MANAGE,
        CAP_ORDER_VIEW,
        CAP_CUSTOMER_VIEW,
    },
}

ROLE_DESCRIPTIONS = {
    ROLE_OWNER: "Full access, including adding staff.",
    ROLE_MANAGER: "Runs the shop. Everything except managing staff.",
    ROLE_FULFILMENT: "Packs, ships and counts stock. No prices, no refunds.",
    ROLE_MARKETING: "Products, promotions and content. Cannot change orders or stock.",
}

ALL_ROLES = tuple(ROLE_CAPABILITIES)


def capabilities_for_roles(role_names):
    """Union of the capabilities granted by these roles."""
    granted = set()
    for name in role_names:
        granted |= ROLE_CAPABILITIES.get(name, set())
    return granted
