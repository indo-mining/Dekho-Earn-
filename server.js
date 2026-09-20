/*
=========================================================
 DEKHOEARN SERVER
 Version 3.0.0
 --------------------------------------------------------
 Login / Register
 Neon PostgreSQL
 Cloudinary Video Upload
 Video Feed
 Watch Rewards
 Likes / Comments / Reports
 Follow System
 Daily Rewards
 Rewarded Ads
 Points History
 Creator Dashboard
 Monetization
 Payout Accounts
 Admin
=========================================================
*/

"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const SERVER_VERSION = "3.0.0";
const PORT = Number(process.env.PORT || 10000);

const DATABASE_URL = process.env.DATABASE_URL || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || "";

const CLOUDINARY_API_KEY =
  process.env.CLOUDINARY_API_KEY || "";

const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || "";

const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER || "dekhoearn/videos";

app.disable("x-powered-by");

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* ======================================================
   DATABASE
====================================================== */

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err.message);
  });
}

async function dbQuery(text, params = []) {
  if (!pool) {
    throw new Error("Database is not configured.");
  }

  return pool.query(text, params);
}

/* ======================================================
   HELPERS
====================================================== */

function randomId() {
  return crypto.randomBytes(18).toString("hex");
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 40);
}

function cleanText(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .scryptSync(String(password), salt, 64)
    .toString("hex");

  return {
    salt,
    hash,
  };
}

function verifyPassword(password, salt, storedHash) {
  try {
    const hash = crypto
      .scryptSync(String(password), salt, 64)
      .toString("hex");

    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}

function getUserId(req) {
  return String(
    req.headers["x-user-id"] ||
      req.body?.user_id ||
      req.query?.user_id ||
      ""
  ).trim();
}

function requireUser(req, res, next) {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      ok: false,
      message: "Please login first.",
    });
  }

  req.userId = userId;
  next();
}

function signCloudinaryParams(params) {
  const keys = Object.keys(params).sort();

  const query = keys
    .filter(
      (key) =>
        params[key] !== undefined &&
        params[key] !== null &&
        params[key] !== ""
    )
    .map(
      (key) =>
        `${key}=${params[key]}`
    )
    .join("&");

  return crypto
    .createHash("sha1")
    .update(query + CLOUDINARY_API_SECRET)
    .digest("hex");
}

function safeUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    first_name: row.first_name,
    points: Number(row.points || 0),
    watched_videos: Number(row.watched_videos || 0),
    today_earned: Number(row.today_earned || 0),
    total_earned: Number(row.total_earned || 0),
    followers_count: Number(row.followers_count || 0),
    following_count: Number(row.following_count || 0),
    is_creator: Boolean(row.is_creator),
    monetization_status: row.monetization_status || "not_applied",
    created_at: row.created_at,
  };
}

