/**
 * Slack Notifier - Send notifications to Slack channels
 * Location: /home/hub/public_html/fins/scripts/notifications/slack-notifier.js
 *
 * Purpose: Send payment notifications, alerts, and reports to Slack channels
 *
 * Setup Requirements:
 * 1. Slack App created at https://api.slack.com/apps
 * 2. Bot Token with scopes: chat:write, chat:write.public
 * 3. Add SLACK_BOT_TOKEN to .env file
 * 4. Invite bot to channels where you want notifications
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class SlackNotifier {
    constructor() {
        this.botToken = process.env.SLACK_BOT_TOKEN;
        this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
        this.defaultChannel = process.env.SLACK_DEFAULT_CHANNEL || '#financial';

        // Staff member Slack user IDs for @mentions
        this.staff = {
            cenker: '<@U080LTXMJSZ>',      // Cenker Ozan Akman (B2B Sales)
            diego: '<@U07CL253LJH>',       // Diego Martin (B2C Sales)
            esperanza: '<@U08SHU1M96D>'    // Esperanza Perfecto (Accounts)
        };
    }

    /**
     * Send message to Slack using Bot Token
     */
    async sendMessage(channel, text, blocks = null) {
        if (!this.botToken && !this.webhookUrl) {
            console.error('❌ No Slack credentials configured. Add SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL to .env');
            return { success: false, error: 'No credentials' };
        }

        try {
            if (this.botToken) {
                // Use Bot Token (more flexible)
                const response = await axios.post('https://slack.com/api/chat.postMessage', {
                    channel,
                    text,
                    blocks
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.botToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.ok) {
                    console.log(`✅ Slack message sent to ${channel}`);
                    return { success: true, timestamp: response.data.ts };
                } else {
                    console.error('❌ Slack API error:', response.data.error);
                    return { success: false, error: response.data.error };
                }
            } else if (this.webhookUrl) {
                // Use Webhook URL (simpler, but channel is predefined)
                const response = await axios.post(this.webhookUrl, {
                    text,
                    blocks
                });

                if (response.status === 200) {
                    console.log(`✅ Slack webhook message sent`);
                    return { success: true };
                } else {
                    console.error('❌ Slack webhook error:', response.status);
                    return { success: false, error: response.statusText };
                }
            }
        } catch (error) {
            console.error('❌ Slack notification failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Format payment success notification
     */
    formatPaymentSuccess(payment) {
        // Determine which sales person to notify
        const salesPerson = payment.pipeline === 'B2B' ? this.staff.cenker : this.staff.diego;
        const pipelineLabel = payment.pipeline === 'B2B' ? 'B2B (Partner)' : 'B2C (Direct)';

        const text = `✅ Payment Assigned - ${payment.studentName} (€${payment.amount.toFixed(2)}) | ${salesPerson} ${this.staff.esperanza}`;

        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "✅ Payment Successfully Assigned",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Notification:* ${salesPerson} (Sales) · ${this.staff.esperanza} (Accounts)`
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Student:*\n${payment.studentName}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Fidelo ID:*\n${payment.bookingId}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Amount:*\n€${payment.amount.toFixed(2)}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Date:*\n${payment.paymentDate}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Pipeline:*\n${pipelineLabel}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Method:*\n${payment.paymentMethod || 'Bank Transfer'}`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Bank Reference:*\n\`${payment.bankDescription}\``
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `Payment ID: ${payment.paymentId} | Matched via: ${payment.matchMethod}${payment.dealId ? ` | Deal ID: ${payment.dealId}` : ''}${payment.dealName ? ` | Deal: ${payment.dealName}` : ''}`
                    }
                ]
            }
        ];

        // Always add Fidelo admin link
        blocks.push({
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Open Fidelo Admin",
                        emoji: true
                    },
                    url: 'https://ulearn.fidelo.com/admin'
                }
            ]
        });

        return { text, blocks };
    }

    /**
     * Format underpayment alert (€1-€10 discrepancy)
     */
    formatUnderpaymentAlert(payment) {
        const shortfall = payment.expectedAmount - payment.receivedAmount;

        // Determine which sales person to notify (URGENT)
        const salesPerson = payment.pipeline === 'B2B' ? this.staff.cenker : this.staff.diego;
        const pipelineLabel = payment.pipeline === 'B2B' ? 'B2B (Partner)' : 'B2C (Direct)';

        const text = `⚠️ Underpayment - ${payment.studentName} - €${shortfall.toFixed(2)} short | ${salesPerson} ${this.staff.esperanza}`;

        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "⚠️ UNDERPAYMENT ALERT - ACTION REQUIRED",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Notification:* ${salesPerson} (Sales) · ${this.staff.esperanza} (Accounts)\n\n*Sales follow-up required*`
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Student:*\n${payment.studentName}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Fidelo ID:*\n${payment.bookingId}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Expected:*\n€${payment.expectedAmount.toFixed(2)}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Received:*\n€${payment.receivedAmount.toFixed(2)}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*SHORTFALL:*\n:warning: €${shortfall.toFixed(2)}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Pipeline:*\n${pipelineLabel}`
                    }
                ]
            }
        ];

        if (payment.partner) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Partner:* ${payment.partner} ${payment.pipeline === 'B2B' ? '(B2B - likely ForEx fee not paid by partner)' : ''}`
                }
            });
        }

        blocks.push(
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*PAYMENT STATUS:*\n✅ €${payment.receivedAmount.toFixed(2)} recorded in Fidelo\n❌ €${shortfall.toFixed(2)} outstanding balance`
                }
            },
            {
                type: "divider"
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Sales (${payment.pipeline === 'B2B' ? 'Cenker' : 'Diego'}):*\nContact Client: ${payment.partner || 'Customer'}\n\n*Accounts:*\nMonitor Incomings`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*NOTE*\n• ForEx & Bank Fees are responsibility of Sender\n• Deal remains at Contract until settled`
                }
            }
        );

        if (payment.startDate) {
            blocks.push({
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `Start Date: ${payment.startDate} | Bank Ref: \`${payment.bankDescription}\``
                    }
                ]
            });
        }

        // Always add Fidelo admin link
        blocks.push({
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Open Fidelo Admin",
                        emoji: true
                    },
                    url: 'https://ulearn.fidelo.com/admin',
                    style: "danger"
                }
            ]
        });

        return { text, blocks };
    }

    /**
     * Format manual review alert (>€10 discrepancy or no match)
     */
    formatManualReviewAlert(transaction, reason) {
        const text = `🚫 MANUAL REVIEW - ${transaction.description} (€${transaction.amount}) | ${this.staff.esperanza}`;

        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🚫 MANUAL REVIEW REQUIRED",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Manual intervention needed:* ${this.staff.esperanza} (Accounts)`
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Date:*\n${transaction.date}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Amount:*\n€${transaction.amount.toFixed(2)}`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Bank Description:*\n\`${transaction.description}\``
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Reason:*\n${reason}`
                }
            }
        ];

        if (transaction.possibleMatches && transaction.possibleMatches.length > 0) {
            const matchesList = transaction.possibleMatches.slice(0, 3).map((m, i) =>
                `${i + 1}. ${m.dealName || m.studentName} - €${m.amount} (${m.similarity || m.score}%)`
            ).join('\n');

            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Possible Matches:*\n${matchesList}`
                }
            });
        }

        blocks.push({
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: "⚠️ Payment NOT assigned - requires manual intervention"
                }
            ]
        });

        return { text, blocks };
    }

    /**
     * Send payment success notification
     */
    async notifyPaymentSuccess(payment, channel = null) {
        const { text, blocks } = this.formatPaymentSuccess(payment);
        return await this.sendMessage(channel || this.defaultChannel, text, blocks);
    }

    /**
     * Send underpayment alert
     */
    async notifyUnderpayment(payment, channel = null) {
        const { text, blocks } = this.formatUnderpaymentAlert(payment);
        return await this.sendMessage(channel || this.defaultChannel, text, blocks);
    }

    /**
     * Send manual review alert
     */
    async notifyManualReview(transaction, reason, channel = null) {
        const { text, blocks } = this.formatManualReviewAlert(transaction, reason);
        return await this.sendMessage(channel || this.defaultChannel, text, blocks);
    }

    /**
     * Test notification
     */
    async testNotification(channel = null) {
        const text = '🧪 Test notification from Incoming Payments automation';
        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🧪 Test Notification",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "If you're seeing this, Slack notifications are working! ✅"
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "Sent from: Incoming Payments Automation (Ai)"
                    }
                ]
            }
        ];

        return await this.sendMessage(channel || this.defaultChannel, text, blocks);
    }
}

