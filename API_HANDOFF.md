# API Handoff Guide - Pakistan Protein Hub

This document provides the necessary information for the frontend team to integrate with the backend API.

## 1. API Documentation
We use **Swagger/OpenAPI** for interactive documentation.
- **Swagger UI**: [http://127.0.0.1:8000/api/docs/](http://127.0.0.1:8000/api/docs/)
- **Schema (YAML)**: See `backend/api_schema.yaml` (generated in project root) or download from `http://127.0.0.1:8000/api/schema/`

**Recommendation**: Import the `api_schema.yaml` into **Postman** or **Insomnia** to auto-generate a collection for testing.

## 2. Base URL
All API requests should be prefixed with:
`http://127.0.0.1:8000`

## 3. Authentication
The API uses **JWT (JSON Web Token)** authentication.
- **Login Endpoint**: `POST /api/users/login/`
  - Body: `{ "email": "user@example.com", "password": "password" }`
  - Response: `{ "refresh": "...", "access": "..." }`
- **Register Endpoint**: `POST /api/users/register/`

**Authorization Header**:
For protected routes (e.g., Checkout, Profile), include the header:
`Authorization: Bearer <access_token>`

## 4. Key Workflows

### Shopping Cart
1. **Get Cart**: `GET /api/cart/`
2. **Add Item**: `POST /api/cart/items/` (Body: `{ "product_id": 1, "quantity": 1 }`)
3. **Update Item**: `PATCH /api/cart/items/{id}/`
4. **Remove Item**: `DELETE /api/cart/items/{id}/`

### Checkout
1. **Create Address**: `POST /api/users/addresses/`
2. **Place Order**: `POST /api/orders/`
   - Body: `{ "address_id": 1, "payment_method": "COD" }`

### Products
- **List**: `GET /api/products/`
  - Filters: `?category=protein`, `?search=whey`, `?ordering=price`

## 5. Error Handling
Errors follow a standard format:
```json
{
    "status_code": 400,
    "error_type": "ValidationError",
    "detail": "Error description here"
}
```

## 6. Local Development
- Backend running on: `http://127.0.0.1:8000`
- Frontend running on: `http://127.0.0.1:8080` (ensure `vite.config.ts` proxies correctly if needed or use absolute URLs)
