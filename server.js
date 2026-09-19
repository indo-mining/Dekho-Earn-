/*
=========================================================
 DEKHOEARN SERVER
 Version 2.0.0
 --------------------------------------------------------
 Dekho. Earn Karo. Reward Lo.

 CORE FEATURES
 - Express
 - Neon PostgreSQL
 - Users
 - Videos
 - Views / Watch Time
 - Likes
 - Comments
 - Reports
 - One-user-one-report-per-video
 - Creator followers
 - Creator monetization eligibility
 - Creator earnings ledger
 - Payout account foundation
 - Daily reward
 - Referral system
 - Rewarded-ad reward
 - Server-controlled points
 - Admin moderation
 - Creator video deletion
 - Copyright / duplicate warning
 - Health check
 - Static frontend

 IMPORTANT
 - Client cannot directly choose arbitrary points.
 - Video files are NOT stored inside PostgreSQL.
 - Database stores video/thumbnail URLs and metadata.
 - Admin actions require ADMIN_KEY.
=========================================================
*/

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;
const SERVER_VERSION = "2.0.0";

const ADMIN_KEY = process.env.ADMIN_KEY || "";

const POINTS_PER_WATCH = 1;
const DAILY_REWARD = 10;
const REWARDED_AD_POINTS = 5;

const MIN_WATCH_SECONDS = 10;
const MAX_WATCH_SECONDS_PER_REQUEST = 60 * 60;

const CREATOR_MIN_FOLLOWERS = 1000;
const CREATOR_MIN_WATCH_HOURS = 1000;

const MAX_VIDEO_TITLE = 200;
const MAX_VIDEO_DESCRIPTION = 5000;
const MAX_COMMENT_LENGTH = 2000;

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

app.use(express.static(path.join(__dirname)));

// ======================================================
// DATABASE
// ======================================================

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on("error", (error) => {
    console.error("Neon database error:", error.message);
  });

  console.log("Neon PostgreSQL configured.");
} else {
  console.warn("DATABASE_URL is missing.");
}

// ======================================================
// HELPERS
// ======================================================

function cleanText(value, maxLength = 5000) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

function getUserId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function getVideoId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function isValidUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function generateReferralCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function adminAuthorized(req) {
  if (!ADMIN_KEY) {
    return false;
  }

  const key =
    req.headers["x-admin-key"] ||
    req.headers["authorization"];

  if (!key) {
    return false;
  }

  const supplied = String(key).replace(
    /^Bearer\s+/i,
    ""
  );

  return supplied === ADMIN_KEY;
}

function databaseRequired(res) {
  if (!pool) {
    res.status(503).json({
      ok: false,
      error: "Database is not connected."
    });

    return false;
  }

  return true;
}

// ======================================================
// DATABASE INITIALIZATION
// ======================================================

