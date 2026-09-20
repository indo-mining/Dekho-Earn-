/*
=========================================================
 DEKHOEARN FRONTEND CONTROLLER
 Version 3.0.0
 --------------------------------------------------------
 Compatible with DekhoEarn Server v3.0.0
 Features:
 - User
 - Video Feed
 - Video Player
 - Watch Reward
 - Like / Comment / Report
 - Daily Reward
 - Rewarded Ad
 - Points History
 - Gallery Video Upload
 - Cloudinary Direct Upload
 - Upload Progress
 - Video Preview
 - Neon Metadata Save
 - My Videos
 - Delete Video
 - Creator Stats
 - PWA Install
=========================================================
*/

"use strict";

/* ======================================================
   CONFIG
====================================================== */

const API_BASE = "";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

/* ======================================================
   GLOBAL STATE
====================================================== */

let currentUser = null;
let currentVideo = null;

let watchSeconds = 0;
let watchRewardSent = false;
let watchTimer = null;

let deferredPrompt = null;

let selectedVideoFile = null;
let previewObjectUrl = null;

let uploadBusy = false;

/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function formatNumber(value) {
  const number = Number(value || 0);

  if (number >= 1000000) {
    return (number / 1000000).toFixed(1) + "M";
  }

  if (number >= 1000) {
    return (number / 1000).toFixed(1) + "K";
  }

  return number.toLocaleString();
}

