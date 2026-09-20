/*
=========================================================
 DEKHOEARN SERVER
 Version 2.3.0

 Dekho. Earn Karo. Reward Lo.

 STACK
 - Node.js
 - Express
 - Neon PostgreSQL
 - Cloudinary
 - Render

 FEATURES
 - User system
 - Points wallet
 - Video feed
 - Real video upload via Cloudinary
 - Video metadata in Neon
 - Watch reward
 - Like / Unlike
 - Comments
 - Reports
 - Follow / Unfollow
 - Daily reward
 - Rewarded ad reward
 - Referrals
 - Creator profile
 - Creator monetization eligibility
 - Creator earnings ledger
 - Payout account foundation
 - Creator self-delete
 - Admin moderation
 - Admin dashboard
 - Duplicate URL warning
 - Health endpoint
 - Static frontend
 - Cloudinary signed upload
 - 100 MB upload compatibility
=========================================================
*/

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");
const path = require("path");

const app = express();


// =========================================================
// CONFIG
// =========================================================

const SERVER_VERSION = "2.3.0";

const PORT =
  process.env.PORT || 10000;

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";


// =========================================================
// REWARD SETTINGS
// =========================================================

const POINTS_PER_WATCH = 1;

const DAILY_REWARD = 10;

const REWARDED_AD_POINTS = 5;

const REFERRAL_REWARD = 10;

const MIN_WATCH_SECONDS = 10;


// =========================================================
// CREATOR SETTINGS
// =========================================================

const CREATOR_MIN_FOLLOWERS = 1000;

const CREATOR_MIN_WATCH_HOURS = 1000;


// =========================================================
// UPLOAD SETTINGS
// =========================================================

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;


// =========================================================
// CLOUDINARY
// =========================================================

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || "";

const CLOUDINARY_API_KEY =
  process.env.CLOUDINARY_API_KEY || "";

const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || "";


// =========================================================
// EXPRESS
// =========================================================

app.disable("x-powered-by");


app.use(
  cors({
    origin: true,
    credentials: true
  })
);


/*
IMPORTANT:

JSON body is only used for metadata/API requests.

The actual video file goes directly:

Browser
   ↓
Cloudinary

So Express does NOT receive the 100 MB video file.
*/


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


// =========================================================
// STATIC FRONTEND
// =========================================================

/*
This was missing from the previous server.

It allows Render/Express to serve:

index.html
app.js
style.css
icons
images
etc.
*/

app.use(
  express.static(
    __dirname,
    {
      index: false,
      maxAge: "1h"
    }
  )
);


// =========================================================
// DATABASE
// =========================================================

let pool = null;


if (DATABASE_URL) {

  pool = new Pool({

    connectionString:
      DATABASE_URL,

    ssl: {
      rejectUnauthorized: false
    },

    max: 5,

    idleTimeoutMillis:
      30000,

    connectionTimeoutMillis:
      10000

  });

}


async function dbQuery(
  text,
  params = []
) {

  if (!pool) {

    throw new Error(
      "DATABASE_URL is not configured."
    );

  }

  return pool.query(
    text,
    params
  );

}


// =========================================================
// HELPERS
// =========================================================

function cleanString(
  value,
  maxLength = 500
) {

  if (
    value === undefined ||
    value === null
  ) {

    return "";

  }

  return String(value)
    .trim()
    .slice(0, maxLength);

}


function safeInteger(
  value,
  fallback = 0
) {

  const n =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(n)
    ? n
    : fallback;

}


function safeNumber(
  value,
  fallback = 0
) {

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;

}


function todayIndia() {

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(
    new Date()
  );

}


function isValidHttpUrl(
  value
) {

  try {

    const url =
      new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );

  } catch {

    return false;

  }

}


function getUserId(
  req
) {

  return cleanString(
    req.body?.user_id ||
    req.query?.user_id ||
    req.headers["x-user-id"],
    100
  );

}


function adminAuthorized(
  req
) {

  if (!ADMIN_KEY) {
    return false;
  }

  const headerKey =
    req.headers["x-admin-key"];

  const auth =
    req.headers.authorization || "";

  const bearer =
    auth.startsWith("Bearer ")
      ? auth.slice(7)
      : "";

  return (
    headerKey === ADMIN_KEY ||
    bearer === ADMIN_KEY
  );

}


function requireAdmin(
  req,
  res,
  next
) {

  if (!ADMIN_KEY) {

    return res.status(503).json({

      ok: false,

      error:
        "ADMIN_KEY is not configured."

    });

  }

  if (!adminAuthorized(req)) {

    return res.status(401).json({

      ok: false,

      error:
        "Unauthorized."

    });

  }

  next();

}


// =========================================================
// DATABASE INITIALIZATION
// =========================================================