async function initDatabase() {
  if (!pool) {
    console.warn(
      "Database initialization skipped because DATABASE_URL is missing."
    );

    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        points NUMERIC(20,2) NOT NULL DEFAULT 0,
        videos_watched INTEGER NOT NULL DEFAULT 0,
        today_earned NUMERIC(20,2) NOT NULL DEFAULT 0,
        followers_count INTEGER NOT NULL DEFAULT 0,
        following_count INTEGER NOT NULL DEFAULT 0,
        watch_seconds BIGINT NOT NULL DEFAULT 0,
        referral_code TEXT UNIQUE,
        referred_by BIGINT REFERENCES dekhoearn_users(id) ON DELETE SET NULL,
        is_creator BOOLEAN NOT NULL DEFAULT FALSE,
        creator_monetization_status TEXT NOT NULL DEFAULT 'not_eligible',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_videos (
        id BIGSERIAL PRIMARY KEY,
        creator_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        views BIGINT NOT NULL DEFAULT 0,
        likes BIGINT NOT NULL DEFAULT 0,
        comments_count BIGINT NOT NULL DEFAULT 0,
        watch_seconds BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        moderation_status TEXT NOT NULL DEFAULT 'approved',
        copyright_warning BOOLEAN NOT NULL DEFAULT FALSE,
        copyright_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
        id BIGSERIAL PRIMARY KEY,
        video_id BIGINT NOT NULL REFERENCES dekhoearn_videos(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        watch_seconds INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_likes (
        id BIGSERIAL PRIMARY KEY,
        video_id BIGINT NOT NULL REFERENCES dekhoearn_videos(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(video_id, user_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_comments (
        id BIGSERIAL PRIMARY KEY,
        video_id BIGINT NOT NULL REFERENCES dekhoearn_videos(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        comment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_reports (
        id BIGSERIAL PRIMARY KEY,
        video_id BIGINT NOT NULL REFERENCES dekhoearn_videos(id) ON DELETE CASCADE,
        reporter_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(video_id, reporter_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_follows (
        id BIGSERIAL PRIMARY KEY,
        follower_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        creator_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(follower_id, creator_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        amount NUMERIC(20,2) NOT NULL,
        type TEXT NOT NULL,
        reference_id TEXT,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        reward_date DATE NOT NULL,
        points NUMERIC(20,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, reward_date)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        reward_date DATE NOT NULL,
        points NUMERIC(20,2) NOT NULL,
        ad_reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
        id BIGSERIAL PRIMARY KEY,
        referrer_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        referred_user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        reward_points NUMERIC(20,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(referred_user_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
        id BIGSERIAL PRIMARY KEY,
        creator_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        video_id BIGINT REFERENCES dekhoearn_videos(id) ON DELETE SET NULL,
        gross_revenue NUMERIC(20,4) NOT NULL DEFAULT 0,
        creator_share NUMERIC(20,4) NOT NULL DEFAULT 0,
        platform_share NUMERIC(20,4) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES dekhoearn_users(id) ON DELETE CASCADE,
        provider TEXT,
        account_reference TEXT,
        status TEXT NOT NULL DEFAULT 'not_connected',
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
        id BIGSERIAL PRIMARY KEY,
        admin_name TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // --------------------------------------------------
    // SAFE MIGRATIONS FOR EXISTING DATABASE
    // --------------------------------------------------

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS watch_seconds BIGINT NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS referral_code TEXT;
    `);

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS referred_by BIGINT;
    `);

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE dekhoearn_users
      ADD COLUMN IF NOT EXISTS creator_monetization_status TEXT NOT NULL DEFAULT 'not_eligible';
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dekhoearn_referral_code
      ON dekhoearn_users(referral_code)
      WHERE referral_code IS NOT NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_dekhoearn_videos_creator
      ON dekhoearn_videos(creator_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_dekhoearn_videos_status
      ON dekhoearn_videos(status);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_dekhoearn_views_video
      ON dekhoearn_video_views(video_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_dekhoearn_views_user
      ON dekhoearn_video_views(user_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_dekhoearn_reports_status
      ON dekhoearn_reports(status);
    `);

    console.log("DekhoEarn database tables are ready.");

  } catch (error) {
    console.error(
      "Database initialization failed:",
      error.message
    );
  }
}

// ======================================================
// HEALTH
// ======================================================

app.get("/health", async (req, res) => {
  let database = false;

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = true;
    } catch {
      database = false;
    }
  }

  res.json({
    ok: true,
    app: "DekhoEarn",
    version: SERVER_VERSION,
    database,
    features: {
      users: true,
      videos: true,
      watchRewards: true,
      likes: true,
      comments: true,
      reports: true,
      reportDeduplication: true,
      follows: true,
      creatorMonetization: true,
      creatorEarnings: true,
      payoutFoundation: true,
      dailyReward: true,
      referrals: true,
      rewardedAds: true,
      adminModeration: true
    }
  });
});

// ======================================================
// ROOT
// ======================================================

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    app: "DekhoEarn",
    version: SERVER_VERSION,
    message: "Dekho. Earn Karo. Reward Lo."
  });
});

// ======================================================
// CREATE USER
// ======================================================

app.post("/api/user", async (req, res) => {
  if (!databaseRequired(res)) return;

  try {
    const username = cleanText(
      req.body?.username,
      100
    );

    const firstName = cleanText(
      req.body?.first_name,
      100
    );

    const referralCode =
      cleanText(req.body?.referral_code, 100);

    const newReferralCode =
      generateReferralCode();

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let referredBy = null;

      if (referralCode) {
        const referralResult = await client.query(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE referral_code = $1
          LIMIT 1
          `,
          [referralCode]
        );

        if (referralResult.rows.length > 0) {
          referredBy =
            referralResult.rows[0].id;
        }
      }

      const result = await client.query(
        `
        INSERT INTO dekhoearn_users
        (
          username,
          first_name,
          referral_code,
          referred_by
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          username,
          first_name,
          points,
          videos_watched,
          today_earned,
          followers_count,
          following_count,
          watch_seconds,
          referral_code,
          is_creator,
          creator_monetization_status,
          created_at,
          updated_at
        `,
        [
          username,
          firstName,
          newReferralCode,
          referredBy
        ]
      );

      const user = result.rows[0];

      // Referral reward is granted only once
      // after the referred account is actually created.
      if (referredBy && referredBy !== user.id) {
        await client.query(
          `
          INSERT INTO dekhoearn_referrals
          (
            referrer_id,
            referred_user_id,
            reward_points,
            status
          )
          VALUES ($1, $2, $3, 'completed')
          ON CONFLICT (referred_user_id)
          DO NOTHING
          `,
          [
            referredBy,
            user.id,
            10
          ]
        );

        const referralInserted =
          await client.query(
            `
            SELECT id
            FROM dekhoearn_referrals
            WHERE referred_user_id = $1
            `,
            [user.id]
          );

        if (referralInserted.rows.length > 0) {
          await client.query(
            `
            UPDATE dekhoearn_users
            SET
              points = points + 10,
              updated_at = NOW()
            WHERE id = $1
            `,
            [referredBy]
          );

          await client.query(
            `
            INSERT INTO dekhoearn_points_ledger
            (
              user_id,
              amount,
              type,
              reference_id,
              description
            )
            VALUES ($1, 10, 'referral', $2, $3)
            `,
            [
              referredBy,
              String(user.id),
              "Referral reward"
            ]
          );
        }
      }

      await client.query("COMMIT");

      res.json({
        ok: true,
        user
      });

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error(
      "Create user error:",
      error.message
    );

    res.status(500).json({
      ok: false,
      error: "Unable to create user."
    });
  }
});

// ======================================================
// GET USER
// ======================================================

app.get("/api/user/:id", async (req, res) => {
  if (!databaseRequired(res)) return;

  try {
    const userId =
      getUserId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid user ID."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        username,
        first_name,
        points,
        videos_watched,
        today_earned,
        followers_count,
        following_count,
        watch_seconds,
        referral_code,
        is_creator,
        creator_monetization_status,
        created_at,
        updated_at
      FROM dekhoearn_users
      WHERE id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "User not found."
      });
    }

    const user = result.rows[0];

    const watchHours =
      Number(user.watch_seconds || 0) / 3600;

    res.json({
      ok: true,
      user,
      creator: {
        followers: Number(
          user.followers_count || 0
        ),
        watchHours: Number(
          watchHours.toFixed(2)
        ),
        minimumFollowers:
          CREATOR_MIN_FOLLOWERS,
        minimumWatchHours:
          CREATOR_MIN_WATCH_HOURS,
        monetizationStatus:
          user.creator_monetization_status
      }
    });

  } catch (error) {
    console.error(
      "Get user error:",
      error.message
    );

    res.status(500).json({
      ok: false,
      error: "Unable to get user."
    });
  }
});

// ======================================================
// POINTS BALANCE
// ======================================================

app.get("/api/user/:id/points", async (req, res) => {
  if (!databaseRequired(res)) return;

  try {
    const userId =
      getUserId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid user ID."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        points,
        today_earned,
        videos_watched
      FROM dekhoearn_users
      WHERE id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "User not found."
      });
    }

    res.json({
      ok: true,
      points: result.rows[0]
    });

  } catch (error) {
    console.error(
      "Points error:",
      error.message
    );

    res.status(500).json({
      ok: false,
      error: "Unable to get points."
    });
  }
});

// ======================================================
// POINTS LEDGER
// ======================================================

app.get(
  "/api/user/:id/points/history",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const userId =
        getUserId(req.params.id);

      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid user ID."
        });
      }

      const limitRaw =
        Number(req.query.limit || 50);

      const limit = Math.min(
        Math.max(
          Number.isInteger(limitRaw)
            ? limitRaw
            : 50,
          1
        ),
        100
      );

      const result = await pool.query(
        `
        SELECT
          id,
          amount,
          type,
          reference_id,
          description,
          created_at
        FROM dekhoearn_points_ledger
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [userId, limit]
      );

      res.json({
        ok: true,
        history: result.rows
      });

    } catch (error) {
      console.error(
        "Points history error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: "Unable to get points history."
      });
    }
  }
);

// ======================================================
// CREATE VIDEO
// ======================================================

app.post("/api/videos", async (req, res) => {
  if (!databaseRequired(res)) return;

  try {
    const creatorId =
      getUserId(req.body?.creator_id);

    const title =
      cleanText(
        req.body?.title,
        MAX_VIDEO_TITLE
      );

    const description =
      cleanText(
        req.body?.description,
        MAX_VIDEO_DESCRIPTION
      );

    const videoUrl =
      cleanText(
        req.body?.video_url,
        2000
      );

    const thumbnailUrl =
      cleanText(
        req.body?.thumbnail_url,
        2000
      );

    const duration =
      Number(req.body?.duration_seconds || 0);

    if (!creatorId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid creator ID."
      });
    }

    if (!title) {
      return res.status(400).json({
        ok: false,
        error: "Video title is required."
      });
    }

    if (!videoUrl || !isValidUrl(videoUrl)) {
      return res.status(400).json({
        ok: false,
        error:
          "A valid video URL is required."
      });
    }

    if (
      thumbnailUrl &&
      !isValidUrl(thumbnailUrl)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid thumbnail URL."
      });
    }

    if (
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 86400
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid video duration."
      });
    }

    const userResult = await pool.query(
      `
      SELECT id
      FROM dekhoearn_users
      WHERE id = $1
      `,
      [creatorId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Creator not found."
      });
    }

    /*
      Basic duplicate URL detection.
      This is NOT a copyright verdict.
      It only warns about an exact previously-used URL.
    */

    const duplicate =
      await pool.query(
        `
        SELECT id
        FROM dekhoearn_videos
        WHERE video_url = $1
        LIMIT 1
        `,
        [videoUrl]
      );

    const copyrightWarning =
      duplicate.rows.length > 0;

    const copyrightNote =
      copyrightWarning
        ? "This video URL already exists on DekhoEarn. Please upload content you own or have permission to use."
        : null;

    const result = await pool.query(
      `
      INSERT INTO dekhoearn_videos
      (
        creator_id,
        title,
        description,
        video_url,
        thumbnail_url,
        duration_seconds,
        copyright_warning,
        copyright_note
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        creatorId,
        title,
        description,
        videoUrl,
        thumbnailUrl,
        Math.floor(duration),
        copyrightWarning,
        copyrightNote
      ]
    );

    res.status(201).json({
      ok: true,
      video: result.rows[0],
      warning: copyrightWarning
        ? copyrightNote
        : null
    });

  } catch (error) {
    console.error(
      "Create video error:",
      error.message
    );

    res.status(500).json({
      ok: false,
      error: "Unable to create video."
    });
  }
});

// ======================================================
// VIDEO FEED
// ======================================================

app.get("/api/videos", async (req, res) => {
  if (!databaseRequired(res)) return;

  try {
    const limitRaw =
      Number(req.query.limit || 20);

    const offsetRaw =
      Number(req.query.offset || 0);

    const limit = Math.min(
      Math.max(
        Number.isInteger(limitRaw)
          ? limitRaw
          : 20,
        1
      ),
      50
    );

    const offset =
      Number.isInteger(offsetRaw) &&
      offsetRaw >= 0
        ? offsetRaw
        : 0;

    const result = await pool.query(
      `
      SELECT
        v.id,
        v.creator_id,
        v.title,
        v.description,
        v.video_url,
        v.thumbnail_url,
        v.duration_seconds,
        v.views,
        v.likes,
        v.comments_count,
        v.watch_seconds,
        v.copyright_warning,
        v.created_at,
        u.username AS creator_username,
        u.first_name AS creator_first_name,
        u.followers_count
      FROM dekhoearn_videos v
      JOIN dekhoearn_users u
        ON u.id = v.creator_id
      WHERE
        v.status = 'active'
        AND v.moderation_status = 'approved'
      ORDER BY v.created_at DESC
      LIMIT $1
      OFFSET $2
      `,
      [limit, offset]
    );

    res.json({
      ok: true,
      videos: result.rows,
      pagination: {
        limit,
        offset,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error(
      "Video feed error:",
      error.message
    );

    res.status(500).json({
      ok: false,
      error: "Unable to load videos."
    });
  }
});

// ======================================================
// GET SINGLE VIDEO
// ======================================================

app.get("/api/videos/:id", async (req, res) => {
  if (!databaseRequired(res)) return;

  try {
    const videoId =
      getVideoId(req.params.id);

    if (!videoId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid video ID."
      });
    }

    const result = await pool.query(
      `
      SELECT
        v.*,
        u.username AS creator_username,
        u.first_name AS creator_first_name,
        u.followers_count
      FROM dekhoearn_videos v
      JOIN dekhoearn_users u
        ON u.id = v.creator_id
      WHERE v.id = $1
      `,
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Video not found."
      });
    }

    res.json({
      ok: true,
      video: result.rows[0]
    });

  } catch (error) {
    console.error(
      "Get video error:",
      error.message
    );

    res.status(500).json({
      ok: false,
      error: "Unable to get video."
    });
  }
});

