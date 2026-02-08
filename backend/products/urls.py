from django.urls import path
from .views import ProductListView, ProductDetailView, CategorylistView

urlpatterns = [
    path('products/', ProductListView.as_view(), name='product-list'),
    path('products/<slug:slug>/', ProductDetailView.as_view(), name='product-detail'),
    path('categories/', CategorylistView.as_view(), name='category-list'),
]