function safeVideo(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    creator_id: row.creator_id || row.user_id,
    title: row.title,
    description: row.description || "",
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url || "",
    cloudinary_public_id: row.cloudinary_public_id || "",
    cloudinary_resource_type:
      row.cloudinary_resource_type || "video",
    cloudinary_format: row.cloudinary_format || "",
    duration: Number(row.duration || 0),
    bytes: Number(row.bytes || 0),
    views: Number(row.views || 0),
    likes_count: Number(row.likes_count || 0),
    comments_count: Number(row.comments_count || 0),
    watch_seconds: Number(row.watch_seconds || 0),
    status: row.status,
    moderation_status: row.moderation_status,
    duplicate_warning: Boolean(row.duplicate_warning),
    creator_username: row.creator_username || "",
    creator_name: row.creator_name || "",
    created_at: row.created_at,
  };
}

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initDatabase() {
  if (!pool) {
    console.log("⚠️ DATABASE_URL not configured.");
    return;
  }

  console.log("📦 Initializing DekhoEarn database...");

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT DEFAULT '',
      password_hash TEXT,
      password_salt TEXT,
      points BIGINT NOT NULL DEFAULT 0,
      total_earned BIGINT NOT NULL DEFAULT 0,
      watched_videos BIGINT NOT NULL DEFAULT 0,
      today_earned BIGINT NOT NULL DEFAULT 0,
      is_creator BOOLEAN NOT NULL DEFAULT FALSE,
      monetization_status TEXT NOT NULL DEFAULT 'not_applied',
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS password_hash TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS password_salt TEXT
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS total_earned BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS watched_videos BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS today_earned BIGINT NOT NULL DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS monetization_status TEXT NOT NULL DEFAULT 'not_applied'
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_videos (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      video_url TEXT NOT NULL,
      thumbnail_url TEXT DEFAULT '',
      cloudinary_public_id TEXT DEFAULT '',
      cloudinary_resource_type TEXT DEFAULT 'video',
      cloudinary_format TEXT DEFAULT '',
      duration NUMERIC(18,3) DEFAULT 0,
      bytes BIGINT DEFAULT 0,
      views BIGINT NOT NULL DEFAULT 0,
      likes_count BIGINT NOT NULL DEFAULT 0,
      comments_count BIGINT NOT NULL DEFAULT 0,
      watch_seconds BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      moderation_status TEXT NOT NULL DEFAULT 'normal',
      duplicate_warning BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS cloudinary_format TEXT DEFAULT ''
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS duration NUMERIC(18,3) DEFAULT 0
  `);

  await dbQuery(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS bytes BIGINT DEFAULT 0
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      watch_seconds BIGINT NOT NULL DEFAULT 0,
      reward_points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, video_id)
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, video_id)
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id BIGINT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,
      follower_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id, creator_id)
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      points BIGINT NOT NULL,
      type TEXT NOT NULL,
      description TEXT DEFAULT '',
      reference_id TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      reward_points BIGINT NOT NULL DEFAULT 10,
      reward_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, reward_date)
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      reward_points BIGINT NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL UNIQUE,
      reward_points BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
      id BIGSERIAL PRIMARY KEY,
      creator_id TEXT NOT NULL,
      video_id BIGINT,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      source TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL,
      account_details TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_dekhoearn_videos_created
    ON dekhoearn_videos(created_at DESC)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_dekhoearn_videos_user
    ON dekhoearn_videos(user_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_dekhoearn_comments_video
    ON dekhoearn_comments(video_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_dekhoearn_points_user
    ON dekhoearn_points_ledger(user_id, created_at DESC)
  `);

  console.log("✅ Database ready.");
}

/* ======================================================
   HEALTH
====================================================== */

app.get("/health", async (req, res) => {
  let database = false;

  if (pool) {
    try {
      await dbQuery("SELECT 1");
      database = true;
    } catch {
      database = false;
    }
  }

  res.json({
    ok: true,
    app: "DekhoEarn",
    version: SERVER_VERSION,
    status: database ? "healthy" : "degraded",
    database,
    cloudinary: Boolean(
      CLOUDINARY_CLOUD_NAME &&
      CLOUDINARY_API_KEY &&
      CLOUDINARY_API_SECRET
    ),
  });
});