// ======================================================
// WATCH / COMPLETE VIDEO
// ======================================================

app.post(
  "/api/watch/complete",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    const client = await pool.connect();

    try {
      const userId =
        getUserId(req.body?.user_id);

      const videoId =
        getVideoId(req.body?.video_id);

      let watchSeconds =
        Number(req.body?.watch_seconds);

      if (!userId || !videoId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid user_id and video_id are required."
        });
      }

      if (!Number.isFinite(watchSeconds)) {
        watchSeconds = 0;
      }

      watchSeconds =
        Math.floor(watchSeconds);

      watchSeconds = Math.max(
        0,
        Math.min(
          watchSeconds,
          MAX_WATCH_SECONDS_PER_REQUEST
        )
      );

      if (watchSeconds < MIN_WATCH_SECONDS) {
        return res.status(400).json({
          ok: false,
          error:
            `Watch at least ${MIN_WATCH_SECONDS} seconds before claiming the watch reward.`
        });
      }

      await client.query("BEGIN");

      const videoResult =
        await client.query(
          `
          SELECT
            id,
            creator_id,
            status,
            moderation_status,
            duration_seconds
          FROM dekhoearn_videos
          WHERE id = $1
          FOR UPDATE
          `,
          [videoId]
        );

      if (videoResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          ok: false,
          error: "Video not found."
        });
      }

      const video =
        videoResult.rows[0];

      if (
        video.status !== "active" ||
        video.moderation_status !== "approved"
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          ok: false,
          error:
            "This video is not currently available."
        });
      }

      const existingView =
        await client.query(
          `
          SELECT id
          FROM dekhoearn_video_views
          WHERE user_id = $1
            AND video_id = $2
            AND completed = TRUE
          LIMIT 1
          `,
          [userId, videoId]
        );

      /*
        One reward per user/video.
        This prevents repeatedly opening the same video
        just to generate unlimited watch points.
      */

      if (existingView.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.json({
          ok: true,
          rewarded: false,
          points: 0,
          message:
            "Watch reward for this video has already been claimed."
        });
      }

      await client.query(
        `
        INSERT INTO dekhoearn_video_views
        (
          video_id,
          user_id,
          watch_seconds,
          completed
        )
        VALUES
        ($1, $2, $3, TRUE)
        `,
        [
          videoId,
          userId,
          watchSeconds
        ]
      );

      await client.query(
        `
        UPDATE dekhoearn_videos
        SET
          views = views + 1,
          watch_seconds =
            watch_seconds + $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          watchSeconds,
          videoId
        ]
      );

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          points = points + $1,
          videos_watched =
            videos_watched + 1,
          today_earned =
            today_earned + $1,
          watch_seconds =
            watch_seconds + $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          POINTS_PER_WATCH,
          watchSeconds,
          userId
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          amount,
          type,
          reference_id,
          description
        )
        VALUES
        ($1, $2, 'watch', $3, $4)
        `,
        [
          userId,
          POINTS_PER_WATCH,
          String(videoId),
          "Video watch reward"
        ]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        rewarded: true,
        points: POINTS_PER_WATCH,
        video_id: videoId,
        watch_seconds: watchSeconds
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Watch complete error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to complete video watch."
      });

    } finally {
      client.release();
    }
  }
);