// Export for use as module
module.exports = SlackNotifier;

// CLI test mode
if (require.main === module) {
    const notifier = new SlackNotifier();

    console.log('Testing Slack Notification...\n');

    (async () => {
        // Test basic notification
        const result = await notifier.testNotification();

        if (result.success) {
            console.log('\n✅ Test notification sent successfully!');

            // Test payment success format
            console.log('\n📝 Testing payment success notification...');
            await notifier.notifyPaymentSuccess({
                studentName: 'Kuramura, Yusuke',
                bookingId: 41595,
                amount: 2160.00,
                paymentDate: '2025-11-07',
                pipeline: 'B2B',
                paymentMethod: 'Bank Transfer',
                bankDescription: '1580214041P2025951 IP',
                paymentId: 36999,
                matchMethod: 'Fidelo Reference (P2025951)',
                fideloUrl: 'https://ulearn.fidelo.com/bookings/41595'
            });

            // Test underpayment alert
            console.log('\n📝 Testing underpayment alert...');
            await notifier.notifyUnderpayment({
                studentName: 'Kuhl, Maurivan',
                bookingId: 41567,
                expectedAmount: 1524.10,
                receivedAmount: 1509.60,
                pipeline: 'B2B',
                partner: 'Blue Intercâmbios Brasil',
                startDate: '2025-12-05',
                bankDescription: 'BLUE CONSULTORIA E GP',
                fideloUrl: 'https://ulearn.fidelo.com/bookings/41567'
            });

        } else {
            console.log('\n❌ Test notification failed:', result.error);
            console.log('\n📋 Setup instructions:');
            console.log('1. Go to https://api.slack.com/apps');
            console.log('2. Select your app or create new one');
            console.log('3. Go to "OAuth & Permissions"');
            console.log('4. Add Bot Token Scopes: chat:write, chat:write.public');
            console.log('5. Install app to workspace');
            console.log('6. Copy "Bot User OAuth Token" (starts with xoxb-)');
            console.log('7. Add to .env: SLACK_BOT_TOKEN=xoxb-...');
            console.log('8. Invite bot to channel: /invite @YourBotName');
        }
    })();
}
