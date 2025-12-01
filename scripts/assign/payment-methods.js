/**
 * Fidelo Payment Methods Mapping
 * Location: /home/hub/public_html/fins/scripts/incomings/payment-methods.js
 *
 * IMPORTANT: These are DATABASE IDs - they are STABLE and never change.
 * The UI dropdown order can be rearranged, but these IDs remain constant.
 *
 * Verified: 2025-11-29 via API test (booking 40066, payments 37012-37023)
 *
 * COMPLETE PAYMENT METHOD INDEX (Fidelo Database IDs):
 * ====================================================
 * ID  | Method Name           | Usage
 * ----|----------------------|----------------------------------
 * 1   | Cash                 | Cash payments
 * 2   | Bank Transfer        | DEFAULT - BOI, SEPA, wire transfers
 * 3   | Check                | Checks/Cheques
 * 4   | Credit Card          | Use for Revolut Merchant (card payments)
 * 5   | Flywire              | Flywire processor (NOT Stripe!)
 * 6   | ULearn Credit        | Internal credits
 * 7   | Internal Assignment  | Internal transfers
 * 8   | Agent Commission     | Agency commissions
 * 9   | Refund               | Refunds
 * 10  | TransferMate         | TransferMate payments (released from escrow)
 * 11  | Stripe               | Stripe payments (info@ + neil@ accounts)
 * 12  | TransferMate Escrow  | LEGACY - being phased out
 *
 * NOTE: UI dropdown can be reordered by school, but IDs never change
 */

// Payment method IDs (VERIFIED 2025-11-29)
const PAYMENT_METHODS = {
    CASH: 1,
    BANK_TRANSFER: 2,           // DEFAULT for bank transfers
    CHECK: 3,
    CREDIT_CARD: 4,             // Use for Revolut Merchant
    FLYWIRE: 5,
    ULEARN_CREDIT: 6,
    INTERNAL_ASSIGNMENT: 7,
    AGENT_COMMISSION: 8,
    REFUND: 9,
    TRANSFERMATE: 10,
    STRIPE: 11,                 // CORRECT ID (NOT 5!)
    TRANSFERMATE_ESCROW: 12,    // Legacy - do not use for new payments

    // Alias for Revolut (doesn't have dedicated method in Fidelo)
    REVOLUT: 4                  // Maps to Credit Card
};

/**
 * Get payment method ID by name
 * @param {string} methodName - Payment method name
 * @returns {number|null} Payment method ID or null if not found
 */
function getPaymentMethodId(methodName) {
    const normalized = (methodName || '').toLowerCase().trim();

    if (normalized.includes('bank') || normalized.includes('transfer')) {
        return PAYMENT_METHODS.BANK_TRANSFER;
    }
    if (normalized.includes('cash')) {
        return PAYMENT_METHODS.CASH;
    }
    if (normalized.includes('transfermate') && !normalized.includes('escrow')) {
        return PAYMENT_METHODS.TRANSFERMATE;
    }
    if (normalized.includes('transfermate') && normalized.includes('escrow')) {
        return PAYMENT_METHODS.TRANSFERMATE_ESCROW;
    }
    if (normalized.includes('stripe')) {
        return PAYMENT_METHODS.STRIPE;
    }
    if (normalized.includes('revolut')) {
        return PAYMENT_METHODS.REVOLUT;
    }

    return null;
}

/**
 * Get payment method name by ID
 * @param {number} methodId - Payment method ID
 * @returns {string|null} Payment method name or null if not found
 */
function getPaymentMethodName(methodId) {
    const methods = {
        1: 'Cash',
        2: 'Bank Transfer',
        3: 'Check',
        4: 'Credit Card',
        5: 'Flywire',
        6: 'ULearn Credit',
        7: 'Internal Assignment',
        8: 'Agent Commission',
        9: 'Refund',
        10: 'TransferMate',
        11: 'Stripe',
        12: 'TransferMate Escrow'
    };

    return methods[methodId] || null;
}

/**
 * Determine payment method for incoming bank transaction
 * @param {string} bankDescription - Bank transaction description
 * @param {boolean} wasEscrow - Whether replacing a TransferMate Escrow payment
 * @returns {Object} { methodId, methodName }
 */
function determinePaymentMethod(bankDescription, wasEscrow = false) {
    const desc = (bankDescription || '').toLowerCase();

    // If replacing escrow, use TransferMate (not Bank Transfer)
    if (wasEscrow) {
        return {
            methodId: PAYMENT_METHODS.TRANSFERMATE,  // 10
            methodName: 'TransferMate'
        };
    }

    // Check description for payment source indicators
    if (desc.includes('stripe')) {
        return {
            methodId: PAYMENT_METHODS.STRIPE,  // 11
            methodName: 'Stripe'
        };
    }

    if (desc.includes('revolut')) {
        return {
            methodId: PAYMENT_METHODS.REVOLUT,  // 4 (Credit Card)
            methodName: 'Credit Card'  // Fidelo doesn't have "Revolut" - use Credit Card
        };
    }

    if (desc.includes('transfermate') || desc.includes('transfer mate')) {
        return {
            methodId: PAYMENT_METHODS.TRANSFERMATE,  // 10
            methodName: 'TransferMate'
        };
    }

    // Default: Bank Transfer
    return {
        methodId: PAYMENT_METHODS.BANK_TRANSFER,  // 2
        methodName: 'Bank Transfer'
    };
}

module.exports = {
    PAYMENT_METHODS,
    getPaymentMethodId,
    getPaymentMethodName,
    determinePaymentMethod
};
