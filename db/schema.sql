-- Unified schema for CoinTracer (core + personalization/alerts)

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core tables -------------------------------------------------
DROP TABLE IF EXISTS sync_logs, transactions, exchange_connections, holdings, manual_holdings, portfolios, users CASCADE;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    birthday DATE,
    phone_number VARCHAR(20),
    country VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

CREATE TABLE IF NOT EXISTS portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);

CREATE TABLE IF NOT EXISTS exchange_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    exchange VARCHAR(50) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT NOT NULL,
    passphrase_encrypted TEXT,
    api_key_hash VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMP,
    transactions_synced INTEGER DEFAULT 0,
    sync_status VARCHAR(50) DEFAULT 'idle',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exchange_connections_user_id ON exchange_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_connections_portfolio_id ON exchange_connections(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_exchange_connections_exchange ON exchange_connections(exchange);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_exchange_api_key_hash 
    ON exchange_connections (exchange, api_key_hash) 
    WHERE api_key_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_symbol VARCHAR(50) NOT NULL,
    total_quantity NUMERIC(30,10) DEFAULT 0,
    average_cost NUMERIC(30,10) DEFAULT 0,
    total_invested NUMERIC(30,10) DEFAULT 0,
    current_price NUMERIC(30,10),
    current_value NUMERIC(30,10),
    unrealized_pnl NUMERIC(30,10),
    pnl_percentage NUMERIC(10,2),
    deposit_address VARCHAR(255),
    deposit_tag VARCHAR(100),
    network VARCHAR(50),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_id ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(asset_symbol);
CREATE INDEX IF NOT EXISTS idx_holdings_pnl ON holdings(unrealized_pnl);

CREATE TABLE IF NOT EXISTS manual_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_symbol VARCHAR(50) NOT NULL,
    quantity NUMERIC(30,10) NOT NULL DEFAULT 0,
    average_cost NUMERIC(30,10) DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(portfolio_id, asset_symbol)
);
CREATE INDEX IF NOT EXISTS idx_manual_holdings_portfolio_id ON manual_holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_manual_holdings_symbol ON manual_holdings(asset_symbol);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES exchange_connections(id) ON DELETE CASCADE,
    exchange VARCHAR(50) NOT NULL DEFAULT 'manual',
    type VARCHAR(50) NOT NULL CHECK (
        type IN ('buy','sell','deposit','withdraw','transfer','convert','spot_trade')
    ),
    symbol VARCHAR(50) NOT NULL,
    asset_id VARCHAR(50),
    quantity NUMERIC(30,10) DEFAULT 0,
    price NUMERIC(30,10) DEFAULT 0,
    total_value NUMERIC(30,10) GENERATED ALWAYS AS (quantity * price) STORED,
    fee NUMERIC(30,10) DEFAULT 0,
    fee_currency VARCHAR(10),
    order_id VARCHAR(100),
    trade_id VARCHAR(100),
    wallet_address VARCHAR(255),
    network VARCHAR(50),
    quote_asset VARCHAR(50),
    quote_quantity NUMERIC(30,10),
    conversion_rate NUMERIC(30,10),
    status VARCHAR(50) DEFAULT 'completed',
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_id ON transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_connection_id ON transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_transactions_exchange ON transactions(exchange);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_address ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES exchange_connections(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'started',
    message TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection_id ON sync_logs(connection_id);

-- Views & functions -------------------------------------------
CREATE OR REPLACE VIEW portfolio_pnl_view AS
SELECT
    h.portfolio_id,
    h.asset_symbol,
    h.total_quantity,
    h.average_cost,
    h.total_invested,
    h.current_price,
    -- Calculate current_value dynamically if not set
    COALESCE(h.current_value, h.total_quantity * COALESCE(h.current_price, h.average_cost, 0)) AS current_value,
    -- Calculate unrealized_pnl dynamically if not set
    COALESCE(h.unrealized_pnl, (h.total_quantity * COALESCE(h.current_price, h.average_cost, 0)) - h.total_invested) AS unrealized_pnl,
    -- Calculate pnl_percentage dynamically
    CASE
        WHEN h.total_invested > 0 THEN
            ((COALESCE(h.unrealized_pnl, (h.total_quantity * COALESCE(h.current_price, h.average_cost, 0)) - h.total_invested) / h.total_invested) * 100)
        ELSE 0
    END AS pnl_percentage,
    h.last_updated,
    p.name AS portfolio_name,
    p.user_id
FROM holdings h
JOIN portfolios p ON h.portfolio_id = p.id
WHERE h.total_quantity > 0
ORDER BY COALESCE(h.unrealized_pnl, (h.total_quantity * COALESCE(h.current_price, h.average_cost, 0)) - h.total_invested) DESC;

CREATE OR REPLACE FUNCTION calculate_portfolio_summary(p_portfolio_id UUID)
RETURNS TABLE (
    total_value NUMERIC,
    total_invested NUMERIC,
    total_pnl NUMERIC,
    total_pnl_percentage NUMERIC,
    asset_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Calculate current_value dynamically: total_quantity * COALESCE(current_price, average_cost)
        COALESCE(SUM(total_quantity * COALESCE(current_price, average_cost, 0)), 0),
        COALESCE(SUM(total_invested), 0),
        -- Calculate unrealized_pnl dynamically: (total_quantity * COALESCE(current_price, average_cost)) - total_invested
        COALESCE(SUM((total_quantity * COALESCE(current_price, average_cost, 0)) - total_invested), 0),
        CASE
            WHEN SUM(total_invested) > 0 THEN
                (SUM((total_quantity * COALESCE(current_price, average_cost, 0)) - total_invested) / SUM(total_invested)) * 100
            ELSE 0
        END,
        COUNT(*)::INTEGER
    FROM holdings
    WHERE portfolio_id = p_portfolio_id AND total_quantity > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalculate_holdings_from_transactions(p_portfolio_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Clear existing holdings for this portfolio
  DELETE FROM holdings WHERE portfolio_id = p_portfolio_id;

  -- Recalculate holdings from transactions
  INSERT INTO holdings (
    portfolio_id,
    asset_symbol,
    total_quantity,
    average_cost,
    total_invested,
    last_updated
  )
  SELECT
    t.portfolio_id,
    COALESCE(NULLIF(t.symbol, ''), t.asset_id) AS asset_symbol,  -- FIX 1: Use asset_id if symbol is empty
    -- Total quantity: sum of buys/deposits/converts minus sells/withdrawals
    SUM(CASE 
          WHEN t.type IN ('buy', 'deposit', 'convert') THEN t.quantity
          WHEN t.type IN ('sell', 'withdraw') THEN -t.quantity
          ELSE 0
        END) AS total_quantity,
    -- FIX 2: Weighted average cost (buy/deposit/convert transactions WITH price > 0)
    CASE 
      WHEN SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN t.quantity END) > 0
      THEN 
        SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN t.quantity * t.price END) / 
        SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN t.quantity END)
      ELSE NULL  -- Changed from 0 to NULL when no cost basis available
    END AS average_cost,
    -- FIX 3: Total invested (buy/deposit/convert transactions WITH price > 0, including fees)
    COALESCE(SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN (t.quantity * t.price) + COALESCE(t.fee, 0) END), 0) AS total_invested,
    NOW() AS last_updated
  FROM transactions t
  WHERE t.portfolio_id = p_portfolio_id
  GROUP BY t.portfolio_id, COALESCE(NULLIF(t.symbol, ''), t.asset_id)
  HAVING SUM(CASE 
          WHEN t.type IN ('buy', 'deposit', 'convert') THEN t.quantity
          WHEN t.type IN ('sell', 'withdraw') THEN -t.quantity
          ELSE 0
        END) > 0;  -- Only keep positive holdings