/* ======================================================
   AUTH - REGISTER
====================================================== */

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        ok: false,
        message: "Database is not configured.",
      });
    }

    const username = normalizeUsername(req.body.username);
    const firstName = cleanText(req.body.first_name, 80);
    const password = String(req.body.password || "");
    const referralCode = cleanText(req.body.referral_code, 80);

    if (username.length < 3) {
      return res.status(400).json({
        ok: false,
        message: "Username must be at least 3 characters.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const existing = await dbQuery(
      `SELECT id FROM dekhoearn_users WHERE LOWER(username)=LOWER($1) LIMIT 1`,
      [username]
    );

    if (existing.rows.length) {
      return res.status(409).json({
        ok: false,
        message: "Username already exists.",
      });
    }

    const id = randomId();
    const passwordData = hashPassword(password);

    let referredBy = null;

    if (referralCode) {
      const ref = await dbQuery(
        `SELECT id FROM dekhoearn_users WHERE referral_code=$1 LIMIT 1`,
        [referralCode]
      );

      if (ref.rows.length) {
        referredBy = ref.rows[0].id;
      }
    }

    const userReferralCode =
      username.replace(/[^a-z0-9]/g, "").slice(0, 12) +
      crypto.randomBytes(3).toString("hex");

    const result = await dbQuery(
      `
      INSERT INTO dekhoearn_users
      (
        id,
        username,
        first_name,
        password_hash,
        password_salt,
        referral_code,
        referred_by
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        id,
        username,
        firstName,
        passwordData.hash,
        passwordData.salt,
        userReferralCode,
        referredBy,
      ]
    );

    if (referredBy && referredBy !== id) {
      const referralReward = 10;

      await dbQuery(
        `
        INSERT INTO dekhoearn_referrals
        (referrer_id,referred_id,reward_points)
        VALUES($1,$2,$3)
        ON CONFLICT(referred_id) DO NOTHING
        `,
        [referredBy, id, referralReward]
      );

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET points=points+$1,
            total_earned=total_earned+$1,
            updated_at=NOW()
        WHERE id=$2
        `,
        [referralReward, referredBy]
      );

      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (user_id,points,type,description,reference_id)
        VALUES($1,$2,'referral','Referral reward',$3)
        `,
        [referredBy, referralReward, id]
      );
    }

    res.json({
      ok: true,
      message: "Registration successful.",
      user: safeUser(result.rows[0]),
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Registration failed.",
    });
  }
});

/* ======================================================
   AUTH - LOGIN
====================================================== */

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: "Username and password are required.",
      });
    }

    const result = await dbQuery(
      `
      SELECT *
      FROM dekhoearn_users
      WHERE LOWER(username)=LOWER($1)
      LIMIT 1
      `,
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        ok: false,
        message: "Invalid username or password.",
      });
    }

    const user = result.rows[0];

    if (
      !user.password_hash ||
      !user.password_salt ||
      !verifyPassword(
        password,
        user.password_salt,
        user.password_hash
      )
    ) {
      return res.status(401).json({
        ok: false,
        message: "Invalid username or password.",
      });
    }

    res.json({
      ok: true,
      message: "Login successful.",
      user: safeUser(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Login failed.",
    });
  }
});

/* ======================================================
   AUTH - LOGOUT
====================================================== */

app.post("/api/auth/logout", (req, res) => {
  res.json({
    ok: true,
    message: "Logged out successfully.",
  });
});

/* ======================================================
   OLD USER COMPATIBILITY
====================================================== */

app.post("/api/user", async (req, res) => {
  try {
    const username =
      normalizeUsername(req.body.username) ||
      `user${crypto.randomBytes(4).toString("hex")}`;

    const firstName = cleanText(req.body.first_name, 80);

    const existing = await dbQuery(
      `
      SELECT *
      FROM dekhoearn_users
      WHERE LOWER(username)=LOWER($1)
      LIMIT 1
      `,
      [username]
    );

    if (existing.rows.length) {
      return res.json({
        ok: true,
        user: safeUser(existing.rows[0]),
      });
    }

    const id = randomId();

    const result = await dbQuery(
      `
      INSERT INTO dekhoearn_users
      (id,username,first_name,referral_code)
      VALUES($1,$2,$3,$4)
      RETURNING *
      `,
      [
        id,
        username,
        firstName,
        username + crypto.randomBytes(3).toString("hex"),
      ]
    );

    res.json({
      ok: true,
      user: safeUser(result.rows[0]),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "User creation failed.",
    });
  }
});

/* ======================================================
   USER
====================================================== */

app.get("/api/user/:id", async (req, res) => {
  try {
    const result = await dbQuery(
      `
      SELECT *
      FROM dekhoearn_users
      WHERE id=$1
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "User not found.",
      });
    }

    res.json({
      ok: true,
      user: safeUser(result.rows[0]),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Could not load user.",
    });
  }
});

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

