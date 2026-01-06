import 'dotenv/config';
import { syncTreeOrdersV2 } from '../lib/sync-v2';

console.log('Running sync locally...\n');
syncTreeOrdersV2()
    .then(() => {
        console.log('\nSync completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Sync failed:', err);
        process.exit(1);
    });
