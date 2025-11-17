DROP TABLE IF EXISTS alerts CASCADE;

CREATE TABLE IF NOT EXISTS "alerts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "asset_id" VARCHAR(100) NOT NULL,
    "asset_symbol" VARCHAR(50),
    "type" VARCHAR(50) NOT NULL CHECK (type IN ('price_target', 'percentage_change')),
    "condition" VARCHAR(50) NOT NULL CHECK (
        (type = 'price_target' AND condition IN ('above', 'below')) OR
        (type = 'percentage_change' AND condition IN ('increase', 'decrease'))
    ),
    "value" NUMERIC(20, 8) NOT NULL,
    "percentage_timeframe" VARCHAR(20) DEFAULT '24h' CHECK (percentage_timeframe IN ('1h', '24h', '7d', '30d')),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggered_at" TIMESTAMP WITH TIME ZONE,
    "trigger_count" INTEGER DEFAULT 0,
    "last_checked_at" TIMESTAMP WITH TIME ZONE,
    "notification_sent" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_user_id ON "alerts" ("user_id");
CREATE INDEX idx_alerts_active ON "alerts" ("active", "asset_id");
CREATE INDEX idx_alerts_type ON "alerts" ("type", "active");
CREATE INDEX idx_alerts_triggered ON "alerts" ("triggered", "active");