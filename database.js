const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;

/*
CREATE TABLE ninjas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT 'Academy',
  avatar_url TEXT,
  experience_points INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  rank_requirement TEXT NOT NULL,
  reward INT NOT NULL,
  status TEXT DEFAULT 'DISPONIBLE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
  ninja_id UUID REFERENCES ninjas(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  report_text TEXT,
  evidence_image_url TEXT
);

*/ 
