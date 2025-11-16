-- Seed data for quick local testing

-- Favorites
INSERT INTO "favorites" ("user_id", "asset_id")
VALUES
  ('user-123', 'BTC'),
  ('user-123', 'ETH'),
  ('user-123', 'SOL')
ON CONFLICT ("user_id", "asset_id") DO NOTHING;

-- Alerts
INSERT INTO "alerts" ("user_id", "asset_id", "type", "condition", "value", "active")
VALUES
  ('user-123', 'BTC', 'price', 'above', 70000, true),
  ('user-123', 'BTC', 'price', 'below', 65000, true),
  ('user-123', 'ETH', 'price', 'below', 3000, true),
  ('user-123', 'DOGE', 'price', 'above', 0.25, false)
ON CONFLICT DO NOTHING;

COMMIT;
