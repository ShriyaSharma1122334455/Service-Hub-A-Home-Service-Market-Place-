# ServiceHub API Documentation

## Base URL

http://localhost:3000/api

## Endpoints

### Categories

#### Get All Categories
GET /categories

Response:
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
GET /categories/:id

#### Get Category by Slug
GET /categories/slug/:slug

### Health Check

#### Server Health
GET /health

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-02-10T...",
  "uptime": 123.456,
  "mongodb": "connected"
}
```

### Test Endpoints

#### Send Test Email
POST /test/test-email

Body:
```json
{
  "to": "your-email@example.com"
}
```

---

## Coming Soon
- User authentication
- Provider management
- Service catalog
- Booking system
- Reviews and ratings