async function initDatabase() {

  if (!pool) {

    console.warn(
      "DATABASE_URL missing. Database disabled."
    );

    return;

  }


  // =======================================================
  // USERS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      email TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      points BIGINT NOT NULL DEFAULT 0,
      followers_count INTEGER NOT NULL DEFAULT 0,
      following_count INTEGER NOT NULL DEFAULT 0,
      total_watch_seconds BIGINT NOT NULL DEFAULT 0,
      total_videos INTEGER NOT NULL DEFAULT 0,
      creator_status TEXT NOT NULL DEFAULT 'not_eligible',
      creator_applied BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // VIDEOS
  // =======================================================

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
      duration NUMERIC(12,3),
      bytes BIGINT,
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


  // =======================================================
  // VIDEO VIEWS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      watch_seconds INTEGER NOT NULL DEFAULT 0,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // LIKES
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id, user_id)
    )
  `);


  // =======================================================
  // COMMENTS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // REPORTS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,
      video_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id, user_id)
    )
  `);


  // =======================================================
  // FOLLOWS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    )
  `);


  // =======================================================
  // POINTS LEDGER
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      type TEXT NOT NULL,
      reference_id TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // DAILY REWARDS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      reward_date DATE NOT NULL,
      points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, reward_date)
    )
  `);


  // =======================================================
  // REWARDED ADS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      reward_date DATE NOT NULL,
      points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // REFERRALS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL UNIQUE,
      reward_points INTEGER NOT NULL DEFAULT 0,
      rewarded BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // CREATOR EARNINGS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
      id BIGSERIAL PRIMARY KEY,
      creator_id TEXT NOT NULL,
      video_id BIGINT,
      gross_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
      platform_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
      creator_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // PAYOUT ACCOUNTS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      account_type TEXT NOT NULL DEFAULT '',
      account_holder_name TEXT DEFAULT '',
      provider_reference TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // ADMIN ACTIONS
  // =======================================================

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
      id BIGSERIAL PRIMARY KEY,
      admin_action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  // =======================================================
  // SAFE MIGRATIONS
  // =======================================================

  const migrations = [

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS username TEXT DEFAULT ''
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS points BIGINT NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS total_watch_seconds BIGINT NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS total_videos INTEGER NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS creator_status TEXT NOT NULL DEFAULT 'not_eligible'
    `,

    `
    ALTER TABLE dekhoearn_users
    ADD COLUMN IF NOT EXISTS creator_applied BOOLEAN NOT NULL DEFAULT FALSE
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT ''
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT DEFAULT ''
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS cloudinary_resource_type TEXT DEFAULT 'video'
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS cloudinary_format TEXT DEFAULT ''
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS duration NUMERIC(12,3)
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS bytes BIGINT
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS views BIGINT NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS likes_count BIGINT NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS comments_count BIGINT NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS watch_seconds BIGINT NOT NULL DEFAULT 0
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'normal'
    `,

    `
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS duplicate_warning BOOLEAN NOT NULL DEFAULT FALSE
    `

  ];


  for (
    const migration of migrations
  ) {

    try {

      await dbQuery(
        migration
      );

    } catch (error) {

      console.warn(
        "Migration warning:",
        error.message
      );

    }

  }


  console.log(
    "Neon database initialized."
  );

}


// =========================================================
// HEALTH
// =========================================================

app.get(
  "/health",
  async (req, res) => {

    let database = false;

    try {

      if (pool) {

        await dbQuery(
          "SELECT 1"
        );

        database = true;

      }

    } catch {

      database = false;

    }


    return res.json({

      ok: true,

      app:
        "DekhoEarn",

      version:
        SERVER_VERSION,

      status:
        database
          ? "healthy"
          : "degraded",

      database,

      cloudinary:
        Boolean(
          CLOUDINARY_CLOUD_NAME &&
          CLOUDINARY_API_KEY &&
          CLOUDINARY_API_SECRET
        ),

      frontend:
        true,

      max_video_size_mb:
        MAX_VIDEO_SIZE /
        1024 /
        1024,

      timestamp:
        new Date().toISOString()

    });

  }
);


// =========================================================
// CLOUDINARY CONFIG CHECK
// =========================================================

app.get(
  "/api/cloudinary/status",
  (req, res) => {

    return res.json({

      ok: true,

      configured:
        Boolean(
          CLOUDINARY_CLOUD_NAME &&
          CLOUDINARY_API_KEY &&
          CLOUDINARY_API_SECRET
        ),

      cloud_name:
        CLOUDINARY_CLOUD_NAME
          ? CLOUDINARY_CLOUD_NAME
          : "",

      resource_type:
        "video",

      max_video_size_mb:
        MAX_VIDEO_SIZE /
        1024 /
        1024

    });

  }
);


// =========================================================
// CLOUDINARY SIGNATURE
// =========================================================

app.post(
  "/api/cloudinary/signature",
  async (req, res) => {

    try {

      if (
        !CLOUDINARY_CLOUD_NAME ||
        !CLOUDINARY_API_KEY ||
        !CLOUDINARY_API_SECRET
      ) {

        console.error(
          "Cloudinary environment variables missing."
        );

        return res.status(503).json({

          ok: false,

          error:
            "Cloudinary environment variables are missing."

        });

      }


      const timestamp =
        Math.floor(
          Date.now() / 1000
        );


      /*
      We are signing only timestamp.

      Browser will send:

      file
      api_key
      timestamp
      signature
      */


      const stringToSign =
        `timestamp=${timestamp}`;


      const signature =
        crypto
          .createHash("sha1")
          .update(
            stringToSign +
            CLOUDINARY_API_SECRET
          )
          .digest("hex");


      const uploadUrl =
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;


      console.log(
        "Cloudinary signature generated."
      );


      return res.json({

        ok: true,

        cloud_name:
          CLOUDINARY_CLOUD_NAME,

        api_key:
          CLOUDINARY_API_KEY,

        timestamp,

        signature,

        resource_type:
          "video",

        upload_url:
          uploadUrl

      });

    } catch (error) {

      console.error(
        "Cloudinary signature error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Unable to create Cloudinary signature."

      });

    }

  }
);


// =========================================================
// CREATE / UPDATE USER
// =========================================================

app.post(
  "/api/user",
  async (req, res) => {

    try {

      const id =
        cleanString(
          req.body.id ||
          req.body.user_id,
          100
        );


      if (!id) {

        return res.status(400).json({

          ok: false,

          error:
            "User id is required."

        });

      }


      const name =
        cleanString(
          req.body.name,
          100
        );


      const username =
        cleanString(
          req.body.username,
          100
        );


      const email =
        cleanString(
          req.body.email,
          200
        );


      const avatar =
        cleanString(
          req.body.avatar_url,
          500
        );


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_users
          (
            id,
            name,
            username,
            email,
            avatar_url
          )
          VALUES
          ($1,$2,$3,$4,$5)

          ON CONFLICT (id)

          DO UPDATE SET

            name =
              CASE
                WHEN EXCLUDED.name <> ''
                THEN EXCLUDED.name
                ELSE dekhoearn_users.name
              END,

            username =
              CASE
                WHEN EXCLUDED.username <> ''
                THEN EXCLUDED.username
                ELSE dekhoearn_users.username
              END,

            email =
              CASE
                WHEN EXCLUDED.email <> ''
                THEN EXCLUDED.email
                ELSE dekhoearn_users.email
              END,

            avatar_url =
              CASE
                WHEN EXCLUDED.avatar_url <> ''
                THEN EXCLUDED.avatar_url
                ELSE dekhoearn_users.avatar_url
              END,

            updated_at =
              NOW()

          RETURNING *
          `,
          [
            id,
            name,
            username,
            email,
            avatar
          ]
        );


      return res.json({

        ok: true,

        user:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Create user error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "User create failed."

      });

    }

  }
);


