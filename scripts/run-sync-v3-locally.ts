import 'dotenv/config';
import { syncTreeOrdersV3 } from '../lib/sync-v3';

console.log('Running sync v3 locally...\n');
syncTreeOrdersV3()
    .then(() => {
        console.log('\nSync v3 completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Sync v3 failed:', err);
        process.exit(1);
    });
