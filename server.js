/*
=========================================================
 DEKHOEARN SERVER
 Version 2.3.0
 --------------------------------------------------------
 Video Earning Platform
 --------------------------------------------------------
 FEATURES
 - User System
 - Video Feed
 - Video Watch + Points
 - Like / Comment / Report
 - Follow / Unfollow
 - Daily Reward
 - Rewarded Ads
 - Points History
 - My Videos
 - Creator Dashboard
 - Monetization
 - Gallery Video Upload
 - Cloudinary Signed Upload
 - Cloudinary Metadata
 - Neon PostgreSQL
 - 100 MB Frontend Upload Compatibility
 - PWA / Static Frontend Support
 - Mobile Friendly
 --------------------------------------------------------
 UPLOAD FLOW

 Browser
    ↓
 /api/cloudinary/signature
    ↓
 Cloudinary Direct Upload
    ↓
 secure_url + public_id + metadata
    ↓
 /api/videos
    ↓
 Neon PostgreSQL
    ↓
 Published Video
=========================================================
*/

"use strict";


/* ======================================================
   DEPENDENCIES
====================================================== */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");


/* ======================================================
   SERVER CONFIG
====================================================== */

const app = express();

const PORT =
  Number(process.env.PORT) || 10000;

const SERVER_VERSION =
  "2.3.0";

const MAX_BODY_SIZE =
  "2mb";


/* ======================================================
   ENVIRONMENT
====================================================== */

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "";

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || "";

const CLOUDINARY_API_KEY =
  process.env.CLOUDINARY_API_KEY || "";

const CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || "";

const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER || "";


/* ======================================================
   DATABASE
====================================================== */

let pool = null;

if (DATABASE_URL) {

  pool = new Pool({
    connectionString:
      DATABASE_URL,

    ssl: {
      rejectUnauthorized: false
    },

    max: 10,

    idleTimeoutMillis:
      30000,

    connectionTimeoutMillis:
      10000
  });

}


/* ======================================================
   EXPRESS CONFIG
====================================================== */

app.disable("x-powered-by");


app.use(
  cors({
    origin: true,
    credentials: true
  })
);


app.use(
  express.json({
    limit: MAX_BODY_SIZE
  })
);


app.use(
  express.urlencoded({
    extended: true,
    limit: MAX_BODY_SIZE
  })
);


/* ======================================================
   STATIC FRONTEND
====================================================== */

/*
  IMPORTANT

  This allows Render to serve:

  index.html
  style.css
  app.js
  manifest.json
  service-worker.js
  icons
  etc.

  Without this, frontend files can return 404.
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


/* ======================================================
   BASIC HELPERS
====================================================== */

function cleanString(
  value,
  maxLength = 500
) {

  return String(
    value ?? ""
  )
    .trim()
    .slice(0, maxLength);
}


function numberValue(
  value,
  fallback = 0
) {

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}


function getUserId(req) {

  return cleanString(
    req.headers["x-user-id"] ||
    req.body?.user_id ||
    req.query?.user_id ||
    "",
    100
  );
}