// ======================================================
// LIKE VIDEO
// ======================================================

app.post(
  "/api/videos/:id/like",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    const client = await pool.connect();

    try {
      const videoId =
        getVideoId(req.params.id);

      const userId =
        getUserId(req.body?.user_id);

      if (!videoId || !userId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid video ID and user ID are required."
        });
      }

      await client.query("BEGIN");

      const video =
        await client.query(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
            AND status = 'active'
          `,
          [videoId]
        );

      if (video.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          ok: false,
          error: "Video not found."
        });
      }

      const inserted =
        await client.query(
          `
          INSERT INTO dekhoearn_likes
          (
            video_id,
            user_id
          )
          VALUES ($1, $2)
          ON CONFLICT (video_id, user_id)
          DO NOTHING
          RETURNING id
          `,
          [videoId, userId]
        );

      if (inserted.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.json({
          ok: true,
          liked: false,
          message:
            "You have already liked this video."
        });
      }

      await client.query(
        `
        UPDATE dekhoearn_videos
        SET
          likes = likes + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [videoId]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        liked: true
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Like error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: "Unable to like video."
      });

    } finally {
      client.release();
    }
  }
);

// ======================================================
// ADD COMMENT
// ======================================================

app.post(
  "/api/videos/:id/comments",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const videoId =
        getVideoId(req.params.id);

      const userId =
        getUserId(req.body?.user_id);

      const comment =
        cleanText(
          req.body?.comment,
          MAX_COMMENT_LENGTH
        );

      if (!videoId || !userId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid video ID and user ID are required."
        });
      }

      if (!comment) {
        return res.status(400).json({
          ok: false,
          error: "Comment cannot be empty."
        });
      }

      const video =
        await pool.query(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
            AND status = 'active'
            AND moderation_status = 'approved'
          `,
          [videoId]
        );

      if (video.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Video not found."
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO dekhoearn_comments
          (
            video_id,
            user_id,
            comment
          )
          VALUES ($1, $2, $3)
          RETURNING id, video_id, user_id, comment, created_at
          `,
          [
            videoId,
            userId,
            comment
          ]
        );

      await pool.query(
        `
        UPDATE dekhoearn_videos
        SET
          comments_count =
            comments_count + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [videoId]
      );

      res.status(201).json({
        ok: true,
        comment: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Comment error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: "Unable to add comment."
      });
    }
  }
);

// ======================================================
// GET COMMENTS
// ======================================================

app.get(
  "/api/videos/:id/comments",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const videoId =
        getVideoId(req.params.id);

      if (!videoId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid video ID."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            c.id,
            c.video_id,
            c.user_id,
            c.comment,
            c.created_at,
            u.username,
            u.first_name
          FROM dekhoearn_comments c
          JOIN dekhoearn_users u
            ON u.id = c.user_id
          WHERE
            c.video_id = $1
            AND c.status = 'active'
          ORDER BY c.created_at DESC
          LIMIT 100
          `,
          [videoId]
        );

      res.json({
        ok: true,
        comments: result.rows
      });

    } catch (error) {
      console.error(
        "Get comments error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: "Unable to get comments."
      });
    }
  }
);

// ======================================================
// REPORT VIDEO
// ======================================================

