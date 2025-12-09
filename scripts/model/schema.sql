-- Financial Modeling System Database Schema
-- Database: hub_payroll (reusing existing database)

-- Core forecast scenarios table
CREATE TABLE IF NOT EXISTS financial_scenarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_year INT NOT NULL,
    forecast_years INT DEFAULT 3,
    is_baseline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    INDEX idx_base_year (base_year),
    INDEX idx_baseline (is_baseline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Forecast drivers (like Fathom)
CREATE TABLE IF NOT EXISTS forecast_drivers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scenario_id INT NOT NULL,
    driver_type ENUM('hire', 'price_change', 'lto_discount', 'strategic_initiative', 'fixed_cost', 'variable_cost') NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Driver specific fields
    channel ENUM('B2B', 'B2C', 'Both') DEFAULT 'Both',
    start_date DATE,
    end_date DATE,

    -- Numeric values (flexible for different driver types)
    value_numeric DECIMAL(15,2),
    value_percentage DECIMAL(5,2),
    monthly_impact JSON, -- Array of monthly impacts

    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (scenario_id) REFERENCES financial_scenarios(id) ON DELETE CASCADE,
    INDEX idx_scenario (scenario_id),
    INDEX idx_type (driver_type),
    INDEX idx_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historical actuals from Xero (cached for performance)
CREATE TABLE IF NOT EXISTS financial_actuals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    period_date DATE NOT NULL, -- First day of month

    -- Revenue breakdown
    revenue_b2b DECIMAL(15,2) DEFAULT 0,
    revenue_b2c DECIMAL(15,2) DEFAULT 0,
    revenue_accommodation DECIMAL(15,2) DEFAULT 0,
    revenue_other DECIMAL(15,2) DEFAULT 0,
    revenue_total DECIMAL(15,2) DEFAULT 0,

    -- Cost of sales
    cos_accommodation DECIMAL(15,2) DEFAULT 0,
    cos_transport DECIMAL(15,2) DEFAULT 0,
    cos_insurance DECIMAL(15,2) DEFAULT 0,
    cos_partner_payments DECIMAL(15,2) DEFAULT 0,
    cos_exam_fees DECIMAL(15,2) DEFAULT 0,
    cos_social DECIMAL(15,2) DEFAULT 0,
    cos_total DECIMAL(15,2) DEFAULT 0,

    -- Expenses (fixed)
    expense_rent DECIMAL(15,2) DEFAULT 0,
    expense_utilities DECIMAL(15,2) DEFAULT 0,
    expense_software DECIMAL(15,2) DEFAULT 0,
    expense_fixed_total DECIMAL(15,2) DEFAULT 0,

    -- Expenses (variable)
    expense_wages DECIMAL(15,2) DEFAULT 0,
    expense_marketing DECIMAL(15,2) DEFAULT 0,
    expense_variable_total DECIMAL(15,2) DEFAULT 0,

    -- Derived metrics
    gross_profit DECIMAL(15,2) DEFAULT 0,
    operating_profit DECIMAL(15,2) DEFAULT 0,
    net_income DECIMAL(15,2) DEFAULT 0,

    -- Cash flow
    cash_on_hand DECIMAL(15,2) DEFAULT 0,

    -- Metadata
    source VARCHAR(50) DEFAULT 'xero',
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_period (period_date),
    INDEX idx_period (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Forecast results (computed)
CREATE TABLE IF NOT EXISTS financial_forecasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scenario_id INT NOT NULL,
    period_date DATE NOT NULL,

    -- Revenue projections
    revenue_b2b DECIMAL(15,2) DEFAULT 0,
    revenue_b2c DECIMAL(15,2) DEFAULT 0,
    revenue_accommodation DECIMAL(15,2) DEFAULT 0,
    revenue_other DECIMAL(15,2) DEFAULT 0,
    revenue_total DECIMAL(15,2) DEFAULT 0,

    -- Revenue adjustments
    lto_discount_amount DECIMAL(15,2) DEFAULT 0,
    lto_discount_percentage DECIMAL(5,2) DEFAULT 0,
    net_revenue DECIMAL(15,2) DEFAULT 0,

    -- Commissions
    commission_b2b DECIMAL(15,2) DEFAULT 0,
    commission_b2c DECIMAL(15,2) DEFAULT 0,
    commission_total DECIMAL(15,2) DEFAULT 0,

    -- Cost of sales (scaled with revenue)
    cos_total DECIMAL(15,2) DEFAULT 0,

    -- Fixed expenses (relatively constant)
    expense_fixed_total DECIMAL(15,2) DEFAULT 0,

    -- Variable expenses (scaled with revenue)
    expense_variable_total DECIMAL(15,2) DEFAULT 0,
    expense_variable_ratio DECIMAL(5,4), -- Variable cost / Revenue ratio

    -- Derived metrics
    gross_profit DECIMAL(15,2) DEFAULT 0,
    operating_profit DECIMAL(15,2) DEFAULT 0,
    net_income DECIMAL(15,2) DEFAULT 0,

    -- Cash flow
    cash_on_hand DECIMAL(15,2) DEFAULT 0,

    -- Metadata
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (scenario_id) REFERENCES financial_scenarios(id) ON DELETE CASCADE,
    UNIQUE KEY unique_scenario_period (scenario_id, period_date),
    INDEX idx_scenario (scenario_id),
    INDEX idx_period (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- KPI tracking
CREATE TABLE IF NOT EXISTS kpi_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    period_date DATE NOT NULL,

    -- Customer Service
    complaints INT DEFAULT 0,
    compliments INT DEFAULT 0,
    customer_attrition_rate DECIMAL(5,2),
    customer_satisfaction_score DECIMAL(5,2),

    -- HR
    staff_turnover INT DEFAULT 0,
    staff_retention_rate DECIMAL(5,2),
    job_satisfaction_score DECIMAL(5,2),
    training_days_per_employee DECIMAL(5,2),

    -- Sales
    avg_sale_per_customer DECIMAL(15,2),
    avg_price_per_hour DECIMAL(10,2),
    price_per_student DECIMAL(10,2),
    new_vs_repeat_ratio DECIMAL(5,2),
    customer_lifetime_value DECIMAL(15,2),

    -- Marketing & Business Development
    new_customers INT DEFAULT 0,
    lost_customers INT DEFAULT 0,
    num_referrals INT DEFAULT 0,
    num_qualified_leads INT DEFAULT 0,
    num_quotes_issued INT DEFAULT 0,
    customer_conversion_rate DECIMAL(5,2),

    -- B2B Specific KPIs
    b2b_deal_signed_date DATE,
    b2b_first_student_date DATE,
    b2b_lag_days INT, -- Days from signing to first student
    b2b_monthly_students INT DEFAULT 0,
    b2b_net_fee_per_student DECIMAL(10,2),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_period (period_date),
    INDEX idx_period (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Revenue/Cost ratio analysis (historical)
CREATE TABLE IF NOT EXISTS revenue_cost_ratios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    period_date DATE NOT NULL,

    -- Ratios
    variable_cost_ratio DECIMAL(5,4), -- Variable costs / Revenue
    cos_ratio DECIMAL(5,4), -- Cost of Sales / Revenue
    marketing_ratio DECIMAL(5,4), -- Marketing / Revenue
    wage_ratio DECIMAL(5,4), -- Wages / Revenue

    -- Moving averages (for smoothing)
    variable_cost_ratio_3m_avg DECIMAL(5,4),
    variable_cost_ratio_6m_avg DECIMAL(5,4),
    variable_cost_ratio_12m_avg DECIMAL(5,4),

    -- Metadata
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_period (period_date),
    INDEX idx_period (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LTO (Limited Time Offer) simulation results
CREATE TABLE IF NOT EXISTS lto_simulations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scenario_id INT NOT NULL,

    -- LTO parameters
    discount_percentage DECIMAL(5,2) NOT NULL,
    channel ENUM('B2B', 'B2C', 'Both') NOT NULL,
    expected_volume_increase DECIMAL(5,2), -- % increase in volume

    -- Results
    breakeven_volume INT, -- Number of students needed to break even
    breakeven_revenue DECIMAL(15,2),
    projected_profit DECIMAL(15,2),
    roi_percentage DECIMAL(5,2),

    -- Timeline
    start_date DATE,
    end_date DATE,
    months_to_breakeven INT,

    -- Metadata
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (scenario_id) REFERENCES financial_scenarios(id) ON DELETE CASCADE,
    INDEX idx_scenario (scenario_id),
    INDEX idx_discount (discount_percentage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