// =========================================================
// GET USER
// =========================================================

app.get(
  "/api/user/:id",
  async (req, res) => {

    try {

      const id =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await dbQuery(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [id]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "User not found."

        });

      }


      return res.json({

        ok: true,

        user:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Get user error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Unable to load user."

      });

    }

  }
);


// =========================================================
// USER POINTS
// =========================================================

app.get(
  "/api/user/:id/points",
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT
            id,
            points,
            created_at
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [
            req.params.id
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "User not found."

        });

      }


      return res.json({

        ok: true,

        points:
          Number(
            result.rows[0].points || 0
          )

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load points."

      });

    }

  }
);


// =========================================================
// POINTS HISTORY
// =========================================================

app.get(
  "/api/user/:id/points/history",
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT
            id,
            points,
            type,
            reference_id,
            description,
            created_at
          FROM dekhoearn_points_ledger
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 100
          `,
          [
            req.params.id
          ]
        );


      return res.json({

        ok: true,

        history:
          result.rows

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load points history."

      });

    }

  }
);


// =========================================================
// VIDEO UPLOAD METADATA
// =========================================================

app.post(
  "/api/videos",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          req.body.creator_id,
          100
        );


      const title =
        cleanString(
          req.body.title,
          120
        );


      const description =
        cleanString(
          req.body.description,
          1000
        );


      const videoUrl =
        cleanString(
          req.body.video_url,
          2000
        );


      const thumbnailUrl =
        cleanString(
          req.body.thumbnail_url,
          2000
        );


      const cloudinaryPublicId =
        cleanString(
          req.body.cloudinary_public_id,
          500
        );


      const cloudinaryResourceType =
        cleanString(
          req.body.cloudinary_resource_type ||
          "video",
          50
        );


      const cloudinaryFormat =
        cleanString(
          req.body.cloudinary_format,
          50
        );


      const duration =
        safeNumber(
          req.body.duration,
          0
        );


      const bytes =
        safeNumber(
          req.body.bytes,
          0
        );


      if (
        !userId ||
        !title ||
        !videoUrl
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id, title and video_url are required."

        });

      }


      if (
        !isValidHttpUrl(
          videoUrl
        )
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Invalid video URL."

        });

      }


      /*
      Basic protection.

      Only allow Cloudinary URLs for the new
      direct-upload flow, while keeping support
      for normal HTTPS URLs.
      */

      if (
        bytes > MAX_VIDEO_SIZE
      ) {

        return res.status(413).json({

          ok: false,

          error:
            "Video exceeds the 100 MB limit."

        });

      }


      const userResult =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE id = $1
          `,
          [userId]
        );


      if (!userResult.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "User not found."

        });

      }


      // ===================================================
      // DUPLICATE URL CHECK
      // ===================================================

      const duplicateResult =
        await dbQuery(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE video_url = $1
          LIMIT 1
          `,
          [videoUrl]
        );


      const duplicateWarning =
        duplicateResult.rows.length > 0;


      const result =
        await dbQuery(
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
            bytes,
            duplicate_warning
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            NULLIF($9, 0),
            NULLIF($10, 0),
            $11
          )

          RETURNING *
          `,
          [
            userId,
            title,
            description,
            videoUrl,
            thumbnailUrl,
            cloudinaryPublicId,
            cloudinaryResourceType,
            cloudinaryFormat,
            duration,
            bytes,
            duplicateWarning
          ]
        );


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          total_videos =
            total_videos + 1,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [userId]
      );


      return res.status(201).json({

        ok: true,

        video:
          result.rows[0],

        warning:
          duplicateWarning
            ? "Similar video URL already exists. Admin review may be required."
            : ""

      });

    } catch (error) {

      console.error(
        "Create video error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Video save failed."

      });

    }

  }
);


// =========================================================
// VIDEO FEED
// =========================================================

app.get(
  "/api/videos",
  async (req, res) => {

    try {

      const limit =
        Math.min(
          Math.max(
            safeInteger(
              req.query.limit,
              30
            ),
            1
          ),
          100
        );


      const offset =
        Math.max(
          safeInteger(
            req.query.offset,
            0
          ),
          0
        );


      const result =
        await dbQuery(
          `
          SELECT
            v.*,

            u.name AS creator_name,

            u.username AS creator_username,

            u.avatar_url AS creator_avatar

          FROM dekhoearn_videos v

          LEFT JOIN dekhoearn_users u
            ON u.id = v.user_id

          WHERE
            v.status = 'published'

            AND v.moderation_status <> 'removed'

          ORDER BY
            v.created_at DESC

          LIMIT $1

          OFFSET $2
          `,
          [
            limit,
            offset
          ]
        );


      return res.json({

        ok: true,

        videos:
          result.rows

      });

    } catch (error) {

      console.error(
        "Video feed error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Unable to load videos."

      });

    }

  }
);


// =========================================================
// SINGLE VIDEO
// =========================================================