app.post(
  "/api/videos/:id/report",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const videoId =
        getVideoId(req.params.id);

      const reporterId =
        getUserId(req.body?.reporter_id);

      const reason =
        cleanText(
          req.body?.reason,
          200
        );

      const details =
        cleanText(
          req.body?.details,
          2000
        );

      if (!videoId || !reporterId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid video ID and reporter ID are required."
        });
      }

      if (!reason) {
        return res.status(400).json({
          ok: false,
          error: "Report reason is required."
        });
      }

      const video =
        await pool.query(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
          `,
          [videoId]
        );

      if (video.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Video not found."
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO dekhoearn_reports
          (
            video_id,
            reporter_id,
            reason,
            details
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (video_id, reporter_id)
          DO NOTHING
          RETURNING id, status, created_at
          `,
          [
            videoId,
            reporterId,
            reason,
            details
          ]
        );

      if (result.rows.length === 0) {
        return res.json({
          ok: true,
          accepted: false,
          duplicate: true,
          message:
            "You have already reported this video. Your previous report remains the one counted."
        });
      }

      res.status(201).json({
        ok: true,
        accepted: true,
        duplicate: false,
        report: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Report error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: "Unable to submit report."
      });
    }
  }
);

// ======================================================
// FOLLOW CREATOR
// ======================================================

app.post(
  "/api/users/:id/follow",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    const client = await pool.connect();

    try {
      const creatorId =
        getUserId(req.params.id);

      const followerId =
        getUserId(req.body?.user_id);

      if (!creatorId || !followerId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid creator ID and user ID are required."
        });
      }

      if (creatorId === followerId) {
        return res.status(400).json({
          ok: false,
          error:
            "You cannot follow yourself."
        });
      }

      await client.query("BEGIN");

      const creator =
        await client.query(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );

      if (creator.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          ok: false,
          error: "Creator not found."
        });
      }

      const inserted =
        await client.query(
          `
          INSERT INTO dekhoearn_follows
          (
            follower_id,
            creator_id
          )
          VALUES ($1, $2)
          ON CONFLICT (follower_id, creator_id)
          DO NOTHING
          RETURNING id
          `,
          [
            followerId,
            creatorId
          ]
        );

      if (inserted.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.json({
          ok: true,
          following: false,
          message:
            "You are already following this creator."
        });
      }

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          followers_count =
            followers_count + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [creatorId]
      );

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          following_count =
            following_count + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [followerId]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        following: true
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Follow error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error: "Unable to follow creator."
      });

    } finally {
      client.release();
    }
  }
);

// ======================================================
// UNFOLLOW CREATOR
// ======================================================

app.post(
  "/api/users/:id/unfollow",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    const client = await pool.connect();

    try {
      const creatorId =
        getUserId(req.params.id);

      const followerId =
        getUserId(req.body?.user_id);

      if (!creatorId || !followerId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid creator ID and user ID are required."
        });
      }

      await client.query("BEGIN");

      const deleted =
        await client.query(
          `
          DELETE FROM dekhoearn_follows
          WHERE follower_id = $1
            AND creator_id = $2
          RETURNING id
          `,
          [
            followerId,
            creatorId
          ]
        );

      if (deleted.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.json({
          ok: true,
          following: false,
          message:
            "You were not following this creator."
        });
      }

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          followers_count =
            GREATEST(followers_count - 1, 0),
          updated_at = NOW()
        WHERE id = $1
        `,
        [creatorId]
      );

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          following_count =
            GREATEST(following_count - 1, 0),
          updated_at = NOW()
        WHERE id = $1
        `,
        [followerId]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        following: false
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Unfollow error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to unfollow creator."
      });

    } finally {
      client.release();
    }
  }
);

// ======================================================
// DELETE OWN VIDEO
// ======================================================

app.delete(
  "/api/videos/:id",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const videoId =
        getVideoId(req.params.id);

      const creatorId =
        getUserId(req.body?.creator_id) ||
        getUserId(req.headers["x-user-id"]);

      if (!videoId || !creatorId) {
        return res.status(400).json({
          ok: false,
          error:
            "Valid video ID and creator ID are required."
        });
      }

      const result =
        await pool.query(
          `
          UPDATE dekhoearn_videos
          SET
            status = 'deleted',
            updated_at = NOW()
          WHERE
            id = $1
            AND creator_id = $2
            AND status <> 'deleted'
          RETURNING id, status
          `,
          [
            videoId,
            creatorId
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error:
            "Video not found or you are not the owner."
        });
      }

      res.json({
        ok: true,
        deleted: true,
        video: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Delete own video error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to delete video."
      });
    }
  }
);

// ======================================================
// DAILY REWARD
// ======================================================

