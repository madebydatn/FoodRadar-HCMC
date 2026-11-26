PRAGMA foreign_keys = ON;

-- Danh sách đơn hàng phát sinh trong từng ca Shipper Log.
-- Thu nhập tổng được kiểm tra lại từ ba thành phần để tránh dữ liệu lệch.
CREATE TABLE IF NOT EXISTS shift_orders (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  fare INTEGER NOT NULL CHECK (fare >= 0),
  bonus INTEGER NOT NULL CHECK (bonus >= 0),
  tip INTEGER NOT NULL CHECK (tip >= 0),
  total_income INTEGER NOT NULL CHECK (
    total_income >= 0 AND total_income = fare + bonus + tip
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_shift_orders_shift_created
  ON shift_orders(shift_id, created_at ASC);

-- Tối ưu truy vấn ca hoàn tất gần nhất của từng tài khoản.
CREATE INDEX IF NOT EXISTS idx_shifts_user_ended
  ON shifts(user_id, ended_at DESC)
  WHERE status = 'completed' AND end_km IS NOT NULL;