app.post("/api/cloudinary/signature", requireUser, async (req, res) => {
  try {
    if (
      !CLOUDINARY_CLOUD_NAME ||
      !CLOUDINARY_API_KEY ||
      !CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({
        ok: false,
        message: "Cloudinary is not configured.",
      });
    }

    const userCheck = await dbQuery(
      `SELECT id FROM dekhoearn_users WHERE id=$1 LIMIT 1`,
      [req.userId]
    );

    if (!userCheck.rows.length) {
      return res.status(401).json({
        ok: false,
        message: "User not found. Please login again.",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const params = {
      timestamp,
      folder: CLOUDINARY_FOLDER,
    };

    const signature = signCloudinaryParams(params);

    res.json({
      ok: true,
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder: CLOUDINARY_FOLDER,
      resource_type: "video",
    });
  } catch (error) {
    console.error("CLOUDINARY SIGNATURE ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Could not create upload signature.",
    });
  }
});

/* ======================================================
   VIDEOS - FEED
====================================================== */

app.get("/api/videos", async (req, res) => {
  try {
    const creatorId =
      req.query.creator_id ||
      req.query.user_id ||
      "";

    let result;

    if (creatorId) {
      result = await dbQuery(
        `
        SELECT
          v.*,
          u.username AS creator_username,
          u.first_name AS creator_name
        FROM dekhoearn_videos v
        LEFT JOIN dekhoearn_users u
          ON u.id=v.user_id
        WHERE v.user_id=$1
        ORDER BY v.created_at DESC
        LIMIT 100
        `,
        [creatorId]
      );
    } else {
      result = await dbQuery(
        `
        SELECT
          v.*,
          u.username AS creator_username,
          u.first_name AS creator_name
        FROM dekhoearn_videos v
        LEFT JOIN dekhoearn_users u
          ON u.id=v.user_id
        WHERE v.status='published'
        ORDER BY v.created_at DESC
        LIMIT 100
        `
      );
    }

    res.json({
      ok: true,
      videos: result.rows.map(safeVideo),
    });
  } catch (error) {
    console.error("VIDEO FEED ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Could not load videos.",
    });
  }
});

/* ======================================================
   CREATE VIDEO
====================================================== */

app.post("/api/videos", requireUser, async (req, res) => {
  try {
    const userId = req.userId;

    const title = cleanText(req.body.title, 120);
    const description = cleanText(req.body.description, 1000);

    const videoUrl = String(req.body.video_url || "").trim();

    const thumbnailUrl =
      String(req.body.thumbnail_url || "").trim();

    const publicId =
      String(req.body.cloudinary_public_id || "").trim();

    const resourceType =
      String(
        req.body.cloudinary_resource_type || "video"
      ).trim();

    const format =
      String(req.body.cloudinary_format || "").trim();

    const duration =
      Number(req.body.duration || 0);

    const bytes =
      Number(req.body.bytes || 0);

    if (!title) {
      return res.status(400).json({
        ok: false,
        message: "Video title is required.",
      });
    }

    if (!videoUrl) {
      return res.status(400).json({
        ok: false,
        message: "Video URL is required.",
      });
    }

    if (bytes > 100 * 1024 * 1024) {
      return res.status(400).json({
        ok: false,
        message: "Video cannot exceed 100 MB.",
      });
    }

    const result = await dbQuery(
      `
      INSERT INTO dekhoearn_videos
      (
        user_id,
        title,
        description,
        video_url,
        thumbnail_url,
        cloudinary_public_id,
        cloudinary_resource_type,
        cloudinary_format,
        duration,
        bytes
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        userId,
        title,
        description,
        videoUrl,
        thumbnailUrl,
        publicId,
        resourceType,
        format,
        duration,
        bytes,
      ]
    );

    res.json({
      ok: true,
      message: "Video uploaded successfully.",
      video: safeVideo(result.rows[0]),
    });
  } catch (error) {
    console.error("CREATE VIDEO ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Could not save video.",
    });
  }
});

/* ======================================================
   SINGLE VIDEO
====================================================== */

app.get("/api/videos/:id", async (req, res) => {
  try {
    const result = await dbQuery(
      `
      SELECT
        v.*,
        u.username AS creator_username,
        u.first_name AS creator_name
      FROM dekhoearn_videos v
      LEFT JOIN dekhoearn_users u
        ON u.id=v.user_id
      WHERE v.id=$1
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Video not found.",
      });
    }

    res.json({
      ok: true,
      video: safeVideo(result.rows[0]),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Could not load video.",
    });
  }
});