app.post(
  "/api/daily/claim",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    const client = await pool.connect();

    try {
      const userId =
        getUserId(req.body?.user_id);

      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid user ID."
        });
      }

      const date = todayUTC();

      await client.query("BEGIN");

      const inserted =
        await client.query(
          `
          INSERT INTO dekhoearn_daily_rewards
          (
            user_id,
            reward_date,
            points
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, reward_date)
          DO NOTHING
          RETURNING id
          `,
          [
            userId,
            date,
            DAILY_REWARD
          ]
        );

      if (inserted.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.json({
          ok: true,
          claimed: false,
          points: 0,
          message:
            "Today's daily reward has already been claimed."
        });
      }

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          points = points + $1,
          today_earned =
            today_earned + $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          DAILY_REWARD,
          userId
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          amount,
          type,
          reference_id,
          description
        )
        VALUES
        ($1, $2, 'daily', $3, $4)
        `,
        [
          userId,
          DAILY_REWARD,
          date,
          "Daily reward"
        ]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        claimed: true,
        points: DAILY_REWARD
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Daily reward error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to claim daily reward."
      });

    } finally {
      client.release();
    }
  }
);

// ======================================================
// REWARDED AD COMPLETION
// ======================================================

app.post(
  "/api/rewarded-ad/complete",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    const client = await pool.connect();

    try {
      const userId =
        getUserId(req.body?.user_id);

      const adReference =
        cleanText(
          req.body?.ad_reference,
          200
        );

      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid user ID."
        });
      }

      /*
        IMPORTANT:
        The frontend should call this endpoint ONLY
        after a genuine rewarded-ad SDK reports completion.

        Never reward ad clicks.
        Never reward artificial impressions.
      */

      const date = todayUTC();

      // Maximum 10 rewarded ads per user/day
      const countResult =
        await client.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_rewarded_ads
          WHERE user_id = $1
            AND reward_date = $2
          `,
          [userId, date]
        );

      const count =
        Number(countResult.rows[0].count);

      if (count >= 10) {
        return res.status(429).json({
          ok: false,
          error:
            "Daily rewarded-ad limit reached."
        });
      }

      await client.query("BEGIN");

      const inserted =
        await client.query(
          `
          INSERT INTO dekhoearn_rewarded_ads
          (
            user_id,
            reward_date,
            points,
            ad_reference
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [
            userId,
            date,
            REWARDED_AD_POINTS,
            adReference
          ]
        );

      await client.query(
        `
        UPDATE dekhoearn_users
        SET
          points = points + $1,
          today_earned =
            today_earned + $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [
          REWARDED_AD_POINTS,
          userId
        ]
      );

      await client.query(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          amount,
          type,
          reference_id,
          description
        )
        VALUES
        ($1, $2, 'rewarded_ad', $3, $4)
        `,
        [
          userId,
          REWARDED_AD_POINTS,
          String(inserted.rows[0].id),
          "Rewarded advertisement completion"
        ]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        rewarded: true,
        points: REWARDED_AD_POINTS
      });

    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      console.error(
        "Rewarded ad error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to process rewarded ad."
      });

    } finally {
      client.release();
    }
  }
);

// ======================================================
// CREATOR PROFILE
// ======================================================

app.get(
  "/api/creator/:id",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const creatorId =
        getUserId(req.params.id);

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      const userResult =
        await pool.query(
          `
          SELECT
            id,
            username,
            first_name,
            followers_count,
            following_count,
            watch_seconds,
            is_creator,
            creator_monetization_status,
            created_at
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Creator not found."
        });
      }

      const creator =
        userResult.rows[0];

      const videoResult =
        await pool.query(
          `
          SELECT
            id,
            title,
            description,
            video_url,
            thumbnail_url,
            duration_seconds,
            views,
            likes,
            comments_count,
            watch_seconds,
            copyright_warning,
            created_at
          FROM dekhoearn_videos
          WHERE
            creator_id = $1
            AND status = 'active'
            AND moderation_status = 'approved'
          ORDER BY created_at DESC
          `,
          [creatorId]
        );

      const watchHours =
        Number(
          creator.watch_seconds || 0
        ) / 3600;

      res.json({
        ok: true,
        creator: {
          ...creator,
          watch_hours:
            Number(watchHours.toFixed(2))
        },
        videos: videoResult.rows
      });

    } catch (error) {
      console.error(
        "Creator profile error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to get creator profile."
      });
    }
  }
);

// ======================================================
// CREATOR MONETIZATION STATUS
// ======================================================

app.get(
  "/api/creator/:id/monetization",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const creatorId =
        getUserId(req.params.id);

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            followers_count,
            watch_seconds,
            creator_monetization_status
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Creator not found."
        });
      }

      const user =
        result.rows[0];

      const followers =
        Number(user.followers_count || 0);

      const watchHours =
        Number(user.watch_seconds || 0) /
        3600;

      const eligible =
        followers >= CREATOR_MIN_FOLLOWERS &&
        watchHours >= CREATOR_MIN_WATCH_HOURS;

      res.json({
        ok: true,
        eligible,
        requirements: {
          followers:
            CREATOR_MIN_FOLLOWERS,
          watch_hours:
            CREATOR_MIN_WATCH_HOURS
        },
        current: {
          followers,
          watch_hours:
            Number(watchHours.toFixed(2))
        },
        status:
          user.creator_monetization_status
      });

    } catch (error) {
      console.error(
        "Monetization status error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to get monetization status."
      });
    }
  }
);

// ======================================================
// CREATOR MONETIZATION APPLY
// ======================================================

app.post(
  "/api/creator/:id/monetization/apply",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const creatorId =
        getUserId(req.params.id);

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            followers_count,
            watch_seconds,
            creator_monetization_status
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [creatorId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Creator not found."
        });
      }

      const user =
        result.rows[0];

      const followers =
        Number(user.followers_count || 0);

      const watchHours =
        Number(user.watch_seconds || 0) /
        3600;

      if (
        followers < CREATOR_MIN_FOLLOWERS ||
        watchHours < CREATOR_MIN_WATCH_HOURS
      ) {
        return res.status(400).json({
          ok: false,
          eligible: false,
          error:
            "Monetization requirements have not been reached yet.",
          current: {
            followers,
            watch_hours:
              Number(watchHours.toFixed(2))
          },
          requirements: {
            followers:
              CREATOR_MIN_FOLLOWERS,
            watch_hours:
              CREATOR_MIN_WATCH_HOURS
          }
        });
      }

      if (
        user.creator_monetization_status ===
        "pending" ||
        user.creator_monetization_status ===
        "approved"
      ) {
        return res.json({
          ok: true,
          eligible: true,
          status:
            user.creator_monetization_status,
          message:
            "Monetization application already exists."
        });
      }

      await pool.query(
        `
        UPDATE dekhoearn_users
        SET
          is_creator = TRUE,
          creator_monetization_status = 'pending',
          updated_at = NOW()
        WHERE id = $1
        `,
        [creatorId]
      );

      res.json({
        ok: true,
        eligible: true,
        status: "pending",
        message:
          "Creator monetization application submitted for review."
      });

    } catch (error) {
      console.error(
        "Monetization apply error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to submit monetization application."
      });
    }
  }
);

// ======================================================
// CREATOR EARNINGS
// ======================================================