app.get(
  "/api/videos/:id",
  async (req, res) => {

    try {

      const videoId =
        safeInteger(
          req.params.id
        );


      const result =
        await dbQuery(
          `
          SELECT
            v.*,

            u.name AS creator_name,

            u.username AS creator_username,

            u.avatar_url AS creator_avatar

          FROM dekhoearn_videos v

          LEFT JOIN dekhoearn_users u
            ON u.id = v.user_id

          WHERE v.id = $1
          `,
          [
            videoId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Video not found."

        });

      }


      return res.json({

        ok: true,

        video:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Single video error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Unable to load video."

      });

    }

  }
);


// =========================================================
// WATCH COMPLETE
// =========================================================

app.post(
  "/api/watch/complete",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      const videoId =
        safeInteger(
          req.body.video_id
        );


      const watchSeconds =
        Math.min(
          Math.max(
            safeInteger(
              req.body.watch_seconds
            ),
            0
          ),
          86400
        );


      if (
        !userId ||
        !videoId
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id and video_id are required."

        });

      }


      const videoResult =
        await dbQuery(
          `
          SELECT
            id,
            user_id,
            status

          FROM dekhoearn_videos

          WHERE id = $1
          `,
          [videoId]
        );


      if (!videoResult.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Video not found."

        });

      }


      if (
        videoResult.rows[0].status !==
        "published"
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Video is not available."

        });

      }


      const rewardEligible =
        watchSeconds >=
        MIN_WATCH_SECONDS;


      await dbQuery(
        `
        INSERT INTO dekhoearn_video_views
        (
          video_id,
          user_id,
          watch_seconds,
          reward_granted
        )

        VALUES
        ($1,$2,$3,$4)
        `,
        [
          videoId,
          userId,
          watchSeconds,
          rewardEligible
        ]
      );


      await dbQuery(
        `
        UPDATE dekhoearn_videos

        SET
          views =
            views + 1,

          watch_seconds =
            watch_seconds + $2,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          videoId,
          watchSeconds
        ]
      );


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          total_watch_seconds =
            total_watch_seconds + $2,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          userId,
          watchSeconds
        ]
      );


      if (rewardEligible) {

        await dbQuery(
          `
          UPDATE dekhoearn_users

          SET
            points =
              points + $2,

            updated_at =
              NOW()

          WHERE id = $1
          `,
          [
            userId,
            POINTS_PER_WATCH
          ]
        );


        await dbQuery(
          `
          INSERT INTO dekhoearn_points_ledger
          (
            user_id,
            points,
            type,
            reference_id,
            description
          )

          VALUES
          ($1,$2,'watch',$3,$4)
          `,
          [
            userId,
            POINTS_PER_WATCH,
            String(videoId),
            "Video watch reward"
          ]
        );

      }


      const userResult =
        await dbQuery(
          `
          SELECT points

          FROM dekhoearn_users

          WHERE id = $1
          `,
          [userId]
        );


      return res.json({

        ok: true,

        reward_granted:
          rewardEligible,

        reward_points:
          rewardEligible
            ? POINTS_PER_WATCH
            : 0,

        points:
          Number(
            userResult.rows[0]?.points ||
            0
          )

      });

    } catch (error) {

      console.error(
        "Watch error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Watch reward failed."

      });

    }

  }
);


// =========================================================
// LIKE / UNLIKE
// =========================================================

app.post(
  "/api/videos/:id/like",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      const videoId =
        safeInteger(
          req.params.id
        );


      if (!userId) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id is required."

        });

      }


      const existing =
        await dbQuery(
          `
          SELECT id

          FROM dekhoearn_likes

          WHERE
            video_id = $1

            AND user_id = $2
          `,
          [
            videoId,
            userId
          ]
        );


      if (existing.rows.length) {

        await dbQuery(
          `
          DELETE FROM dekhoearn_likes

          WHERE
            video_id = $1

            AND user_id = $2
          `,
          [
            videoId,
            userId
          ]
        );


        await dbQuery(
          `
          UPDATE dekhoearn_videos

          SET
            likes_count =
              GREATEST(
                likes_count - 1,
                0
              )

          WHERE id = $1
          `,
          [videoId]
        );


        return res.json({

          ok: true,

          liked: false

        });

      }


      const insertResult =
        await dbQuery(
          `
          INSERT INTO dekhoearn_likes
          (
            video_id,
            user_id
          )

          VALUES
          ($1,$2)

          ON CONFLICT
          (
            video_id,
            user_id
          )

          DO NOTHING

          RETURNING id
          `,
          [
            videoId,
            userId
          ]
        );


      if (
        insertResult.rows.length
      ) {

        await dbQuery(
          `
          UPDATE dekhoearn_videos

          SET
            likes_count =
              likes_count + 1

          WHERE id = $1
          `,
          [videoId]
        );

      }


      return res.json({

        ok: true,

        liked: true

      });

    } catch (error) {

      console.error(
        "Like error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Like failed."

      });

    }

  }
);


// =========================================================
// COMMENTS
// =========================================================

app.post(
  "/api/videos/:id/comments",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      const videoId =
        safeInteger(
          req.params.id
        );


      const comment =
        cleanString(
          req.body.comment,
          1000
        );


      if (
        !userId ||
        !comment
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id and comment are required."

        });

      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_comments
          (
            video_id,
            user_id,
            comment
          )

          VALUES
          ($1,$2,$3)

          RETURNING *
          `,
          [
            videoId,
            userId,
            comment
          ]
        );


      await dbQuery(
        `
        UPDATE dekhoearn_videos

        SET
          comments_count =
            comments_count + 1

        WHERE id = $1
        `,
        [videoId]
      );


      return res.status(201).json({

        ok: true,

        comment:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Comment error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Comment failed."

      });

    }

  }
);


