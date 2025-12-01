# Hotel Setup Guide - Click A Tree Integration

Welcome! This guide will help you set up the Click A Tree integration in your Mews PMS.

---

## Prerequisites

- Active Mews Operations account
- Admin access to Mews
- Click A Tree partnership agreement

---

## Step 1: Create Tree Product in Mews

### 1.1 Navigate to Services

1. Log in to **Mews Operations**
2. Go to **Settings** → **Services** → **Additional Services**
3. Click **+ New Service**

### 1.2 Configure Product

**Basic Information:**
- **Name:** "Plant a Tree" (or your preferred name)
- **Name (Translations):**
  - English: "Plant a Tree"
  - German: "Baum pflanzen"
  - French: "Planter un arbre"
  - (Add other languages as needed)

**Description:**
```
Help make the world greener! Plant a tree with your stay.
Each tree helps offset your carbon footprint and supports reforestation.
```

**Category:**
- Select or create: "Sustainability" or "Extras"

**Pricing:**
- **Charging Mode:** "Per Item"
- **Price:** €5.00 (or your agreed price)
- **Currency:** EUR (or your hotel currency)
- **Tax Rate:** Select appropriate VAT rate

**Options:**
- ✅ **Orderable:** Yes
- ✅ **Show in Booking Engine:** Yes
- ✅ **Show in Guest Portal:** Yes (optional)
- ✅ **Default Quantity:** 1
- ✅ **Allow Quantity Change:** Yes

**Accounting:**
- **Accounting Category:** Select appropriate category (e.g., "Other Revenue")

### 1.3 Save and Note Service ID