app.get(
  "/api/creator/:id/earnings",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const creatorId =
        getUserId(req.params.id);

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            video_id,
            gross_revenue,
            creator_share,
            platform_share,
            currency,
            status,
            created_at
          FROM dekhoearn_creator_earnings
          WHERE creator_id = $1
          ORDER BY created_at DESC
          LIMIT 100
          `,
          [creatorId]
        );

      const totals =
        await pool.query(
          `
          SELECT
            COALESCE(
              SUM(gross_revenue), 0
            ) AS gross_revenue,
            COALESCE(
              SUM(creator_share), 0
            ) AS creator_share,
            COALESCE(
              SUM(platform_share), 0
            ) AS platform_share
          FROM dekhoearn_creator_earnings
          WHERE creator_id = $1
          `,
          [creatorId]
        );

      res.json({
        ok: true,
        earnings: result.rows,
        totals: totals.rows[0]
      });

    } catch (error) {
      console.error(
        "Creator earnings error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to get creator earnings."
      });
    }
  }
);

// ======================================================
// PAYOUT ACCOUNT FOUNDATION
// ======================================================

app.post(
  "/api/creator/:id/payout-account",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const creatorId =
        getUserId(req.params.id);

      const provider =
        cleanText(
          req.body?.provider,
          100
        );

      const accountReference =
        cleanText(
          req.body?.account_reference,
          500
        );

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      /*
        Do NOT send raw bank passwords, card PINs,
        OTPs or other secrets to this endpoint.

        account_reference is intended for a future
        payout-provider/customer/account reference.
      */

      const result =
        await pool.query(
          `
          INSERT INTO dekhoearn_payout_accounts
          (
            user_id,
            provider,
            account_reference,
            status,
            verified
          )
          VALUES
          ($1, $2, $3, 'pending_verification', FALSE)
          ON CONFLICT (user_id)
          DO UPDATE SET
            provider = EXCLUDED.provider,
            account_reference =
              EXCLUDED.account_reference,
            status = 'pending_verification',
            verified = FALSE,
            updated_at = NOW()
          RETURNING
            id,
            user_id,
            provider,
            account_reference,
            status,
            verified,
            created_at,
            updated_at
          `,
          [
            creatorId,
            provider,
            accountReference
          ]
        );

      res.json({
        ok: true,
        payout_account:
          result.rows[0],
        message:
          "Payout account foundation saved. Provider verification is required before withdrawals."
      });

    } catch (error) {
      console.error(
        "Payout account error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to save payout account."
      });
    }
  }
);

// ======================================================
// GET PAYOUT ACCOUNT
// ======================================================

app.get(
  "/api/creator/:id/payout-account",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    try {
      const creatorId =
        getUserId(req.params.id);

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            user_id,
            provider,
            account_reference,
            status,
            verified,
            created_at,
            updated_at
          FROM dekhoearn_payout_accounts
          WHERE user_id = $1
          `,
          [creatorId]
        );

      res.json({
        ok: true,
        payout_account:
          result.rows[0] || null
      });

    } catch (error) {
      console.error(
        "Get payout account error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to get payout account."
      });
    }
  }
);

// ======================================================
// ADMIN: LIST REPORTS
// ======================================================

app.get(
  "/api/admin/reports",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    if (!adminAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: "Admin authorization required."
      });
    }

    try {
      const result =
        await pool.query(
          `
          SELECT
            r.id,
            r.video_id,
            r.reporter_id,
            r.reason,
            r.details,
            r.status,
            r.admin_note,
            r.created_at,
            v.title,
            v.creator_id,
            u.username AS creator_username
          FROM dekhoearn_reports r
          JOIN dekhoearn_videos v
            ON v.id = r.video_id
          JOIN dekhoearn_users u
            ON u.id = v.creator_id
          ORDER BY
            CASE
              WHEN r.status = 'pending'
              THEN 0
              ELSE 1
            END,
            r.created_at DESC
          LIMIT 200
          `
        );

      res.json({
        ok: true,
        reports: result.rows
      });

    } catch (error) {
      console.error(
        "Admin reports error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to load reports."
      });
    }
  }
);

// ======================================================
// ADMIN: MODERATE VIDEO
// ======================================================

app.post(
  "/api/admin/videos/:id/moderate",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    if (!adminAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: "Admin authorization required."
      });
    }

    try {
      const videoId =
        getVideoId(req.params.id);

      const action =
        cleanText(
          req.body?.action,
          50
        );

      const note =
        cleanText(
          req.body?.note,
          2000
        );

      if (!videoId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid video ID."
        });
      }

      const allowedActions = [
        "remove",
        "restore",
        "approve",
        "review"
      ];

      if (!allowedActions.includes(action)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid moderation action."
        });
      }

      let status = "active";
      let moderationStatus = "approved";

      if (action === "remove") {
        status = "removed";
        moderationStatus = "removed";
      }

      if (action === "restore") {
        status = "active";
        moderationStatus = "approved";
      }

      if (action === "approve") {
        status = "active";
        moderationStatus = "approved";
      }

      if (action === "review") {
        status = "active";
        moderationStatus = "review";
      }

      const result =
        await pool.query(
          `
          UPDATE dekhoearn_videos
          SET
            status = $1,
            moderation_status = $2,
            updated_at = NOW()
          WHERE id = $3
          RETURNING
            id,
            status,
            moderation_status
          `,
          [
            status,
            moderationStatus,
            videoId
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Video not found."
        });
      }

      await pool.query(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_name,
          action,
          target_type,
          target_id,
          note
        )
        VALUES
        ($1, $2, 'video', $3, $4)
        `,
        [
          "admin",
          action,
          String(videoId),
          note
        ]
      );

      res.json({
        ok: true,
        video: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Admin moderation error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to moderate video."
      });
    }
  }
);

// ======================================================
// ADMIN: REVIEW REPORT
// ======================================================

app.post(
  "/api/admin/reports/:id/review",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    if (!adminAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: "Admin authorization required."
      });
    }

    try {
      const reportId =
        getVideoId(req.params.id);

      const status =
        cleanText(
          req.body?.status,
          50
        );

      const note =
        cleanText(
          req.body?.note,
          2000
        );

      const allowedStatuses = [
        "accepted",
        "rejected",
        "dismissed"
      ];

      if (!reportId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid report ID."
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid report status."
        });
      }

      const result =
        await pool.query(
          `
          UPDATE dekhoearn_reports
          SET
            status = $1,
            admin_note = $2,
            reviewed_at = NOW()
          WHERE id = $3
          RETURNING
            id,
            video_id,
            status,
            admin_note,
            reviewed_at
          `,
          [
            status,
            note,
            reportId
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Report not found."
        });
      }

      await pool.query(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_name,
          action,
          target_type,
          target_id,
          note
        )
        VALUES
        ($1, 'review_report', 'report', $2, $3)
        `,
        [
          "admin",
          String(reportId),
          note
        ]
      );

      res.json({
        ok: true,
        report: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Admin report review error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to review report."
      });
    }
  }
);