app.get(
  "/api/videos/:id/comments",
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT
            c.*,

            u.name,

            u.username,

            u.avatar_url

          FROM dekhoearn_comments c

          LEFT JOIN dekhoearn_users u
            ON u.id = c.user_id

          WHERE c.video_id = $1

          ORDER BY
            c.created_at ASC

          LIMIT 200
          `,
          [
            req.params.id
          ]
        );


      return res.json({

        ok: true,

        comments:
          result.rows

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load comments."

      });

    }

  }
);


// =========================================================
// REPORT VIDEO
// =========================================================

app.post(
  "/api/videos/:id/report",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      const videoId =
        safeInteger(
          req.params.id
        );


      const reason =
        cleanString(
          req.body.reason,
          500
        );


      if (!userId) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id is required."

        });

      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_reports
          (
            video_id,
            user_id,
            reason
          )

          VALUES
          ($1,$2,$3)

          ON CONFLICT
          (
            video_id,
            user_id
          )

          DO NOTHING

          RETURNING *
          `,
          [
            videoId,
            userId,
            reason
          ]
        );


      if (!result.rows.length) {

        return res.json({

          ok: true,

          duplicate: true,

          message:
            "You already reported this video."

        });

      }


      return res.json({

        ok: true,

        duplicate: false,

        message:
          "Report submitted."

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Report failed."

      });

    }

  }
);


// =========================================================
// FOLLOW
// =========================================================

app.post(
  "/api/users/:id/follow",
  async (req, res) => {

    try {

      const followerId =
        cleanString(
          req.body.user_id,
          100
        );


      const followingId =
        cleanString(
          req.params.id,
          100
        );


      if (
        !followerId ||
        !followingId
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Invalid user."

        });

      }


      if (
        followerId ===
        followingId
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "You cannot follow yourself."

        });

      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_follows
          (
            follower_id,
            following_id
          )

          VALUES
          ($1,$2)

          ON CONFLICT
          (
            follower_id,
            following_id
          )

          DO NOTHING

          RETURNING id
          `,
          [
            followerId,
            followingId
          ]
        );


      if (!result.rows.length) {

        return res.json({

          ok: true,

          following: true,

          already_following: true

        });

      }


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          following_count =
            following_count + 1

        WHERE id = $1
        `,
        [followerId]
      );


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          followers_count =
            followers_count + 1

        WHERE id = $1
        `,
        [followingId]
      );


      return res.json({

        ok: true,

        following: true

      });

    } catch (error) {

      console.error(
        "Follow error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Follow failed."

      });

    }

  }
);


// =========================================================
// UNFOLLOW
// =========================================================

app.post(
  "/api/users/:id/unfollow",
  async (req, res) => {

    try {

      const followerId =
        cleanString(
          req.body.user_id,
          100
        );


      const followingId =
        cleanString(
          req.params.id,
          100
        );


      if (
        !followerId ||
        !followingId
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Invalid user."

        });

      }


      const result =
        await dbQuery(
          `
          DELETE FROM dekhoearn_follows

          WHERE
            follower_id = $1

            AND following_id = $2

          RETURNING id
          `,
          [
            followerId,
            followingId
          ]
        );


      if (!result.rows.length) {

        return res.json({

          ok: true,

          following: false

        });

      }


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          following_count =
            GREATEST(
              following_count - 1,
              0
            )

        WHERE id = $1
        `,
        [followerId]
      );


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          followers_count =
            GREATEST(
              followers_count - 1,
              0
            )

        WHERE id = $1
        `,
        [followingId]
      );


      return res.json({

        ok: true,

        following: false

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unfollow failed."

      });

    }

  }
);


// =========================================================
// CREATOR PROFILE
// =========================================================

app.get(
  "/api/creator/:id",
  async (req, res) => {

    try {

      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      const userResult =
        await dbQuery(
          `
          SELECT
            id,
            name,
            username,
            avatar_url,
            followers_count,
            following_count,
            total_watch_seconds,
            total_videos,
            creator_status,
            creator_applied,
            created_at

          FROM dekhoearn_users

          WHERE id = $1
          `,
          [
            creatorId
          ]
        );


      if (!userResult.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Creator not found."

        });

      }


      const videosResult =
        await dbQuery(
          `
          SELECT *

          FROM dekhoearn_videos

          WHERE
            user_id = $1

            AND status = 'published'

            AND moderation_status <> 'removed'

          ORDER BY
            created_at DESC

          LIMIT 100
          `,
          [
            creatorId
          ]
        );


      return res.json({

        ok: true,

        creator:
          userResult.rows[0],

        videos:
          videosResult.rows

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load creator."

      });

    }

  }
);


// =========================================================
// CREATOR STATS
// =========================================================

app.get(
  "/api/creator/:id/stats",
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT

            u.id,

            u.name,

            u.username,

            u.followers_count,

            u.total_watch_seconds,

            u.total_videos,

            u.creator_status,

            u.creator_applied,

            COALESCE(
              SUM(v.views),
              0
            ) AS total_views,

            COALESCE(
              SUM(v.likes_count),
              0
            ) AS total_likes

          FROM dekhoearn_users u

          LEFT JOIN dekhoearn_videos v
            ON v.user_id = u.id

          WHERE u.id = $1

          GROUP BY
            u.id
          `,
          [
            req.params.id
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Creator not found."

        });

      }


      const row =
        result.rows[0];


      const followers =
        Number(
          row.followers_count || 0
        );


      const watchHours =
        Number(
          row.total_watch_seconds || 0
        ) / 3600;


      const eligible =
        followers >=
        CREATOR_MIN_FOLLOWERS &&

        watchHours >=
        CREATOR_MIN_WATCH_HOURS;


      return res.json({

        ok: true,

        stats: {

          ...row,

          followers,

          watch_hours:
            Number(
              watchHours.toFixed(2)
            ),

          total_views:
            Number(
              row.total_views || 0
            ),

          total_likes:
            Number(
              row.total_likes || 0
            ),

          monetization_eligible:
            eligible,

          requirement: {

            followers:
              CREATOR_MIN_FOLLOWERS,

            watch_hours:
              CREATOR_MIN_WATCH_HOURS

          }

        }

      });

    } catch (error) {

      console.error(
        "Creator stats error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Unable to load creator stats."

      });

    }

  }
);


