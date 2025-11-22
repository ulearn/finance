/**
 * Shared Payment Data Processing Utility
 *
 * This module ensures consistent data processing whether importing from:
 * - CSV files (import-sql.js)
 * - Fidelo API (payment-detail-api.js)
 *
 * Version 1.0
 */

class PaymentDataProcessor {
    constructor() {
        // Standard column names that the dashboard expects
        this.standardColumns = [
            'date',          // Payment date (CRITICAL)
            'amount',        // Payment amount
            'course',        // Course fees
            'agent',         // Agent name (B2B identifier)
            'type',          // Payment type (identifies Refunds)
            'method',        // Payment method (identifies TransferMate Escrow)
            'invoice_numbers',
            'student_id',
            'surname',
            'first_name'
        ];
    }

    /**
     * Parse date from various formats to MySQL DATE format (YYYY-MM-DD)
     */
    parseDate(dateStr) {
        if (!dateStr || dateStr === '') return null;

        // Check if this contains multiple dates separated by commas
        if (dateStr.includes(',')) {
            const dates = dateStr.split(',').map(d => d.trim());
            if (dates.length > 0) {
                return this.parseDate(dates[0]); // Parse the first date only
            }
        }

        // Handle DD/MM/YYYY format (Fidelo standard)
        if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            const [day, month, year] = dateStr.split('/');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        // Handle YYYY-MM-DD format (already correct)
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateStr;
        }

