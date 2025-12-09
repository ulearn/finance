// scenarios.js - Scenario management system
// Create, manage, and compare multiple forecast scenarios

const mysql = require('mysql2/promise');
const dayjs = require('dayjs');

class ScenarioManager {
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
     * Create a new scenario
     */
    async createScenario(params) {
        const connection = await this.getConnection();

        try {
            const {
                name,
                description,
                base_year,
                forecast_years = 3,
                is_baseline = false,
                created_by
            } = params;

            console.log(`Creating scenario: ${name}...`);

            const [result] = await connection.execute(`
                INSERT INTO financial_scenarios (
                    name, description, base_year, forecast_years, is_baseline, created_by
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                name || '',
                description || '',
                base_year,
                forecast_years,
                is_baseline,
                created_by || null
            ]);

            const scenarioId = result.insertId;

            console.log(`✓ Created scenario #${scenarioId}: ${name}`);

            return {
                success: true,
                scenario_id: scenarioId,
                scenario: {
                    id: scenarioId,
                    name,
                    description,
                    base_year,
                    forecast_years,
                    is_baseline,
                    created_by
                }
            };

        } catch (error) {
            console.error('Error creating scenario:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Add a driver to a scenario
     */
    async addDriver(scenarioId, driverParams) {
        const connection = await this.getConnection();

        try {
            const {
                driver_type,
                name,
                description,
                channel = 'Both',
                start_date,
                end_date,
                value_numeric,
                value_percentage,
                monthly_impact
            } = driverParams;

            console.log(`Adding ${driver_type} driver: ${name}...`);

            const [result] = await connection.execute(`
                INSERT INTO forecast_drivers (
                    scenario_id, driver_type, name, description, channel,
                    start_date, end_date, value_numeric, value_percentage, monthly_impact
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                scenarioId,
                driver_type,
                name,
                description || null,
                channel,
                start_date,
                end_date || null,
                value_numeric || null,
                value_percentage || null,
                monthly_impact ? JSON.stringify(monthly_impact) : null
            ]);

            console.log(`✓ Added driver #${result.insertId}`);

            return {
                success: true,
                driver_id: result.insertId
            };

        } catch (error) {
            console.error('Error adding driver:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    /**
     * Get all scenarios
     */
    async getScenarios() {
        const connection = await this.getConnection();

        try {
            const [scenarios] = await connection.execute(`
                SELECT * FROM financial_scenarios
                ORDER BY created_at DESC
            `);

            // Get driver counts for each scenario
            for (const scenario of scenarios) {
                const [drivers] = await connection.execute(`
                    SELECT COUNT(*) as count
                    FROM forecast_drivers
                    WHERE scenario_id = ? AND is_active = TRUE
                `, [scenario.id]);

                scenario.driver_count = drivers[0].count;
            }

            return scenarios;

        } finally {
            await connection.end();
        }
    }

    /**
     * Get scenario details with drivers
     */
    async getScenario(scenarioId) {
        const connection = await this.getConnection();

        try {
            const [scenarios] = await connection.execute(`
                SELECT * FROM financial_scenarios WHERE id = ?
            `, [scenarioId]);

            if (scenarios.length === 0) {
                throw new Error(`Scenario ${scenarioId} not found`);
            }

            const scenario = scenarios[0];

            // Get drivers
            const [drivers] = await connection.execute(`
                SELECT * FROM forecast_drivers
                WHERE scenario_id = ? AND is_active = TRUE
                ORDER BY start_date ASC
            `, [scenarioId]);

            scenario.drivers = drivers;

            return scenario;

        } finally {
            await connection.end();
        }
    }

    /**
     * Compare multiple scenarios
     */
    async compareScenarios(scenarioIds) {
        const connection = await this.getConnection();

        try {
            console.log(`Comparing ${scenarioIds.length} scenarios...`);

            const comparison = {
                scenarios: [],
                metrics: []
            };

            for (const scenarioId of scenarioIds) {
                const scenario = await this.getScenario(scenarioId);

                // Get forecast summary
                const [summary] = await connection.execute(`
                    SELECT
                        MIN(period_date) as start_date,
                        MAX(period_date) as end_date,
                        SUM(revenue_total) as total_revenue,
                        SUM(net_revenue) as total_net_revenue,
                        SUM(operating_profit) as total_operating_profit,
                        SUM(net_income) as total_net_income,
                        AVG(revenue_total) as avg_monthly_revenue,
                        AVG(operating_profit) as avg_monthly_profit
                    FROM financial_forecasts
                    WHERE scenario_id = ?
                `, [scenarioId]);

                comparison.scenarios.push({
                    id: scenarioId,
                    name: scenario.name,
                    description: scenario.description,
                    driver_count: scenario.drivers.length,
                    summary: summary[0]
                });
            }

            // Calculate variance from baseline
            const baseline = comparison.scenarios.find(s =>
                s.name.toLowerCase().includes('baseline')
            ) || comparison.scenarios[0];

            for (const scenario of comparison.scenarios) {
                if (scenario.id === baseline.id) continue;

                scenario.variance = {
                    revenue: ((scenario.summary.total_revenue - baseline.summary.total_revenue) /
                             baseline.summary.total_revenue * 100).toFixed(2),
                    profit: ((scenario.summary.total_net_income - baseline.summary.total_net_income) /
                            baseline.summary.total_net_income * 100).toFixed(2)
                };
            }

            return comparison;

        } finally {
            await connection.end();
        }
    }

    /**
     * Update driver
     */
    async updateDriver(driverId, updates) {
        const connection = await this.getConnection();

        try {
            const allowedFields = [
                'name', 'description', 'channel', 'start_date', 'end_date',
                'value_numeric', 'value_percentage', 'monthly_impact', 'is_active'
            ];

            const updateFields = [];
            const updateValues = [];

            for (const [field, value] of Object.entries(updates)) {
                if (allowedFields.includes(field)) {
                    updateFields.push(`${field} = ?`);
                    updateValues.push(field === 'monthly_impact' && value ? JSON.stringify(value) : value);
                }
            }

            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            updateValues.push(driverId);

            await connection.execute(`
                UPDATE forecast_drivers
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, updateValues);

            console.log(`✓ Updated driver #${driverId}`);

            return { success: true };

        } finally {
            await connection.end();
        }
    }

    /**
     * Delete scenario
     */
    async deleteScenario(scenarioId) {
        const connection = await this.getConnection();

        try {
            console.log(`Deleting scenario #${scenarioId}...`);

            // Cascade delete will handle drivers and forecasts
            await connection.execute(`
                DELETE FROM financial_scenarios WHERE id = ?
            `, [scenarioId]);

            console.log(`✓ Deleted scenario #${scenarioId}`);

            return { success: true };

        } finally {
            await connection.end();
        }
    }

    /**
     * Clone scenario
     */
    async cloneScenario(scenarioId, newName) {
        const connection = await this.getConnection();

        try {
            console.log(`Cloning scenario #${scenarioId}...`);

            // Get original scenario
            const original = await this.getScenario(scenarioId);

            // Create new scenario
            const [result] = await connection.execute(`
                INSERT INTO financial_scenarios (
                    name, description, base_year, forecast_years, is_baseline, created_by
                ) VALUES (?, ?, ?, ?, FALSE, ?)
            `, [
                newName || `${original.name} (Copy)`,
                original.description,
                original.base_year,
                original.forecast_years,
                original.created_by
            ]);

            const newScenarioId = result.insertId;

            // Clone drivers
            for (const driver of original.drivers) {
                await connection.execute(`
                    INSERT INTO forecast_drivers (
                        scenario_id, driver_type, name, description, channel,
                        start_date, end_date, value_numeric, value_percentage,
                        monthly_impact, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    newScenarioId,
                    driver.driver_type,
                    driver.name,
                    driver.description,
                    driver.channel,
                    driver.start_date,
                    driver.end_date,
                    driver.value_numeric,
                    driver.value_percentage,
                    driver.monthly_impact,
                    driver.is_active
                ]);
            }

            console.log(`✓ Cloned scenario to #${newScenarioId}`);

            return {
                success: true,
                new_scenario_id: newScenarioId
            };

        } finally {
            await connection.end();
        }
    }

    /**
     * Quick scenario templates
     */
    async createFromTemplate(templateName, baseYear) {
        const templates = {
            'baseline': {
                name: `${baseYear} Baseline`,
                description: 'No changes, continue current trajectory',
                drivers: []
            },
            'aggressive_growth': {
                name: `${baseYear} Aggressive Growth`,
                description: 'New hires + increased marketing',
                drivers: [
                    {
                        driver_type: 'hire',
                        name: 'B2B Sales Hire',
                        channel: 'B2B',
                        value_numeric: 30000,
                        start_date: `${baseYear}-01-01`
                    },
                    {
                        driver_type: 'hire',
                        name: 'B2C Marketing Specialist',
                        channel: 'B2C',
                        value_numeric: 15000,
                        start_date: `${baseYear}-03-01`
                    },
                    {
                        driver_type: 'variable_cost',
                        name: 'Increased Marketing Budget',
                        value_numeric: 5000,
                        start_date: `${baseYear}-01-01`
                    }
                ]
            },
            'conservative': {
                name: `${baseYear} Conservative`,
                description: 'Cost cutting, maintain revenue',
                drivers: [
                    {
                        driver_type: 'variable_cost',
                        name: 'Reduce Marketing Spend',
                        value_numeric: -3000,
                        start_date: `${baseYear}-01-01`
                    },
                    {
                        driver_type: 'fixed_cost',
                        name: 'Rent Reduction (negotiation)',
                        value_numeric: -1000,
                        start_date: `${baseYear}-07-01`
                    }
                ]
            }
        };

        const template = templates[templateName];
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        // Create scenario
        const scenario = await this.createScenario({
            name: template.name,
            description: template.description,
            base_year: baseYear,
            forecast_years: 3,
            is_baseline: templateName === 'baseline'
        });

        // Add drivers
        for (const driver of template.drivers) {
            await this.addDriver(scenario.scenario_id, driver);
        }

        return scenario;
    }
}

module.exports = ScenarioManager;