// =========================================================
// APPLY CREATOR MONETIZATION
// =========================================================

app.post(
  "/api/creator/:id/apply",
  async (req, res) => {

    try {

      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await dbQuery(
          `
          SELECT
            followers_count,
            total_watch_seconds,
            creator_status,
            creator_applied

          FROM dekhoearn_users

          WHERE id = $1
          `,
          [
            creatorId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Creator not found."

        });

      }


      const row =
        result.rows[0];


      const followers =
        Number(
          row.followers_count || 0
        );


      const watchHours =
        Number(
          row.total_watch_seconds || 0
        ) / 3600;


      if (
        followers <
        CREATOR_MIN_FOLLOWERS ||

        watchHours <
        CREATOR_MIN_WATCH_HOURS
      ) {

        return res.status(400).json({

          ok: false,

          eligible: false,

          error:
            "Creator requirements are not met yet.",

          requirement: {

            followers:
              CREATOR_MIN_FOLLOWERS,

            watch_hours:
              CREATOR_MIN_WATCH_HOURS

          },

          current: {

            followers,

            watch_hours:
              Number(
                watchHours.toFixed(2)
              )

          }

        });

      }


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          creator_applied = TRUE,

          creator_status =
            CASE

              WHEN creator_status =
                'approved'

              THEN 'approved'

              ELSE 'pending'

            END,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [creatorId]
      );


      return res.json({

        ok: true,

        eligible: true,

        status:
          "pending"

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Creator application failed."

      });

    }

  }
);


// =========================================================
// CREATOR EARNINGS
// =========================================================

app.get(
  "/api/creator/:id/earnings",
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT *

          FROM dekhoearn_creator_earnings

          WHERE creator_id = $1

          ORDER BY
            created_at DESC

          LIMIT 200
          `,
          [
            req.params.id
          ]
        );


      const totals =
        await dbQuery(
          `
          SELECT

            COALESCE(
              SUM(gross_amount),
              0
            ) AS gross,

            COALESCE(
              SUM(platform_amount),
              0
            ) AS platform,

            COALESCE(
              SUM(creator_amount),
              0
            ) AS creator

          FROM dekhoearn_creator_earnings

          WHERE creator_id = $1
          `,
          [
            req.params.id
          ]
        );


      return res.json({

        ok: true,

        earnings:
          result.rows,

        totals:
          totals.rows[0]

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load earnings."

      });

    }

  }
);


// =========================================================
// PAYOUT ACCOUNT
// =========================================================

app.post(
  "/api/payout-account",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      const accountType =
        cleanString(
          req.body.account_type,
          50
        );


      const holderName =
        cleanString(
          req.body.account_holder_name,
          150
        );


      const providerReference =
        cleanString(
          req.body.provider_reference,
          200
        );


      if (!userId) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id is required."

        });

      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_payout_accounts
          (
            user_id,
            account_type,
            account_holder_name,
            provider_reference
          )

          VALUES
          ($1,$2,$3,$4)

          ON CONFLICT (user_id)

          DO UPDATE SET

            account_type =
              EXCLUDED.account_type,

            account_holder_name =
              EXCLUDED.account_holder_name,

            provider_reference =
              EXCLUDED.provider_reference,

            updated_at =
              NOW()

          RETURNING
            id,
            user_id,
            account_type,
            account_holder_name,
            provider_reference,
            status,
            created_at,
            updated_at
          `,
          [
            userId,
            accountType,
            holderName,
            providerReference
          ]
        );


      return res.json({

        ok: true,

        payout_account:
          result.rows[0]

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Payout account save failed."

      });

    }

  }
);


// =========================================================
// GET PAYOUT ACCOUNT
// =========================================================

