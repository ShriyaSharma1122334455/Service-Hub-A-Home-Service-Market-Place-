# ServiceHub API Documentation

## Base URL

```
http://localhost:3000/api
```

## Authentication

Protected endpoints require a valid Supabase JWT in the Authorization header:

```
Authorization: Bearer <supabase-jwt-token>
```

Tokens are obtained from Supabase Auth after sign-in. The middleware validates the token and attaches `req.user = { id, email, role }` to every authenticated request.

### Roles

| Role | Access Level |
|------|-------------|
| `customer` | Browse services/providers, create bookings, view own profile |
| `provider` | All customer access + create/edit own services, accept/reject bookings |
| `admin` | Full access to all endpoints |

---

## Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": {},
  "message": "Optional message"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable description"
}
```

---

## Endpoints

---

### Health Check

#### Server Health
`GET /health`

> No authentication required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-02-10T...",
  "uptime": 123.456,
  "mongodb": "connected"
}
```

---

### Categories
> Sprint 1 — No authentication required

#### Get All Categories
`GET /categories`

**Response:**
```json
{
  "success": true,
  "count": 4,
  "data": [
    {
      "_id": "...",
      "name": "Plumbing",
      "slug": "plumbing",
      "description": "Professional plumbing services...",
      "icon": "plumbing-icon.svg",
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

#### Get Category by ID
`GET /categories/:id`

#### Get Category by Slug
`GET /categories/slug/:slug`

---

### Test Endpoints
> Sprint 1

#### Send Test Email
`POST /test/test-email`

**Body:**
```json
{
  "to": "your-email@example.com"
}
```

---

### Profile Routes
> Sprint 2 — `feature/secure-routes`

#### Get Own Profile
`GET /profile/me`

> 🔒 Authentication required — any role

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "customer",
    "fullName": "John Doe",
    "avatarUrl": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Errors:**

| Code | Cause |
|------|-------|
| 401 | Missing or invalid Bearer token |
| 404 | User profile not found in database |

---

#### Get All Providers (Public Catalog)
`GET /profile/providers`

> 🌐 No authentication required

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 50) |

---

#### Get Single Provider
`GET /profile/provider/:id`

> 🌐 No authentication required

---

#### Get All Users
`GET /profile/users`

> 🔒 Authentication required — `admin` only

---

#### Get Single User
`GET /profile/user/:id`

> 🔒 Authentication required — `admin` only

---

### Services API
> Sprint 2 — `feature/services-api`

#### List Services
`GET /services`

> 🌐 No authentication required

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by category ObjectId |
| `minPrice` | number | Minimum price filter |
| `maxPrice` | number | Maximum price filter |
| `search` | string | Search by name or description |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10) |

**Response:**
```json
{
  "success": true,
  "count": 10,
  "total": 45,
  "page": 1,
  "data": [
    {
      "_id": "...",
      "name": "Bathroom Renovation",
      "description": "Full bathroom remodel",
      "category": "...",
      "price": 2500,
      "priceType": "fixed",
      "estimatedDuration": "3-5 days",
      "isActive": true
    }
  ]
}
```

---

#### Get Single Service
`GET /services/:id`

> 🌐 No authentication required

---

#### Create Service
`POST /services`

> 🔒 Authentication required — `provider` role

**Body:**
```json
{
  "name": "Bathroom Renovation",
  "description": "Full bathroom remodel including tiles and fixtures",
  "category": "64a1b2c3d4e5f6789012345",
  "price": 2500,
  "priceType": "fixed",
  "estimatedDuration": "3-5 days"
}
```

**Response:** `201 Created`

---

#### Update Service
`PUT /services/:id`

> 🔒 Authentication required — `provider` role (own services only)

---

#### Delete Service
`DELETE /services/:id`

> 🔒 Authentication required — `provider` role (own services only)

Soft-deletes the service by setting `isActive` to `false`.

---

### Providers API
> Sprint 2 — `feature/providers-api`

#### List All Providers
`GET /providers`

> 🌐 No authentication required

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10) |

---

#### Search Providers
`GET /providers/search`

> 🌐 No authentication required

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by service category ObjectId |
| `minRating` | number | Minimum average rating (0–5) |
| `isActive` | boolean | Filter by active status (default: true) |
| `search` | string | Search by business name |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10) |

---

#### Get Single Provider
`GET /providers/:id`

> 🌐 No authentication required

Returns full provider profile including services and verification status.

---

### Bookings API
> Sprint 2 — `feature/booking-api`

#### Create Booking
`POST /bookings`

> 🔒 Authentication required — `customer` role

**Body:**
```json
{
  "serviceId": "64a1b2c3d4e5f6789012345",
  "providerId": "64a1b2c3d4e5f6789012346",
  "scheduledDate": "2026-04-15T10:00:00.000Z",
  "address": {
    "street": "123 Main St",
    "city": "Newark",
    "state": "NJ",
    "zip": "07102"
  },
  "notes": "Please call before arriving"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "64a1b2c3d4e5f6789012347",
    "status": "pending",
    "customerId": "...",
    "providerId": "...",
    "serviceId": "...",
    "scheduledDate": "2026-04-15T10:00:00.000Z",
    "createdAt": "2026-03-02T00:00:00.000Z"
  }
}
```

---

#### List Bookings
`GET /bookings`

> 🔒 Authentication required — any role

Returns bookings filtered automatically by the authenticated user's role:
- **Customer** — sees only their own bookings
- **Provider** — sees only bookings assigned to them
- **Admin** — sees all bookings

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter: `pending`, `accepted`, `rejected`, `completed` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10) |

---

#### Get Single Booking
`GET /bookings/:id`

> 🔒 Authentication required — booking owner or admin

---

#### Accept Booking
`PUT /bookings/:id/accept`

> 🔒 Authentication required — `provider` role (own bookings only)

Changes booking status from `pending` → `accepted`.

---

#### Reject Booking
`PUT /bookings/:id/reject`

> 🔒 Authentication required — `provider` role (own bookings only)

Changes booking status from `pending` → `rejected`.

**Body (optional):**
```json
{
  "reason": "Not available on requested date"
}
```

---

### Booking Status Flow

```
POST /bookings → status: pending
                      |
          +-----------+-----------+
          |                       |
   PUT .../accept          PUT .../reject
          |                       |
   status: accepted        status: rejected
          |
   (Future sprint)
          |
   status: completed
