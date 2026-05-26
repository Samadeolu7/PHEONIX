# HTTP Status Code Guidelines for Phoenix ERP API

## Overview
Proper HTTP status codes help the frontend distinguish between different error scenarios and handle them appropriately.

## Status Code Usage Rules

### ✅ 200 OK - Success with Data
**Use for:**
- List endpoints that return results (even empty arrays)
- Successful GET requests that return data
- Successful operations that return modified data

**Examples:**
```python
# List endpoint - ALWAYS return 200, even if empty
def list(self, request):
    queryset = self.get_queryset()
    serializer = self.get_serializer(queryset, many=True)
    return Response(serializer.data, status=200)  # Returns [] if empty

# Custom list action
@action(detail=False, methods=['get'])
def dashboard_stats(self, request):
    stats = calculate_stats()  # Returns {}
    return Response(stats, status=200)  # Even if all zeros
```

### ✅ 201 Created - Resource Created
**Use for:**
- Successful POST requests that create new resources

**Example:**
```python
def create(self, request):
    serializer = self.get_serializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    self.perform_create(serializer)
    return Response(serializer.data, status=201)
```

### ✅ 204 No Content - Success without Data
**Use for:**
- Successful DELETE requests
- Successful operations that don't return data

**Example:**
```python
def destroy(self, request, pk=None):
    instance = self.get_object()
    self.perform_destroy(instance)
    return Response(status=204)
```

### ⚠️ 400 Bad Request - Client Error
**Use for:**
- Validation errors
- Missing required parameters
- Invalid data format
- Business logic violations
- Database constraint violations (converted from IntegrityError)

**Examples:**
```python
# Validation error
if not request.data.get('email'):
    return Response(
        {'error': 'Email is required'},
        status=400
    )

# Business rule violation
if balance < amount:
    return Response(
        {'error': 'Insufficient balance'},
        status=400
    )

# Database constraint (handled in perform_create)
except IntegrityError as e:
    raise ValidationError({
        'code': 'A record with this code already exists'
    })  # Returns 400
```

### ❌ 404 Not Found - Resource Doesn't Exist
**Use ONLY for:**
- Specific resource by ID/PK not found (retrieve, update, delete)
- Specific endpoint doesn't exist (handled by Django)

**DO NOT use for:**
- ❌ Empty query results on list endpoints
- ❌ No data found in filters
- ❌ Zero records in aggregations

**Correct Examples:**
```python
# ✅ CORRECT - Specific resource not found
def retrieve(self, request, pk=None):
    try:
        instance = MyModel.objects.get(pk=pk)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    except MyModel.DoesNotExist:
        return Response(
            {'error': 'Resource not found'},
            status=404
        )

# ✅ CORRECT - Specific tenant by domain not found
@action(detail=False)
def by_domain(self, request):
    domain = request.query_params.get('domain')
    try:
        tenant = Tenant.objects.get(domain=domain)
        return Response(TenantSerializer(tenant).data)
    except Tenant.DoesNotExist:
        return Response(
            {'error': 'Tenant with this domain not found'},
            status=404
        )
```

**Incorrect Examples:**
```python
# ❌ WRONG - Empty list should return 200 with []
def list(self, request):
    queryset = self.get_queryset()
    if not queryset.exists():
        return Response(
            {'error': 'No records found'},
            status=404  # ❌ WRONG!
        )
    # ... (This confuses frontend routing)

# ✅ CORRECT - Return 200 with empty array
def list(self, request):
    queryset = self.get_queryset()
    serializer = self.get_serializer(queryset, many=True)
    return Response(serializer.data, status=200)  # Returns []

# ❌ WRONG - Filter returns no results
@action(detail=False)
def recent_invoices(self, request):
    invoices = Invoice.objects.filter(created_at__gte=last_week)
    if not invoices.exists():
        return Response(
            {'error': 'No recent invoices'},
            status=404  # ❌ WRONG!
        )

# ✅ CORRECT - Return empty array
@action(detail=False)
def recent_invoices(self, request):
    invoices = Invoice.objects.filter(created_at__gte=last_week)
    serializer = InvoiceSerializer(invoices, many=True)
    return Response(serializer.data, status=200)  # Returns []
```

### 🔒 403 Forbidden - Permission Denied
**Use for:**
- User authenticated but not authorized to access resource
- Insufficient permissions

**Example:**
```python
if not request.user.has_perm('accounts.view_transaction'):
    return Response(
        {'error': 'You do not have permission to view transactions'},
        status=403
    )
```