app.get(
  "/api/payout-account/:userId",
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT
            id,
            user_id,
            account_type,
            account_holder_name,
            provider_reference,
            status,
            created_at,
            updated_at

          FROM dekhoearn_payout_accounts

          WHERE user_id = $1
          `,
          [
            req.params.userId
          ]
        );


      return res.json({

        ok: true,

        payout_account:
          result.rows[0] ||
          null

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load payout account."

      });

    }

  }
);


// =========================================================
// DAILY REWARD
// =========================================================

app.post(
  "/api/daily/claim",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      const today =
        todayIndia();


      if (!userId) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id is required."

        });

      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_daily_rewards
          (
            user_id,
            reward_date,
            points
          )

          VALUES
          ($1,$2,$3)

          ON CONFLICT
          (
            user_id,
            reward_date
          )

          DO NOTHING

          RETURNING *
          `,
          [
            userId,
            today,
            DAILY_REWARD
          ]
        );


      if (!result.rows.length) {

        return res.json({

          ok: true,

          claimed: false,

          message:
            "Daily reward already claimed today."

        });

      }


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          points =
            points + $2,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          userId,
          DAILY_REWARD
        ]
      );


      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          points,
          type,
          description
        )

        VALUES
        (
          $1,
          $2,
          'daily',
          'Daily reward'
        )
        `,
        [
          userId,
          DAILY_REWARD
        ]
      );


      return res.json({

        ok: true,

        claimed: true,

        points:
          DAILY_REWARD

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Daily reward failed."

      });

    }

  }
);


// =========================================================
// REWARDED AD
// =========================================================

app.post(
  "/api/rewarded-ad/complete",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id,
          100
        );


      if (!userId) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id is required."

        });

      }


      /*
      IMPORTANT:

      This endpoint should only be called after
      a genuine rewarded-ad completion event
      from the actual ad provider.

      Never reward ad clicks.
      */


      await dbQuery(
        `
        INSERT INTO dekhoearn_rewarded_ads
        (
          user_id,
          reward_date,
          points
        )

        VALUES
        ($1,$2,$3)
        `,
        [
          userId,
          todayIndia(),
          REWARDED_AD_POINTS
        ]
      );


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          points =
            points + $2,

          updated_at =
            NOW()

        WHERE id = $1
        `,
        [
          userId,
          REWARDED_AD_POINTS
        ]
      );


      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          points,
          type,
          description
        )

        VALUES
        (
          $1,
          $2,
          'rewarded_ad',
          'Rewarded ad completion'
        )
        `,
        [
          userId,
          REWARDED_AD_POINTS
        ]
      );


      return res.json({

        ok: true,

        points:
          REWARDED_AD_POINTS

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Rewarded ad reward failed."

      });

    }

  }
);


// =========================================================
// REFERRAL
// =========================================================

app.post(
  "/api/referral",
  async (req, res) => {

    try {

      const referrerId =
        cleanString(
          req.body.referrer_id,
          100
        );


      const referredId =
        cleanString(
          req.body.referred_id,
          100
        );


      if (
        !referrerId ||
        !referredId
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "referrer_id and referred_id are required."

        });

      }


      if (
        referrerId ===
        referredId
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Self referral is not allowed."

        });

      }


      const result =
        await dbQuery(
          `
          INSERT INTO dekhoearn_referrals
          (
            referrer_id,
            referred_id,
            reward_points,
            rewarded
          )

          VALUES
          ($1,$2,$3,TRUE)

          ON CONFLICT
          (
            referred_id
          )

          DO NOTHING

          RETURNING *
          `,
          [
            referrerId,
            referredId,
            REFERRAL_REWARD
          ]
        );


      if (!result.rows.length) {

        return res.json({

          ok: true,

          rewarded: false,

          message:
            "Referral already processed."

        });

      }


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          points =
            points + $2

        WHERE id = $1
        `,
        [
          referrerId,
          REFERRAL_REWARD
        ]
      );


      await dbQuery(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          points,
          type,
          reference_id,
          description
        )

        VALUES
        (
          $1,
          $2,
          'referral',
          $3,
          'Referral reward'
        )
        `,
        [
          referrerId,
          REFERRAL_REWARD,
          referredId
        ]
      );


      return res.json({

        ok: true,

        rewarded: true,

        points:
          REFERRAL_REWARD

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Referral failed."

      });

    }

  }
);


// =========================================================
// CREATOR DELETE OWN VIDEO
// =========================================================

app.delete(
  "/api/videos/:id",
  async (req, res) => {

    try {

      const videoId =
        safeInteger(
          req.params.id
        );


      const userId =
        cleanString(
          req.body?.user_id ||
          req.headers["x-user-id"],
          100
        );


      if (!userId) {

        return res.status(400).json({

          ok: false,

          error:
            "user_id is required."

        });

      }


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_videos

          SET
            status = 'deleted',

            updated_at =
              NOW()

          WHERE
            id = $1

            AND user_id = $2

          RETURNING *
          `,
          [
            videoId,
            userId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Video not found or you are not the owner."

        });

      }


      await dbQuery(
        `
        UPDATE dekhoearn_users

        SET
          total_videos =
            GREATEST(
              total_videos - 1,
              0
            )

        WHERE id = $1
        `,
        [userId]
      );


      return res.json({

        ok: true,

        deleted: true

      });

    } catch (error) {

      console.error(
        "Delete video error:",
        error
      );


      return res.status(500).json({

        ok: false,

        error:
          "Video delete failed."

      });

    }

  }
);


// =========================================================
// ADMIN DASHBOARD
// =========================================================

app.get(
  "/api/admin/dashboard",
  requireAdmin,
  async (req, res) => {

    try {

      const users =
        await dbQuery(
          `
          SELECT
            COUNT(*)::BIGINT AS count

          FROM dekhoearn_users
          `
        );


      const videos =
        await dbQuery(
          `
          SELECT
            COUNT(*)::BIGINT AS count

          FROM dekhoearn_videos

          WHERE status <> 'deleted'
          `
        );


      const views =
        await dbQuery(
          `
          SELECT

            COALESCE(
              SUM(views),
              0
            ) AS count

          FROM dekhoearn_videos
          `
        );


      const reports =
        await dbQuery(
          `
          SELECT
            COUNT(*)::BIGINT AS count

          FROM dekhoearn_reports
          `
        );


      const pendingCreators =
        await dbQuery(
          `
          SELECT
            COUNT(*)::BIGINT AS count

          FROM dekhoearn_users

          WHERE
            creator_status = 'pending'
          `
        );


      return res.json({

        ok: true,

        dashboard: {

          users:
            Number(
              users.rows[0].count
            ),

          videos:
            Number(
              videos.rows[0].count
            ),

          views:
            Number(
              views.rows[0].count
            ),

          reports:
            Number(
              reports.rows[0].count
            ),

          pending_creators:
            Number(
              pendingCreators.rows[0].count
            )

        }

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Dashboard failed."

      });

    }

  }
);


// =========================================================
// ADMIN REPORTS
// =========================================================

app.get(
  "/api/admin/reports",
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT

            r.*,

            v.title AS video_title,

            v.video_url,

            u.name AS reporter_name

          FROM dekhoearn_reports r

          LEFT JOIN dekhoearn_videos v
            ON v.id = r.video_id

          LEFT JOIN dekhoearn_users u
            ON u.id = r.user_id

          ORDER BY
            r.created_at DESC

          LIMIT 500
          `
        );


      return res.json({

        ok: true,

        reports:
          result.rows

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load reports."

      });

    }

  }
);


// =========================================================
// ADMIN REMOVE VIDEO
// =========================================================

app.post(
  "/api/admin/videos/:id/remove",
  requireAdmin,
  async (req, res) => {

    try {

      const videoId =
        safeInteger(
          req.params.id
        );


      const reason =
        cleanString(
          req.body.reason,
          500
        );


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_videos

          SET
            moderation_status =
              'removed',

            status =
              'removed',

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            videoId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Video not found."

        });

      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_action,
          target_type,
          target_id,
          reason
        )

        VALUES
        (
          'remove_video',
          'video',
          $1,
          $2
        )
        `,
        [
          String(videoId),
          reason
        ]
      );


      return res.json({

        ok: true,

        removed: true

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Admin video removal failed."

      });

    }

  }
);