/* ======================================================
   DELETE VIDEO
====================================================== */

app.delete("/api/videos/:id", requireUser, async (req, res) => {
  try {
    const result = await dbQuery(
      `
      DELETE FROM dekhoearn_videos
      WHERE id=$1 AND user_id=$2
      RETURNING id
      `,
      [req.params.id, req.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Video not found or not owned by you.",
      });
    }

    res.json({
      ok: true,
      message: "Video deleted.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Could not delete video.",
    });
  }
});

/* ======================================================
   WATCH COMPLETE
====================================================== */

app.post("/api/watch/complete", requireUser, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.userId;
    const videoId = Number(req.body.video_id);
    const watchSeconds = Math.max(
      0,
      Math.min(86400, Number(req.body.watch_seconds || 0))
    );

    if (!videoId) {
      return res.status(400).json({
        ok: false,
        message: "Invalid video.",
      });
    }

    await client.query("BEGIN");

    const video = await client.query(
      `
      SELECT *
      FROM dekhoearn_videos
      WHERE id=$1
      FOR UPDATE
      `,
      [videoId]
    );

    if (!video.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Video not found.",
      });
    }

    const existing = await client.query(
      `
      SELECT *
      FROM dekhoearn_video_views
      WHERE user_id=$1 AND video_id=$2
      FOR UPDATE
      `,
      [userId, videoId]
    );

    let reward = 0;

    if (!existing.rows.length) {
      reward = 1;

      await client.query(
        `
        INSERT INTO dekhoearn_video_views
        (user_id,video_id,watch_seconds,reward_points)
        VALUES($1,$2,$3,$4)
        `,
        [userId, videoId, watchSeconds, reward]
      );

      await client.query(
        `
        UPDATE dekhoearn_videos
        SET
          views=views+1,
          watch_seconds=watch_seconds+$1,
          updated_at=NOW()
        WHERE id=$2
        `,
        [watchSeconds, videoId]
      );

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          points=points+$1,
          total_earned=total_earned+$1,
          watched_videos=watched_videos+1,
          today_earned=today_earned+$1,
          updated_at=NOW()
        WHERE id=$2
        `,
        [reward, userId]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger
        (user_id,points,type,description,reference_id)
        VALUES($1,$2,'watch','Video watch reward',$3)
        `,
        [userId, reward, String(videoId)]
      );
    } else {
      await client.query(
        `
        UPDATE dekhoearn_video_views
        SET watch_seconds=GREATEST(watch_seconds,$1)
        WHERE user_id=$2 AND video_id=$3
        `,
        [watchSeconds, userId, videoId]
      );

      await client.query(
        `
        UPDATE dekhoearn_videos
        SET
          watch_seconds=watch_seconds+$1,
          updated_at=NOW()
        WHERE id=$2
        `,
        [Math.max(0, watchSeconds - Number(existing.rows[0].watch_seconds || 0)), videoId]
      );
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      reward,
      message:
        reward > 0
          ? `You earned ${reward} point.`
          : "Watch already rewarded.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("WATCH ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Watch reward failed.",
    });
  } finally {
    client.release();
  }
});

/* ======================================================
   LIKE / UNLIKE
====================================================== */

app.post("/api/videos/:id/like", requireUser, async (req, res) => {
  try {
    const videoId = Number(req.params.id);
    const userId = req.userId;

    const inserted = await dbQuery(
      `
      INSERT INTO dekhoearn_likes(user_id,video_id)
      VALUES($1,$2)
      ON CONFLICT(user_id,video_id) DO NOTHING
      RETURNING id
      `,
      [userId, videoId]
    );

    let liked;

    if (inserted.rows.length) {
      liked = true;

      await dbQuery(
        `
        UPDATE dekhoearn_videos
        SET likes_count=likes_count+1,
            updated_at=NOW()
        WHERE id=$1
        `,
        [videoId]
      );
    } else {
      liked = false;

      const deleted = await dbQuery(
        `
        DELETE FROM dekhoearn_likes
        WHERE user_id=$1 AND video_id=$2
        RETURNING id
        `,
        [userId, videoId]
      );

      if (deleted.rows.length) {
        await dbQuery(
          `
          UPDATE dekhoearn_videos
          SET likes_count=GREATEST(0,likes_count-1),
              updated_at=NOW()
          WHERE id=$1
          `,
          [videoId]
        );
      }
    }

    const result = await dbQuery(
      `
      SELECT likes_count
      FROM dekhoearn_videos
      WHERE id=$1
      `,
      [videoId]
    );

    res.json({
      ok: true,
      liked,
      likes_count: Number(
        result.rows[0]?.likes_count || 0
      ),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Like failed.",
    });
  }
});

