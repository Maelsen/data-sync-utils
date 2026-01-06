# Email Draft to Darya

**To:** Darya (Mews API Team)
**Subject:** Re: API Review - Simplified Integration Approach

---

Hi Darya,

Thank you for initiating the API review and for your feedback about using modern endpoints.

## What We Discovered

Following your suggestion, we investigated migrating to the modern `reservations/getAll/2023-06-06` endpoint. During this process, we discovered:

1. **Modern endpoint complexity:** The 2023-06-06 version requires:
   - A mandatory `Limitation` parameter with `Count` (1-1000)
   - Completely different pagination structure
   - Significant code refactoring (not a simple drop-in replacement)

2. **Our actual needs are simpler:** We realized our integration only requires:
   - Reading reservation data with Products included
   - Filtering for tree-related products
   - No write operations
   - No need for services/getAll or products/getAll endpoints

## Simplified Certification Request

We would like to request certification using **only** the deprecated `reservations/getAll` endpoint with the following approach:

### Integration Details:
- **Endpoint:** `reservations/getAll` (deprecated, we understand)
- **Product filtering:** Name-based (products containing "tree" in the name)
- **Access type:** Read-only
- **No additional endpoints needed**

### How It Works:
1. Hotels create a product in Mews with "tree" in the name (e.g., "Plant a Tree", "Click A Tree", "Sustainability Tree")
2. Our integration filters Products by name: `products.filter(p => p.Name.toLowerCase().includes("tree"))`
3. We sync related Items, OrderItems, and ProductAssignments

### Benefits of This Approach:
- ✅ **Simpler for hotels:** No Product ID configuration needed
- ✅ **Flexible:** Any product name with "tree" works
- ✅ **Minimal API calls:** One endpoint provides all required data
- ✅ **Read-only:** No risk of data modification

## Question

We understand that `reservations/getAll` is marked as deprecated. However:
- The modern endpoint requires significant refactoring that doesn't align with our simple use case
- We only need basic read access to reservation data with Products
- Our integration is low-risk (read-only)

**Would it be possible to proceed with certification using only the deprecated `reservations/getAll` endpoint?**

If not, could you suggest an alternative approach that maintains the simplicity of our integration while using modern endpoints?

Thank you for your guidance on this matter.

Best regards,
Marlin

---

## Alternative Email (If Above is Too Direct)

**Subject:** Re: API Review - Questions About Modern Endpoint Migration

Hi Darya,

Thank you for the API review feedback. I've been investigating the modern `reservations/getAll/2023-06-06` endpoint and wanted to clarify a few things before proceeding.

### Current Integration:
We use `reservations/getAll` (deprecated) to:
- Fetch reservations with Products, Items, OrderItems, ProductAssignments
- Filter products by name (containing "tree")
- Read-only access - no write operations

### Questions About Modern Endpoint:
1. Does `reservations/getAll/2023-06-06` return Products when `Products: true` is set in Extent?
2. The modern endpoint requires a `Limitation` parameter - is there documentation on pagination for time-based queries?
3. For a simple read-only integration like ours, would using only the deprecated endpoint be acceptable for certification?

### Our Situation:
- We don't need services/getAll or products/getAll separately
- All required data comes from the reservations response
- Migration to modern endpoint would require significant code refactoring
- Our integration is low-risk (read-only, name-based filtering)

Could you provide guidance on the best path forward for certification given our simple use case?

Thank you,
Marlin