// ======================================================
// ADMIN: CREATOR MONETIZATION DECISION
// ======================================================

app.post(
  "/api/admin/creator/:id/monetization",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    if (!adminAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: "Admin authorization required."
      });
    }

    try {
      const creatorId =
        getUserId(req.params.id);

      const status =
        cleanText(
          req.body?.status,
          50
        );

      const note =
        cleanText(
          req.body?.note,
          2000
        );

      const allowedStatuses = [
        "approved",
        "rejected",
        "pending",
        "not_eligible"
      ];

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid monetization status."
        });
      }

      const result =
        await pool.query(
          `
          UPDATE dekhoearn_users
          SET
            is_creator =
              CASE
                WHEN $1 = 'approved'
                THEN TRUE
                ELSE is_creator
              END,
            creator_monetization_status = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING
            id,
            is_creator,
            creator_monetization_status
          `,
          [
            status,
            creatorId
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Creator not found."
        });
      }

      await pool.query(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_name,
          action,
          target_type,
          target_id,
          note
        )
        VALUES
        ($1, 'monetization_decision', 'creator', $2, $3)
        `,
        [
          "admin",
          String(creatorId),
          note
        ]
      );

      res.json({
        ok: true,
        creator: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Admin monetization error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to update monetization status."
      });
    }
  }
);

// ======================================================
// ADMIN: ADD CREATOR EARNING
// ======================================================
//
// This endpoint is for ADMIN / future verified ad-revenue
// processing only. Users cannot call this to give
// themselves money because ADMIN_KEY is required.
// ======================================================

app.post(
  "/api/admin/creator-earnings",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    if (!adminAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: "Admin authorization required."
      });
    }

    try {
      const creatorId =
        getUserId(req.body?.creator_id);

      const videoId =
        req.body?.video_id
          ? getVideoId(req.body.video_id)
          : null;

      const grossRevenue =
        Number(req.body?.gross_revenue);

      const creatorShare =
        Number(req.body?.creator_share);

      const platformShare =
        Number(req.body?.platform_share);

      const currency =
        cleanText(
          req.body?.currency || "INR",
          10
        );

      if (!creatorId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid creator ID."
        });
      }

      if (
        !Number.isFinite(grossRevenue) ||
        grossRevenue < 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid gross revenue."
        });
      }

      if (
        !Number.isFinite(creatorShare) ||
        creatorShare < 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid creator share."
        });
      }

      if (
        !Number.isFinite(platformShare) ||
        platformShare < 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid platform share."
        });
      }

      const total =
        creatorShare + platformShare;

      if (
        Math.abs(total - grossRevenue) >
        0.01
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Creator share + platform share must equal gross revenue."
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO dekhoearn_creator_earnings
          (
            creator_id,
            video_id,
            gross_revenue,
            creator_share,
            platform_share,
            currency,
            status
          )
          VALUES
          ($1, $2, $3, $4, $5, $6, 'pending')
          RETURNING *
          `,
          [
            creatorId,
            videoId,
            grossRevenue,
            creatorShare,
            platformShare,
            currency
          ]
        );

      res.status(201).json({
        ok: true,
        earning: result.rows[0]
      });

    } catch (error) {
      console.error(
        "Admin creator earning error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to create creator earning."
      });
    }
  }
);

// ======================================================
// ADMIN: DASHBOARD
// ======================================================

app.get(
  "/api/admin/dashboard",
  async (req, res) => {
    if (!databaseRequired(res)) return;

    if (!adminAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: "Admin authorization required."
      });
    }

    try {
      const users =
        await pool.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_users
          `
        );

      const videos =
        await pool.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_videos
          WHERE status <> 'deleted'
          `
        );

      const activeVideos =
        await pool.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_videos
          WHERE
            status = 'active'
            AND moderation_status = 'approved'
          `
        );

      const reports =
        await pool.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_reports
          WHERE status = 'pending'
          `
        );

      const creators =
        await pool.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_users
          WHERE is_creator = TRUE
          `
        );

      const monetizationPending =
        await pool.query(
          `
          SELECT COUNT(*)::INTEGER AS count
          FROM dekhoearn_users
          WHERE
            creator_monetization_status =
            'pending'
          `
        );

      const views =
        await pool.query(
          `
          SELECT
            COALESCE(
              SUM(views), 0
            )::BIGINT AS views,
            COALESCE(
              SUM(watch_seconds), 0
            )::BIGINT AS watch_seconds
          FROM dekhoearn_videos
          `
        );

      res.json({
        ok: true,
        dashboard: {
          users:
            Number(users.rows[0].count),
          videos:
            Number(videos.rows[0].count),
          active_videos:
            Number(activeVideos.rows[0].count),
          pending_reports:
            Number(reports.rows[0].count),
          creators:
            Number(creators.rows[0].count),
          monetization_pending:
            Number(
              monetizationPending.rows[0].count
            ),
          total_views:
            Number(views.rows[0].views),
          total_watch_seconds:
            Number(
              views.rows[0].watch_seconds
            )
        }
      });

    } catch (error) {
      console.error(
        "Admin dashboard error:",
        error.message
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to load admin dashboard."
      });
    }
  }
);

// ======================================================
// 404 API
// ======================================================

app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    error: "API endpoint not found."
  });
});

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {
  console.error(
    "Unhandled server error:",
    error.message
  );

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error: "Internal server error."
  });
});

// ======================================================
// START SERVER
// ======================================================

async function startServer() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(
      `DekhoEarn ${SERVER_VERSION} running on port ${PORT}`
    );

    console.log(
      "Dekho. Earn Karo. Reward Lo."
    );
  });
}

startServer().catch((error) => {
  console.error(
    "Server startup failed:",
    error
  );

  process.exit(1);
});