/* ======================================================
   COMMENTS GET
====================================================== */

app.get("/api/videos/:id/comments", async (req, res) => {
  try {
    const result = await dbQuery(
      `
      SELECT
        c.*,
        u.username,
        u.first_name
      FROM dekhoearn_comments c
      LEFT JOIN dekhoearn_users u
        ON u.id=c.user_id
      WHERE c.video_id=$1
      ORDER BY c.created_at ASC
      LIMIT 200
      `,
      [req.params.id]
    );

    res.json({
      ok: true,
      comments: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Could not load comments.",
    });
  }
});

/* ======================================================
   COMMENT POST
====================================================== */

app.post(
  "/api/videos/:id/comments",
  requireUser,
  async (req, res) => {
    try {
      const comment = cleanText(req.body.comment, 500);

      if (!comment) {
        return res.status(400).json({
          ok: false,
          message: "Comment cannot be empty.",
        });
      }

      const result = await dbQuery(
        `
        INSERT INTO dekhoearn_comments
        (user_id,video_id,comment)
        VALUES($1,$2,$3)
        RETURNING *
        `,
        [req.userId, req.params.id, comment]
      );

      await dbQuery(
        `
        UPDATE dekhoearn_videos
        SET comments_count=comments_count+1,
            updated_at=NOW()
        WHERE id=$1
        `,
        [req.params.id]
      );

      res.json({
        ok: true,
        comment: result.rows[0],
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Could not add comment.",
      });
    }
  }
);

/* ======================================================
   REPORT
====================================================== */

app.post(
  "/api/videos/:id/report",
  requireUser,
  async (req, res) => {
    try {
      const reason = cleanText(req.body.reason, 500);

      await dbQuery(
        `
        INSERT INTO dekhoearn_reports
        (user_id,video_id,reason)
        VALUES($1,$2,$3)
        `,
        [req.userId, req.params.id, reason]
      );

      res.json({
        ok: true,
        message: "Report submitted.",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Could not submit report.",
      });
    }
  }
);

/* ======================================================
   DAILY REWARD
====================================================== */

app.post("/api/daily/claim", requireUser, async (req, res) => {
  try {
    const reward = 10;

    const result = await dbQuery(
      `
      INSERT INTO dekhoearn_daily_rewards
      (user_id,reward_points,reward_date)
      VALUES($1,$2,CURRENT_DATE)
      ON CONFLICT(user_id,reward_date) DO NOTHING
      RETURNING id
      `,
      [req.userId, reward]
    );

    if (!result.rows.length) {
      return res.json({
        ok: true,
        claimed: false,
        reward: 0,
        message: "Daily reward already claimed.",
      });
    }

    await dbQuery(
      `
      UPDATE dekhoearn_users
      SET
        points=points+$1,
        total_earned=total_earned+$1,
        today_earned=today_earned+$1,
        updated_at=NOW()
      WHERE id=$2
      `,
      [reward, req.userId]
    );

    await dbQuery(
      `
      INSERT INTO dekhoearn_points_ledger
      (user_id,points,type,description)
      VALUES($1,$2,'daily','Daily reward')
      `,
      [req.userId, reward]
    );

    res.json({
      ok: true,
      claimed: true,
      reward,
      message: `Daily reward: +${reward} points`,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Daily reward failed.",
    });
  }
});

/* ======================================================
   REWARDED AD
====================================================== */

