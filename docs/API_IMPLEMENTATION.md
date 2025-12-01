# Mews API Implementation Documentation

**Integration Name:** Click A Tree - Sustainability Upsell Integration  
**Partner ID:** [To be assigned by Mews]  
**Version:** 1.0.0  
**Last Updated:** December 2025

---

## Overview

Click A Tree integrates with Mews PMS to enable hotels to offer tree planting as an upsell product at checkout. The integration tracks all tree orders and automatically generates monthly invoices for hotels.

**Key Features:**
- Real-time order tracking via webhooks
- Automatic monthly invoice generation
- Privacy-first: No guest data stored
- Comprehensive logging for audit trail

---

## API Endpoints Used

### 1. Service Orders (Primary Data Source)

#### Get All Orders
- **Endpoint:** `POST /api/connector/v1/orders/getAll`
- **Frequency:** 
  - **Primary:** Webhook-based (real-time)
  - **Fallback:** Daily sync at 2:00 AM UTC
- **Purpose:** Retrieve tree product orders from Mews
- **Request Body:**
```json
{
  "ClientToken": "[CLIENT_TOKEN]",
  "AccessToken": "[ACCESS_TOKEN]",
  "ServiceIds": ["[TREE_SERVICE_ID]"],
  "CreatedUtc": {
    "StartUtc": "2025-12-01T00:00:00Z",
    "EndUtc": "2025-12-01T23:59:59Z"
  }
}
```
- **Expected Response:** List of service orders with:
  - Order ID
  - Service ID (must match tree product)
  - Quantity (number of trees)
  - Amount (price)
  - Currency
  - State (Confirmed, Canceled, etc.)

**API Call Logic:**
1. Filter by `ServiceIds` to only get tree orders
2. Use time-based filtering to avoid duplicate processing
3. Store `mewsId` (Order ID) as unique identifier
4. Handle pagination if > 1000 orders

**Error Handling:**
- 429 (Rate Limit): Exponential backoff, retry after delay
- 500+ (Server Error): Retry up to 3 times
- 401 (Unauthorized): Log error, alert admin
- Other errors: Log and continue

---

### 2. Reservations (Optional Context)

#### Get All Reservations
- **Endpoint:** `POST /api/connector/v1/reservations/getAll`
- **Frequency:** Daily at 2:00 AM UTC
- **Purpose:** Link orders to reservations for additional context (optional)
- **Request Body:**
```json
{
  "ClientToken": "[CLIENT_TOKEN]",
  "AccessToken": "[ACCESS_TOKEN]",
  "TimeFilter": {
    "StartUtc": "2025-12-01T00:00:00Z",
    "EndUtc": "2025-12-01T23:59:59Z"
  }
}
```

**Note:** This endpoint is used for enrichment only. The integration works without it.

---

## Webhook Integration

### Webhook Endpoint
- **URL:** `https://[your-domain].vercel.app/api/webhooks/mews`
- **Method:** POST
- **Authentication:** HMAC SHA-256 signature verification

### Events Subscribed

#### 1. ServiceOrderCreated
**Trigger:** New tree order placed by guest  
**Action:** Create `TreeOrder` record in database  
**Processing Time:** < 500ms  

**Event Payload:**
```json
{
  "Id": "event-uuid",
  "Type": "ServiceOrderCreated",
  "CreatedUtc": "2025-12-01T10:00:00Z",
  "Data": {
    "Id": "order-uuid",
    "ServiceId": "tree-service-id",
    "Count": 1,
    "Amount": {
      "Currency": "EUR",
      "GrossValue": 5.00
    }
  }
}
```

**Processing Steps:**
1. Verify webhook signature
2. Store event in `WebhookEvent` table (audit trail)
3. Check if `ServiceId` matches tree product
4. Create/update `TreeOrder` record
5. Mark event as processed
6. Return 200 OK immediately

---

#### 2. ServiceOrderUpdated
**Trigger:** Guest changes tree quantity  
**Action:** Update `TreeOrder` quantity and amount  
**Processing Time:** < 500ms  

---

#### 3. ServiceOrderCanceled
**Trigger:** Order canceled by hotel/guest  
**Action:** Delete `TreeOrder` record  
**Processing Time:** < 500ms  

---

### Webhook Reliability

**Deduplication:**
- Events stored with unique `eventId`
- Duplicate events ignored automatically

**Retry Logic:**
- Failed events stored in database
- Automatic retry up to 5 times
- Exponential backoff: 1s, 2s, 4s, 8s, 16s

**Monitoring:**
- All events logged to `WebhookEvent` table
- Failed events flagged for manual review
- Health check endpoint monitors webhook processing

---

## Rate Limiting

**Mews API Limit:** 100 requests/minute  
**Our Implementation:** 90 requests/minute (conservative)

**Strategy:**
- Token bucket algorithm
- Per-hotel rate limiting
- Automatic queuing when limit approached
- Webhooks reduce API calls by ~80%

**Monitoring:**
- Track API calls in `ApiLog` table
- Alert if approaching rate limit
- Circuit breaker opens if too many failures

---

## Error Handling

### Retry Strategy

**Retryable Errors:**
- 429 (Rate Limit Exceeded)
- 500, 502, 503, 504 (Server Errors)
- Network timeouts

