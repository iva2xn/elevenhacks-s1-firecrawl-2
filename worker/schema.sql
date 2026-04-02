DROP TABLE IF EXISTS pins;
CREATE TABLE IF NOT EXISTS pins (
  id TEXT PRIMARY KEY,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL, 
  title TEXT, 
  summary TEXT,
  author_id TEXT,
  audio_id TEXT,
  timestamp INTEGER NOT NULL,
  images TEXT -- JSON array of image IDs
);

DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  avatar_url TEXT
);

DROP TABLE IF EXISTS friendships;
CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'accepted'
  PRIMARY KEY (user_id, friend_id)
);
