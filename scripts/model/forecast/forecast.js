// forecast.js - Core forecasting engine with driver-based modeling
// This is the KEY piece that Fathom couldn't do properly!

const mysql = require('mysql2/promise');
const dayjs = require('dayjs');
const FinancialDataAggregator = require('./data');

class ForecastEngine {
    constructor() {
        this.dataAggregator = new FinancialDataAggregator();
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
     * Generate forecast for a scenario
     * @param {number} scenarioId
     * @param {object} options
     */
    async generateForecast(scenarioId, options = {}) {
        const connection = await this.getConnection();

        try {
            console.log(`Generating forecast for scenario ${scenarioId}...`);

            // Get scenario details
            const [scenarios] = await connection.execute(
                'SELECT * FROM financial_scenarios WHERE id = ?',
                [scenarioId]
            );

            if (scenarios.length === 0) {
                throw new Error(`Scenario ${scenarioId} not found`);
            }

            const scenario = scenarios[0];

            // Get all drivers for this scenario
            const [drivers] = await connection.execute(
                'SELECT * FROM forecast_drivers WHERE scenario_id = ? AND is_active = TRUE',
                [scenarioId]
            );

            // Get baseline actuals (use 2024 full year data)
            // Note: Using 2024-01 to 2024-11 to exclude incomplete December data
            const baselineStartDate = '2024-01-01';
            const baselineEndDate = '2024-11-30';
            const actuals = await this.dataAggregator.getActuals(baselineStartDate, baselineEndDate);

            // Calculate baseline averages
            const baseline = this.calculateBaseline(actuals);

            // Get latest variable cost ratio (calculate if missing)
            let variableCostRatio;
            try {
                variableCostRatio = await this.dataAggregator.getLatestCostRatio('12m');
            } catch (error) {
                if (error.message.includes('No historical ratio data')) {
                    console.log('⚠️  No ratio data found, calculating now...');
                    await this.dataAggregator.calculateHistoricalRatios(24);
                    variableCostRatio = await this.dataAggregator.getLatestCostRatio('12m');
                } else {
                    throw error;
                }
            }

            console.log(`✓ Baseline revenue: €${baseline.avg_revenue_total.toFixed(2)}`);
            console.log(`✓ Variable cost ratio: ${(variableCostRatio * 100).toFixed(2)}%`);

            // Generate monthly forecasts
            const forecasts = [];
            const startDate = dayjs(scenario.base_year + '-01-01');
            const totalMonths = scenario.forecast_years * 12;

            for (let monthOffset = 0; monthOffset < totalMonths; monthOffset++) {
                const forecastDate = startDate.add(monthOffset, 'months');
                const monthData = await this.forecastMonth(
                    forecastDate,
                    baseline,
                    drivers,
                    variableCostRatio,
                    monthOffset
                );

                monthData.scenario_id = scenarioId;
                monthData.period_date = forecastDate.format('YYYY-MM-DD');

                forecasts.push(monthData);

                // Insert into database
                await this.saveForecast(connection, monthData);
            }

            console.log(`✓ Generated ${forecasts.length} months of forecasts`);

            return {
                success: true,
                scenario_id: scenarioId,
                months: forecasts.length,
                forecasts: forecasts
            };

        } catch (error) {
            console.error('Error generating forecast:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Calculate baseline from historical actuals
     */
    calculateBaseline(actuals) {
        if (actuals.length === 0) {
            throw new Error('No historical data available for baseline');
        }

        const totals = actuals.reduce((acc, month) => {
            acc.revenue_b2b += parseFloat(month.revenue_b2b) || 0;
            acc.revenue_b2c += parseFloat(month.revenue_b2c) || 0;
            acc.revenue_accommodation += parseFloat(month.revenue_accommodation) || 0;
            acc.revenue_other += parseFloat(month.revenue_other) || 0;
            acc.revenue_total += parseFloat(month.revenue_total) || 0;
            acc.cos_total += parseFloat(month.cos_total) || 0;
            acc.expense_fixed += parseFloat(month.expense_fixed_total) || 0;
            acc.expense_variable += parseFloat(month.expense_variable_total) || 0;
            return acc;
        }, {
            revenue_b2b: 0,
            revenue_b2c: 0,
            revenue_accommodation: 0,
            revenue_other: 0,
            revenue_total: 0,
            cos_total: 0,
            expense_fixed: 0,
            expense_variable: 0
        });

        const count = actuals.length;

        return {
            avg_revenue_b2b: totals.revenue_b2b / count,
            avg_revenue_b2c: totals.revenue_b2c / count,
            avg_revenue_accommodation: totals.revenue_accommodation / count,
            avg_revenue_other: totals.revenue_other / count,
            avg_revenue_total: totals.revenue_total / count,
            avg_cos_total: totals.cos_total / count,
            avg_expense_fixed: totals.expense_fixed / count,
            avg_expense_variable: totals.expense_variable / count
        };
    }

    /**
     * Forecast a single month
     * This is where the magic happens!
     */
    async forecastMonth(date, baseline, drivers, variableCostRatio, monthOffset) {
        // Start with baseline
        let revenue_b2b = baseline.avg_revenue_b2b;
        let revenue_b2c = baseline.avg_revenue_b2c;
        let revenue_accommodation = baseline.avg_revenue_accommodation;
        let revenue_other = baseline.avg_revenue_other;

        let lto_discount_percentage = 0;
        let commission_rate_b2b = 0.25; // Default 25%
        let commission_rate_b2c = 0.01; // Default 1%

        // Apply drivers
        for (const driver of drivers) {
            if (!this.isDriverActive(driver, date)) {
                continue;
            }

            switch (driver.driver_type) {
                case 'hire':
                    // New hire driver (e.g., B2B sales hire)
                    const hireImpact = this.calculateHireImpact(driver, monthOffset);
                    if (driver.channel === 'B2B') {
                        revenue_b2b += hireImpact;
                    } else if (driver.channel === 'B2C') {
                        revenue_b2c += hireImpact;
                    }
                    break;

                case 'price_change':
                    // Price increase/decrease
                    const priceChangePct = parseFloat(driver.value_percentage) / 100;
                    if (driver.channel === 'B2B' || driver.channel === 'Both') {
                        revenue_b2b *= (1 + priceChangePct);
                    }
                    if (driver.channel === 'B2C' || driver.channel === 'Both') {
                        revenue_b2c *= (1 + priceChangePct);
                    }
                    break;

                case 'lto_discount':
                    // Limited Time Offer discount
                    lto_discount_percentage = parseFloat(driver.value_percentage);
                    break;

                case 'strategic_initiative':
                    // Strategic play (e.g., Life Pass)
                    const stratImpact = parseFloat(driver.value_numeric) || 0;
                    revenue_other += stratImpact;
                    break;

                case 'fixed_cost':
                    // Will be handled in expense calculation
                    break;

                case 'variable_cost':
                    // Will be handled in expense calculation
                    break;
            }
        }

        // Calculate total revenue
        const revenue_total = revenue_b2b + revenue_b2c + revenue_accommodation + revenue_other;

        // Apply LTO discount
        const lto_discount_amount = revenue_total * (lto_discount_percentage / 100);
        const net_revenue = revenue_total - lto_discount_amount;

        // Calculate commissions
        const commission_b2b = revenue_b2b * commission_rate_b2b;
        const commission_b2c = revenue_b2c * commission_rate_b2c;
        const commission_total = commission_b2b + commission_b2c;

        // Calculate Cost of Sales (use baseline, scales proportionally with revenue)
        const cos_total = (net_revenue / baseline.avg_revenue_total) * baseline.avg_cos_total;

        // Calculate Fixed Expenses (relatively constant)
        let expense_fixed_total = baseline.avg_expense_fixed;

        // Apply fixed cost drivers
        for (const driver of drivers) {
            if (driver.driver_type === 'fixed_cost' && this.isDriverActive(driver, date)) {
                expense_fixed_total += parseFloat(driver.value_numeric) || 0;
            }
        }

        // Calculate Variable Expenses
        // THIS IS THE KEY FEATURE THAT FATHOM COULDN'T DO!
        // Variable costs automatically scale with revenue!
        let expense_variable_total = net_revenue * variableCostRatio;

        // Apply variable cost drivers
        for (const driver of drivers) {
            if (driver.driver_type === 'variable_cost' && this.isDriverActive(driver, date)) {
                const adjustment = parseFloat(driver.value_numeric) || 0;
                expense_variable_total += adjustment;
            }
        }

        // Calculate derived metrics
        const gross_profit = net_revenue - cos_total;
        const operating_profit = gross_profit - expense_fixed_total - expense_variable_total - commission_total;
        const net_income = operating_profit; // Simplified (no tax/interest for now)

        // Cash on hand (simplified rolling calculation)
        const cash_on_hand = 0; // Will calculate properly in cash flow model

        return {
            revenue_b2b: Math.round(revenue_b2b * 100) / 100,
            revenue_b2c: Math.round(revenue_b2c * 100) / 100,
            revenue_accommodation: Math.round(revenue_accommodation * 100) / 100,
            revenue_other: Math.round(revenue_other * 100) / 100,
            revenue_total: Math.round(revenue_total * 100) / 100,
            lto_discount_amount: Math.round(lto_discount_amount * 100) / 100,
            lto_discount_percentage: lto_discount_percentage,
            net_revenue: Math.round(net_revenue * 100) / 100,
            commission_b2b: Math.round(commission_b2b * 100) / 100,
            commission_b2c: Math.round(commission_b2c * 100) / 100,
            commission_total: Math.round(commission_total * 100) / 100,
            cos_total: Math.round(cos_total * 100) / 100,
            expense_fixed_total: Math.round(expense_fixed_total * 100) / 100,
            expense_variable_total: Math.round(expense_variable_total * 100) / 100,
            expense_variable_ratio: variableCostRatio,
            gross_profit: Math.round(gross_profit * 100) / 100,
            operating_profit: Math.round(operating_profit * 100) / 100,
            net_income: Math.round(net_income * 100) / 100,
            cash_on_hand: cash_on_hand
        };
    }

    /**
     * Check if driver is active for given date
     */
    isDriverActive(driver, date) {
        const driverStart = driver.start_date ? dayjs(driver.start_date) : null;
        const driverEnd = driver.end_date ? dayjs(driver.end_date) : null;

        if (driverStart && date.isBefore(driverStart)) {
            return false;
        }

        if (driverEnd && date.isAfter(driverEnd)) {
            return false;
        }

        return true;
    }

    /**
     * Calculate hire impact with lag time
     * Accounts for: deal signing → first student delay
     */
    calculateHireImpact(driver, monthOffset) {
        const monthlyImpact = parseFloat(driver.value_numeric) || 0;

        // Parse monthly_impact JSON if exists (allows custom ramp-up)
        if (driver.monthly_impact) {
            try {
                const impacts = JSON.parse(driver.monthly_impact);
                if (impacts[monthOffset] !== undefined) {
                    return impacts[monthOffset];
                }
            } catch (e) {
                // Fall through to default calculation
            }
        }

        // Default: linear ramp-up over 6 months
        const rampMonths = 6;
        if (monthOffset < rampMonths) {
            return monthlyImpact * (monthOffset + 1) / rampMonths;
        }

        return monthlyImpact;
    }

    /**
     * Save forecast to database
     */
    async saveForecast(connection, data) {
        const query = `
            INSERT INTO financial_forecasts (
                scenario_id, period_date,
                revenue_b2b, revenue_b2c, revenue_accommodation, revenue_other, revenue_total,
                lto_discount_amount, lto_discount_percentage, net_revenue,
                commission_b2b, commission_b2c, commission_total,
                cos_total,
                expense_fixed_total, expense_variable_total, expense_variable_ratio,
                gross_profit, operating_profit, net_income,
                cash_on_hand,
                computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                revenue_b2b = VALUES(revenue_b2b),
                revenue_b2c = VALUES(revenue_b2c),
                revenue_accommodation = VALUES(revenue_accommodation),
                revenue_other = VALUES(revenue_other),
                revenue_total = VALUES(revenue_total),
                lto_discount_amount = VALUES(lto_discount_amount),
                lto_discount_percentage = VALUES(lto_discount_percentage),
                net_revenue = VALUES(net_revenue),
                commission_b2b = VALUES(commission_b2b),
                commission_b2c = VALUES(commission_b2c),
                commission_total = VALUES(commission_total),
                cos_total = VALUES(cos_total),
                expense_fixed_total = VALUES(expense_fixed_total),
                expense_variable_total = VALUES(expense_variable_total),
                expense_variable_ratio = VALUES(expense_variable_ratio),
                gross_profit = VALUES(gross_profit),
                operating_profit = VALUES(operating_profit),
                net_income = VALUES(net_income),
                cash_on_hand = VALUES(cash_on_hand),
                computed_at = NOW()
        `;

        await connection.execute(query, [
            data.scenario_id,
            data.period_date,
            data.revenue_b2b,
            data.revenue_b2c,
            data.revenue_accommodation,
            data.revenue_other,
            data.revenue_total,
            data.lto_discount_amount,
            data.lto_discount_percentage,
            data.net_revenue,
            data.commission_b2b,
            data.commission_b2c,
            data.commission_total,
            data.cos_total,
            data.expense_fixed_total,
            data.expense_variable_total,
            data.expense_variable_ratio,
            data.gross_profit,
            data.operating_profit,
            data.net_income,
            data.cash_on_hand
        ]);
    }

    /**
     * Get forecast results
     */
    async getForecast(scenarioId) {
        const connection = await this.getConnection();

        try {
            const [rows] = await connection.execute(`
                SELECT *
                FROM financial_forecasts
                WHERE scenario_id = ?
                ORDER BY period_date ASC
            `, [scenarioId]);

            return rows;

        } finally {
            await connection.end();
        }
    }
}

module.exports = ForecastEngine;