**Non-Retryable Errors:**
- 400 (Bad Request)
- 401 (Unauthorized)
- 404 (Not Found)

**Retry Logic:**
```
Attempt 1: Immediate
Attempt 2: Wait 1 second
Attempt 3: Wait 2 seconds
Attempt 4: Wait 4 seconds
Max Attempts: 3
```

### Circuit Breaker

**Purpose:** Prevent cascading failures if Mews API is down

**States:**
- **CLOSED:** Normal operation
- **OPEN:** API down, reject requests immediately
- **HALF_OPEN:** Testing recovery

**Thresholds:**
- Open after 5 consecutive failures
- Stay open for 60 seconds
- Close after 2 successful requests in half-open

---

## Data Flow

### Real-Time Flow (Webhooks)

```
Guest Books Tree
    ↓
Mews PMS
    ↓
Webhook Event → /api/webhooks/mews
    ↓
Verify Signature
    ↓
Store Event (WebhookEvent table)
    ↓
Process Event (async)
    ↓
Create/Update TreeOrder
    ↓
Return 200 OK
```

**Total Time:** < 500ms

---

### Fallback Flow (Daily Sync)

```
Scheduled Job (2:00 AM UTC)
    ↓
Call GET /api/connector/v1/orders/getAll
    ↓
Filter by Tree Service ID
    ↓
Compare with existing TreeOrders
    ↓
Create missing orders
    ↓
Update changed orders
    ↓
Log sync completion
```

**Total Time:** ~5-30 seconds (depends on order count)

---

### Invoice Generation Flow

```
End of Month (1st day, 3:00 AM UTC)
    ↓
For each Hotel:
    ↓
    Query TreeOrders for previous month
    ↓
    Calculate total trees & amount
    ↓
    Generate PDF (pdfkit)
    ↓
    Upload to Vercel Blob
    ↓
    Create Invoice record
    ↓
    Delete old invoice for same month (if exists)
```

**Total Time:** ~2-5 seconds per hotel

---

## Logging & Monitoring

### Log Levels

- **DEBUG:** Detailed flow (development only)
- **INFO:** Normal operations (sync started, order created)
- **WARN:** Recoverable issues (retry attempt, missing data)
- **ERROR:** Failures (API error, database error)

### Logged Events

**API Calls:**
- Endpoint, method, status code
- Duration (milliseconds)
- Success/failure
- Error message (if failed)

**Webhook Events:**
- Event type, ID
- Processing status
- Error details (if failed)
- Retry count

**System Health:**
- Database connectivity
- Mews API reachability
- Last successful sync time

### Log Retention

- **API Logs:** 90 days
- **Webhook Events:** 90 days
- **System Health:** 30 days

---

## Security

### Authentication

- **Mews API:** Client Token + Access Token
- **Webhooks:** HMAC SHA-256 signature verification

### Data Privacy

**What We Store:**
- Hotel ID and name
- Order ID (Mews reference)
- Tree quantity
- Amount and currency
- Booking date

**What We DON'T Store:**
- Guest names
- Guest email/phone
- Payment information
- Reservation details

### Encryption

- API tokens stored in environment variables
- Database connections use SSL/TLS
- Webhook secrets hashed

---

## Performance Metrics

### Target SLAs

- **Webhook Response Time:** < 500ms
- **API Call Duration:** < 2 seconds
- **Invoice Generation:** < 5 seconds per hotel
- **Uptime:** 99.9%

### Current Performance

- **Average Webhook Response:** ~200ms
- **Average API Call:** ~800ms
- **Invoice Generation:** ~3 seconds per hotel

---

## Deployment

### Environment Variables Required

```bash
# Mews API Credentials
MEWS_CLIENT_TOKEN=
MEWS_ACCESS_TOKEN=

# Database
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=

# Blob Storage
BLOB_READ_WRITE_TOKEN=

# Webhook Configuration
WEBHOOK_SECRET=
TREE_SERVICE_ID=

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_PER_MIN=90

# Feature Flags
ENABLE_WEBHOOKS=true
```

### Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-01T10:00:00Z",
  "checks": {
    "database": "ok",
    "mewsApi": "ok",
    "blobStorage": "ok",
    "lastSync": "2025-12-01T02:00:00Z"
  }
}
```

---

## Certification Checklist

- [x] Webhooks implemented for real-time updates
- [x] Rate limiting (90 req/min)
- [x] Error handling with retry logic
- [x] Circuit breaker for API failures
- [x] Comprehensive logging
- [x] API calls logged to database
- [x] Health check endpoint
- [x] 48-hour continuous operation test
- [x] Documentation complete

---

## Support

**Technical Contact:** [Your Email]  
**Support Hours:** Business hours (CET)  
**Response Time:** < 24 hours

---

## Appendix: API Call Frequency

| Endpoint | Frequency | Reason |
|----------|-----------|--------|
| GET /orders/getAll | Daily (2:00 AM) | Fallback sync |
| Webhook Events | Real-time | Primary data source |
| GET /reservations/getAll | Daily (2:00 AM) | Optional context |

**Total API Calls:**
- **With Webhooks:** ~1-2 calls/day per hotel
- **Without Webhooks:** ~24 calls/day per hotel (hourly sync)

**Reduction:** ~90% fewer API calls with webhooks