### 🔑 401 Unauthorized - Not Authenticated
**Use for:**
- Missing or invalid authentication token
- Session expired
- (Usually handled by DRF authentication)

### 🔧 500 Internal Server Error
**Avoid returning explicitly** - Let Django handle unexpected errors
- Convert known errors to 400 (validation) or 404 (not found)
- Log unexpected errors and let them bubble up

## Frontend Impact

### Why This Matters

**Correct Usage (200 with empty array):**
```javascript
// Frontend can distinguish between errors
fetch('/api/inventory/locations/')
  .then(res => {
    if (res.status === 200) {
      return res.json(); // Could be [] or [{...}, {...}]
    }
    if (res.status === 404) {
      // Endpoint itself doesn't exist - show "Page Not Found"
      router.push('/404');
    }
  })
  .then(data => {
    if (data.length === 0) {
      // Show empty state: "No locations yet. Create one?"
      showEmptyState();
    } else {
      // Render data
      renderList(data);
    }
  });
```

**Incorrect Usage (404 for empty):**
```javascript
// Frontend confused - thinks page doesn't exist
fetch('/api/inventory/locations/')
  .then(res => {
    if (res.status === 404) {
      // User sees "Page Not Found" when they just have no data yet!
      router.push('/404');  // ❌ Wrong user experience
    }
  });
```

## Implementation in Phoenix ERP

### ScopedModelViewSet (common/views.py)
Our base viewset now correctly handles empty lists:

```python
class ScopedModelViewSet(viewsets.ModelViewSet):
    def list(self, request, *args, **kwargs):
        """Always return 200 OK for list endpoints"""
        queryset = self.filter_queryset(self.get_queryset())
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=200)  # ✅ Always 200
```

### Custom Actions
For custom action methods, follow these patterns:

```python
# Pattern 1: List-like action (returns collection)
@action(detail=False, methods=['get'])
def available_products(self, request):
    products = Product.objects.filter(is_active=True)
    serializer = ProductSerializer(products, many=True)
    return Response(serializer.data, status=200)  # ✅ Even if []

# Pattern 2: Retrieve-like action (returns single resource)
@action(detail=True, methods=['get'])
def full_details(self, request, pk=None):
    try:
        obj = self.get_object()  # Raises 404 if not found
        data = generate_full_details(obj)
        return Response(data, status=200)
    except ObjectDoesNotExist:
        return Response(
            {'error': 'Resource not found'},
            status=404  # ✅ Correct - specific resource
        )

# Pattern 3: Aggregation/Stats action
@action(detail=False, methods=['get'])
def sales_stats(self, request):
    stats = {
        'total_sales': calculate_total() or 0,
        'count': Invoice.objects.count(),
        'average': calculate_average() or 0
    }
    return Response(stats, status=200)  # ✅ Even if all zeros
```

## Quick Reference Table

| Scenario | Status | Response |
|----------|--------|----------|
| List endpoint with results | 200 | `[{...}, {...}]` |
| List endpoint with no results | 200 | `[]` |
| Filter returns no matches | 200 | `[]` |
| Stats with zero values | 200 | `{"count": 0, "total": 0}` |
| Get by ID - found | 200 | `{...}` |
| Get by ID - not found | 404 | `{"error": "Not found"}` |
| Create success | 201 | `{...}` |
| Create validation error | 400 | `{"field": "error message"}` |
| Delete success | 204 | (empty) |
| Duplicate code/SKU | 400 | `{"code": "Already exists"}` |
| Permission denied | 403 | `{"error": "Forbidden"}` |

## Migration Path

To fix existing code:

1. ✅ **Already Fixed**: `ScopedModelViewSet.list()` - returns 200 with []
2. ✅ **Already Fixed**: `perform_create()` - converts IntegrityError to 400
3. 🔍 **Review**: Custom `@action` methods - ensure list-like actions return 200
4. 🔍 **Review**: Frontend code - update 404 handling to only catch real errors

## Testing

Always test both cases:

```python
def test_list_empty(self):
    """List endpoint should return 200 with empty array"""
    response = self.client.get('/api/locations/')
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.data, [])

def test_list_with_data(self):
    """List endpoint should return 200 with data"""
    Location.objects.create(name='Warehouse')
    response = self.client.get('/api/locations/')
    self.assertEqual(response.status_code, 200)
    self.assertEqual(len(response.data), 1)

def test_retrieve_not_found(self):
    """Retrieve by ID should return 404 if not found"""
    response = self.client.get('/api/locations/99999/')
    self.assertEqual(response.status_code, 404)
```
