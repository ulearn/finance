#!/usr/bin/env node
// Fetch Sales Invoices Awaiting Payment and their attachments
// Location: /home/hub/public_html/fins/scripts/xero/recon/get-invoices.js

const XeroAPIClient = require('../xero-client');
const fs = require('fs').promises;
const path = require('path');

class InvoiceRetriever {
    constructor() {
        this.xeroClient = new XeroAPIClient();
        this.outputDir = path.join(__dirname, '2025', 'Invoices');
        this.outputFile = path.join(this.outputDir, 'invoices.json');
    }

    /**
     * Get invoice attachments
     */
    async getInvoiceAttachments(invoiceId) {
        try {
            await this.xeroClient.ensureValidToken();
            const response = await this.xeroClient.xero.accountingApi.getInvoiceAttachments(
                this.xeroClient.tenantId,
                invoiceId
            );
            return response.body.attachments || [];
        } catch (error) {
            console.error(`Error getting attachments for invoice ${invoiceId}:`, error.message);
            return [];
        }
    }

    /**
     * Download invoice attachment
     */
    async downloadAttachment(invoiceId, fileName) {
        try {
            await this.xeroClient.ensureValidToken();
            const response = await this.xeroClient.xero.accountingApi.getInvoiceAttachmentByFileName(
                this.xeroClient.tenantId,
                invoiceId,
                fileName,
                'application/pdf'
            );

            // Save to file
            const filePath = path.join(this.outputDir, fileName);
            await fs.writeFile(filePath, response.body);
            console.log(`  ✓ Downloaded: ${fileName}`);
            return filePath;
        } catch (error) {
            console.error(`  ✗ Error downloading ${fileName}:`, error.message);
            return null;
        }
    }

    /**
     * Get all Sales Invoices with status AUTHORISED (Awaiting Payment)
     */
    async getAwaitingPaymentInvoices() {
        console.log('Fetching Sales Invoices (Awaiting Payment)...\n');

        try {
            // Get invoices with status AUTHORISED and type ACCREC (sales invoices)
            const where = 'Status=="AUTHORISED" AND Type=="ACCREC"';
            const result = await this.xeroClient.getInvoices({
                where,
                order: 'InvoiceNumber DESC'
            });

            const invoices = result.invoices || [];
            console.log(`Found ${invoices.length} invoices awaiting payment\n`);

            const processedInvoices = [];

            for (const invoice of invoices) {
                console.log(`Processing: ${invoice.invoiceNumber} - ${invoice.contact.name}`);

                // Get attachments for this invoice
                const attachments = await this.getInvoiceAttachments(invoice.invoiceID);

                const invoiceData = {
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceID: invoice.invoiceID,
                    contact: invoice.contact.name,
                    reference: invoice.reference || '',
                    issueDate: invoice.date,
                    dueDate: invoice.dueDate,
                    totalDue: invoice.total,
                    amountPaid: invoice.amountPaid || 0,
                    amountDue: invoice.amountDue || invoice.total,
                    status: invoice.status,
                    attachments: attachments.map(a => ({
                        fileName: a.fileName,
                        mimeType: a.mimeType,
                        contentLength: a.contentLength
                    })),
                    paymentSchedule: null, // To be filled from PDF parsing
                    notes: ''
                };

                // Download PDF attachments (quotations)
                for (const attachment of attachments) {
                    if (attachment.fileName.toLowerCase().endsWith('.pdf')) {
                        console.log(`  Found PDF: ${attachment.fileName}`);
                        const downloaded = await this.downloadAttachment(
                            invoice.invoiceID,
                            attachment.fileName
                        );
                        if (downloaded) {
                            invoiceData.pdfPath = downloaded;
                        }
                    }
                }

                processedInvoices.push(invoiceData);
                console.log('');
            }

            return processedInvoices;
        } catch (error) {
            console.error('Error fetching invoices:', error.message);
            throw error;
        }
    }

    /**
     * Save invoices data to JSON file
     */
    async saveInvoices(invoices) {
        const data = {
            generated: new Date().toISOString(),
            totalInvoices: invoices.length,
            totalAmountDue: invoices.reduce((sum, inv) => sum + inv.amountDue, 0),
            invoices: invoices
        };

        await fs.writeFile(this.outputFile, JSON.stringify(data, null, 2));
        console.log(`\n✓ Saved ${invoices.length} invoices to: ${this.outputFile}`);
        console.log(`✓ Total Amount Due: €${data.totalAmountDue.toFixed(2)}\n`);
    }

    /**
     * Main execution
     */
    async run() {
        try {
            console.log('=== Xero Sales Invoice Retriever ===\n');

            // Ensure output directory exists
            await fs.mkdir(this.outputDir, { recursive: true });

            // Get invoices
            const invoices = await this.getAwaitingPaymentInvoices();

            // Save to file
            await this.saveInvoices(invoices);

            console.log('Done!\n');
            return invoices;
        } catch (error) {
            console.error('\n✗ Fatal Error:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const retriever = new InvoiceRetriever();
    retriever.run();
}

module.exports = InvoiceRetriever;