// =========================================================
// ADMIN RESTORE VIDEO
// =========================================================

app.post(
  "/api/admin/videos/:id/restore",
  requireAdmin,
  async (req, res) => {

    try {

      const videoId =
        safeInteger(
          req.params.id
        );


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_videos

          SET
            moderation_status =
              'normal',

            status =
              'published',

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            videoId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Video not found."

        });

      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_action,
          target_type,
          target_id,
          reason
        )

        VALUES
        (
          'restore_video',
          'video',
          $1,
          $2
        )
        `,
        [
          String(videoId),
          cleanString(
            req.body.reason,
            500
          )
        ]
      );


      return res.json({

        ok: true,

        restored: true

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Admin restore failed."

      });

    }

  }
);


// =========================================================
// ADMIN CREATOR APPROVE
// =========================================================

app.post(
  "/api/admin/creator/:id/approve",
  requireAdmin,
  async (req, res) => {

    try {

      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_users

          SET
            creator_status =
              'approved',

            creator_applied =
              TRUE,

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            creatorId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Creator not found."

        });

      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_action,
          target_type,
          target_id,
          reason
        )

        VALUES
        (
          'approve_creator',
          'user',
          $1,
          $2
        )
        `,
        [
          creatorId,
          cleanString(
            req.body.reason,
            500
          )
        ]
      );


      return res.json({

        ok: true,

        approved: true

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Creator approval failed."

      });

    }

  }
);


// =========================================================
// ADMIN CREATOR REJECT
// =========================================================

app.post(
  "/api/admin/creator/:id/reject",
  requireAdmin,
  async (req, res) => {

    try {

      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await dbQuery(
          `
          UPDATE dekhoearn_users

          SET
            creator_status =
              'rejected',

            updated_at =
              NOW()

          WHERE id = $1

          RETURNING *
          `,
          [
            creatorId
          ]
        );


      if (!result.rows.length) {

        return res.status(404).json({

          ok: false,

          error:
            "Creator not found."

        });

      }


      await dbQuery(
        `
        INSERT INTO dekhoearn_admin_actions
        (
          admin_action,
          target_type,
          target_id,
          reason
        )

        VALUES
        (
          'reject_creator',
          'user',
          $1,
          $2
        )
        `,
        [
          creatorId,
          cleanString(
            req.body.reason,
            500
          )
        ]
      );


      return res.json({

        ok: true,

        rejected: true

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Creator rejection failed."

      });

    }

  }
);


// =========================================================
// ADMIN USERS
// =========================================================

app.get(
  "/api/admin/users",
  requireAdmin,
  async (req, res) => {

    try {

      const limit =
        Math.min(
          Math.max(
            safeInteger(
              req.query.limit,
              100
            ),
            1
          ),
          500
        );


      const result =
        await dbQuery(
          `
          SELECT
            id,
            name,
            username,
            email,
            points,
            followers_count,
            following_count,
            total_watch_seconds,
            total_videos,
            creator_status,
            creator_applied,
            created_at

          FROM dekhoearn_users

          ORDER BY
            created_at DESC

          LIMIT $1
          `,
          [
            limit
          ]
        );


      return res.json({

        ok: true,

        users:
          result.rows

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load users."

      });

    }

  }
);


// =========================================================
// ADMIN VIDEOS
// =========================================================

app.get(
  "/api/admin/videos",
  requireAdmin,
  async (req, res) => {

    try {

      const result =
        await dbQuery(
          `
          SELECT

            v.*,

            u.name AS creator_name,

            u.username AS creator_username

          FROM dekhoearn_videos v

          LEFT JOIN dekhoearn_users u
            ON u.id = v.user_id

          ORDER BY
            v.created_at DESC

          LIMIT 500
          `
        );


      return res.json({

        ok: true,

        videos:
          result.rows

      });

    } catch (error) {

      return res.status(500).json({

        ok: false,

        error:
          "Unable to load admin videos."

      });

    }

  }
);


// =========================================================
// FRONTEND ROOT
// =========================================================

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );

  }
);


// =========================================================
// API 404
// =========================================================

app.use(
  "/api",
  (req, res) => {

    return res.status(404).json({

      ok: false,

      error:
        "API endpoint not found.",

      path:
        req.originalUrl

    });

  }
);


// =========================================================
// GLOBAL ERROR
// =========================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "GLOBAL ERROR:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(error);

    }


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error."

    });

  }
);


// =========================================================
// START SERVER
// =========================================================

async function startServer() {

  try {

    await initDatabase();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "========================================"
        );

        console.log(
          `DekhoEarn v${SERVER_VERSION}`
        );

        console.log(
          `Server running on port ${PORT}`
        );

        console.log(
          `Database: ${
            pool
              ? "configured"
              : "missing"
          }`
        );

        console.log(
          `Cloudinary: ${
            CLOUDINARY_CLOUD_NAME &&
            CLOUDINARY_API_KEY &&
            CLOUDINARY_API_SECRET
              ? "configured"
              : "missing"
          }`
        );

        console.log(
          `Max video size: ${
            MAX_VIDEO_SIZE /
            1024 /
            1024
          } MB`
        );

        console.log(
          "Static frontend: enabled"
        );

        console.log(
          "Cloudinary signed upload: enabled"
        );

        console.log(
          "========================================"
        );

      }
    );

  } catch (error) {

    console.error(
      "SERVER START ERROR:",
      error
    );


    process.exit(1);

  }

}


startServer();
