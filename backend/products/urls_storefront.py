"""Public storefront routes.

Mounted under ``/api/v2/storefront/``. The legacy ``/api/products/`` routes are
untouched and still serve the current Vite SPA — the two run side by side until
the Next.js storefront takes over the domain, so a failed cutover is a DNS
change back rather than a redeploy.
"""

from django.urls import path

from .views_storefront import (
    StorefrontBrandListView,
    StorefrontCategoryListView,
    StorefrontFiltersView,
    StorefrontGoalListView,
    StorefrontProductDetailView,
    StorefrontProductListView,
    StorefrontRelatedProductsView,
    StorefrontSettingsView,
    StorefrontSitemapView,
)

app_name = "storefront_v2"

urlpatterns = [
    path("v2/storefront/products/", StorefrontProductListView.as_view(), name="product-list"),
    path(
        "v2/storefront/products/<slug:slug>/",
        StorefrontProductDetailView.as_view(),
        name="product-detail",
    ),
    path(
        "v2/storefront/products/<slug:slug>/related/",
        StorefrontRelatedProductsView.as_view(),
        name="product-related",
    ),
    path("v2/storefront/filters/", StorefrontFiltersView.as_view(), name="filters"),
    path("v2/storefront/brands/", StorefrontBrandListView.as_view(), name="brand-list"),
    path("v2/storefront/categories/", StorefrontCategoryListView.as_view(), name="category-list"),
    path("v2/storefront/goals/", StorefrontGoalListView.as_view(), name="goal-list"),
    path("v2/storefront/settings/", StorefrontSettingsView.as_view(), name="settings"),
    path("v2/storefront/sitemap/", StorefrontSitemapView.as_view(), name="sitemap"),
]
