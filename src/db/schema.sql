-- WK Health App — core schema
-- ลำดับ: users -> food_entries -> steps_daily

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- uuid
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  weight_kg REAL,
  height_cm REAL,
  goal_kcal INTEGER NOT NULL DEFAULT 2000,
  goal_protein REAL NOT NULL DEFAULT 120,
  goal_carb REAL NOT NULL DEFAULT 240,
  goal_fat REAL NOT NULL DEFAULT 65,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,              -- opaque random token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

INSERT OR IGNORE INTO users (id, email, password_hash, display_name)
VALUES ('local', 'local@local', 'no-login', 'Local User');


CREATE TABLE IF NOT EXISTS food_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL,              -- breakfast/lunch/dinner/snack
  food_name TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein REAL DEFAULT 0,
  carbs REAL DEFAULT 0,
  fat REAL DEFAULT 0,
  sodium REAL DEFAULT 0,
  fiber REAL DEFAULT 0,
  photo_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | vision | nlp | barcode
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_food_entries_created_at ON food_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_food_entries_user ON food_entries(user_id);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 10,
  kcal_burned INTEGER NOT NULL,
  source_key TEXT,                      -- อ้างอิงกลับไปยังแผนที่ AI generate ให้ (กันบันทึกซ้ำวันเดียวกัน)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, created_at);

CREATE TABLE IF NOT EXISTS gps_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  distance_km REAL NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  kcal_burned REAL NOT NULL DEFAULT 0,
  path_json TEXT,                        -- JSON array ของ {lat,lng,t}
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_routes_user ON gps_routes(user_id);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                    -- user | assistant
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assistant_user ON assistant_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS music_library (
  id TEXT PRIMARY KEY,                   -- client-generated id (t_...)
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  type TEXT NOT NULL,                    -- youtube | audio
  yt_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_music_library_user ON music_library(user_id);

CREATE TABLE IF NOT EXISTS music_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  type TEXT NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 1,
  played_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_music_history_user ON music_history(user_id, played_at);

CREATE TABLE IF NOT EXISTS barcode_cache (
  barcode TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  calories REAL,
  protein REAL,
  carbs REAL,
  fat REAL,
  image_url TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- กลุ่ม Pedometer: บันทึกก้าวเดิน/ระยะทาง/แคลอรีที่เผาผลาญต่อวัน
CREATE TABLE IF NOT EXISTS steps_daily (
  day TEXT NOT NULL,           -- YYYY-MM-DD
  user_id TEXT NOT NULL DEFAULT 'local' REFERENCES users(id) ON DELETE CASCADE,
  steps INTEGER NOT NULL DEFAULT 0,
  distance_km REAL NOT NULL DEFAULT 0,
  kcal_burned REAL NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, user_id)
);

-- กลุ่ม Check-in / Streak รายวัน (เทียบ doCheckin/checkinGreeting เดิม)
CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INTEGER NOT NULL DEFAULT 0,
  last_date TEXT,                     -- YYYY-MM-DD ของวันที่เช็คอินล่าสุด
  freeze_available INTEGER NOT NULL DEFAULT 2,
  freeze_month_key TEXT,              -- YYYY-MM ของเดือนที่คำนวณโควตา freeze
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- หมายเหตุ กลุ่ม Gallery: ใช้ food_entries.photo_url ที่มีอยู่แล้ว (เก็บ path ไฟล์จริงบน disk ผ่าน /api/gallery/upload)
-- ไม่ต้องมีตารางเพิ่ม แค่ query food_entries WHERE photo_url IS NOT NULL ORDER BY created_at