function isValidHttpUrl(value) {

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


async function query(
  text,
  params = []
) {

  if (!pool) {

    throw new Error(
      "DATABASE_URL configured nahi hai."
    );

  }

  return pool.query(
    text,
    params
  );
}


/* ======================================================
   CLOUDINARY SIGNATURE HELPER
====================================================== */

function createCloudinarySignature(
  params
) {

  if (!CLOUDINARY_API_SECRET) {

    throw new Error(
      "CLOUDINARY_API_SECRET configured nahi hai."
    );

  }


  const stringToSign =
    Object.keys(params)
      .sort()
      .filter(
        key =>
          params[key] !== undefined &&
          params[key] !== null &&
          params[key] !== ""
      )
      .map(
        key =>
          `${key}=${params[key]}`
      )
      .join("&");


  return crypto
    .createHash("sha1")
    .update(
      stringToSign +
      CLOUDINARY_API_SECRET
    )
    .digest("hex");
}


/* ======================================================
   HEALTH
====================================================== */

app.get(
  "/health",
  async (req, res) => {

    let database =
      false;

    try {

      if (pool) {

        await query(
          "SELECT 1"
        );

        database = true;

      }

    } catch {

      database = false;

    }


    res.json({
      ok: true,
      app: "DekhoEarn",
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
      timestamp:
        new Date().toISOString()
    });

  }
);


/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

async function initDatabase() {

  if (!pool) {

    console.log(
      "⚠️ DATABASE_URL not configured."
    );

    return;

  }


  console.log(
    "📦 Initializing DekhoEarn database..."
  );


  /* ====================================================
     USERS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_users (
      id BIGSERIAL PRIMARY KEY,

      username TEXT UNIQUE,

      first_name TEXT DEFAULT '',

      points BIGINT NOT NULL DEFAULT 0,

      videos_watched BIGINT NOT NULL DEFAULT 0,

      today_earned BIGINT NOT NULL DEFAULT 0,

      followers BIGINT NOT NULL DEFAULT 0,

      watch_hours NUMERIC(18,3)
        NOT NULL DEFAULT 0,

      referral_code TEXT UNIQUE,

      referred_by TEXT,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     VIDEOS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_videos (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      title TEXT NOT NULL,

      description TEXT DEFAULT '',

      video_url TEXT NOT NULL,

      thumbnail_url TEXT DEFAULT '',

      cloudinary_public_id TEXT DEFAULT '',

      cloudinary_resource_type TEXT
        DEFAULT 'video',

      cloudinary_format TEXT
        DEFAULT '',

      duration NUMERIC(18,3)
        DEFAULT 0,

      bytes BIGINT
        DEFAULT 0,

      views BIGINT
        NOT NULL DEFAULT 0,

      likes_count BIGINT
        NOT NULL DEFAULT 0,

      comments_count BIGINT
        NOT NULL DEFAULT 0,

      watch_seconds BIGINT
        NOT NULL DEFAULT 0,

      status TEXT
        NOT NULL DEFAULT 'published',

      moderation_status TEXT
        NOT NULL DEFAULT 'normal',

      duplicate_warning BOOLEAN
        NOT NULL DEFAULT FALSE,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     VIDEO VIEWS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_video_views (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      watch_seconds BIGINT
        NOT NULL DEFAULT 0,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     LIKES
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_likes (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(user_id, video_id)
    )
  `);


  /* ====================================================
     COMMENTS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_comments (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      comment TEXT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     REPORTS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_reports (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      video_id BIGINT NOT NULL,

      reason TEXT NOT NULL,

      status TEXT
        NOT NULL DEFAULT 'open',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     FOLLOWS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_follows (
      id BIGSERIAL PRIMARY KEY,

      follower_id TEXT NOT NULL,

      creator_id TEXT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(follower_id, creator_id)
    )
  `);


  /* ====================================================
     POINT LEDGER
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_points_ledger (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      points BIGINT NOT NULL,

      type TEXT DEFAULT '',

      description TEXT DEFAULT '',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     DAILY REWARDS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_daily_rewards (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      reward_date DATE NOT NULL,

      points BIGINT NOT NULL DEFAULT 10,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(user_id, reward_date)
    )
  `);


  /* ====================================================
     REWARDED ADS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_rewarded_ads (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      points BIGINT NOT NULL DEFAULT 5,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     REFERRALS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_referrals (
      id BIGSERIAL PRIMARY KEY,

      referrer_id TEXT NOT NULL,

      referred_id TEXT NOT NULL,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      UNIQUE(referrer_id, referred_id)
    )
  `);


  /* ====================================================
     CREATOR EARNINGS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_creator_earnings (
      id BIGSERIAL PRIMARY KEY,

      creator_id TEXT NOT NULL,

      video_id BIGINT,

      amount NUMERIC(18,6)
        NOT NULL DEFAULT 0,

      status TEXT
        NOT NULL DEFAULT 'pending',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     PAYOUT ACCOUNTS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_payout_accounts (
      id BIGSERIAL PRIMARY KEY,

      user_id TEXT NOT NULL,

      method TEXT DEFAULT '',

      account_name TEXT DEFAULT '',

      account_details TEXT DEFAULT '',

      status TEXT
        NOT NULL DEFAULT 'pending',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     ADMIN ACTIONS
  ==================================================== */

  await query(`
    CREATE TABLE IF NOT EXISTS dekhoearn_admin_actions (
      id BIGSERIAL PRIMARY KEY,

      admin_key TEXT DEFAULT '',

      action TEXT DEFAULT '',

      target_id TEXT DEFAULT '',

      details TEXT DEFAULT '',

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);


  /* ====================================================
     MIGRATIONS
  ==================================================== */

  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    cloudinary_resource_type TEXT
    DEFAULT 'video'
  `);


  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    cloudinary_format TEXT
    DEFAULT ''
  `);


  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    duration NUMERIC(18,3)
    DEFAULT 0
  `);


  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    bytes BIGINT
    DEFAULT 0
  `);


  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    thumbnail_url TEXT
    DEFAULT ''
  `);


  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    moderation_status TEXT
    DEFAULT 'normal'
  `);


  await query(`
    ALTER TABLE dekhoearn_videos
    ADD COLUMN IF NOT EXISTS
    duplicate_warning BOOLEAN
    DEFAULT FALSE
  `);


  /* ====================================================
     INDEXES
  ==================================================== */

  await query(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_videos_created
    ON dekhoearn_videos(created_at DESC)
  `);


  await query(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_videos_user
    ON dekhoearn_videos(user_id)
  `);


  await query(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_views_video
    ON dekhoearn_video_views(video_id)
  `);


  await query(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_comments_video
    ON dekhoearn_comments(video_id)
  `);


  await query(`
    CREATE INDEX IF NOT EXISTS
    idx_dekhoearn_ledger_user
    ON dekhoearn_points_ledger(user_id)
  `);


  console.log(
    "✅ Database ready."
  );

}


/* ======================================================
   USER CREATE / LOGIN
====================================================== */

app.post(
  "/api/user",
  async (req, res) => {

    try {

      const username =
        cleanString(
          req.body.username,
          100
        ) || null;


      const firstName =
        cleanString(
          req.body.first_name,
          100
        );


      const referralCode =
        cleanString(
          req.body.referral_code,
          100
        ) || null;


      /*
        Existing user by username
      */

      if (username) {

        const existing =
          await query(
            `
            SELECT *
            FROM dekhoearn_users
            WHERE username = $1
            LIMIT 1
            `,
            [username]
          );


        if (
          existing.rows.length
        ) {

          return res.json({
            ok: true,
            user:
              existing.rows[0]
          });

        }

      }


      const generatedReferral =
        "DEKHO" +
        crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase();


      const result =
        await query(
          `
          INSERT INTO dekhoearn_users
          (
            username,
            first_name,
            referral_code,
            referred_by
          )
          VALUES
          ($1,$2,$3,$4)
          RETURNING *
          `,
          [
            username,
            firstName,
            generatedReferral,
            referralCode
          ]
        );


      const user =
        result.rows[0];


      /*
        Referral reward
      */

      if (referralCode) {

        const referrer =
          await query(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE referral_code = $1
            LIMIT 1
            `,
            [referralCode]
          );


        if (
          referrer.rows.length &&
          String(
            referrer.rows[0].id
          ) !== String(user.id)
        ) {

          const referrerId =
            String(
              referrer.rows[0].id
            );


          await query(
            `
            INSERT INTO dekhoearn_referrals
            (
              referrer_id,
              referred_id
            )
            VALUES ($1,$2)
            ON CONFLICT DO NOTHING
            `,
            [
              referrerId,
              String(user.id)
            ]
          );


          await query(
            `
            UPDATE dekhoearn_users
            SET points = points + 15,
                updated_at = NOW()
            WHERE id = $1
            `,
            [referrerId]
          );


          await query(
            `
            INSERT INTO dekhoearn_points_ledger
            (
              user_id,
              points,
              type,
              description
            )
            VALUES
            ($1,15,'referral','Referral reward')
            `,
            [referrerId]
          );

        }

      }


      res.json({
        ok: true,
        user
      });


    } catch (error) {

      console.error(
        "Create user:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "User create nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   GET USER
====================================================== */

app.get(
  "/api/user/:id",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await query(
          `
          SELECT *
          FROM dekhoearn_users
          WHERE id::text = $1
          LIMIT 1
          `,
          [userId]
        );


      if (
        !result.rows.length
      ) {

        return res.status(404).json({
          ok: false,
          error: "User nahi mila."
        });

      }


      const user =
        result.rows[0];


      const creatorResult =
        await query(
          `
          SELECT
            u.id,
            u.followers,
            u.watch_hours,

            COUNT(v.id)::BIGINT
              AS videos_count

          FROM dekhoearn_users u

          LEFT JOIN dekhoearn_videos v
            ON v.user_id = u.id::text
           AND v.status = 'published'

          WHERE u.id::text = $1

          GROUP BY
            u.id,
            u.followers,
            u.watch_hours
          `,
          [userId]
        );


      const creator =
        creatorResult.rows[0] ||
        {};


      res.json({
        ok: true,
        user,
        creator
      });


    } catch (error) {

      console.error(
        "Get user:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "User load nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

app.post(
  "/api/cloudinary/signature",
  async (req, res) => {

    try {

      if (
        !CLOUDINARY_CLOUD_NAME ||
        !CLOUDINARY_API_KEY ||
        !CLOUDINARY_API_SECRET
      ) {

        return res.status(500).json({
          ok: false,
          error:
            "Cloudinary environment variables configured nahi hain."
        });

      }


      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(400).json({
          ok: false,
          error:
            "User session missing hai."
        });

      }


      /*
        Verify user if database exists.
      */

      if (pool) {

        const user =
          await query(
            `
            SELECT id
            FROM dekhoearn_users
            WHERE id::text = $1
            LIMIT 1
            `,
            [userId]
          );


        if (
          !user.rows.length
        ) {

          return res.status(404).json({
            ok: false,
            error:
              "User account nahi mila."
          });

        }

      }


      const timestamp =
        Math.floor(
          Date.now() / 1000
        );


      const signParams = {
        timestamp
      };


      if (CLOUDINARY_FOLDER) {

        signParams.folder =
          CLOUDINARY_FOLDER;

      }


      const signature =
        createCloudinarySignature(
          signParams
        );


      const response = {
        ok: true,

        cloud_name:
          CLOUDINARY_CLOUD_NAME,

        api_key:
          CLOUDINARY_API_KEY,

        timestamp,

        signature,

        resource_type:
          "video"
      };


      if (CLOUDINARY_FOLDER) {

        response.folder =
          CLOUDINARY_FOLDER;

      }


      res.json(
        response
      );


    } catch (error) {

      console.error(
        "Cloudinary signature:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Cloudinary signature generate nahi hui."
      });

    }

  }
);


/* ======================================================
   CREATE VIDEO
   CLOUDINARY → NEON
====================================================== */

app.post(
  "/api/videos",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          req.body.creator_id ||
          getUserId(req),
          100
        );


      if (!userId) {

        return res.status(400).json({
          ok: false,
          error:
            "User ID required hai."
        });

      }


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


      const publicId =
        cleanString(
          req.body.cloudinary_public_id,
          1000
        );


      const resourceType =
        cleanString(
          req.body.cloudinary_resource_type ||
          "video",
          50
        );


      const format =
        cleanString(
          req.body.cloudinary_format,
          50
        );


      const duration =
        Math.max(
          0,
          numberValue(
            req.body.duration,
            0
          )
        );


      const bytes =
        Math.max(
          0,
          Math.floor(
            numberValue(
              req.body.bytes,
              0
            )
          )
        );


      if (!title) {

        return res.status(400).json({
          ok: false,
          error:
            "Video title required hai."
        });

      }


      if (!videoUrl) {

        return res.status(400).json({
          ok: false,
          error:
            "Video URL required hai."
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
            "Video URL invalid hai."
        });

      }


      /*
        User verify
      */

      const userResult =
        await query(
          `
          SELECT id
          FROM dekhoearn_users
          WHERE id::text = $1
          LIMIT 1
          `,
          [userId]
        );


      if (
        !userResult.rows.length
      ) {

        return res.status(404).json({
          ok: false,
          error:
            "User account nahi mila."
        });

      }


      /*
        Duplicate Cloudinary URL warning.
        We don't block the upload.
      */

      const duplicate =
        await query(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE video_url = $1
          LIMIT 1
          `,
          [videoUrl]
        );


      const duplicateWarning =
        duplicate.rows.length > 0;


      /*
        Generate Cloudinary thumbnail
        when possible.
      */

      let finalThumbnail =
        thumbnailUrl;


      if (
        !finalThumbnail &&
        publicId
      ) {

        /*
          Cloudinary video poster URL.

          Example:
          https://res.cloudinary.com/cloud/video/upload/
          so_auto,so_0/...
        */

        finalThumbnail =
          `https://res.cloudinary.com/${encodeURIComponent(
            CLOUDINARY_CLOUD_NAME
          )}/video/upload/so_0/${publicId}.jpg`;

      }


      const result =
        await query(
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
            status,
            moderation_status,
            duplicate_warning
          )
          VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            'published',
            'normal',
            $11
          )
          RETURNING *
          `,
          [
            userId,
            title,
            description,
            videoUrl,
            finalThumbnail,
            publicId,
            resourceType,
            format,
            duration,
            bytes,
            duplicateWarning
          ]
        );


      const video =
        result.rows[0];


      res.status(201).json({
        ok: true,
        message:
          "Video successfully published.",
        video
      });


    } catch (error) {

      console.error(
        "Create video:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Video database mein save nahi hua."
      });

    }

  }
);