END;
$$ LANGUAGE plpgsql;

-- Deduplicate existing transactions and enforce uniqueness
DELETE FROM transactions a
USING transactions b
WHERE a.ctid < b.ctid
  AND a.portfolio_id = b.portfolio_id
  AND a.trade_id = b.trade_id;
DO $$
BEGIN
    BEGIN
        ALTER TABLE transactions
            ADD CONSTRAINT unique_tx UNIQUE (portfolio_id, trade_id);
    EXCEPTION
        WHEN duplicate_object THEN
            -- Constraint already exists; ignore
            NULL;
    END;
END;
$$;

-- Recalculate Holdings Function
-- This function recalculates holdings from transactions for a given portfolio
DROP FUNCTION IF EXISTS recalculate_holdings_from_transactions(UUID);

CREATE OR REPLACE FUNCTION recalculate_holdings_from_transactions(p_portfolio_id UUID)
RETURNS VOID AS $$
DECLARE
  stablecoins TEXT[] := ARRAY['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USDP'];
BEGIN
  -- Clear existing holdings for this portfolio
  DELETE FROM holdings WHERE portfolio_id = p_portfolio_id;

  -- Recalculate holdings from transactions AND manual holdings
  INSERT INTO holdings (
    portfolio_id,
    asset_symbol,
    total_quantity,
    average_cost,
    total_invested,
    last_updated
  )
  SELECT
    p_portfolio_id,
    asset_symbol,
    SUM(total_quantity) AS total_quantity,
    -- Weighted average cost across transaction-based and manual holdings
    CASE 
      WHEN asset_symbol = ANY(stablecoins) THEN NULL
      WHEN SUM(CASE WHEN total_quantity > 0 AND average_cost > 0 THEN total_quantity END) > 0
      THEN 
        SUM(CASE WHEN total_quantity > 0 AND average_cost > 0 THEN total_quantity * average_cost END) / 
        SUM(CASE WHEN total_quantity > 0 AND average_cost > 0 THEN total_quantity END)
      ELSE NULL  -- Changed from 0 to NULL when no cost basis available
    END AS average_cost,
    SUM(total_invested) AS total_invested,
    NOW() AS last_updated
  FROM (
    -- Holdings from transactions
    SELECT
      COALESCE(NULLIF(t.symbol, ''), t.asset_id) AS asset_symbol,
      SUM(CASE 
            WHEN t.type IN ('buy', 'deposit', 'convert') THEN t.quantity
            WHEN t.type IN ('sell', 'withdraw') THEN -t.quantity
            ELSE 0
          END) AS total_quantity,
      CASE 
        WHEN SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN t.quantity END) > 0
        THEN 
          SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN t.quantity * t.price END) / 
          SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN t.quantity END)
        ELSE NULL  -- Changed from 0 to NULL when no price data available
      END AS average_cost,
      COALESCE(SUM(CASE WHEN t.type IN ('buy', 'deposit', 'convert') AND t.price > 0 THEN (t.quantity * t.price) + COALESCE(t.fee, 0) END), 0) AS total_invested
    FROM transactions t
    WHERE t.portfolio_id = p_portfolio_id
    GROUP BY COALESCE(NULLIF(t.symbol, ''), t.asset_id)
    
    UNION ALL
    
    -- Manual holdings
    SELECT
      mh.asset_symbol,
      mh.quantity AS total_quantity,
      COALESCE(mh.average_cost, 0) AS average_cost,
      CASE 
        WHEN mh.average_cost > 0 THEN mh.quantity * mh.average_cost
        ELSE 0
      END AS total_invested
    FROM manual_holdings mh
    WHERE mh.portfolio_id = p_portfolio_id
  ) combined
  GROUP BY asset_symbol
  HAVING SUM(total_quantity) > 0.00000001;  -- Filter out dust balances (< 0.00000001)
END;
$$ LANGUAGE plpgsql;

-- Personalization & Alerts ------------------------------------
CREATE TABLE IF NOT EXISTS "favorites" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "asset_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("user_id", "asset_id")
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON "favorites" ("user_id");

CREATE TABLE IF NOT EXISTS "alerts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "asset_id" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'price',
    "condition" VARCHAR(50) NOT NULL,
    "value" NUMERIC(20, 8) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON "alerts" ("user_id");
CREATE INDEX IF NOT EXISTS idx_alerts_active ON "alerts" ("active", "asset_id");

-- Default demo user (safe if rerun)
INSERT INTO users (email, name, password_hash)
VALUES ('test@example.com', 'Demo User', 'demo')
ON CONFLICT (email) DO NOTHING;

