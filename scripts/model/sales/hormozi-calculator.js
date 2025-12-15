/**
 * Hormozi Sales Model Calculator
 *
 * Calculates key metrics based on Alex Hormozi's framework:
 * - CAC (Customer Acquisition Cost) - Media & Fully Loaded
 * - LTV (Lifetime Value)
 * - Gross Profit & Margin
 * - LTV:CAC Ratio
 */

class HormoziCalculator {
    constructor() {
        // Session Pricing
        this.morningSession = {
            hourlyPrice: 7.00,
            hoursPerWeek: 15,
            weeklyPrice: 105.00,
            monthlyPrice: 420.00
        };

        this.afternoonSession = {
            hourlyPrice: 6.00,
            hoursPerWeek: 15,
            weeklyPrice: 90.00,
            monthlyPrice: 360.00
        };

        // Teacher Costs
        this.teacher = {
            hourlyRate: 21.00,
            hoursPerWeek: 15,
            monthlyTotal: 1260.00,
            maxStudents: 15
        };

        // Calculate cost per client (teacher cost / max students)
        this.costPerClient = this.teacher.monthlyTotal / this.teacher.maxStudents; // €84
    }

    /**
     * Calculate Media CAC (Ads + Software only)
     */
    calculateMediaCAC(ads, software) {
        return ads + software;
    }

    /**
     * Calculate Fully Loaded CAC (Media + Salaries + Commissions)
     */
    calculateFullyLoadedCAC(ads, software, salaries, commissions) {
        const mediaCAC = this.calculateMediaCAC(ads, software);
        return mediaCAC + salaries + commissions;
    }

    /**
     * Calculate CAC per customer
     */
    calculateCACPerCustomer(fullyLoadedCAC, salesWon) {
        if (salesWon === 0) return 0;
        return fullyLoadedCAC / salesWon;
    }

    /**
     * Calculate Gross Profit for a session type
     */
    calculateGrossProfit(sessionType) {
        const session = sessionType === 'morning' ? this.morningSession : this.afternoonSession;
        return session.monthlyPrice - this.costPerClient;
    }

    /**
     * Calculate Gross Margin % for a session type
     */
    calculateGrossMargin(sessionType) {
        const session = sessionType === 'morning' ? this.morningSession : this.afternoonSession;
        const grossProfit = this.calculateGrossProfit(sessionType);
        return (grossProfit / session.monthlyPrice) * 100;
    }

    /**
     * Calculate Lifetime Revenue (assuming average customer duration)
     * @param {number} averageMonths - Average customer lifetime in months
     * @param {string} sessionType - 'morning' or 'afternoon'
     */
    calculateLTR(averageMonths, sessionType) {
        const session = sessionType === 'morning' ? this.morningSession : this.afternoonSession;
        return session.monthlyPrice * averageMonths;
    }

    /**
     * Calculate Lifetime Gross Profit (LTV in Hormozi terms)
     * @param {number} averageMonths - Average customer lifetime in months
     * @param {string} sessionType - 'morning' or 'afternoon'
     */
    calculateLTV(averageMonths, sessionType) {
        const grossProfit = this.calculateGrossProfit(sessionType);
        return grossProfit * averageMonths;
    }

    /**
     * Calculate LTV:CAC Ratio
     */
    calculateLTVtoCAC(ltv, cac) {
        if (cac === 0) return 0;
        return ltv / cac;
    }

    /**
     * Process monthly data for a full year
     * @param {Array} monthlyData - Array of 12 months with: { ads, software, salaries, commissions, salesWon }
     * @param {number} averageMonths - Average customer lifetime
     * @param {string} sessionType - 'morning' or 'afternoon'
     */
    processYearData(monthlyData, averageMonths, sessionType) {
        const results = [];

        for (let i = 0; i < monthlyData.length; i++) {
            const month = monthlyData[i];

            const mediaCAC = this.calculateMediaCAC(month.ads, month.software);
            const fullyLoadedCAC = this.calculateFullyLoadedCAC(
                month.ads,
                month.software,
                month.salaries,
                month.commissions
            );
            const cacPerCustomer = this.calculateCACPerCustomer(fullyLoadedCAC, month.salesWon);

            const grossProfit = this.calculateGrossProfit(sessionType);
            const grossMargin = this.calculateGrossMargin(sessionType);
            const ltr = this.calculateLTR(averageMonths, sessionType);
            const ltv = this.calculateLTV(averageMonths, sessionType);
            const ltvToCAC = this.calculateLTVtoCAC(ltv, cacPerCustomer);

            results.push({
                month: i + 1,
                mediaCAC: mediaCAC,
                fullyLoadedCAC: fullyLoadedCAC,
                salesWon: month.salesWon,
                cacPerCustomer: cacPerCustomer,
                grossProfit: grossProfit,
                grossMargin: grossMargin,
                ltr: ltr,
                ltv: ltv,
                ltvToCAC: ltvToCAC
            });
        }

        // Calculate totals
        const totals = {
            mediaCAC: results.reduce((sum, m) => sum + m.mediaCAC, 0),
            fullyLoadedCAC: results.reduce((sum, m) => sum + m.fullyLoadedCAC, 0),
            salesWon: results.reduce((sum, m) => sum + m.salesWon, 0),
            avgCACPerCustomer: 0,
            grossProfit: this.calculateGrossProfit(sessionType),
            grossMargin: this.calculateGrossMargin(sessionType),
            ltr: this.calculateLTR(averageMonths, sessionType),
            ltv: this.calculateLTV(averageMonths, sessionType),
            avgLTVtoCAC: 0
        };

        totals.avgCACPerCustomer = this.calculateCACPerCustomer(totals.fullyLoadedCAC, totals.salesWon);
        totals.avgLTVtoCAC = this.calculateLTVtoCAC(totals.ltv, totals.avgCACPerCustomer);

        return {
            monthly: results,
            totals: totals
        };
    }
}

module.exports = HormoziCalculator;
