
PRAGMA foreign_keys = ON;

-- Mỗi tài khoản có một cấu hình xe mặc định.
CREATE TABLE IF NOT EXISTS user_vehicles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_name TEXT,
  fuel_type TEXT NOT NULL CHECK (
    fuel_type IN (
      'Dầu hỏa 2-K',
      'DO 0,001S Mức 5',
      'DO 0,05S Mức 2',
      'Xăng E10 RON 95 Mức 3',
      'Xăng E10 RON 95 Mức 5',
      'Xăng E5 RON 92 Mức 2'
    )
  ),
  fuel_efficiency REAL NOT NULL CHECK (fuel_efficiency > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Snapshot chi phí nhiên liệu của từng ca.
-- Cho phép NULL để bảo toàn các ca cũ.
ALTER TABLE shifts ADD COLUMN fuel_type TEXT;

ALTER TABLE shifts ADD COLUMN fuel_efficiency REAL
  CHECK (fuel_efficiency IS NULL OR fuel_efficiency > 0);

ALTER TABLE shifts ADD COLUMN fuel_price REAL
  CHECK (fuel_price IS NULL OR fuel_price > 0);

ALTER TABLE shifts ADD COLUMN fuel_consumed REAL
  CHECK (fuel_consumed IS NULL OR fuel_consumed >= 0);

ALTER TABLE shifts ADD COLUMN fuel_cost REAL
  CHECK (fuel_cost IS NULL OR fuel_cost >= 0);

ALTER TABLE shifts ADD COLUMN fuel_price_source TEXT
  CHECK (
    fuel_price_source IS NULL OR
    fuel_price_source IN ('api', 'manual')
  );

ALTER TABLE shifts ADD COLUMN fuel_price_at TEXT;