        // Handle ISO datetime (YYYY-MM-DDTHH:MM:SS)
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
            return dateStr.substring(0, 10);
        }

        console.warn(`Unable to parse date: ${dateStr}`);
        return null;
    }

    /**
     * Clean and normalize currency values
     * Handles: €1,234.56, -€1,234.56, 1234.56, etc.
     */
    cleanCurrency(value) {
        if (!value || value === '') return null;

        // Already a number
        if (typeof value === 'number') {
            return value;
        }

        // String processing
        let cleaned = String(value);

        // Remove currency symbols and spaces
        cleaned = cleaned.replace(/[€$£\s]/g, '');

        // Check if negative
        const isNegative = cleaned.includes('-') || cleaned.startsWith('(');

        // Remove negative signs and parentheses
        cleaned = cleaned.replace(/[-()]/g, '');

        // Remove commas (thousands separator)
        cleaned = cleaned.replace(/,/g, '');

        // Parse to float
        const num = parseFloat(cleaned);

        if (isNaN(num)) {
            console.warn(`Unable to parse currency: ${value}`);
            return null;
        }

        return isNegative ? -num : num;
    }

    /**
     * Clean text fields - remove HTML, fix encoding
     */
    cleanTextField(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        let cleaned = String(value);

        // Remove HTML tags
        cleaned = cleaned.replace(/<br\s*\/?>/gi, ', ');  // Convert breaks to commas
        cleaned = cleaned.replace(/<[^>]*>/g, '');        // Remove all HTML tags

        // Fix character encoding issues
        cleaned = cleaned.replace(/â‚¬/g, '€');
        cleaned = cleaned.replace(/Ã¡/g, 'á');
        cleaned = cleaned.replace(/Ã­/g, 'í');
        cleaned = cleaned.replace(/Ã©/g, 'é');
        cleaned = cleaned.replace(/Ã³/g, 'ó');
        cleaned = cleaned.replace(/Ãº/g, 'ú');
        cleaned = cleaned.replace(/Ã±/g, 'ñ');
        cleaned = cleaned.replace(/&amp;/g, '&');
        cleaned = cleaned.replace(/&lt;/g, '<');
        cleaned = cleaned.replace(/&gt;/g, '>');

        // Clean up whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned || null;
    }

    /**
     * Normalize field names to standard column names
     * Maps various possible field names to the standard ones the dashboard expects
     */
    normalizeFieldName(fieldName) {
        const fieldLower = String(fieldName).toLowerCase().trim();

        // Payment date mapping
        if (fieldLower === 'date' || fieldLower === 'payment_date' ||
            fieldLower === 'date_tmp' || fieldLower === 'paymentdate') {
            return 'date';
        }

        // Amount mapping
        if (fieldLower === 'amount' || fieldLower === 'payment_amount' ||
            fieldLower === 'total' || fieldLower === 'payment_total') {
            return 'amount';
        }

        // Course fees mapping
        if (fieldLower === 'course' || fieldLower === 'course_1' ||
            fieldLower === 'course_fee' || fieldLower === 'course_fees') {
            return 'course';
        }

        // Agent mapping (B2B identifier)
        if (fieldLower === 'agent' || fieldLower === 'agency' ||
            fieldLower === 'agent_name' || fieldLower === 'agency_name') {
            return 'agent';
        }

        // Type mapping (identifies Refunds)
        if (fieldLower === 'type' || fieldLower === 'payment_type' ||
            fieldLower === 'transaction_type') {
            return 'type';
        }

        // Method mapping (identifies TransferMate Escrow)
        if (fieldLower === 'method' || fieldLower === 'payment_method' ||
            fieldLower === 'paymentmethod') {
            return 'method';
        }

        // Return original if no mapping found
        return fieldLower
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Process a single payment record
     * Standardizes field names and cleans values
     */
    processRecord(rawRecord) {
        const processed = {
            import_date: new Date(),
            import_source: rawRecord._source || 'unknown'
        };

        for (const [fieldName, value] of Object.entries(rawRecord)) {
            // Skip internal metadata fields
            if (fieldName.startsWith('_')) continue;

            const normalizedName = this.normalizeFieldName(fieldName);

            // Apply appropriate cleaning based on field type
            if (normalizedName === 'date' || normalizedName.includes('_date') ||
                normalizedName === 'start' || normalizedName === 'end') {
                processed[normalizedName] = this.parseDate(value);
            }
            else if (normalizedName === 'amount' || normalizedName === 'course' ||
                     normalizedName.includes('_fee') || normalizedName.includes('_cost')) {
                processed[normalizedName] = this.cleanCurrency(value);
            }
            else {
                processed[normalizedName] = this.cleanTextField(value);
            }
        }

        return processed;
    }

    /**
     * Validate that critical fields are present
     */
    validateRecord(record) {
        const errors = [];

        // Critical field validations
        if (!record.date) {
            errors.push('Missing or invalid date field');
        }

        if (record.amount === null || record.amount === undefined) {
            errors.push('Missing or invalid amount field');
        }

        // Type field is critical for identifying refunds
        if (!record.type) {
            console.warn('Warning: Record missing type field (cannot identify refunds)');
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: record.type ? [] : ['Missing type field']
        };
    }

    /**
     * Identify if a record is a refund
     */
    isRefund(record) {
        if (!record.type) return false;

        const typeLower = String(record.type).toLowerCase();
        return typeLower.includes('refund') || typeLower === 'refund';
    }

    /**
     * Identify if a record is B2B (has agent) or B2C (no agent)
     */
    getChannel(record) {
        return (record.agent && record.agent !== '') ? 'B2B' : 'B2C';
    }

    /**
     * Identify if a record is TransferMate Escrow
     */
    isTransferMateEscrow(record) {
        if (!record.method) return false;

        const methodLower = String(record.method).toLowerCase();
        return methodLower.includes('transfermate') || methodLower.includes('escrow');
    }

    /**
     * Get MySQL column definition for a field
     */
    getMySQLType(fieldName, sampleValue) {
        const normalizedName = this.normalizeFieldName(fieldName);

        // Date fields
        if (normalizedName === 'date' || normalizedName.includes('_date') ||
            normalizedName === 'start' || normalizedName === 'end') {
            return 'DATE';
        }

        // Amount/currency fields
        if (normalizedName === 'amount' || normalizedName === 'course' ||
            normalizedName.includes('_fee') || normalizedName.includes('_cost')) {
            return 'DECIMAL(12,2)';
        }

        // ID fields
        if (normalizedName.includes('_id') || normalizedName === 'id') {
            return 'VARCHAR(100)';
        }

        // Name and short text fields
        if (normalizedName.includes('name') || normalizedName === 'type' ||
            normalizedName === 'method' || normalizedName === 'agent') {
            return 'VARCHAR(255)';
        }

        // Default to TEXT for flexibility
        return 'TEXT';
    }

    /**
     * Get a summary of a record for logging
     */
    getSummary(record) {
        return {
            date: record.date,
            amount: record.amount,
            type: record.type,
            channel: this.getChannel(record),
            isRefund: this.isRefund(record),
            isEscrow: this.isTransferMateEscrow(record)
        };
    }
}

module.exports = PaymentDataProcessor;