function formatVideoSize(bytes) {
  const size = Number(bytes || 0);

  if (size < 1024) {
    return size + " B";
  }

  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(1) + " KB";
  }

  if (size < 1024 * 1024 * 1024) {
    return (size / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (size / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatDate(date) {
  if (!date) return "";

  try {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

/* ======================================================
   TOAST
====================================================== */

let toastTimer = null;

function showToast(message, type = "normal") {
  let toast = $("toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;

  toast.classList.remove("success", "error", "normal");
  toast.classList.add(type);

  toast.style.display = "block";

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

/* ======================================================
   API HELPER
====================================================== */

async function api(path, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  if (currentUser?.id) {
    config.headers["x-user-id"] = currentUser.id;
  }

  if (options.body !== undefined) {
    config.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }

  const response = await fetch(API_BASE + path, config);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.message ||
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

/* ======================================================
   LOCAL USER
====================================================== */

function saveLocalUser() {
  if (!currentUser) return;

  localStorage.setItem(
    "dekhoearn_user",
    JSON.stringify(currentUser)
  );
}

function loadLocalUser() {
  try {
    const saved = localStorage.getItem("dekhoearn_user");

    if (!saved) return null;

    return JSON.parse(saved);
  } catch {
    localStorage.removeItem("dekhoearn_user");
    return null;
  }
}

/* ======================================================
   USER CREATE
====================================================== */

async function createUser() {
  const savedUser = loadLocalUser();

  if (savedUser?.id) {
    currentUser = savedUser;
    return currentUser;
  }

  const username =
    "Guest" +
    Math.floor(10000 + Math.random() * 89999);

  const firstName = "Guest";

  const referralCode =
    localStorage.getItem("dekhoearn_referral_code") || "";

  const data = await api("/api/user", {
    method: "POST",
    body: {
      username,
      first_name: firstName,
      referral_code: referralCode
    }
  });

  currentUser = data.user;

  saveLocalUser();

  return currentUser;
}

/* ======================================================
   LOAD USER
====================================================== */

async function loadUser() {
  if (!currentUser?.id) return;

  try {
    const data = await api(
      "/api/user/" +
      encodeURIComponent(currentUser.id)
    );

    if (data.user) {
      currentUser = data.user;
      saveLocalUser();
      updateUserUI();
    }
  } catch (error) {
    console.error("loadUser:", error);
  }
}

/* ======================================================
   UPDATE USER UI
====================================================== */

function updateUserUI() {
  if (!currentUser) return;

  const points = Number(currentUser.points || 0);
  const watched = Number(currentUser.watched_videos || 0);
  const today = Number(currentUser.today_earned || 0);
  const videos = Number(currentUser.video_count || 0);
  const views = Number(currentUser.total_views || 0);

  const elements = {
    topPoints: points,
    earnPoints: points,
    earnWatched: watched,
    earnToday: today,
    profilePoints: points,
    profileVideos: videos,
    profileViews: views
  };

  Object.keys(elements).forEach((id) => {
    const element = $(id);

    if (element) {
      element.textContent =
        formatNumber(elements[id]);
    }
  });

  const profileName = $("profileName");

  if (profileName) {
    profileName.textContent =
      currentUser.first_name ||
      currentUser.username ||
      "User";
  }

  const profileId = $("profileId");

  if (profileId) {
    profileId.textContent =
      "User ID: " + currentUser.id;
  }
}

/* ======================================================
   NAVIGATION
====================================================== */

const PAGE_IDS = [
  "homeSection",
  "watchSection",
  "playerSection",
  "earnSection",
  "uploadSection",
  "profileSection",
  "creatorSection"
];

function findPage(name) {
  const aliases = {
    home: [
      "homeSection",
      "homePage",
      "home"
    ],

    watch: [
      "watchSection",
      "watchPage",
      "watch"
    ],

    player: [
      "playerSection",
      "playerPage",
      "player"
    ],

    earn: [
      "earnSection",
      "earnPage",
      "earn"
    ],

    upload: [
      "uploadSection",
      "uploadPage",
      "upload"
    ],

    profile: [
      "profileSection",
      "profilePage",
      "profile"
    ],

    creator: [
      "creatorSection",
      "creatorPage",
      "creator"
    ]
  };

  const list = aliases[name] || [];

  for (const id of list) {
    const element = $(id);

    if (element) {
      return element;
    }
  }

  return null;
}

function showPage(pageName) {
  const target = findPage(pageName);

  document.querySelectorAll(
    ".page-section, .page"
  ).forEach((section) => {
    section.classList.remove("active");
    section.classList.add("hidden");
  });

  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }

  document.querySelectorAll(
    "[data-page], [data-section]"
  ).forEach((button) => {
    const value =
      button.dataset.page ||
      button.dataset.section;

    button.classList.toggle(
      "active",
      value === pageName
    );
  });

  if (pageName === "home") {
    loadVideos();
  }

  if (pageName === "earn") {
    loadPointsHistory();
  }

  if (pageName === "profile") {
    loadMyVideos();
  }

  if (pageName === "creator") {
    loadCreatorStats();
  }
}

/* ======================================================
   NAVIGATION EVENTS
====================================================== */

function setupNavigation() {
  document.addEventListener("click", (event) => {
    const button =
      event.target.closest("[data-page]") ||
      event.target.closest("[data-section]");

    if (!button) return;

    const page =
      button.dataset.page ||
      button.dataset.section;

    if (!page) return;

    event.preventDefault();

    showPage(page);
  });
}

/* ======================================================
   VIDEO THUMBNAIL
====================================================== */

function getThumbnail(video) {
  if (video.thumbnail_url) {
    return video.thumbnail_url;
  }

  if (
    video.cloudinary_public_id &&
    video.cloudinary_resource_type === "video"
  ) {
    return "";
  }

  return "";
}

/* ======================================================
   VIDEO CARD
====================================================== */

function renderVideoCard(video, options = {}) {
  const own =
    options.own === true ||
    String(video.user_id) ===
    String(currentUser?.id);

  const thumbnail =
    getThumbnail(video);

  return `
    <article class="video-card">

      ${
        thumbnail
          ? `
            <img
              class="video-thumb"
              src="${escapeHTML(thumbnail)}"
              alt="${escapeHTML(video.title)}"
              loading="lazy"
              onerror="this.style.display='none'"
            >
          `
          : `
            <div class="video-thumb video-placeholder">
              🎥
            </div>
          `
      }

      <div class="video-info">

        <h3 class="video-title">
          ${escapeHTML(video.title)}
        </h3>

        <p class="video-description">
          ${escapeHTML(
            video.description || ""
          )}
        </p>

        <div class="video-meta">
          <span>
            👤
            ${escapeHTML(
              video.creator_name ||
              video.username ||
              "Creator"
            )}
          </span>

          <span>
            👁️
            ${formatNumber(video.views)}
          </span>

          <span>
            ❤️
            ${formatNumber(video.likes_count)}
          </span>
        </div>

        <div class="video-actions">

          <button
            type="button"
            class="btn primary-btn"
            onclick="openVideo(${Number(video.id)})"
          >
            ▶️ Watch
          </button>

          <button
            type="button"
            class="btn"
            onclick="likeVideo(${Number(video.id)})"
          >
            ❤️ Like
          </button>

          ${
            own
              ? `
                <button
                  type="button"
                  class="btn danger-btn"
                  onclick="deleteVideo(${Number(video.id)})"
                >
                  🗑️ Delete
                </button>
              `
              : ""
          }

        </div>

      </div>

    </article>
  `;
}

/* ======================================================
   LOAD VIDEOS
====================================================== */

async function loadVideos() {
  const feed =
    $("videoFeed") ||
    $("feed") ||
    $("videosList");

  if (!feed) return;

  feed.innerHTML = `
    <div class="loading">
      Videos load ho rahe hain...
    </div>
  `;

  try {
    const data =
      await api("/api/videos");

    const videos =
      Array.isArray(data.videos)
        ? data.videos
        : [];

    if (!videos.length) {
      feed.innerHTML = `
        <div class="empty-state">
          <div>🎥</div>
          <h3>Abhi koi video nahi hai</h3>
          <p>Sabse pehla video aap upload karein.</p>
        </div>
      `;

      return;
    }

    feed.innerHTML =
      videos
        .map((video) =>
          renderVideoCard(video)
        )
        .join("");

  } catch (error) {
    console.error("loadVideos:", error);

    feed.innerHTML = `
      <div class="empty-state">
        <h3>Videos load nahi ho paaye</h3>
        <p>${escapeHTML(error.message)}</p>

        <button
          class="btn primary-btn"
          onclick="loadVideos()"
        >
          🔄 Retry
        </button>
      </div>
    `;
  }
}

/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(videoId) {
  if (!videoId) return;

  try {
    const data =
      await api(
        "/api/videos/" +
        encodeURIComponent(videoId)
      );

    currentVideo = data.video;

    watchSeconds = 0;
    watchRewardSent = false;

    clearInterval(watchTimer);

    renderVideoPlayer();

    showPage("watch");

    await loadComments(videoId);

  } catch (error) {
    console.error("openVideo:", error);

    showToast(
      error.message ||
      "Video open nahi ho paaya",
      "error"
    );
  }
}

/* ======================================================
   RENDER PLAYER
====================================================== */

function renderVideoPlayer() {
  if (!currentVideo) return;

  const container =
    $("videoPlayer") ||
    $("playerBox") ||
    $("playerContainer");

  if (!container) return;

  const videoUrl =
    currentVideo.video_url || "";

  container.innerHTML = `
    <div class="player-card">

      <video
        id="mainVideo"
        class="main-video"
        controls
        playsinline
        preload="metadata"
      >
        <source
          src="${escapeHTML(videoUrl)}"
          type="video/${escapeHTML(
            currentVideo.cloudinary_format ||
            "mp4"
          )}"
        >
      </video>

      <div class="player-info">

        <h2>
          ${escapeHTML(
            currentVideo.title
          )}
        </h2>

        <p>
          ${escapeHTML(
            currentVideo.description || ""
          )}
        </p>

        <div class="player-meta">
          👁️ ${formatNumber(currentVideo.views)}
          &nbsp;&nbsp;
          ❤️ ${formatNumber(currentVideo.likes_count)}
          &nbsp;&nbsp;
          💬 ${formatNumber(currentVideo.comments_count)}
        </div>

        <div class="player-actions">

          <button
            class="btn"
            onclick="likeVideo(${Number(currentVideo.id)})"
          >
            ❤️ Like
          </button>

          <button
            class="btn danger-btn"
            onclick="reportVideo(${Number(currentVideo.id)})"
          >
            ⚠️ Report
          </button>

        </div>

      </div>

    </div>
  `;

  setupWatchTracking();
}

/* ======================================================
   WATCH TRACKING
====================================================== */

function setupWatchTracking() {
  const video =
    $("mainVideo");

  if (!video) return;

  watchSeconds = 0;
  watchRewardSent = false;

  clearInterval(watchTimer);

  video.addEventListener(
    "timeupdate",
    () => {
      watchSeconds =
        Math.floor(video.currentTime);

      if (
        watchSeconds >= 10 &&
        !watchRewardSent
      ) {
        completeWatch();
      }
    }
  );

  video.addEventListener(
    "play",
    () => {
      clearInterval(watchTimer);

      watchTimer = setInterval(() => {
        if (!video.paused) {
          watchSeconds =
            Math.floor(video.currentTime);

          if (
            watchSeconds >= 10 &&
            !watchRewardSent
          ) {
            completeWatch();
          }
        }
      }, 1000);
    }
  );

  video.addEventListener(
    "pause",
    () => {
      clearInterval(watchTimer);
    }
  );

  video.addEventListener(
    "ended",
    () => {
      clearInterval(watchTimer);
    }
  );
}

/* ======================================================
   COMPLETE WATCH
====================================================== */

async function completeWatch() {
  if (
    watchRewardSent ||
    !currentVideo ||
    !currentUser
  ) {
    return;
  }

  watchRewardSent = true;

  try {
    const data =
      await api(
        "/api/watch/complete",
        {
          method: "POST",
          body: {
            video_id:
              currentVideo.id,

            seconds:
              Math.max(
                10,
                watchSeconds
              )
          }
        }
      );

    if (data.user) {
      currentUser = data.user;
      saveLocalUser();
      updateUserUI();
    }

    showToast(
      "🎉 Watch reward mil gaya!",
      "success"
    );

  } catch (error) {
    watchRewardSent = false;

    console.error(
      "completeWatch:",
      error
    );

    showToast(
      error.message ||
      "Reward nahi mila",
      "error"
    );
  }
}

/* ======================================================
   LIKE VIDEO
====================================================== */

async function likeVideo(videoId) {
  if (!currentUser) {
    showToast(
      "Login required",
      "error"
    );

    return;
  }

  try {
    const data =
      await api(
        "/api/videos/" +
        encodeURIComponent(videoId) +
        "/like",
        {
          method: "POST"
        }
      );

    showToast(
      data.liked
        ? "❤️ Video liked"
        : "Like removed",
      "success"
    );

    if (
      currentVideo &&
      Number(currentVideo.id) ===
      Number(videoId)
    ) {
      currentVideo.likes_count =
        Number(currentVideo.likes_count || 0) +
        (data.liked ? 1 : -1);

      renderVideoPlayer();
    }

    loadVideos();

  } catch (error) {
    showToast(
      error.message ||
      "Like failed",
      "error"
    );
  }
}

/* ======================================================
   COMMENTS
====================================================== */

async function loadComments(videoId) {
  const commentsBox =
    $("commentsBox") ||
    $("commentsSection");

  const comments =
    $("comments") ||
    $("commentsList");

  if (!comments) return;

  if (commentsBox) {
    commentsBox.classList.remove("hidden");
  }

  comments.innerHTML = `
    <div class="loading">
      Comments load ho rahe hain...
    </div>
  `;

  try {
    const data =
      await api(
        "/api/videos/" +
        encodeURIComponent(videoId) +
        "/comments"
      );

    const list =
      Array.isArray(data.comments)
        ? data.comments
        : [];

    if (!list.length) {
      comments.innerHTML = `
        <div class="empty-state">
          💬 Abhi koi comment nahi hai.
        </div>
      `;

      return;
    }

    comments.innerHTML =
      list
        .map((comment) => `
          <div class="comment-item">

            <div class="comment-user">
              👤
              ${escapeHTML(
                comment.username ||
                "User"
              )}
            </div>

            <div class="comment-text">
              ${escapeHTML(
                comment.comment
              )}
            </div>

            <div class="comment-date">
              ${formatDate(
                comment.created_at
              )}
            </div>

          </div>
        `)
        .join("");

  } catch (error) {
    console.error(
      "loadComments:",
      error
    );

    comments.innerHTML = `
      <div class="empty-state">
        Comments load nahi ho paaye.
      </div>
    `;
  }
}

/* ======================================================
   SEND COMMENT
====================================================== */

async function sendComment() {
  if (
    !currentVideo ||
    !currentUser
  ) {
    showToast(
      "Video open karein",
      "error"
    );

    return;
  }

  const input =
    $("commentInput") ||
    $("commentText");

  if (!input) return;

  const comment =
    input.value.trim();

  if (!comment) {
    showToast(
      "Comment likhein",
      "error"
    );

    return;
  }

  if (comment.length > 1000) {
    showToast(
      "Comment maximum 1000 characters ka ho sakta hai",
      "error"
    );

    return;
  }

  try {
    await api(
      "/api/videos/" +
      encodeURIComponent(
        currentVideo.id
      ) +
      "/comments",
      {
        method: "POST",
        body: {
          comment
        }
      }
    );

    input.value = "";

    showToast(
      "💬 Comment posted",
      "success"
    );

    await loadComments(
      currentVideo.id
    );

  } catch (error) {
    showToast(
      error.message ||
      "Comment failed",
      "error"
    );
  }
}

/* ======================================================
   REPORT
====================================================== */

async function reportVideo(videoId) {
  let reason =
    window.prompt(
      "Report reason:",
      "Inappropriate content"
    );

  if (reason === null) {
    return;
  }

  reason =
    reason.trim();

  if (!reason) {
    reason = "Other";
  }

  try {
    await api(
      "/api/videos/" +
      encodeURIComponent(videoId) +
      "/report",
      {
        method: "POST",
        body: {
          reason
        }
      }
    );

    showToast(
      "⚠️ Report submitted",
      "success"
    );

  } catch (error) {
    showToast(
      error.message ||
      "Report failed",
      "error"
    );
  }
}

/* ======================================================
   UPLOAD ELEMENTS
====================================================== */

function getUploadElements() {
  return {
    file:
      $("videoFile"),

    fileName:
      $("videoFileName"),

    preview:
      $("uploadPreview"),

    previewVideo:
      $("uploadPreviewVideo"),

    progressBox:
      $("uploadProgressBox"),

    progressBar:
      $("uploadProgressBar"),

    progressText:
      $("uploadProgressText"),

    progressPercent:
      $("uploadProgressPercent"),

    uploadButton:
      $("uploadVideoBtn"),

    title:
      $("videoTitle"),

    description:
      $("videoDescription")
  };
}

/* ======================================================
   SETUP VIDEO FILE INPUT
====================================================== */

function setupVideoFileInput() {
  const elements =
    getUploadElements();

  const fileInput =
    elements.file;

  if (!fileInput) {
    console.warn(
      "videoFile input not found."
    );

    return;
  }

  fileInput.addEventListener(
    "change",
    handleVideoFileChange
  );
}

/* ======================================================
   VIDEO FILE CHANGE
====================================================== */

function handleVideoFileChange(event) {
  const file =
    event.target.files?.[0];

  if (!file) {
    selectedVideoFile = null;
    return;
  }

  if (
    !file.type ||
    !file.type.startsWith("video/")
  ) {
    showToast(
      "Sirf video file select karein.",
      "error"
    );

    event.target.value = "";
    selectedVideoFile = null;

    return;
  }

  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {
    showToast(
      "Video maximum 100 MB hona chahiye.",
      "error"
    );

    event.target.value = "";
    selectedVideoFile = null;

    return;
  }

  selectedVideoFile = file;

  const elements =
    getUploadElements();

  if (elements.fileName) {
    elements.fileName.textContent =
      file.name +
      " • " +
      formatVideoSize(file.size);
  }

  if (
    elements.preview &&
    elements.previewVideo
  ) {
    if (previewObjectUrl) {
      URL.revokeObjectURL(
        previewObjectUrl
      );
    }

    previewObjectUrl =
      URL.createObjectURL(file);

    elements.previewVideo.src =
      previewObjectUrl;

    elements.preview.classList.remove(
      "hidden"
    );
  }

  showToast(
    "Video select ho gaya 🎥",
    "success"
  );
}

/* ======================================================
   UPDATE UPLOAD PROGRESS
====================================================== */

function updateUploadProgress(
  percent,
  message
) {
  const elements =
    getUploadElements();

  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent || 0)
      )
    );

  if (elements.progressBox) {
    elements.progressBox.classList.remove(
      "hidden"
    );
  }

  if (elements.progressBar) {
    elements.progressBar.style.width =
      safePercent + "%";
  }

  if (elements.progressPercent) {
    elements.progressPercent.textContent =
      Math.round(safePercent) + "%";
  }

  if (
    elements.progressText &&
    message
  ) {
    elements.progressText.textContent =
      message;
  }
}

/* ======================================================
   GET CLOUDINARY SIGNATURE
====================================================== */

async function getCloudinarySignature() {
  if (!currentUser?.id) {
    throw new Error(
      "User login required."
    );
  }

  const data =
    await api(
      "/api/cloudinary/signature",
      {
        method: "POST",
        body: {
          user_id:
            currentUser.id
        }
      }
    );

  if (
    !data.ok ||
    !data.cloud_name ||
    !data.api_key ||
    !data.timestamp ||
    !data.signature
  ) {
    throw new Error(
      "Cloudinary signature nahi mila."
    );
  }

  return data;
}

/* ======================================================
   CLOUDINARY DIRECT VIDEO UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signatureData
) {
  return new Promise(
    (resolve, reject) => {
      if (!file) {
        reject(
          new Error(
            "Video file missing."
          )
        );

        return;
      }

      const cloudName =
        signatureData.cloud_name;

      const uploadUrl =
        "https://api.cloudinary.com/v1_1/" +
        encodeURIComponent(
          cloudName
        ) +
        "/video/upload";

      const xhr =
        new XMLHttpRequest();

      xhr.open(
        "POST",
        uploadUrl,
        true
      );

      xhr.upload.addEventListener(
        "progress",
        (event) => {
          if (!event.lengthComputable) {
            return;
          }

          const cloudinaryPercent =
            event.loaded /
            event.total *
            90;

          updateUploadProgress(
            cloudinaryPercent,
            "Video Cloudinary par upload ho raha hai..."
          );
        }
      );

      xhr.addEventListener(
        "error",
        () => {
          reject(
            new Error(
              "Cloudinary network error."
            )
          );
        }
      );

      xhr.addEventListener(
        "abort",
        () => {
          reject(
            new Error(
              "Upload cancel ho gaya."
            )
          );
        }
      );

      xhr.addEventListener(
        "load",
        () => {
          let data = {};

          try {
            data =
              JSON.parse(
                xhr.responseText
              );
          } catch {
            data = {};
          }

          if (
            xhr.status >= 200 &&
            xhr.status < 300 &&
            data.secure_url
          ) {
            resolve(data);
            return;
          }

          reject(
            new Error(
              data?.error?.message ||
              "Cloudinary upload failed."
            )
          );
        }
      );

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      formData.append(
        "api_key",
        signatureData.api_key
      );

      formData.append(
        "timestamp",
        signatureData.timestamp
      );

      formData.append(
        "signature",
        signatureData.signature
      );

      if (
        signatureData.folder
      ) {
        formData.append(
          "folder",
          signatureData.folder
        );
      }

      xhr.send(formData);
    }
  );
}

/* ======================================================
   CLOUDINARY THUMBNAIL
====================================================== */

function makeCloudinaryThumbnail(
  cloudinaryData
) {
  const publicId =
    cloudinaryData.public_id;

  const resourceType =
    cloudinaryData.resource_type ||
    "video";

  if (
    !publicId ||
    resourceType !== "video"
  ) {
    return "";
  }

  const cloudName =
    cloudinaryData.cloud_name ||
    "";

  if (!cloudName) {
    return "";
  }

  const encodedPublicId =
    publicId
      .split("/")
      .map(
        encodeURIComponent
      )
      .join("/");

  return (
    "https://res.cloudinary.com/" +
    cloudName +
    "/video/upload/so_0/" +
    encodedPublicId +
    ".jpg"
  );
}

/* ======================================================
   SAVE VIDEO METADATA
====================================================== */

async function saveVideoMetadata(
  cloudinaryData,
  title,
  description
) {
  if (!currentUser?.id) {
    throw new Error(
      "User login required."
    );
  }

  const thumbnailUrl =
    makeCloudinaryThumbnail(
      cloudinaryData
    );

  const data =
    await api(
      "/api/videos",
      {
        method: "POST",

        body: {
          user_id:
            currentUser.id,

          creator_id:
            currentUser.id,

          title:
            title.trim(),

          description:
            description.trim(),

          video_url:
            cloudinaryData.secure_url,

          thumbnail_url:
            thumbnailUrl,

          cloudinary_public_id:
            cloudinaryData.public_id ||
            "",

          cloudinary_resource_type:
            cloudinaryData.resource_type ||
            "video",

          cloudinary_format:
            cloudinaryData.format ||
            "",

          duration:
            Number(
              cloudinaryData.duration ||
              0
            ),

          bytes:
            Number(
              cloudinaryData.bytes ||
              selectedVideoFile?.size ||
              0
            )
        }
      }
    );

  return data;
}

/* ======================================================
   RESET UPLOAD FORM
====================================================== */

function resetUploadForm() {
  const elements =
    getUploadElements();

  if (elements.title) {
    elements.title.value = "";
  }

  if (elements.description) {
    elements.description.value = "";
  }

  if (elements.file) {
    elements.file.value = "";
  }

  if (elements.fileName) {
    elements.fileName.textContent =
      "Gallery se video choose karein";
  }

  if (elements.preview) {
    elements.preview.classList.add(
      "hidden"
    );
  }

  if (elements.previewVideo) {
    elements.previewVideo.pause();

    elements.previewVideo.removeAttribute(
      "src"
    );

    elements.previewVideo.load();
  }

  if (previewObjectUrl) {
    URL.revokeObjectURL(
      previewObjectUrl
    );

    previewObjectUrl = null;
  }

  if (elements.progressBox) {
    elements.progressBox.classList.add(
      "hidden"
    );
  }

  if (elements.progressBar) {
    elements.progressBar.style.width =
      "0%";
  }

  if (elements.progressPercent) {
    elements.progressPercent.textContent =
      "0%";
  }

  if (elements.progressText) {
    elements.progressText.textContent =
      "Uploading...";
  }

  selectedVideoFile = null;
}

/* ======================================================
   UPLOAD VIDEO
====================================================== */

async function uploadUserVideo() {
  if (uploadBusy) {
    return;
  }

  if (!currentUser) {
    showToast(
      "User account ready nahi hai.",
      "error"
    );

    return;
  }

  const elements =
    getUploadElements();

  const title =
    elements.title?.value.trim() || "";

  const description =
    elements.description?.value.trim() || "";

  if (!title) {
    showToast(
      "Video title likhein.",
      "error"
    );

    elements.title?.focus();

    return;
  }

  if (!selectedVideoFile) {
    showToast(
      "Gallery se video select karein.",
      "error"
    );

    return;
  }

  if (
    !selectedVideoFile.type.startsWith(
      "video/"
    )
  ) {
    showToast(
      "Valid video file select karein.",
      "error"
    );

    return;
  }

  if (
    selectedVideoFile.size >
    MAX_VIDEO_SIZE
  ) {
    showToast(
      "Video maximum 100 MB hona chahiye.",
      "error"
    );

    return;
  }

  uploadBusy = true;

  if (elements.uploadButton) {
    elements.uploadButton.disabled =
      true;

    elements.uploadButton.textContent =
      "⏳ Uploading...";
  }

  try {
    /* STEP 1 */

    updateUploadProgress(
      1,
      "Secure upload prepare ho raha hai..."
    );

    const signature =
      await getCloudinarySignature();

    /* STEP 2 */

    updateUploadProgress(
      5,
      "Cloudinary upload ready..."
    );

    const cloudinaryData =
      await uploadToCloudinary(
        selectedVideoFile,
        signature
      );

    /* STEP 3 */

    updateUploadProgress(
      94,
      "Video information database mein save ho rahi hai..."
    );

    const saved =
      await saveVideoMetadata(
        cloudinaryData,
        title,
        description
      );

    /* STEP 4 */

    updateUploadProgress(
      100,
      "Upload complete 🎉"
    );

    if (saved.user) {
      currentUser =
        saved.user;

      saveLocalUser();
      updateUserUI();
    } else {
      await loadUser();
    }

    showToast(
      "🎉 Video successfully upload ho gaya!",
      "success"
    );

    resetUploadForm();

    await loadVideos();

    await loadMyVideos();

    setTimeout(() => {
      showPage("profile");
    }, 700);

  } catch (error) {
    console.error(
      "uploadUserVideo:",
      error
    );

    updateUploadProgress(
      0,
      "Upload failed"
    );

    showToast(
      error.message ||
      "Video upload failed.",
      "error"
    );

  } finally {
    uploadBusy = false;

    const currentElements =
      getUploadElements();

    if (currentElements.uploadButton) {
      currentElements.uploadButton.disabled =
        false;

      currentElements.uploadButton.textContent =
        "🎥 Upload Video";
    }
  }
}

/* ======================================================
   ALIAS
====================================================== */

async function uploadVideo() {
  return uploadUserVideo();
}

/* ======================================================
   UPLOAD BUTTON
====================================================== */

function setupUploadButton() {
  const button =
    $("uploadVideoBtn");

  if (!button) {
    return;
  }

  if (
    button.dataset.listenerAttached ===
    "true"
  ) {
    return;
  }

  button.dataset.listenerAttached =
    "true";

  button.addEventListener(
    "click",
    function (event) {
      event.preventDefault();

      uploadUserVideo();
    }
  );
}

/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {
  if (!currentUser?.id) {
    return;
  }

  const container =
    $("myVideos") ||
    $("myVideosList");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="loading">
      Aapke videos load ho rahe hain...
    </div>
  `;

  try {
    const data =
      await api(
        "/api/videos?creator_id=" +
        encodeURIComponent(
          currentUser.id
        )
      );

    const videos =
      Array.isArray(data.videos)
        ? data.videos
        : [];

    const ownVideos =
      videos.filter(
        (video) =>
          String(
            video.creator_id ??
            video.user_id
          ) ===
          String(currentUser.id)
      );

    if (!ownVideos.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div>🎥</div>

          <h3>
            Aapne abhi koi video upload nahi kiya
          </h3>

          <button
            class="btn primary-btn"
            onclick="showPage('upload')"
          >
            ⬆️ Video Upload Karein
          </button>
        </div>
      `;

      return;
    }

    container.innerHTML =
      ownVideos
        .map((video) =>
          renderVideoCard(
            video,
            {
              own: true
            }
          )
        )
        .join("");

  } catch (error) {
    console.error(
      "loadMyVideos:",
      error
    );

    container.innerHTML = `
      <div class="empty-state">
        My Videos load nahi ho paaye.

        <button
          class="btn primary-btn"
          onclick="loadMyVideos()"
        >
          🔄 Retry
        </button>
      </div>
    `;
  }
}

/* ======================================================
   DELETE VIDEO
====================================================== */

async function deleteVideo(videoId) {
  if (!videoId) return;

  const confirmed =
    window.confirm(
      "Kya aap ye video delete karna chahte hain?"
    );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      "/api/videos/" +
      encodeURIComponent(videoId),
      {
        method: "DELETE"
      }
    );

    showToast(
      "🗑️ Video deleted",
      "success"
    );

    await loadMyVideos();
    await loadVideos();

  } catch (error) {
    showToast(
      error.message ||
      "Video delete nahi hua.",
      "error"
    );
  }
}