```

---

## Endpoint Summary

| Method | Endpoint | Auth | Role | Sprint |
|--------|----------|------|------|--------|
| GET | `/health` | No | — | 1 |
| GET | `/categories` | No | — | 1 |
| GET | `/categories/:id` | No | — | 1 |
| GET | `/categories/slug/:slug` | No | — | 1 |
| POST | `/test/test-email` | No | — | 1 |
| GET | `/profile/me` | Yes | Any | 2 |
| GET | `/profile/providers` | No | — | 2 |
| GET | `/profile/provider/:id` | No | — | 2 |
| GET | `/profile/users` | Yes | admin | 2 |
| GET | `/profile/user/:id` | Yes | admin | 2 |
| GET | `/services` | No | — | 2 |
| GET | `/services/:id` | No | — | 2 |
| POST | `/services` | Yes | provider | 2 |
| PUT | `/services/:id` | Yes | provider | 2 |
| DELETE | `/services/:id` | Yes | provider | 2 |
| GET | `/providers` | No | — | 2 |
| GET | `/providers/search` | No | — | 2 |
| GET | `/providers/:id` | No | — | 2 |
| POST | `/bookings` | Yes | customer | 2 |
| GET | `/bookings` | Yes | Any | 2 |
| GET | `/bookings/:id` | Yes | Owner/admin | 2 |
| PUT | `/bookings/:id/accept` | Yes | provider | 2 |
| PUT | `/bookings/:id/reject` | Yes | provider | 2 |

---

## Coming Soon
- Reviews and ratings
- Payment integration (Jaysheel)
- User verification / identity check (Prithvi)
- Damage assessment endpoints (Jaysheel)
- Notifications