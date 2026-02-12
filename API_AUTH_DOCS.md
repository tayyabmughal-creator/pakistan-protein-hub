# Authentication Flow

## Login
POST `/api/users/login`
**Request:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```
**Response:**
```json
{
  "refresh": "eyJ...",
  "access": "eyJ...",
  "id": 1,
  "name": "User Name",
  "email": "user@example.com",
  "is_staff": false
}
```
*Note: The user data is properly flattened in the root of the response object.*

## Register
POST `/api/users/register`
**Request:**
```json
{
  "name": "Full Name",
  "email": "user@example.com",
  "password": "password"
}
```
**Response:** `201 Created`
