// lto.js - LTO (Limited Time Offer) Simulation Engine
// Analyzes profitability breakpoints for discounts

const mysql = require('mysql2/promise');
const dayjs = require('dayjs');

class LTOSimulator {
    constructor() {
        this.dbConfig = {
            host: process.env.MODEL_DB_HOST || 'localhost',
            user: process.env.MODEL_DB_USER,
            password: process.env.MODEL_DB_PASSWORD,
            database: process.env.MODEL_DB_NAME || 'hub_model',
            port: process.env.MODEL_DB_PORT || 3306
        };
    }

    async getConnection() {
        return await mysql.createConnection(this.dbConfig);
    }

    /**
     * Simulate LTO profitability
     * Key question: At what scale does a 20% discount become profitable?
     *
     * @param {number} scenarioId
     * @param {object} params
     * @param {number} params.discount_percentage - e.g., 20 for 20% off
     * @param {string} params.channel - 'B2B', 'B2C', or 'Both'
     * @param {number} params.expected_volume_increase - % increase in bookings (e.g., 50 = 50% more)
     * @param {date} params.start_date
     * @param {date} params.end_date
     * @param {number} params.baseline_monthly_students - Avg students per month normally
     * @param {number} params.avg_revenue_per_student - Average price per student
     */
    async simulateLTO(scenarioId, params) {
        const connection = await this.getConnection();

        try {
            console.log(`Simulating LTO: ${params.discount_percentage}% off for ${params.channel}...`);

            const {
                discount_percentage,
                channel,
                expected_volume_increase,
                start_date,
                end_date,
                baseline_monthly_students,
                avg_revenue_per_student
            } = params;

            // Get baseline costs from scenario forecast
            const baselineCosts = await this.getBaselineCosts(connection, scenarioId);

            // Calculate scenarios
            const results = {
                baseline: this.calculateScenario({
                    students: baseline_monthly_students,
                    revenue_per_student: avg_revenue_per_student,
                    discount: 0,
                    costs: baselineCosts
                }),
                with_lto: this.calculateScenario({
                    students: baseline_monthly_students * (1 + expected_volume_increase / 100),
                    revenue_per_student: avg_revenue_per_student,
                    discount: discount_percentage,
                    costs: baselineCosts
                })
            };

            // Calculate breakeven volume
            const breakeven = this.calculateBreakeven({
                revenue_per_student: avg_revenue_per_student,
                discount: discount_percentage,
                baseline_students: baseline_monthly_students,
                baseline_profit: results.baseline.profit,
                costs: baselineCosts
            });

            // Calculate ROI
            const durationMonths = dayjs(end_date).diff(dayjs(start_date), 'months') + 1;
            const total_profit_with_lto = results.with_lto.profit * durationMonths;
            const total_profit_baseline = results.baseline.profit * durationMonths;
            const incremental_profit = total_profit_with_lto - total_profit_baseline;

            const roi_percentage = (incremental_profit / total_profit_baseline) * 100;

            // Save results
            const simulationResult = {
                scenario_id: scenarioId,
                discount_percentage: discount_percentage,
                channel: channel,
                expected_volume_increase: expected_volume_increase,
                breakeven_volume: breakeven.students,
                breakeven_revenue: breakeven.revenue,
                projected_profit: total_profit_with_lto,
                roi_percentage: roi_percentage,
                start_date: start_date,
                end_date: end_date,
                months_to_breakeven: breakeven.months
            };

            await this.saveLTOSimulation(connection, simulationResult);

            console.log(`✓ LTO Simulation complete`);
            console.log(`  Baseline profit/month: €${results.baseline.profit.toFixed(2)}`);
            console.log(`  With LTO profit/month: €${results.with_lto.profit.toFixed(2)}`);
            console.log(`  Breakeven students: ${breakeven.students}`);
            console.log(`  ROI: ${roi_percentage.toFixed(2)}%`);

            return {
                success: true,
                baseline: results.baseline,
                with_lto: results.with_lto,
                breakeven: breakeven,
                roi: roi_percentage,
                incremental_profit: incremental_profit,
                recommendation: this.getRecommendation(roi_percentage, breakeven.achievable)
            };

        } catch (error) {
            console.error('Error simulating LTO:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Calculate scenario financials
     */
    calculateScenario({ students, revenue_per_student, discount, costs }) {
        // Revenue
        const gross_revenue = students * revenue_per_student;
        const discount_amount = gross_revenue * (discount / 100);
        const net_revenue = gross_revenue - discount_amount;

        // Variable costs scale with volume
        const variable_cost_per_student = costs.variable_cost_per_student;
        const variable_costs = students * variable_cost_per_student;

        // Fixed costs stay the same
        const fixed_costs = costs.fixed_monthly;

        // Cost of sales scales with revenue
        const cos = net_revenue * costs.cos_ratio;

        // Commissions scale with revenue
        const commissions = net_revenue * costs.commission_ratio;

        // Total costs
        const total_costs = variable_costs + fixed_costs + cos + commissions;

        // Profit
        const profit = net_revenue - total_costs;
        const margin = (profit / net_revenue) * 100;

        return {
            students: Math.round(students),
            gross_revenue: Math.round(gross_revenue * 100) / 100,
            discount_amount: Math.round(discount_amount * 100) / 100,
            net_revenue: Math.round(net_revenue * 100) / 100,
            variable_costs: Math.round(variable_costs * 100) / 100,
            fixed_costs: Math.round(fixed_costs * 100) / 100,
            cos: Math.round(cos * 100) / 100,
            commissions: Math.round(commissions * 100) / 100,
            total_costs: Math.round(total_costs * 100) / 100,
            profit: Math.round(profit * 100) / 100,
            margin: Math.round(margin * 100) / 100
        };
    }

    /**
     * Calculate breakeven volume for LTO
     * Key question: How many students do we need to match baseline profit?
     */
    calculateBreakeven({ revenue_per_student, discount, baseline_students, baseline_profit, costs }) {
        // Discounted price per student
        const discounted_price = revenue_per_student * (1 - discount / 100);

        // Revenue per student after commissions and COS
        const net_per_student = discounted_price * (1 - costs.commission_ratio - costs.cos_ratio);

        // Variable cost per student
        const cost_per_student = costs.variable_cost_per_student;

        // Contribution margin per student
        const contribution_per_student = net_per_student - cost_per_student;

        // Fixed costs
        const fixed_costs = costs.fixed_monthly;

        // Breakeven students = (Fixed costs + Desired profit) / Contribution per student
        const breakeven_students = Math.ceil((fixed_costs + baseline_profit) / contribution_per_student);

        // Breakeven revenue
        const breakeven_revenue = breakeven_students * discounted_price;

        // Volume increase required
        const volume_increase_required = ((breakeven_students - baseline_students) / baseline_students) * 100;

        // Estimated months to achieve
        // Assuming 15% month-over-month growth during promotion
        let months = 1;
        let current_students = baseline_students;
        while (current_students < breakeven_students && months < 24) {
            current_students *= 1.15;
            months++;
        }

        return {
            students: breakeven_students,
            revenue: Math.round(breakeven_revenue * 100) / 100,
            volume_increase_required: Math.round(volume_increase_required * 100) / 100,
            months: months,
            achievable: volume_increase_required <= 100 // Is it realistic?
        };
    }

    /**
     * Get baseline costs from scenario
     */
    async getBaselineCosts(connection, scenarioId) {
        // Get average costs from forecast
        const [rows] = await connection.execute(`
            SELECT
                AVG(expense_variable_ratio) as variable_ratio,
                AVG(expense_fixed_total) as fixed_monthly,
                AVG(cos_total / NULLIF(net_revenue, 0)) as cos_ratio,
                AVG(commission_total / NULLIF(net_revenue, 0)) as commission_ratio,
                AVG(expense_variable_total / NULLIF(revenue_total, 0)) as var_cost_ratio
            FROM financial_forecasts
            WHERE scenario_id = ?
        `, [scenarioId]);

        if (rows.length === 0) {
            // Fallback to defaults
            return {
                variable_cost_per_student: 150,
                fixed_monthly: 50000,
                cos_ratio: 0.21,
                commission_ratio: 0.15,
                variable_ratio: 0.25
            };
        }

        const data = rows[0];

        return {
            variable_cost_per_student: 150, // Placeholder - will calculate properly
            fixed_monthly: parseFloat(data.fixed_monthly) || 50000,
            cos_ratio: parseFloat(data.cos_ratio) || 0.21,
            commission_ratio: parseFloat(data.commission_ratio) || 0.15,
            variable_ratio: parseFloat(data.variable_ratio) || 0.25
        };
    }

    /**
     * Save LTO simulation results
     */
    async saveLTOSimulation(connection, data) {
        const query = `
            INSERT INTO lto_simulations (
                scenario_id,
                discount_percentage,
                channel,
                expected_volume_increase,
                breakeven_volume,
                breakeven_revenue,
                projected_profit,
                roi_percentage,
                start_date,
                end_date,
                months_to_breakeven,
                computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        await connection.execute(query, [
            data.scenario_id,
            data.discount_percentage,
            data.channel,
            data.expected_volume_increase,
            data.breakeven_volume,
            data.breakeven_revenue,
            data.projected_profit,
            data.roi_percentage,
            data.start_date,
            data.end_date,
            data.months_to_breakeven
        ]);
    }

    /**
     * Get recommendation based on ROI
     */
    getRecommendation(roi_percentage, achievable) {
        if (!achievable) {
            return '❌ NOT RECOMMENDED - Breakeven volume is unrealistic';
        }

        if (roi_percentage > 50) {
            return '✅ HIGHLY RECOMMENDED - Excellent ROI potential';
        } else if (roi_percentage > 20) {
            return '✅ RECOMMENDED - Good ROI potential';
        } else if (roi_percentage > 0) {
            return '⚠️ MARGINAL - Small positive ROI, proceed with caution';
        } else {
            return '❌ NOT RECOMMENDED - Negative ROI projected';
        }
    }

    /**
     * Run multiple LTO scenarios (e.g., 10%, 15%, 20%, 25% discounts)
     */
    async runMultipleScenarios(scenarioId, baseParams) {
        const discounts = [10, 15, 20, 25, 30];
        const results = [];

        for (const discount of discounts) {
            const result = await this.simulateLTO(scenarioId, {
                ...baseParams,
                discount_percentage: discount
            });
            results.push({
                discount: discount,
                ...result
            });
        }

        return {
            success: true,
            scenarios: results,
            optimal: this.findOptimalDiscount(results)
        };
    }

    /**
     * Find optimal discount percentage
     */
    findOptimalDiscount(results) {
        let best = null;
        let bestROI = -Infinity;

        for (const result of results) {
            if (result.breakeven.achievable && result.roi > bestROI) {
                bestROI = result.roi;
                best = result;
            }
        }

        return best;
    }

    /**
     * Get LTO simulation history
     */
    async getLTOSimulations(scenarioId) {
        const connection = await this.getConnection();

        try {
            const [rows] = await connection.execute(`
                SELECT *
                FROM lto_simulations
                WHERE scenario_id = ?
                ORDER BY discount_percentage ASC
            `, [scenarioId]);

            return rows;

        } finally {
            await connection.end();
        }
    }
}

module.exports = LTOSimulator;
