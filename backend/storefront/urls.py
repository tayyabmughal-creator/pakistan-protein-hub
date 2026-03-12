from django.urls import path

from .views import HomePageSettingsPublicView
from .views_admin import (
    AdminCatalogSummaryView,
    AdminDashboardSummaryView,
    AdminHomePageSettingsView,
    AdminReportDownloadView,
)

urlpatterns = [
    path("storefront/homepage-settings/", HomePageSettingsPublicView.as_view(), name="homepage-settings-public"),
    path("admin/dashboard/", AdminDashboardSummaryView.as_view(), name="admin-dashboard"),
    path("admin/catalog-summary/", AdminCatalogSummaryView.as_view(), name="admin-catalog-summary"),
    path("admin/homepage-settings/", AdminHomePageSettingsView.as_view(), name="admin-homepage-settings"),
    path("admin/reports/<str:report_key>/", AdminReportDownloadView.as_view(), name="admin-report-download"),
]