app.post(
  "/api/rewarded-ad/complete",
  requireUser,
  async (req, res) => {
    try {
      const reward = 5;

      await dbQuery(
        `
        INSERT INTO dekhoearn_rewarded_ads
        (user_id,reward_points)
        VALUES($1,$2)
        `,
        [req.userId, reward]
      );

      await dbQuery(
        `
        UPDATE dekhoearn_users
        SET
          points=points+$1,
          total_earned=total_earned+$1,
          today_earned=today_earned+$1,
          updated_at=NOW()
        WHERE id=$2
        `,
        [reward, req.userId]
      );

      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (user_id,points,type,description)
        VALUES($1,$2,'rewarded_ad','Rewarded advertisement')
        `,
        [req.userId, reward]
      );

      res.json({
        ok: true,
        reward,
        message: `Ad reward: +${reward} points`,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Ad reward failed.",
      });
    }
  }
);

/* ======================================================
   POINTS HISTORY
====================================================== */

app.get("/api/user/:id/points/history", async (req, res) => {
  try {
    const result = await dbQuery(
      `
      SELECT *
      FROM dekhoearn_points_ledger
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [req.params.id]
    );

    res.json({
      ok: true,
      history: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Could not load points history.",
    });
  }
});

/* ======================================================
   CREATOR STATS
====================================================== */

app.get("/api/creator/:id", async (req, res) => {
  try {
    const user = await dbQuery(
      `
      SELECT *
      FROM dekhoearn_users
      WHERE id=$1
      `,
      [req.params.id]
    );

    if (!user.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Creator not found.",
      });
    }

    const videos = await dbQuery(
      `
      SELECT
        COUNT(*) AS video_count,
        COALESCE(SUM(views),0) AS total_views,
        COALESCE(SUM(likes_count),0) AS total_likes,
        COALESCE(SUM(comments_count),0) AS total_comments
      FROM dekhoearn_videos
      WHERE user_id=$1
      `,
      [req.params.id]
    );

    const followers = await dbQuery(
      `
      SELECT COUNT(*) AS count
      FROM dekhoearn_follows
      WHERE creator_id=$1
      `,
      [req.params.id]
    );

    const earnings = await dbQuery(
      `
      SELECT COALESCE(SUM(amount),0) AS total
      FROM dekhoearn_creator_earnings
      WHERE creator_id=$1
      `,
      [req.params.id]
    );

    res.json({
      ok: true,
      creator: {
        user: safeUser(user.rows[0]),
        video_count: Number(
          videos.rows[0]?.video_count || 0
        ),
        total_views: Number(
          videos.rows[0]?.total_views || 0
        ),
        total_likes: Number(
          videos.rows[0]?.total_likes || 0
        ),
        total_comments: Number(
          videos.rows[0]?.total_comments || 0
        ),
        followers: Number(
          followers.rows[0]?.count || 0
        ),
        earnings: Number(
          earnings.rows[0]?.total || 0
        ),
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Could not load creator dashboard.",
    });
  }
});

/* ======================================================
   MONETIZATION APPLY
====================================================== */