/* ======================================================
   POINTS HISTORY
====================================================== */

async function loadPointsHistory() {
  if (!currentUser?.id) {
    return;
  }

  const container =
    $("pointsHistory") ||
    $("history");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="loading">
      Points history load ho rahi hai...
    </div>
  `;

  try {
    const data =
      await api(
        "/api/user/" +
        encodeURIComponent(
          currentUser.id
        ) +
        "/points/history"
      );

    const history =
      Array.isArray(data.history)
        ? data.history
        : [];

    if (!history.length) {
      container.innerHTML = `
        <div class="empty-state">
          Abhi points history nahi hai.
        </div>
      `;

      return;
    }

    container.innerHTML =
      history
        .map((item) => `
          <div class="history-item">

            <div>
              <strong>
                +${formatNumber(
                  item.points
                )}
                points
              </strong>

              <div>
                ${escapeHTML(
                  item.reason ||
                  "Reward"
                )}
              </div>
            </div>

            <small>
              ${formatDate(
                item.created_at
              )}
            </small>

          </div>
        `)
        .join("");

  } catch (error) {
    console.error(
      "loadPointsHistory:",
      error
    );

    container.innerHTML = `
      <div class="empty-state">
        History load nahi ho paayi.
      </div>
    `;
  }
}

/* ======================================================
   ALIAS
====================================================== */

async function loadHistory() {
  return loadPointsHistory();
}

/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDaily() {
  if (!currentUser) {
    showToast(
      "Login required.",
      "error"
    );

    return;
  }

  try {
    const data =
      await api(
        "/api/daily/claim",
        {
          method: "POST"
        }
      );

    if (data.user) {
      currentUser =
        data.user;

      saveLocalUser();
      updateUserUI();
    }

    showToast(
      data.message ||
      "🎁 Daily reward claimed!",
      "success"
    );

    loadPointsHistory();

  } catch (error) {
    showToast(
      error.message ||
      "Daily reward failed.",
      "error"
    );
  }
}

/* ======================================================
   REWARDED AD
====================================================== */

async function rewardAd() {
  if (!currentUser) {
    showToast(
      "Login required.",
      "error"
    );

    return;
  }

  try {
    const data =
      await api(
        "/api/rewarded-ad/complete",
        {
          method: "POST"
        }
      );

    if (data.user) {
      currentUser =
        data.user;

      saveLocalUser();
      updateUserUI();
    }

    showToast(
      data.message ||
      "📺 Reward added!",
      "success"
    );

    loadPointsHistory();

  } catch (error) {
    showToast(
      error.message ||
      "Reward failed.",
      "error"
    );
  }
}

/* ======================================================
   CREATOR STATS
====================================================== */

async function loadCreatorStats() {
  if (!currentUser?.id) {
    return;
  }

  try {
    const data =
      await api(
        "/api/creator/" +
        encodeURIComponent(
          currentUser.id
        )
      );

    const creator =
      data.creator;

    if (!creator) {
      return;
    }

    const mappings = {
      creatorVideos:
        creator.video_count,

      creatorViews:
        creator.total_views,

      creatorFollowers:
        creator.followers,

      creatorPoints:
        creator.points
    };

    Object.keys(mappings).forEach(
      (id) => {
        const element = $(id);

        if (element) {
          element.textContent =
            formatNumber(
              mappings[id]
            );
        }
      }
    );

  } catch (error) {
    console.error(
      "loadCreatorStats:",
      error
    );
  }
}

/* ======================================================
   CREATOR MONETIZATION
====================================================== */

async function applyCreatorMonetization() {
  if (!currentUser?.id) {
    showToast(
      "Login required.",
      "error"
    );

    return;
  }

  try {
    const data =
      await api(
        "/api/creator/" +
        encodeURIComponent(
          currentUser.id
        ) +
        "/monetization/apply",
        {
          method: "POST"
        }
      );

    showToast(
      data.message ||
      "Monetization application submitted.",
      "success"
    );

  } catch (error) {
    showToast(
      error.message ||
      "Application failed.",
      "error"
    );
  }
}

/* ======================================================
   FOLLOW / UNFOLLOW
====================================================== */

async function followCreator(
  creatorId
) {
  if (!creatorId) return;

  try {
    const data =
      await api(
        "/api/follow/" +
        encodeURIComponent(
          creatorId
        ),
        {
          method: "POST"
        }
      );

    showToast(
      data.following
        ? "❤️ Following"
        : "Following removed",
      "success"
    );

    loadCreatorStats();

  } catch (error) {
    showToast(
      error.message ||
      "Follow failed.",
      "error"
    );
  }
}

/* ======================================================
   PAYOUT ACCOUNT
====================================================== */

async function savePayoutAccount(
  method,
  accountName,
  accountValue
) {
  try {
    const data =
      await api(
        "/api/payout-account",
        {
          method: "POST",

          body: {
            method,
            account_name:
              accountName,

            account_value:
              accountValue
          }
        }
      );

    showToast(
      data.message ||
      "Payout account saved.",
      "success"
    );

    return data;

  } catch (error) {
    showToast(
      error.message ||
      "Payout account save failed.",
      "error"
    );

    throw error;
  }
}

/* ======================================================
   PWA INSTALL
====================================================== */

window.addEventListener(
  "beforeinstallprompt",
  (event) => {
    event.preventDefault();

    deferredPrompt =
      event;

    const buttons =
      document.querySelectorAll(
        "[data-install-app]"
      );

    buttons.forEach(
      (button) => {
        button.classList.remove(
          "hidden"
        );
      }
    );
  }
);

async function installApp() {
  if (!deferredPrompt) {
    showToast(
      "Install option abhi available nahi hai."
    );

    return;
  }

  deferredPrompt.prompt();

  try {
    await deferredPrompt.userChoice;
  } catch {
    // ignore
  }

  deferredPrompt = null;
}

window.addEventListener(
  "appinstalled",
  () => {
    deferredPrompt = null;

    showToast(
      "🎉 DekhoEarn install ho gaya!",
      "success"
    );
  }
);

/* ======================================================
   SERVICE WORKER
====================================================== */

async function registerServiceWorker() {
  if (
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  try {
    await navigator.serviceWorker.register(
      "/sw.js"
    );
  } catch (error) {
    console.warn(
      "Service worker:",
      error
    );
  }
}

/* ======================================================
   UPLOAD DRAG / DROP
====================================================== */

function setupUploadDropZone() {
  const elements =
    getUploadElements();

  const fileInput =
    elements.file;

  const picker =
    document.querySelector(
      ".video-picker"
    ) ||
    document.querySelector(
      ".video-select-box"
    );

  if (!picker || !fileInput) {
    return;
  }

  [
    "dragenter",
    "dragover"
  ].forEach((eventName) => {
    picker.addEventListener(
      eventName,
      (event) => {
        event.preventDefault();

        picker.classList.add(
          "drag-active"
        );
      }
    );
  });

  [
    "dragleave",
    "drop"
  ].forEach((eventName) => {
    picker.addEventListener(
      eventName,
      (event) => {
        event.preventDefault();

        picker.classList.remove(
          "drag-active"
        );
      }
    );
  });

  picker.addEventListener(
    "drop",
    (event) => {
      const file =
        event.dataTransfer?.files?.[0];

      if (!file) return;

      try {
        const dataTransfer =
          new DataTransfer();

        dataTransfer.items.add(
          file
        );

        fileInput.files =
          dataTransfer.files;

        fileInput.dispatchEvent(
          new Event(
            "change",
            {
              bubbles: true
            }
          )
        );
      } catch (error) {
        console.warn(
          "Drop file:",
          error
        );
      }
    }
  );
}

/* ======================================================
   GLOBAL UPLOAD HELPERS
====================================================== */

window.uploadUserVideo =
  uploadUserVideo;

window.uploadVideo =
  uploadVideo;

window.openVideo =
  openVideo;

window.likeVideo =
  likeVideo;

window.sendComment =
  sendComment;

window.reportVideo =
  reportVideo;

window.claimDaily =
  claimDaily;

window.rewardAd =
  rewardAd;

window.deleteVideo =
  deleteVideo;

window.loadMyVideos =
  loadMyVideos;

window.loadVideos =
  loadVideos;

window.loadHistory =
  loadHistory;

window.loadPointsHistory =
  loadPointsHistory;

window.applyCreatorMonetization =
  applyCreatorMonetization;

window.followCreator =
  followCreator;

window.installApp =
  installApp;

window.showPage =
  showPage;

/* ======================================================
   START APP
====================================================== */

async function startApp() {
  console.log(
    "DekhoEarn frontend starting..."
  );

  try {
    setupNavigation();

    /*
      Important:
      Upload elements DOM ready hone ke baad
      resolve kiye ja rahe hain.
      Isse script head mein hone par bhi
      upload system break nahi hoga.
    */

    setupVideoFileInput();
    setupUploadButton();
    setupUploadDropZone();

    await createUser();

    updateUserUI();

    await loadUser();

    updateUserUI();

    await loadVideos();

    registerServiceWorker();

    console.log(
      "DekhoEarn frontend ready."
    );

  } catch (error) {
    console.error(
      "startApp:",
      error
    );

    showToast(
      error.message ||
      "DekhoEarn start nahi ho paaya.",
      "error"
    );
  }
}

/* ======================================================
   DOM READY
====================================================== */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    startApp,
    {
      once: true
    }
  );
} else {
  startApp();
}
