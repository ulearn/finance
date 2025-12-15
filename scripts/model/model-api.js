/**
 * API Endpoint for Hormozi Sales Model Dashboard
 * Serves integrated data from MySQL and Xero
 */

const express = require('express');
const router = express.Router();
const ModelDataIntegration = require('./data-integration');

// GET /api/model/data?year=2025
router.get('/data', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2025;

        const integration = new ModelDataIntegration();

        // TODO: Configure where ad spend data comes from
        // For now, use default €4000/month (from your CSV)
        const defaultAdSpend = Array(12).fill(4000);

        // Fetch all data
        const [modelData, salesData] = await Promise.all([
            integration.getCompleteModelData(year, defaultAdSpend),
            integration.getSalesWonData(year)
        ]);

        // Combine model data with sales won
        const completeData = modelData.map((data, idx) => ({
            ...data,
            ...salesData[idx]
        }));

        res.json({
            success: true,
            year: year,
            data: completeData
        });

    } catch (error) {
        console.error('Error fetching model data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/model/summary?year=2025
router.get('/summary', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2025;

        const integration = new ModelDataIntegration();
        const defaultAdSpend = Array(12).fill(4000);

        const [modelData, salesData] = await Promise.all([
            integration.getCompleteModelData(year, defaultAdSpend),
            integration.getSalesWonData(year)
        ]);

        // Calculate year totals
        const totals = modelData.reduce((acc, month) => ({
            ads: acc.ads + month.ads,
            software: acc.software + month.software,
            printing: acc.printing + month.printing,
            events: acc.events + month.events,
            travel: acc.travel + month.travel,
            salaries: acc.salaries + month.salaries,
            commissions: acc.commissions + month.commissions,
            mediaCAC: acc.mediaCAC + month.mediaCAC,
            prospectingCAC: acc.prospectingCAC + month.prospectingCAC,
            fullyLoadedCAC: acc.fullyLoadedCAC + month.fullyLoadedCAC
        }), {
            ads: 0,
            software: 0,
            printing: 0,
            events: 0,
            travel: 0,
            salaries: 0,
            commissions: 0,
            mediaCAC: 0,
            prospectingCAC: 0,
            fullyLoadedCAC: 0
        });

        const salesTotals = salesData.reduce((acc, month) => ({
            total: acc.total + month.salesWon,
            b2c: acc.b2c + month.b2cSales,
            b2b: acc.b2b + month.b2bSales
        }), { total: 0, b2c: 0, b2b: 0 });

        res.json({
            success: true,
            year: year,
            totals: totals,
            sales: salesTotals,
            avgCACPerCustomer: salesTotals.total > 0
                ? totals.fullyLoadedCAC / salesTotals.total
                : 0
        });

    } catch (error) {
        console.error('Error fetching model summary:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
