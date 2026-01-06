import 'dotenv/config';
import { MewsClient } from '../lib/mews';
import { addHours, subDays } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const TREE_NAME = (process.env.TREE_PRODUCT_NAME || 'tree').toLowerCase();

async function testModernEndpoint() {
    console.log('=== Testing Modern Endpoint with Name-Based Filtering ===\n');
    console.log(`Client Token: ${CLIENT_TOKEN.slice(0, 8)}...`);
    console.log(`Access Token: ${ACCESS_TOKEN.slice(0, 8)}...`);
    console.log(`Product Name Filter: "${TREE_NAME}"\n`);

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
        console.error('ERROR: Missing credentials');
        process.exit(1);
    }

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    try {
        // Fetch a small window (last 7 days)
        const windowEnd = addHours(new Date(), 24);
        const windowStart = subDays(windowEnd, 7);

        console.log(`Fetching reservations from ${windowStart.toISOString()} to ${windowEnd.toISOString()}...\n`);

        const data = await mews.getReservations(windowStart.toISOString(), windowEnd.toISOString());

        console.log('=== API Response Summary ===');
        console.log(`Reservations: ${data.Reservations?.length || 0}`);
        console.log(`Items: ${data.Items?.length || 0}`);
        console.log(`OrderItems: ${data.OrderItems?.length || 0}`);
        console.log(`ProductAssignments: ${data.ProductAssignments?.length || 0}`);
        console.log(`Products: ${data.Products?.length || 0}`);
        console.log(`Enterprise: ${data.Enterprise?.Name || 'N/A'}\n`);

        // CRITICAL TEST: Did we get Products back?
        if (!data.Products || data.Products.length === 0) {
            console.log('❌ CRITICAL: No Products returned by modern endpoint!');
            console.log('   The modern endpoint may not support Products in Extent.\n');
        } else {
            console.log('✅ SUCCESS: Products returned by modern endpoint!\n');

            console.log('=== All Products ===');
            data.Products.forEach((p: any, idx: number) => {
                console.log(`  [${idx + 1}] ID: ${p.Id}`);
                console.log(`      Name: "${p.Name}"`);
            });
            console.log('');

            // Test name-based filtering
            const treeProducts = data.Products.filter((p: any) =>
                (p.Name || '').toLowerCase().includes(TREE_NAME)
            );

            console.log('=== Name-Based Filter Results ===');
            if (treeProducts.length === 0) {
                console.log(`❌ No products found containing "${TREE_NAME}"`);
                console.log(`   Try adjusting TREE_PRODUCT_NAME or check product names in Mews.\n`);
            } else {
                console.log(`✅ Found ${treeProducts.length} product(s) containing "${TREE_NAME}":`);
                treeProducts.forEach((p: any, idx: number) => {
                    console.log(`  [${idx + 1}] "${p.Name}" (ID: ${p.Id})`);
                });
                console.log('');
            }

            // Check for tree items
            const treeProductIds = treeProducts.map((p: any) => p.Id);
            const treeItems = (data.Items || []).filter((item: any) =>
                treeProductIds.includes(item.ProductId)
            );
            const treeOrderItems = (data.OrderItems || []).filter((item: any) =>
                treeProductIds.includes(item.ProductId)
            );
            const treeAssignments = (data.ProductAssignments || []).filter((item: any) =>
                treeProductIds.includes(item.ProductId)
            );

            const totalTreeLines = treeItems.length + treeOrderItems.length + treeAssignments.length;

            console.log('=== Tree Orders Found ===');
            console.log(`Items: ${treeItems.length}`);
            console.log(`OrderItems: ${treeOrderItems.length}`);
            console.log(`ProductAssignments: ${treeAssignments.length}`);
            console.log(`Total tree lines: ${totalTreeLines}\n`);

            if (totalTreeLines > 0) {
                console.log('✅ Tree orders found! Name-based filtering is working.\n');
            } else {
                console.log('⚠️  No tree orders in this time window (this may be expected).\n');
            }
        }

        console.log('=== Test Complete ===');
        console.log('✅ Modern endpoint works!');
        console.log(`✅ Products ${data.Products?.length > 0 ? 'ARE' : 'ARE NOT'} returned`);
        console.log(`✅ Name-based filtering ${data.Products?.filter((p: any) => (p.Name || '').toLowerCase().includes(TREE_NAME)).length > 0 ? 'WORKS' : 'needs adjustment'}`);

    } catch (error: any) {
        console.error('\n❌ ERROR:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

testModernEndpoint();