/* ======================================================
   VIDEO FEED
====================================================== */

app.get(
  "/api/videos",
  async (req, res) => {

    try {

      const creatorId =
        cleanString(
          req.query.creator_id ||
          req.query.user_id ||
          "",
          100
        );


      let sql = `
        SELECT
          v.*,

          u.username,
          u.first_name,

          u.username AS creator_name

        FROM dekhoearn_videos v

        LEFT JOIN dekhoearn_users u
          ON u.id::text = v.user_id

        WHERE v.status = 'published'
      `;


      const params = [];


      if (creatorId) {

        params.push(
          creatorId
        );


        sql += `
          AND v.user_id = $1
        `;

      }


      sql += `
        ORDER BY v.created_at DESC
        LIMIT 100
      `;


      const result =
        await query(
          sql,
          params
        );


      res.json({
        ok: true,
        videos:
          result.rows
      });


    } catch (error) {

      console.error(
        "Video feed:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Videos load nahi ho paaye."
      });

    }

  }
);


/* ======================================================
   SINGLE VIDEO
====================================================== */

app.get(
  "/api/videos/:id",
  async (req, res) => {

    try {

      const videoId =
        numberValue(
          req.params.id,
          0
        );


      const result =
        await query(
          `
          SELECT
            v.*,

            u.username,
            u.first_name,

            u.username AS creator_name

          FROM dekhoearn_videos v

          LEFT JOIN dekhoearn_users u
            ON u.id::text = v.user_id

          WHERE v.id = $1

          LIMIT 1
          `,
          [videoId]
        );


      if (
        !result.rows.length
      ) {

        return res.status(404).json({
          ok: false,
          error:
            "Video nahi mila."
        });

      }


      res.json({
        ok: true,
        video:
          result.rows[0]
      });


    } catch (error) {

      console.error(
        "Single video:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Video load nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   DELETE VIDEO
====================================================== */

app.delete(
  "/api/videos/:id",
  async (req, res) => {

    try {

      const videoId =
        numberValue(
          req.params.id,
          0
        );


      const userId =
        getUserId(req);


      if (!userId) {

        return res.status(401).json({
          ok: false,
          error:
            "User session missing hai."
        });

      }


      const video =
        await query(
          `
          SELECT *
          FROM dekhoearn_videos
          WHERE id = $1
          LIMIT 1
          `,
          [videoId]
        );


      if (
        !video.rows.length
      ) {

        return res.status(404).json({
          ok: false,
          error:
            "Video nahi mila."
        });

      }


      if (
        String(
          video.rows[0].user_id
        ) !== String(userId)
      ) {

        return res.status(403).json({
          ok: false,
          error:
            "Aap sirf apna video delete kar sakte hain."
        });

      }


      await query(
        `
        DELETE FROM dekhoearn_videos
        WHERE id = $1
        `,
        [videoId]
      );


      res.json({
        ok: true,
        message:
          "Video deleted."
      });


    } catch (error) {

      console.error(
        "Delete video:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Video delete nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   WATCH COMPLETE
====================================================== */

app.post(
  "/api/watch/complete",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      const videoId =
        numberValue(
          req.body.video_id,
          0
        );


      const watchSeconds =
        Math.max(
          0,
          Math.floor(
            numberValue(
              req.body.watch_seconds,
              0
            )
          )
        );


      if (
        !userId ||
        !videoId
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "User aur video required hai."
        });

      }


      if (
        watchSeconds < 10
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "At least 10 seconds watch karein."
        });

      }


      const video =
        await query(
          `
          SELECT id
          FROM dekhoearn_videos
          WHERE id = $1
          LIMIT 1
          `,
          [videoId]
        );


      if (
        !video.rows.length
      ) {

        return res.status(404).json({
          ok: false,
          error:
            "Video nahi mila."
        });

      }


      /*
        One watch record per completion.
      */

      await query(
        `
        INSERT INTO dekhoearn_video_views
        (
          user_id,
          video_id,
          watch_seconds
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          userId,
          videoId,
          watchSeconds
        ]
      );


      const reward =
        1;


      await query(
        `
        UPDATE dekhoearn_users
        SET
          points = points + $1,
          videos_watched =
            videos_watched + 1,
          today_earned =
            today_earned + $1,
          updated_at = NOW()
        WHERE id::text = $2
        `,
        [
          reward,
          userId
        ]
      );


      await query(
        `
        INSERT INTO dekhoearn_points_ledger
        (
          user_id,
          points,
          type,
          description
        )
        VALUES
        ($1,$2,'watch','Video watch reward')
        `,
        [
          userId,
          reward
        ]
      );


      await query(
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


      res.json({
        ok: true,
        reward,
        points_added:
          reward
      });


    } catch (error) {

      console.error(
        "Watch complete:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Watch reward process nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   LIKE / UNLIKE
====================================================== */

app.post(
  "/api/videos/:id/like",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      const videoId =
        numberValue(
          req.params.id,
          0
        );


      if (!userId) {

        return res.status(401).json({
          ok: false,
          error:
            "User session missing hai."
        });

      }


      const existing =
        await query(
          `
          SELECT id
          FROM dekhoearn_likes
          WHERE user_id = $1
            AND video_id = $2
          LIMIT 1
          `,
          [
            userId,
            videoId
          ]
        );


      if (
        existing.rows.length
      ) {

        await query(
          `
          DELETE FROM dekhoearn_likes
          WHERE user_id = $1
            AND video_id = $2
          `,
          [
            userId,
            videoId
          ]
        );


        await query(
          `
          UPDATE dekhoearn_videos
          SET
            likes_count =
              GREATEST(
                0,
                likes_count - 1
              ),
            updated_at = NOW()
          WHERE id = $1
          `,
          [videoId]
        );


        return res.json({
          ok: true,
          liked: false,
          message:
            "Like removed."
        });

      }


      await query(
        `
        INSERT INTO dekhoearn_likes
        (
          user_id,
          video_id
        )
        VALUES
        ($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [
          userId,
          videoId
        ]
      );


      await query(
        `
        UPDATE dekhoearn_videos
        SET
          likes_count =
            likes_count + 1,
          updated_at = NOW()
        WHERE id = $1
        `,
        [videoId]
      );


      res.json({
        ok: true,
        liked: true,
        message:
          "Liked ❤️"
      });


    } catch (error) {

      console.error(
        "Like:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Like update nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   COMMENTS GET
====================================================== */

app.get(
  "/api/videos/:id/comments",
  async (req, res) => {

    try {

      const videoId =
        numberValue(
          req.params.id,
          0
        );


      const result =
        await query(
          `
          SELECT
            c.*,

            u.username,
            u.first_name

          FROM dekhoearn_comments c

          LEFT JOIN dekhoearn_users u
            ON u.id::text = c.user_id

          WHERE c.video_id = $1

          ORDER BY
            c.created_at DESC

          LIMIT 200
          `,
          [videoId]
        );


      res.json({
        ok: true,
        comments:
          result.rows
      });


    } catch (error) {

      console.error(
        "Comments:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Comments load nahi ho paaye."
      });

    }

  }
);


/* ======================================================
   ADD COMMENT
====================================================== */

app.post(
  "/api/videos/:id/comments",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      const videoId =
        numberValue(
          req.params.id,
          0
        );


      const comment =
        cleanString(
          req.body.comment ||
          req.body.text,
          1000
        );


      if (
        !userId ||
        !videoId ||
        !comment
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Comment required hai."
        });

      }


      const result =
        await query(
          `
          INSERT INTO dekhoearn_comments
          (
            user_id,
            video_id,
            comment
          )
          VALUES
          ($1,$2,$3)
          RETURNING *
          `,
          [
            userId,
            videoId,
            comment
          ]
        );


      await query(
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
        comment:
          result.rows[0],
        message:
          "Comment added."
      });


    } catch (error) {

      console.error(
        "Add comment:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Comment add nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   REPORT
====================================================== */

app.post(
  "/api/videos/:id/report",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      const videoId =
        numberValue(
          req.params.id,
          0
        );


      const reason =
        cleanString(
          req.body.reason,
          1000
        );


      if (
        !userId ||
        !videoId ||
        !reason
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Report reason required hai."
        });

      }


      await query(
        `
        INSERT INTO dekhoearn_reports
        (
          user_id,
          video_id,
          reason
        )
        VALUES
        ($1,$2,$3)
        `,
        [
          userId,
          videoId,
          reason
        ]
      );


      res.json({
        ok: true,
        message:
          "Report submitted."
      });


    } catch (error) {

      console.error(
        "Report:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Report submit nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   FOLLOW
====================================================== */

app.post(
  "/api/creator/:id/follow",
  async (req, res) => {

    try {

      const followerId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      if (
        !followerId ||
        !creatorId
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Follower aur creator required hain."
        });

      }


      if (
        String(followerId) ===
        String(creatorId)
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Aap khud ko follow nahi kar sakte."
        });

      }


      const inserted =
        await query(
          `
          INSERT INTO dekhoearn_follows
          (
            follower_id,
            creator_id
          )
          VALUES
          ($1,$2)
          ON CONFLICT DO NOTHING
          RETURNING id
          `,
          [
            followerId,
            creatorId
          ]
        );


      if (
        inserted.rows.length
      ) {

        await query(
          `
          UPDATE dekhoearn_users
          SET
            followers =
              followers + 1,
            updated_at = NOW()
          WHERE id::text = $1
          `,
          [creatorId]
        );

      }


      res.json({
        ok: true,
        following: true,
        message:
          "Following."
      });


    } catch (error) {

      console.error(
        "Follow:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Follow nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   UNFOLLOW
====================================================== */

app.delete(
  "/api/creator/:id/follow",
  async (req, res) => {

    try {

      const followerId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      const deleted =
        await query(
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


      if (
        deleted.rows.length
      ) {

        await query(
          `
          UPDATE dekhoearn_users
          SET
            followers =
              GREATEST(
                0,
                followers - 1
              ),
            updated_at = NOW()
          WHERE id::text = $1
          `,
          [creatorId]
        );

      }


      res.json({
        ok: true,
        following: false,
        message:
          "Unfollowed."
      });


    } catch (error) {

      console.error(
        "Unfollow:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Unfollow nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   CREATOR PROFILE / DASHBOARD
====================================================== */

app.get(
  "/api/creator/:id",
  async (req, res) => {

    try {

      const creatorId =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await query(
          `
          SELECT
            u.id,
            u.username,
            u.first_name,
            u.followers,
            u.watch_hours,

            COUNT(v.id)::BIGINT
              AS videos_count,

            COALESCE(
              SUM(v.watch_seconds),
              0
            ) AS total_watch_seconds

          FROM dekhoearn_users u

          LEFT JOIN dekhoearn_videos v
            ON v.user_id = u.id::text
           AND v.status = 'published'

          WHERE u.id::text = $1

          GROUP BY
            u.id,
            u.username,
            u.first_name,
            u.followers,
            u.watch_hours
          `,
          [creatorId]
        );


      if (
        !result.rows.length
      ) {

        return res.status(404).json({
          ok: false,
          error:
            "Creator nahi mila."
        });

      }


      const creator =
        result.rows[0];


      /*
        Calculate current watch hours
        from video watch seconds.
      */

      creator.eligible_watch_hours =
        Number(
          creator.total_watch_seconds ||
          0
        ) / 3600;


      res.json({
        ok: true,
        creator
      });


    } catch (error) {

      console.error(
        "Creator:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Creator stats load nahi ho paaye."
      });

    }

  }
);


/* ======================================================
   MONETIZATION APPLICATION
====================================================== */

async function monetizationHandler(
  req,
  res
) {

  try {

    const creatorId =
      cleanString(
        req.params.id,
        100
      );


    const result =
      await query(
        `
        SELECT
          u.followers,

          COALESCE(
            SUM(v.watch_seconds),
            0
          ) AS watch_seconds

        FROM dekhoearn_users u

        LEFT JOIN dekhoearn_videos v
          ON v.user_id = u.id::text
         AND v.status = 'published'

        WHERE u.id::text = $1

        GROUP BY u.id,u.followers
        `,
        [creatorId]
      );


    if (
      !result.rows.length
    ) {

      return res.status(404).json({
        ok: false,
        error:
          "Creator nahi mila."
      });

    }


    const creator =
      result.rows[0];


    const followers =
      Number(
        creator.followers || 0
      );


    const watchHours =
      Number(
        creator.watch_seconds || 0
      ) / 3600;


    if (
      followers < 1000 ||
      watchHours < 1000
    ) {

      return res.status(400).json({
        ok: false,
        error:
          "Monetization requirements abhi complete nahi hui hain.",
        followers,
        watch_hours:
          watchHours
      });

    }


    /*
      Store application in payout table
      as a simple application record.
    */

    const existing =
      await query(
        `
        SELECT id,status
        FROM dekhoearn_payout_accounts
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [creatorId]
      );


    if (
      existing.rows.length &&
      existing.rows[0].status ===
        "pending"
    ) {

      return res.json({
        ok: true,
        message:
          "Monetization application already pending.",
        status:
          "pending"
      });

    }


    await query(
      `
      INSERT INTO dekhoearn_payout_accounts
      (
        user_id,
        method,
        account_name,
        account_details,
        status
      )
      VALUES
      (
        $1,
        'creator_monetization',
        '',
        '',
        'pending'
      )
      `,
      [creatorId]
    );


    res.json({
      ok: true,
      message:
        "Monetization application submitted.",
      status:
        "pending"
    });


  } catch (error) {

    console.error(
      "Monetization:",
      error
    );


    res.status(500).json({
      ok: false,
      error:
        "Monetization application submit nahi ho paayi."
    });

  }

}


app.post(
  "/api/creator/:id/apply",
  monetizationHandler
);


/*
  Frontend compatibility route.
*/

app.post(
  "/api/creator/:id/monetization/apply",
  monetizationHandler
);


/* ======================================================
   DAILY REWARD
====================================================== */

app.post(
  "/api/daily/claim",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      if (!userId) {

        return res.status(401).json({
          ok: false,
          error:
            "User session missing hai."
        });

      }


      const result =
        await query(
          `
          INSERT INTO dekhoearn_daily_rewards
          (
            user_id,
            reward_date,
            points
          )
          VALUES
          (
            $1,
            CURRENT_DATE,
            10
          )
          ON CONFLICT
          (
            user_id,
            reward_date
          )
          DO NOTHING
          RETURNING id
          `,
          [userId]
        );


      if (
        !result.rows.length
      ) {

        return res.status(400).json({
          ok: false,
          error:
            "Aaj ka daily reward already claim ho chuka hai."
        });

      }


      const reward =
        10;


      await query(
        `
        UPDATE dekhoearn_users
        SET
          points = points + $1,
          today_earned =
            today_earned + $1,
          updated_at = NOW()
        WHERE id::text = $2
        `,
        [
          reward,
          userId
        ]
      );


      await query(
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
          reward
        ]
      );


      res.json({
        ok: true,
        reward,
        points_added:
          reward
      });


    } catch (error) {

      console.error(
        "Daily reward:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Daily reward process nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   REWARDED AD
====================================================== */

app.post(
  "/api/rewarded-ad/complete",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.body.user_id ||
          getUserId(req),
          100
        );


      if (!userId) {

        return res.status(401).json({
          ok: false,
          error:
            "User session missing hai."
        });

      }


      /*
        IMPORTANT

        Real production app mein is endpoint ko
        genuine ad provider server-side verification
        ke saath secure karna chahiye.

        Frontend confirmation ko proof na maana jaye.
      */


      const reward =
        5;


      await query(
        `
        INSERT INTO dekhoearn_rewarded_ads
        (
          user_id,
          points
        )
        VALUES
        ($1,$2)
        `,
        [
          userId,
          reward
        ]
      );


      await query(
        `
        UPDATE dekhoearn_users
        SET
          points = points + $1,
          today_earned =
            today_earned + $1,
          updated_at = NOW()
        WHERE id::text = $2
        `,
        [
          reward,
          userId
        ]
      );


      await query(
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
          'Rewarded advertisement'
        )
        `,
        [
          userId,
          reward
        ]
      );


      res.json({
        ok: true,
        reward,
        points_added:
          reward
      });


    } catch (error) {

      console.error(
        "Rewarded ad:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Rewarded ad reward process nahi ho paaya."
      });

    }

  }
);


/* ======================================================
   POINT HISTORY
====================================================== */

app.get(
  "/api/user/:id/points/history",
  async (req, res) => {

    try {

      const userId =
        cleanString(
          req.params.id,
          100
        );


      const result =
        await query(
          `
          SELECT *
          FROM dekhoearn_points_ledger

          WHERE user_id = $1

          ORDER BY
            created_at DESC

          LIMIT 200
          `,
          [userId]
        );


      res.json({
        ok: true,
        history:
          result.rows
      });


    } catch (error) {

      console.error(
        "Points history:",
        error
      );


      res.status(500).json({
        ok: false,
        error:
          "Points history load nahi ho paayi."
      });

    }

  }
);


/* ======================================================
   ADMIN
====================================================== */

function checkAdmin(req) {

  if (!ADMIN_KEY) {
    return false;
  }


  const provided =
    req.headers["x-admin-key"] ||
    req.body?.admin_key ||
    req.query?.admin_key ||
    "";


  return (
    String(provided) ===
    String(ADMIN_KEY)
  );

}


app.get(
  "/api/admin/videos",
  async (req, res) => {

    if (!checkAdmin(req)) {

      return res.status(403).json({
        ok: false,
        error:
          "Admin access required."
      });

    }


    try {

      const result =
        await query(
          `
          SELECT *
          FROM dekhoearn_videos

          ORDER BY
            created_at DESC

          LIMIT 500
          `
        );


      res.json({
        ok: true,
        videos:
          result.rows
      });


    } catch (error) {

      res.status(500).json({
        ok: false,
        error:
          "Admin videos load failed."
      });

    }

  }
);


/* ======================================================
   API 404
====================================================== */

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({
      ok: false,
      error:
        "API endpoint not found.",
      path:
        req.originalUrl
    });

  }
);


/* ======================================================
   FRONTEND ROOT
====================================================== */

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


/* ======================================================
   ERROR HANDLER
====================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "Express error:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    res.status(500).json({
      ok: false,
      error:
        "Server internal error."
    });

  }
);


/* ======================================================
   DATABASE STARTUP
====================================================== */

async function startServer() {

  try {

    await initDatabase();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "================================================="
        );

        console.log(
          `🚀 DekhoEarn Server v${SERVER_VERSION}`
        );

        console.log(
          `🌐 Port: ${PORT}`
        );

        console.log(
          `📦 Database: ${
            pool
              ? "Configured"
              : "Missing"
          }`
        );

        console.log(
          `☁️ Cloudinary: ${
            CLOUDINARY_CLOUD_NAME &&
            CLOUDINARY_API_KEY &&
            CLOUDINARY_API_SECRET
              ? "Configured"
              : "Missing"
          }`
        );

        console.log(
          `📁 Static frontend: Enabled`
        );

        console.log(
          "================================================="
        );

      }
    );


  } catch (error) {

    console.error(
      "❌ Server startup error:",
      error
    );


    /*
      Keep the process alive when possible,
      so Render can expose the error instead
      of immediately disappearing.
    */

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `⚠️ DekhoEarn running on ${PORT} with startup warning.`
        );

      }
    );

  }

}


/* ======================================================
   GRACEFUL SHUTDOWN
====================================================== */

async function shutdown(
  signal
) {

  console.log(
    `${signal} received. Shutting down...`
  );


  try {

    if (pool) {

      await pool.end();

    }

  } catch (error) {

    console.error(
      "Database shutdown error:",
      error
    );

  }


  process.exit(0);

}


process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);


process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);


/* ======================================================
   UNHANDLED ERRORS
====================================================== */

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "Unhandled rejection:",
      error
    );

  }
);


process.on(
  "uncaughtException",
  error => {

    console.error(
      "Uncaught exception:",
      error
    );

  }
);


/* ======================================================
   START
====================================================== */

startServer();
