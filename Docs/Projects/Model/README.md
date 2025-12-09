# Financial Modeling & Simulation System

**Replacing Fathom with custom driver-based forecasting**

## Quick Start

### 1. Initialize Database

```bash
cd /home/hub/public_html/fins
node scripts/model/init-db.js
```

This creates all necessary tables in `hub_model` database.

### 2. Import 2024 Actuals from Xero

```bash
node scripts/model/import-xero-2024.js
```

This will:
- Pull all 2024 P&L data from Xero
- Calculate revenue/cost ratios (the thing Fathom couldn't do!)
- Store baseline data for forecasting

### 3. Access Dashboard

Open: https://hub.ulearnschool.com/fins/scripts/model/dashboard.html

### 4. Create Your First Scenario

**Option A: Use Templates**
- Click "Create Baseline" for no-change scenario
- Click "Aggressive Growth" for expansion scenario
- Click "Conservative" for cost-cutting scenario

**Option B: Custom Scenario**
- Click "+ Create Custom Scenario"
- Name it (e.g., "2025 Growth Plan")
- Add description
- Set base year (2025) and forecast years (3)

### 5. Add Drivers

Drivers are the changes you want to model:

**Hire Driver** (New sales person):
```json
{
  "driver_type": "hire",
  "name": "B2B Sales Hire",
  "channel": "B2B",
  "value_numeric": 30000,
  "start_date": "2025-01-01",
  "description": "Expected monthly revenue from new hire"
}
```

**Price Change**:
```json
{
  "driver_type": "price_change",
  "name": "10% Price Increase",
  "channel": "Both",
  "value_percentage": 10,
  "start_date": "2025-01-01"
}
```

**LTO Discount**:
```json
{
  "driver_type": "lto_discount",
  "name": "Summer 20% Off",
  "value_percentage": 20,
  "start_date": "2025-06-01",
  "end_date": "2025-08-31"
}
```

### 6. Generate Forecast

Click "Generate Forecast" - the system will:
- Use 2024 as baseline
- Apply all your drivers
- **Automatically scale variable costs with revenue** (KEY FEATURE!)
- Project 36 months forward

### 7. Run LTO Simulation

Go to "LTO Simulation" tab to answer:
- "At what scale does a 20% discount become profitable?"
- Calculate breakeven volume
- Compare with/without discount scenarios

## Key Features

### 1. Automatic Variable Cost Scaling
**The thing Fathom couldn't do!**

The system analyzes your historical revenue/cost ratio and automatically scales variable costs when revenue changes. No manual configuration needed.

### 2. Driver-Based Modeling
Like Fathom but better. Add drivers for:
- New hires (with lag time for deal → student)
- Price changes
- LTO discounts
- Strategic initiatives (Life Pass, etc.)
- Cost adjustments

### 3. LTO Profitability Analysis
Simulate discount campaigns:
- Input: discount %, expected volume increase
- Output: breakeven volume, ROI, recommendation

### 4. B2B vs B2C Tracking
Separate channels with different:
- Commission rates (B2B: 22-30%, B2C: 1%)
- Growth drivers
- Revenue streams

### 5. Scenario Comparison
Create multiple scenarios and compare:
- Baseline vs Growth
- Conservative vs Aggressive
- With LTO vs Without

## API Endpoints

All endpoints at: `/fins/model/dashboard`

### Scenarios
- `GET /scenarios` - List all scenarios
- `POST /scenarios` - Create scenario
- `POST /scenarios/template/:name` - Create from template
- `GET /scenarios/:id` - Get scenario details
- `POST /scenarios/:id/clone` - Clone scenario
- `DELETE /scenarios/:id` - Delete scenario

### Drivers
- `POST /scenarios/:id/drivers` - Add driver
- `PUT /drivers/:id` - Update driver

### Forecasting
- `POST /scenarios/:id/forecast` - Generate forecast
- `GET /scenarios/:id/forecast` - Get forecast results

### LTO Simulation
- `POST /scenarios/:id/lto/simulate` - Single simulation
- `POST /scenarios/:id/lto/multi-simulate` - Multiple discounts
- `GET /scenarios/:id/lto` - Get simulation history

### Data
- `POST /data/sync-xero` - Sync Xero actuals
- `POST /data/calculate-ratios` - Calculate cost ratios
- `GET /data/cost-ratio?period=12m` - Get latest ratio

## Database Schema

### financial_scenarios
Forecast scenarios (baseline, growth, conservative, etc.)

### forecast_drivers
Changes to model (hires, price changes, LTO discounts)

### financial_actuals
Historical data from Xero (monthly P&L)

### financial_forecasts
Computed forecast results

### revenue_cost_ratios
Historical ratio analysis (variable costs / revenue)

### lto_simulations
LTO discount simulation results

### kpi_tracking
KPI data (for future sales strategy tracking)

## File Structure

```
/home/hub/public_html/fins/scripts/model/
├── schema.sql           # Database schema
├── init-db.js          # Initialize database
├── import-xero-2024.js # Import 2024 actuals
├── data.js             # Xero data aggregator
├── forecast.js         # Forecasting engine
├── scenarios.js        # Scenario management
├── lto.js              # LTO simulator
├── dashboard.js        # API endpoints (routing only)
└── dashboard.html      # React dashboard UI
```

## Troubleshooting

### Database connection issues
Check `.env` file has:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=hub_model
DB_USER=hub_admin
DB_PASSWORD=Aracna5bia25?
```

### Xero sync fails
Ensure Xero OAuth tokens are valid. Run Xero auth flow if needed.

### "No historical data" error
Run `node scripts/model/import-xero-2024.js` first.

### Variable cost ratio seems wrong
Check the Data Sync tab to see current ratio. Re-run "Calculate Cost Ratios" if needed.

## Next Steps for Sales Strategy Presentation

1. **Import 2024 data** ✓
2. **Create 2025 baseline scenario** - Current trajectory
3. **Create growth scenario** - With new B2B hire
4. **Add LTO drivers** - Model Q1/Q2 discount campaigns
5. **Generate forecasts** - Compare scenarios
6. **Run LTO simulations** - Find profitable breakpoints
7. **Export charts** - For presentation

## Comparison to Fathom

| Feature | Fathom | This System |
|---------|--------|-------------|
| Driver-based forecasting | ✓ | ✓ |
| Automatic cost scaling | ✗ | ✓ (KEY!) |
| LTO profitability analysis | ✗ | ✓ |
| B2B/B2C split tracking | Limited | ✓ |
| Lag time modeling | ✗ | ✓ |
| Scenario comparison | ✓ | ✓ |
| Custom integrations | ✗ | ✓ (Xero, Fidelo) |
| Cost | €99/mo | €0 |

## Support

Issues? Check:
1. `/home/hub/public_html/fins/fins.log`
2. Browser console (F12)
3. Database connection in Data Sync tab
