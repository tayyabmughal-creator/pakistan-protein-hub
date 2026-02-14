from django.urls import path
from .views import ProductListView, ProductDetailView, CategorylistView
from .views_admin import AdminProductListCreateView, AdminProductDetailView, AdminCategoryListCreateView, AdminCategoryDetailView

urlpatterns = [
    path('products/', ProductListView.as_view(), name='product-list'),
    path('products/<slug:slug>/', ProductDetailView.as_view(), name='product-detail'),
    path('categories/', CategorylistView.as_view(), name='category-list'),

    # Admin URLs
    path('admin/products/', AdminProductListCreateView.as_view(), name='admin-product-list-create'),
    path('admin/products/<int:pk>/', AdminProductDetailView.as_view(), name='admin-product-detail'),
    path('admin/categories/', AdminCategoryListCreateView.as_view(), name='admin-category-list-create'),
    path('admin/categories/<int:pk>/', AdminCategoryDetailView.as_view(), name='admin-category-detail'),
]
