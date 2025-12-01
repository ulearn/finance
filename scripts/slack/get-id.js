/**
 * Get Slack User IDs - helper script to find user IDs for @mentions
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

(async () => {
    try {
        const response = await axios.get('https://slack.com/api/users.list', {
            headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` }
        });

        if (response.data.ok) {
            const users = response.data.members.filter(u => !u.is_bot && !u.deleted);

            console.log('═══════════════════════════════════════════');
            console.log('SLACK WORKSPACE USERS');
            console.log('═══════════════════════════════════════════\n');

            users.forEach(u => {
                const realName = u.real_name || u.name;
                const username = u.name;
                const id = u.id;
                console.log(`${realName.padEnd(30)} @${username.padEnd(20)} ${id}`);
            });

            console.log('\n═══════════════════════════════════════════');
            console.log('Looking for:');
            console.log('  - Diego Martin (B2C Sales)');
            console.log('  - Esperanza Perfecto (Accounts)');
            console.log('  - Cenker Ozan Akman (B2B Sales)');
            console.log('═══════════════════════════════════════════\n');

        } else {
            console.log('❌ Error:', response.data.error);
        }
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
})();
