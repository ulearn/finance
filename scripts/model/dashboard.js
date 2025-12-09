// dashboard.js - API endpoints for financial modeling dashboard
// ROUTING ONLY - No business logic (per architecture rules)

const express = require('express');
const router = express.Router();
const ForecastEngine = require('./forecast');
const ScenarioManager = require('./scenarios');
const LTOSimulator = require('./lto');
const FinancialDataAggregator = require('./data');

// Initialize engines
const forecastEngine = new ForecastEngine();
const scenarioManager = new ScenarioManager();
const ltoSimulator = new LTOSimulator();
const dataAggregator = new FinancialDataAggregator();

// =============================================================================
// SCENARIO MANAGEMENT
// =============================================================================

// Get all scenarios
router.get('/scenarios', async (req, res) => {
    try {
        const scenarios = await scenarioManager.getScenarios();
        res.json({ success: true, scenarios });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single scenario with details
router.get('/scenarios/:id', async (req, res) => {
    try {
        const scenario = await scenarioManager.getScenario(req.params.id);
        res.json({ success: true, scenario });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new scenario
router.post('/scenarios', async (req, res) => {
    try {
        const result = await scenarioManager.createScenario(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create scenario from template
router.post('/scenarios/template/:templateName', async (req, res) => {
    try {
        const { templateName } = req.params;
        const { baseYear } = req.body;
        const result = await scenarioManager.createFromTemplate(templateName, baseYear);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clone scenario
router.post('/scenarios/:id/clone', async (req, res) => {
    try {
        const { newName } = req.body;
        const result = await scenarioManager.cloneScenario(req.params.id, newName);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete scenario
router.delete('/scenarios/:id', async (req, res) => {
    try {
        const result = await scenarioManager.deleteScenario(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Compare scenarios
router.post('/scenarios/compare', async (req, res) => {
    try {
        const { scenarioIds } = req.body;
        const comparison = await scenarioManager.compareScenarios(scenarioIds);
        res.json({ success: true, comparison });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// DRIVERS
// =============================================================================

// Add driver to scenario
router.post('/scenarios/:id/drivers', async (req, res) => {
    try {
        const result = await scenarioManager.addDriver(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update driver
router.put('/drivers/:id', async (req, res) => {
    try {
        const result = await scenarioManager.updateDriver(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// FORECASTING
// =============================================================================

// Generate forecast for scenario
router.post('/scenarios/:id/forecast', async (req, res) => {
    try {
        // Clear module cache to ensure latest code is used
        delete require.cache[require.resolve('./forecast')];
        delete require.cache[require.resolve('./data')];
        const ForecastEngine = require('./forecast');
        const freshEngine = new ForecastEngine();

        const result = await freshEngine.generateForecast(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get forecast results
router.get('/scenarios/:id/forecast', async (req, res) => {
    try {
        const forecast = await forecastEngine.getForecast(req.params.id);
        res.json({ success: true, forecast });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// LTO SIMULATION
// =============================================================================

// Simulate single LTO
router.post('/scenarios/:id/lto/simulate', async (req, res) => {
    try {
        const result = await ltoSimulator.simulateLTO(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Run multiple LTO scenarios
router.post('/scenarios/:id/lto/multi-simulate', async (req, res) => {
    try {
        const result = await ltoSimulator.runMultipleScenarios(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get LTO simulation history
router.get('/scenarios/:id/lto', async (req, res) => {
    try {
        const simulations = await ltoSimulator.getLTOSimulations(req.params.id);
        res.json({ success: true, simulations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// DATA SYNC
// =============================================================================

// Sync Xero actuals
router.post('/data/sync-xero', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        const result = await dataAggregator.syncXeroActuals(startDate, endDate);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Calculate historical ratios
router.post('/data/calculate-ratios', async (req, res) => {
    try {
        const { months } = req.body;
        const result = await dataAggregator.calculateHistoricalRatios(months || 24);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get historical actuals
router.get('/data/actuals', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const actuals = await dataAggregator.getActuals(startDate, endDate);
        res.json({ success: true, actuals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get latest cost ratio
router.get('/data/cost-ratio', async (req, res) => {
    try {
        const { period } = req.query;
        const ratio = await dataAggregator.getLatestCostRatio(period || '12m');
        res.json({ success: true, ratio });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available Xero reports
router.get('/data/xero-reports', async (req, res) => {
    try {
        const reports = await dataAggregator.getAvailableXeroReports();
        res.json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'Financial Modeling Engine',
        status: 'operational',
        version: '1.0.0',
        features: [
            'Driver-based forecasting',
            'LTO simulation',
            'Scenario comparison',
            'Automatic variable cost scaling',
            'Xero integration'
        ]
    });
});

module.exports = router;
