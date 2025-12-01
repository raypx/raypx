# Project TODO Board

> **Last Updated:** 2025-12-01
> **Total Items:** 4
> **Critical Issues:** 0

---


## 📋 To Do

### Stripe Subscription Data Synchronization
**Priority**: P1 | **Effort**: 1-2h | **Tags**: `billing` `stripe` `payments`

**Description**: Sync subscription status and dates from Stripe API response to database
**Impact**: Ensures billing data consistency and prevents subscription status mismatches

**File**: [`packages/trpc/src/routers/billing.ts:352`](packages/trpc/src/routers/billing.ts#L352)

**Current Code**:
```typescript
// TODO: Sync subscription status and dates from Stripe response
```

**Implementation Details**:
- Extract `status`, `current_period_start`, `current_period_end` from Stripe response
- Update subscription record in database with synced data
- Handle edge cases (canceled, past_due, incomplete subscriptions)

**Acceptance Criteria**:
- [ ] Subscription status accurately reflects Stripe data
- [ ] Period dates are synced on every update
- [ ] Handle Stripe webhook events for real-time sync

---

### External Logging Service Integration
**Priority**: P2 | **Effort**: 4-6h | **Tags**: `observability` `sentry` `logging`

**Description**: Integrate Sentry for centralized error tracking and monitoring
**Impact**: Better production error visibility and debugging capabilities

**File**: [`packages/trpc/src/middlewares/error-logger.ts:127`](packages/trpc/src/middlewares/error-logger.ts#L127)

**Current Code**:
```typescript
// TODO: Send to external logging service (e.g., Sentry, LogRocket, etc.)
// Example:
// await logger.error(entry);
```

**Implementation Details**:
- Configure Sentry SDK (already in dependencies: `@sentry/react`)
- Add environment variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`
- Integrate with tRPC error middleware
- Add user context and breadcrumbs
- Filter sensitive data (passwords, tokens)

**Recommended Service**: Sentry (free tier: 5k errors/month)

**Acceptance Criteria**:
- [ ] All tRPC errors are sent to Sentry
- [ ] User context included in error reports
- [ ] Sensitive data is filtered
- [ ] Source maps uploaded for production builds

---

### Performance Monitoring Service Integration
**Priority**: P2 | **Effort**: 3-4h | **Tags**: `observability` `performance` `monitoring`

**Description**: Send performance metrics and slow query alerts to monitoring service
**Impact**: Proactive performance issue detection and optimization insights

**File**: [`packages/trpc/src/middlewares/error-logger.ts:181`](packages/trpc/src/middlewares/error-logger.ts#L181)

**Current Code**:
```typescript
// TODO: Send to monitoring service (e.g., DataDog, New Relic)
```

**Implementation Details**:
- Option 1: DataDog (comprehensive APM)
- Option 2: Vercel Analytics (already available)
- Option 3: New Relic (free tier available)
- Track: slow queries (>1s), API response times, database latency
- Set up alerts for performance degradation

**Recommended Service**: Vercel Analytics + DataDog

**Acceptance Criteria**:
- [ ] Slow queries logged to monitoring service
- [ ] API endpoint performance tracked
- [ ] Alerts configured for critical thresholds
- [ ] Dashboard created for key metrics

---

## 🎨 Backlog (Low Priority)

### User Avatar Upload Feature
**Priority**: P3 | **Effort**: 3-4h | **Tags**: `profile` `upload` `media`

**Description**: Implement user avatar upload functionality in profile settings
**Impact**: Allows users to personalize their profiles

**File**: [`apps/web/src/routes/dashboard/profile/index.tsx:44`](apps/web/src/routes/dashboard/profile/index.tsx#L44)

**Current Code**:
```typescript
// TODO: Implement avatar upload
toast.info("Avatar upload coming soon!");
```

**Technical Considerations**:
- **Option 1**: UploadThing (recommended - Next.js native, free tier)
- **Option 2**: Cloudinary (image optimization, generous free tier)
- **Option 3**: AWS S3 + CloudFront (full control, higher setup cost)

**Implementation Details**:
- File upload component with drag-and-drop
- Image cropping/resizing (square, 256x256)
- Image compression (WebP format)
- CDN delivery for performance
- Fallback to avatar initials

**Acceptance Criteria**:
- [ ] Upload image files (JPEG, PNG, WebP)
- [ ] Crop and resize before upload
- [ ] Preview before saving
- [ ] Delete existing avatar option
- [ ] File size limit (max 5MB)
- [ ] Loading states and error handling

---

## 📊 Statistics

### By Status
| Status | Count |
|--------|-------|
| 📋 To Do | 3 |
| 🎨 Backlog | 1 |
| **Total** | **4** |

### By Priority
| Priority | Count | Description |
|----------|-------|-------------|
| P1 | 1 | Core business logic |
| P2 | 2 | Observability & stability |
| P3 | 1 | UX improvements |

### By Category
| Category | Count |
|----------|-------|
| Billing & Payments | 1 |
| Observability | 2 |
| User Interface | 1 |

### Estimated Total Effort
- **P1**: 1-2 hours
- **P2**: 7-10 hours
- **P3**: 3-4 hours
- **Total**: ~11-16 hours

---

## 🎯 Recommended Action Plan

### Phase 1: Core Business Logic (Week 1)
1. 🔴 **Implement Stripe subscription sync** (P1) - 1-2h

### Phase 2: Observability (Week 2)
2. 🟡 **Integrate Sentry logging** (P2) - 4-6h
3. 🟡 **Setup performance monitoring** (P2) - 3-4h

### Phase 3: User Experience (Week 3+)
4. 🟢 **Implement avatar upload** (P3) - 3-4h

---

## 📝 Notes

- All items have corresponding code locations for easy navigation
- Priority based on business impact and user value
- Effort estimates assume familiarity with the codebase
- Consider creating GitHub issues from these items for better tracking
- **Organization features disabled** - This is a B2C product (user-level subscriptions only)

---

**Maintained by**: Raypx Team | **Next Review**: 2025-12-15