async function applyMonetization(req, res) {
  try {
    const result = await dbQuery(
      `
      UPDATE dekhoearn_users
      SET
        is_creator=TRUE,
        monetization_status='pending',
        updated_at=NOW()
      WHERE id=$1
      RETURNING *
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "User not found.",
      });
    }

    res.json({
      ok: true,
      message: "Monetization application submitted.",
      user: safeUser(result.rows[0]),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Monetization application failed.",
    });
  }
}

app.post(
  "/api/creator/:id/monetization/apply",
  requireUser,
  applyMonetization
);

app.post(
  "/api/creator/:id/apply",
  requireUser,
  applyMonetization
);

/* ======================================================
   FOLLOW / UNFOLLOW
====================================================== */

app.post(
  "/api/creator/:id/follow",
  requireUser,
  async (req, res) => {
    try {
      const creatorId = req.params.id;

      if (creatorId === req.userId) {
        return res.status(400).json({
          ok: false,
          message: "You cannot follow yourself.",
        });
      }

      const inserted = await dbQuery(
        `
        INSERT INTO dekhoearn_follows
        (follower_id,creator_id)
        VALUES($1,$2)
        ON CONFLICT(follower_id,creator_id)
        DO NOTHING
        RETURNING id
        `,
        [req.userId, creatorId]
      );

      if (inserted.rows.length) {
        res.json({
          ok: true,
          following: true,
          message: "Following.",
        });
      } else {
        await dbQuery(
          `
          DELETE FROM dekhoearn_follows
          WHERE follower_id=$1 AND creator_id=$2
          `,
          [req.userId, creatorId]
        );

        res.json({
          ok: true,
          following: false,
          message: "Unfollowed.",
        });
      }
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Follow action failed.",
      });
    }
  }
);

/* ======================================================
   PAYOUT ACCOUNT
====================================================== */

app.post(
  "/api/payout/account",
  requireUser,
  async (req, res) => {
    try {
      const method = cleanText(req.body.method, 50);
      const accountDetails = cleanText(
        req.body.account_details,
        1000
      );

      if (!method || !accountDetails) {
        return res.status(400).json({
          ok: false,
          message: "Payout details are required.",
        });
      }

      const result = await dbQuery(
        `
        INSERT INTO dekhoearn_payout_accounts
        (user_id,method,account_details)
        VALUES($1,$2,$3)
        ON CONFLICT(user_id)
        DO UPDATE SET
          method=EXCLUDED.method,
          account_details=EXCLUDED.account_details,
          updated_at=NOW()
        RETURNING *
        `,
        [req.userId, method, accountDetails]
      );

      res.json({
        ok: true,
        account: result.rows[0],
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Could not save payout account.",
      });
    }
  }
);

/* ======================================================
   ADMIN
====================================================== */

function requireAdmin(req, res, next) {
  const key =
    req.headers["x-admin-key"] ||
    req.query.admin_key ||
    "";

  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(403).json({
      ok: false,
      message: "Admin access denied.",
    });
  }

  next();
}

app.get(
  "/api/admin/reports",
  requireAdmin,
  async (req, res) => {
    try {
      const result = await dbQuery(`
        SELECT
          r.*,
          v.title,
          u.username
        FROM dekhoearn_reports r
        LEFT JOIN dekhoearn_videos v
          ON v.id=r.video_id
        LEFT JOIN dekhoearn_users u
          ON u.id=r.user_id
        ORDER BY r.created_at DESC
        LIMIT 200
      `);

      res.json({
        ok: true,
        reports: result.rows,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Could not load reports.",
      });
    }
  }
);

app.post(
  "/api/admin/action",
  requireAdmin,
  async (req, res) => {
    try {
      const action = cleanText(req.body.action, 100);
      const targetId = cleanText(req.body.target_id, 100);
      const details = cleanText(req.body.details, 2000);

      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (action,target_id,details)
        VALUES($1,$2,$3)
        `,
        [action, targetId, details]
      );

      res.json({
        ok: true,
        message: "Admin action recorded.",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        message: "Admin action failed.",
      });
    }
  }
);

/* ======================================================
   STATIC FRONTEND
====================================================== */

app.use(
  express.static(__dirname, {
    index: false,
  })
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* ======================================================
   404
====================================================== */

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      message: "API route not found.",
    });
  }

  res.sendFile(path.join(__dirname, "index.html"));
});

/* ======================================================
   ERROR HANDLER
====================================================== */

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  res.status(500).json({
    ok: false,
    message: "Internal server error.",
  });
});

/* ======================================================
   START
====================================================== */

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log("=================================================");
      console.log("service is live 🎉");
      console.log("=================================================");
      console.log("📁 Static frontend: Enabled");
      console.log(
        "☁️ Cloudinary:",
        CLOUDINARY_CLOUD_NAME ? "Configured" : "Not configured"
      );
      console.log(
        "📦 Database:",
        pool ? "Configured" : "Not configured"
      );
      console.log(`🌐 Port: ${PORT}`);
      console.log(`🚀 DekhoEarn Server v${SERVER_VERSION}`);
      console.log("=================================================");
    });
  } catch (error) {
    console.error("❌ Startup failed:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM received.");

  if (pool) {
    await pool.end().catch(() => {});
  }

  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received.");

  if (pool) {
    await pool.end().catch(() => {});
  }

  process.exit(0);
});

startServer();
