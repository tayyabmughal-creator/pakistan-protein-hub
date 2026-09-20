from django.urls import path

from .views_admin_v2 import (
    AdminBrandDetailView,
    AdminBrandListView,
    AdminCategoryListV2View,
    AdminGoalListView,
    AdminMediaDetailView,
    AdminMediaListView,
    AdminProductDetailView,
    AdminProductListView,
    AdminProductPublishView,
    AdminVariantDetailView,
    AdminVariantListView,
)

urlpatterns = [
    path("admin/v2/catalog/products/", AdminProductListView.as_view(), name="admin-v2-product-list"),
    path("admin/v2/catalog/products/<int:pk>/", AdminProductDetailView.as_view(), name="admin-v2-product-detail"),
    # Publishing is a command, not a field: it has a precondition the
    # completeness checklist enforces.
    path("admin/v2/catalog/products/<int:pk>/publish/", AdminProductPublishView.as_view(), name="admin-v2-product-publish"),

    path("admin/v2/catalog/variants/", AdminVariantListView.as_view(), name="admin-v2-variant-create"),
    path("admin/v2/catalog/variants/<int:pk>/", AdminVariantDetailView.as_view(), name="admin-v2-variant-detail"),

    path("admin/v2/catalog/media/", AdminMediaListView.as_view(), name="admin-v2-media-create"),
    path("admin/v2/catalog/media/<int:pk>/", AdminMediaDetailView.as_view(), name="admin-v2-media-detail"),

    path("admin/v2/catalog/brands/", AdminBrandListView.as_view(), name="admin-v2-brand-list"),
    path("admin/v2/catalog/brands/<int:pk>/", AdminBrandDetailView.as_view(), name="admin-v2-brand-detail"),

    path("admin/v2/catalog/goals/", AdminGoalListView.as_view(), name="admin-v2-goal-list"),
    path("admin/v2/catalog/categories/", AdminCategoryListV2View.as_view(), name="admin-v2-category-list"),
]