1. Click **Save**
2. **IMPORTANT:** Copy the **Service ID** (you'll need this later)
   - It looks like: `abc12345-6789-def0-1234-56789abcdef0`

---

## Step 2: Generate API Access Token

### 2.1 Create Integration Token

1. In Mews Operations, go to **Settings** → **Integrations**
2. Click **+ New Integration**
3. Fill in details:
   - **Name:** "Click A Tree Integration"
   - **Description:** "Tree planting upsell integration"
   - **Type:** "API Integration"

### 2.2 Generate Tokens

1. Click **Generate Token**
2. **IMPORTANT:** Copy both tokens immediately:
   - **Client Token:** `[LONG_STRING]`
   - **Access Token:** `[LONG_STRING]`
3. Store these securely - you won't see them again!

---

## Step 3: Configure Webhook (Recommended)

### 3.1 Set Up Webhook URL

1. In Mews Operations, go to **Settings** → **Integrations** → **Webhooks**
2. Click **+ New Webhook**
3. Configure:
   - **URL:** `https://[your-domain].vercel.app/api/webhooks/mews`
   - **Events to Subscribe:**
     - ✅ `ServiceOrderCreated`
     - ✅ `ServiceOrderUpdated`
     - ✅ `ServiceOrderCanceled`
   - **Secret:** (Generate a random string, e.g., `openssl rand -hex 32`)

### 3.2 Test Webhook

1. Click **Test Webhook**
2. Verify you receive a 200 OK response
3. Click **Save**

---

## Step 4: Register with Click A Tree

### 4.1 Provide Configuration

Send the following information to Click A Tree:

```
Hotel Name: [Your Hotel Name]
Mews Property ID: [Your Property ID]
Tree Service ID: [From Step 1.3]
Client Token: [From Step 2.2]
Access Token: [From Step 2.2]
Webhook Secret: [From Step 3.1]
```

**Security Note:** Send credentials via secure channel (encrypted email or password manager)

### 4.2 Wait for Confirmation

Click A Tree will:
1. Configure your hotel in their system
2. Test the connection
3. Confirm setup is complete (~1-2 business days)

---

## Step 5: Test the Integration

### 5.1 Create Test Booking

1. In Mews Operations, create a test reservation
2. Add the "Plant a Tree" product
3. Set quantity to 1
4. Confirm the booking

### 5.2 Verify Tracking

1. Check with Click A Tree that the order was received
2. Verify the tree count is correct
3. Confirm the amount matches your pricing

### 5.3 Test Quantity Change

1. Edit the test reservation
2. Change tree quantity to 3
3. Verify Click A Tree receives the update

### 5.4 Test Cancellation

1. Cancel the tree order (not the whole reservation)
2. Verify Click A Tree removes the order

---

## Step 6: Go Live!

### 6.1 Enable in Booking Engine

1. Go to **Settings** → **Booking Engine** → **Products**
2. Ensure "Plant a Tree" is visible
3. Set display order (e.g., after room selection)
4. Add promotional text:
   ```
   🌳 Plant a tree with your stay!
   Help us create a greener future. Just €5 per tree.
   ```

### 6.2 Train Your Team

**Front Desk:**
- How to add trees to reservations
- How to explain the program to guests
- How to handle questions

**Reservations:**
- How to upsell trees during booking calls
- How to add trees to group bookings

### 6.3 Promote to Guests

**Email Templates:**
- Pre-arrival email: "Plant a tree with your stay!"
- Post-stay email: "Thank you for planting X trees!"

**On-Site:**
- Reception desk signage
- In-room cards
- Website banner

---

## Invoicing

### How It Works

1. **Monthly Automatic Invoices:**
   - Generated on the 1st of each month
   - Covers all trees from previous month
   - Sent via email as PDF

2. **Invoice Details:**
   - Hotel name
   - Period (e.g., "November 2025")
   - Total trees planted
   - Total amount (trees × price)
   - Payment instructions

3. **Payment:**
   - Due within 30 days
   - Bank transfer details on invoice
   - Reference: Invoice number

### Access Your Dashboard

**URL:** `https://[your-domain].vercel.app`

**Features:**
- View total trees planted
- See recent orders
- Download invoices
- Track monthly statistics

---

## Troubleshooting

### Orders Not Appearing

**Check:**
1. Service ID is correct in Click A Tree configuration
2. API tokens are valid (not expired)
3. Webhook is active and receiving events
4. Product is set to "Orderable" in Mews

**Solution:**
- Contact Click A Tree support with order ID
- They can manually sync if needed

### Webhook Not Working

**Check:**
1. Webhook URL is correct
2. Webhook secret matches configuration
3. Events are subscribed correctly

**Solution:**
- Test webhook from Mews
- Check Click A Tree health endpoint: `/api/health`
- Verify webhook events in Mews logs

### Pricing Mismatch

**Check:**
1. Product price in Mews
2. Currency setting
3. Tax rate configuration

**Solution:**
- Update product price in Mews
- Contact Click A Tree to update their records

---

## Support

**Click A Tree Support:**
- Email: support@clickatree.com
- Response Time: < 24 hours
- Hours: Monday-Friday, 9:00-17:00 CET

**Mews Support:**
- Help Center: help.mews.com
- Phone: [Your Region Number]
- Email: support@mews.com

---

## FAQ

**Q: Can guests plant multiple trees?**  
A: Yes! They can change the quantity when adding to their booking.

**Q: What happens if a guest cancels their reservation?**  
A: If the tree order is canceled, it's automatically removed from your invoice.

**Q: Can we offer trees for free as a promotion?**  
A: Yes! Set the price to €0 in Mews. You'll still be invoiced at the agreed partner rate.

**Q: Do we get reports on environmental impact?**  
A: Yes! Your dashboard shows total trees planted and estimated CO2 offset.

**Q: Can we customize the product name?**  
A: Yes! Use any name you like in Mews. Just inform Click A Tree of the change.

**Q: What if we have multiple properties?**  
A: Each property needs separate setup. Contact Click A Tree for multi-property discounts.

---

## Next Steps

After setup is complete:

1. ✅ Monitor first week of orders
2. ✅ Review first monthly invoice
3. ✅ Gather guest feedback
4. ✅ Optimize upsell messaging
5. ✅ Share success stories with Click A Tree!

**Welcome to the Click A Tree family! 🌳**
