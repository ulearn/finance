/**
 * Generate composite key from teacher payment record fields
 * Used for reliable deduplication across Fidelo API refreshes
 *
 * @param {string} firstname - Teacher name (e.g., "O'h-Uigin, Caol")
 * @param {string} selectValue - Week string (e.g., "Week 43, 20/10/2025 – 26/10/2025")
 * @param {string} classname - Class name (e.g., "B2&C1 PM")
 * @param {string} days - Days string (e.g., "Monday, Tuesday, Wednesday, Thursday, Friday")
 * @returns {string} - Composite key (alphanumeric + underscores, lowercase)
 */
function generateCompositeKey(firstname, selectValue, classname, days) {
    // Combine all fields
    const combined = `${firstname}_${selectValue}_${classname}_${days}`;

    // Strip out non-alphanumeric characters (except underscores)
    // Keep spaces temporarily, then replace with underscores
    const cleaned = combined
        .replace(/[^a-zA-Z0-9\s_]/g, '') // Remove special chars
        .replace(/\s+/g, '_')             // Replace spaces with underscores
        .replace(/_+/g, '_')              // Collapse multiple underscores
        .toLowerCase();                   // Lowercase for consistency

    return cleaned;
}

module.exports = { generateCompositeKey };
