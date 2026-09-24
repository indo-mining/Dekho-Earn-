/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.1.3 FINAL
 --------------------------------------------------------
 Compatible with:
 - DekhoEarn Server v3.1.3
 - Secure Authentication
 - Bearer Token
 - Video Feed
 - Watch Rewards
 - Likes / Comments / Reports
 - Follow System
 - Daily Reward
 - Rewarded Ad Demo
 - Points History
 - Watch History
 - Gallery Video Upload
 - Cloudinary Signed Upload
 - Upload Progress
 - Upload Timeout
 - Detailed Upload Errors
 - My Videos
 - Creator Dashboard
 - Monetization
 - PWA
=========================================================
*/

"use strict";


/* ======================================================
   CONFIG
====================================================== */

const API_BASE = "";

const AUTH_TOKEN_KEY = "dekhoearn_auth_token";
const USER_KEY = "dekhoearn_user";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MIN_WATCH_SECONDS = 10;

const CLOUDINARY_UPLOAD_TIMEOUT = 10 * 60 * 1000;


/* ======================================================
   GLOBAL STATE
====================================================== */

let currentUser = null;
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";

let currentVideo = null;

let watchSeconds = 0;
let watchRewardSent = false;
let watchTimer = null;

let deferredPrompt = null;

let selectedVideoFile = null;
let uploadPreviewUrl = null;
let selectedVideoDuration = 0;


/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}


function showToast(message, type = "normal") {
  document.querySelector(".dekho-toast")?.remove();

  const toast = document.createElement("div");

  toast.className = `dekho-toast ${type}`;
  toast.textContent = String(message || "");

  toast.style.position = "fixed";
  toast.style.left = "50%";
  toast.style.bottom = "85px";
  toast.style.transform = "translateX(-50%)";
  toast.style.zIndex = "999999";
  toast.style.maxWidth = "92%";
  toast.style.padding = "12px 16px";
  toast.style.borderRadius = "12px";
  toast.style.background = "#111";
  toast.style.color = "#fff";
  toast.style.fontSize = "14px";
  toast.style.boxShadow = "0 6px 25px rgba(0,0,0,.25)";
  toast.style.textAlign = "center";

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}


function formatVideoSize(bytes) {
  const size = Number(bytes || 0);

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}


function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "";
  }
}


/* ======================================================
   SESSION
====================================================== */

function saveSession(token, user) {
  authToken = String(token || "");
  currentUser = user || null;

  if (authToken) {
    localStorage.setItem(
      AUTH_TOKEN_KEY,
      authToken
    );
  }

  if (currentUser) {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify(currentUser)
    );
  }
}


function clearSession() {
  authToken = "";
  currentUser = null;

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  stopWatchTimer();
}


/* ======================================================
   API HELPER
====================================================== */

async function api(path, options = {}) {

  const requestOptions = {
    ...options
  };

  const headers = {
    ...(options.headers || {})
  };

  /*
   * Do not manually set Content-Type for FormData.
   * Browser will automatically add multipart boundary.
   */

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  /*
   * Secure authentication
   */

  if (authToken) {
    headers.Authorization =
      `Bearer ${authToken}`;
  }

  requestOptions.headers = headers;

  let response;

  try {

    response = await fetch(
      `${API_BASE}${path}`,
      requestOptions
    );

  } catch (error) {

    console.error(
      "API network error:",
      error
    );

    throw new Error(
      "Network error. Please check your internet connection."
    );
  }

  let data = {};

  const contentType =
    response.headers.get("content-type") || "";

  if (
    contentType.includes("application/json")
  ) {

    try {
      data = await response.json();
    } catch {
      data = {};
    }

  } else {

    try {
      const text =
        await response.text();

      data = {
        message: text
      };

    } catch {
      data = {};
    }
  }


  /*
   * Session expired
   */

  if (
    response.status === 401 &&
    !path.startsWith("/api/auth/login") &&
    !path.startsWith("/api/auth/register")
  ) {

    clearSession();

    showAuthScreen(
      "login",
      "Session expired. Please login again."
    );

    throw new Error(
      "Session expired"
    );
  }


  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


/* ======================================================
   AUTH SCREEN
====================================================== */

function showAuthScreen(
  mode = "login",
  message = ""
) {

  const authScreen =
    $("authScreen");

  const appScreen =
    $("appScreen");

  authScreen?.classList.remove(
    "hidden"
  );

  appScreen?.classList.add(
    "hidden"
  );

  const loginForm =
    $("loginForm");

  const registerForm =
    $("registerForm");

  if (mode === "register") {

    loginForm?.classList.add(
      "hidden"
    );

    registerForm?.classList.remove(
      "hidden"
    );

  } else {

    registerForm?.classList.add(
      "hidden"
    );

    loginForm?.classList.remove(
      "hidden"
    );
  }

  if (message) {
    showToast(
      message,
      "error"
    );
  }
}


function showApp() {

  $("authScreen")?.classList.add(
    "hidden"
  );

  $("appScreen")?.classList.remove(
    "hidden"
  );

  updateUserUI();

  showPage("homeSection");

  loadVideos();
}


/* ======================================================
   LOGIN
====================================================== */

async function login() {

  const username =
    String(
      $("loginUsername")?.value || ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      $("loginPassword")?.value || ""
    );

  if (!username || !password) {

    showToast(
      "Username and password required.",
      "error"
    );

    return;
  }

  const button =
    $("loginBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Logging in...";
  }

  try {

    const data =
      await api(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            username,
            password
          })
        }
      );

    if (
      !data.token ||
      !data.user
    ) {
      throw new Error(
        "Invalid login response."
      );
    }

    saveSession(
      data.token,
      data.user
    );

    showToast(
      "Login successful 🎉",
      "success"
    );

    showApp();

  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Login";
    }
  }
}


/* ======================================================
   REGISTER
====================================================== */

async function register() {

  const firstName =
    String(
      $("registerFirstName")?.value || ""
    ).trim();

  const username =
    String(
      $("registerUsername")?.value || ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      $("registerPassword")?.value || ""
    );

  const referral =
    String(
      $("registerReferral")?.value || ""
    )
      .trim()
      .toUpperCase();

  const usernameRegex =
    /^[A-Za-z0-9_.]{3,30}$/;

  if (!firstName) {

    showToast(
      "First name required.",
      "error"
    );

    $("registerFirstName")?.focus();

    return;
  }

  if (!usernameRegex.test(username)) {

    showToast(
      "Username must be 3-30 characters and use only letters, numbers, underscore or dot.",
      "error"
    );

    $("registerUsername")?.focus();

    return;
  }

  if (password.length < 6) {

    showToast(
      "Password must be at least 6 characters.",
      "error"
    );

    $("registerPassword")?.focus();

    return;
  }

  const button =
    $("registerBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Creating account...";
  }

  try {

    const data =
      await api(
        "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            first_name:
              firstName,
            username,
            password,
            referral_code:
              referral
          })
        }
      );

    if (
      !data.token ||
      !data.user
    ) {
      throw new Error(
        "Invalid registration response."
      );
    }

    saveSession(
      data.token,
      data.user
    );

    showToast(
      "Account created successfully 🎉",
      "success"
    );

    showApp();

  } catch (error) {

    console.error(
      "Register error:",
      error
    );

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Create Account";
    }
  }
}


/* ======================================================
   LOAD SESSION
====================================================== */

async function loadSession() {

  if (!authToken) {

    showAuthScreen("login");

    return;
  }

  try {

    const data =
      await api(
        "/api/auth/me"
      );

    if (!data.user) {
      throw new Error(
        "User session not found."
      );
    }

    currentUser =
      data.user;

    localStorage.setItem(
      USER_KEY,
      JSON.stringify(
        currentUser
      )
    );

    showApp();

  } catch (error) {

    console.warn(
      "Session load:",
      error
    );

    clearSession();

    showAuthScreen(
      "login"
    );
  }
}


/* ======================================================
   LOGOUT
====================================================== */

async function logout() {

  try {

    if (authToken) {

      await api(
        "/api/auth/logout",
        {
          method: "POST"
        }
      );
    }

  } catch (error) {

    console.warn(
      "Logout API:",
      error
    );
  }

  clearSession();

  showAuthScreen(
    "login",
    "You have been logged out."
  );
}


/* ======================================================
   USER UI
====================================================== */

function updateUserUI() {

  if (!currentUser) return;

  const name =
    currentUser.first_name ||
    currentUser.name ||
    currentUser.username ||
    "User";

  if ($("headerGreeting")) {
    $("headerGreeting").textContent =
      `Hi, ${name} 👋`;
  }

  if ($("headerPoints")) {
    $("headerPoints").textContent =
      `${formatNumber(
        currentUser.points
      )} pts`;
  }

  if ($("profileName")) {
    $("profileName").textContent =
      name;
  }

  if ($("profileUsername")) {
    $("profileUsername").textContent =
      `@${currentUser.username || ""}`;
  }

  if ($("profilePoints")) {
    $("profilePoints").textContent =
      formatNumber(
        currentUser.points
      );
  }

  if ($("profileVideos")) {
    $("profileVideos").textContent =
      formatNumber(
        currentUser.watched_videos ??
        currentUser.total_videos_watched ??
        0
      );
  }

  if ($("profileEarned")) {
    $("profileEarned").textContent =
      formatNumber(
        currentUser.total_earned ??
        currentUser.points_earned ??
        currentUser.points ??
        0
      );
  }

  if ($("profileFollowers")) {
    $("profileFollowers").textContent =
      formatNumber(
        currentUser.followers_count ||
        0
      );
  }

  if ($("profileFollowing")) {
    $("profileFollowing").textContent =
      formatNumber(
        currentUser.following_count ||
        0
      );
  }
}


async function refreshCurrentUser() {

  if (!currentUser) return;

  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          currentUser.id
        )}`
      );

    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }

  } catch (error) {

    console.warn(
      "Refresh user failed:",
      error
    );
  }
}


/* ======================================================
   NAVIGATION
====================================================== */

function showPage(sectionId) {

  document
    .querySelectorAll(
      ".page-section"
    )
    .forEach(section => {

      section.classList.toggle(
        "active",
        section.id === sectionId
      );
    });


  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === sectionId
      );
    });


  if (
    sectionId !==
    "playerSection"
  ) {
    stopWatchTimer();
  }


  if (
    sectionId ===
    "watchSection"
  ) {
    loadWatchHistory();
  }


  if (
    sectionId ===
    "earnSection"
  ) {
    loadPointsHistory();
  }


  if (
    sectionId ===
    "profileSection"
  ) {
    loadMyVideos();
  }


  if (
    sectionId ===
    "creatorSection"
  ) {
    loadCreatorDashboard();
  }
}


/* ======================================================
   VIDEO FEED
====================================================== */

async function loadVideos() {

  const feed =
    $("videoFeed");

  if (!feed) return;

  feed.innerHTML =
    `<div class="mini-loading">
      Loading videos...
    </div>`;

  try {

    const data =
      await api(
        "/api/videos"
      );

    const videos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];

    renderVideoFeed(
      videos
    );

  } catch (error) {

    console.error(
      "Load videos:",
      error
    );

    feed.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


function renderVideoFeed(
  videos
) {

  const feed =
    $("videoFeed");

  if (!feed) return;

  if (!videos.length) {

    feed.innerHTML =
      `<div class="empty-state">
        No videos available yet.
      </div>`;

    return;
  }


  feed.innerHTML =
    videos.map(video => {

      const id =
        video.id ??
        video.video_id;

      const thumbnail =
        video.thumbnail_url ||
        video.thumbnail ||
        "";

      const title =
        video.title ||
        "Untitled video";

      const description =
        video.description ||
        "";

      const creator =
        video.creator_username ||
        video.username ||
        video.first_name ||
        "Creator";

      const views =
        video.views ??
        video.view_count ??
        0;


      return `
        <article
          class="video-card"
          data-video-id="${escapeHTML(id)}"
          onclick="openVideo('${escapeHTML(id)}')"
        >

          <div class="video-thumb-wrap">

            ${
              thumbnail
                ? `
                  <img
                    class="video-thumb"
                    src="${escapeHTML(
                      thumbnail
                    )}"
                    alt="${escapeHTML(
                      title
                    )}"
                    loading="lazy"
                  >
                `
                : `
                  <div class="video-thumb-placeholder">
                    🎬
                  </div>
                `
            }

          </div>

          <div class="video-card-body">

            <h3>
              ${escapeHTML(
                title
              )}
            </h3>

            ${
              description
                ? `
                  <p>
                    ${escapeHTML(
                      description
                    )}
                  </p>
                `
                : ""
            }

            <div class="video-meta">

              <span>
                @${escapeHTML(
                  creator
                )}
              </span>

              <span>
                ${formatNumber(
                  views
                )} views
              </span>

            </div>

          </div>

        </article>
      `;

    }).join("");
}


/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(
  videoId
) {

  if (!videoId) return;

  stopWatchTimer();

  showPage(
    "playerSection"
  );

  const videoElement =
    $("playerVideo");

  if (videoElement) {

    videoElement.pause();

    videoElement.removeAttribute(
      "src"
    );

    videoElement.load();
  }

  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          videoId
        )}`
      );

    currentVideo =
      data.video ||
      data;

    if (!currentVideo) {
      throw new Error(
        "Video not found."
      );
    }


    const videoUrl =
      currentVideo.video_url ||
      currentVideo.url ||
      currentVideo.secure_url ||
      "";

    const thumbnail =
      currentVideo.thumbnail_url ||
      currentVideo.thumbnail ||
      "";

    const title =
      currentVideo.title ||
      "Untitled video";

    const description =
      currentVideo.description ||
      "";

    const views =
      currentVideo.views ||
      currentVideo.view_count ||
      0;

    const likes =
      currentVideo.likes_count ??
      currentVideo.likes ??
      0;

    const comments =
      currentVideo.comments_count ??
      currentVideo.comments ??
      0;


    if ($("playerTitle")) {
      $("playerTitle").textContent =
        title;
    }

    if ($("playerDescription")) {
      $("playerDescription").textContent =
        description;
    }

    if ($("playerViews")) {
      $("playerViews").textContent =
        `${formatNumber(
          views
        )} views`;
    }

    if ($("playerLikes")) {
      $("playerLikes").textContent =
        formatNumber(
          likes
        );
    }

    if ($("playerCommentsCount")) {
      $("playerCommentsCount").textContent =
        formatNumber(
          comments
        );
    }


    if (videoElement) {

      if (thumbnail) {
        videoElement.poster =
          thumbnail;
      }

      if (videoUrl) {

        videoElement.src =
          videoUrl;

        videoElement.load();
      }
    }


    watchSeconds = 0;
    watchRewardSent = false;


    await loadLikeStatus();
    await loadFollowStatus();
    await loadComments();

    setupWatchTimer();

  } catch (error) {

    console.error(
      "Open video:",
      error
    );

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   WATCH TIMER
====================================================== */

function setupWatchTimer() {

  stopWatchTimer();

  if (!currentVideo) return;

  watchSeconds = 0;
  watchRewardSent = false;

  watchTimer =
    setInterval(() => {

      if (!currentVideo) {
        return;
      }

      const videoElement =
        $("playerVideo");

      if (
        videoElement &&
        !videoElement.paused &&
        !videoElement.ended
      ) {

        watchSeconds++;

        if (
          watchSeconds >=
            MIN_WATCH_SECONDS &&
          !watchRewardSent
        ) {

          completeWatch();
        }
      }

    }, 1000);
}


function stopWatchTimer() {

  if (watchTimer) {

    clearInterval(
      watchTimer
    );

    watchTimer = null;
  }
}


async function completeWatch() {

  if (
    !currentVideo ||
    watchRewardSent ||
    watchSeconds <
      MIN_WATCH_SECONDS
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
          body: JSON.stringify({
            video_id:
              currentVideo.id,
            watch_seconds:
              watchSeconds
          })
        }
      );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    if (
      data.reward_granted ||
      data.reward
    ) {

      showToast(
        `+${data.reward || 1} point earned 🎉`,
        "success"
      );
    }

  } catch (error) {

    watchRewardSent = false;

    console.warn(
      "Watch reward:",
      error
    );
  }
}


/* ======================================================
   LIKE
====================================================== */

function updateLikeButton(
  liked
) {

  const button =
    $("likeBtn");

  if (!button) return;

  button.classList.toggle(
    "liked",
    Boolean(liked)
  );

  const text =
    button.querySelector(
      ".like-text"
    );

  if (text) {

    text.textContent =
      liked
        ? "Liked"
        : "Like";

  } else {

    button.textContent =
      liked
        ? "❤️ Liked"
        : "🤍 Like";
  }
}


async function loadLikeStatus() {

  if (!currentVideo) return;

  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/like`
      );

    updateLikeButton(
      Boolean(
        data.liked ??
        data.like ??
        false
      )
    );

  } catch (error) {

    console.warn(
      "Like status:",
      error
    );
  }
}


async function toggleLike() {

  if (!currentVideo) return;

  const button =
    $("likeBtn");

  if (button) {
    button.disabled = true;
  }

  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/like`,
        {
          method: "POST"
        }
      );

    updateLikeButton(
      Boolean(
        data.liked
      )
    );


    if ($("playerLikes")) {

      $("playerLikes").textContent =
        formatNumber(
          data.likes_count ??
          data.likes ??
          currentVideo.likes_count ??
          0
        );
    }

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


/* ======================================================
   FOLLOW
====================================================== */

function updateFollowButton(
  following
) {

  const button =
    $("followCreatorBtn");

  if (!button) return;

  button.classList.toggle(
    "following",
    Boolean(following)
  );

  button.textContent =
    following
      ? "Following"
      : "Follow";
}


async function loadFollowStatus() {

  if (!currentVideo) return;

  const creatorId =
    currentVideo.creator_id ||
    currentVideo.user_id;

  if (!creatorId) return;


  if (
    String(creatorId) ===
    String(currentUser?.id)
  ) {

    $("followCreatorBtn")
      ?.classList.add(
        "hidden"
      );

    return;
  }


  $("followCreatorBtn")
    ?.classList.remove(
      "hidden"
    );


  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          creatorId
        )}/follow`
      );

    updateFollowButton(
      Boolean(
        data.following ??
        data.followed ??
        false
      )
    );

  } catch (error) {

    console.warn(
      "Follow status:",
      error
    );
  }
}


async function toggleFollow() {

  if (!currentVideo) return;

  const creatorId =
    currentVideo.creator_id ||
    currentVideo.user_id;

  if (!creatorId) return;

  if (
    String(creatorId) ===
    String(currentUser?.id)
  ) {
    return;
  }

  const button =
    $("followCreatorBtn");

  if (button) {
    button.disabled = true;
  }

  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          creatorId
        )}/follow`,
        {
          method: "POST"
        }
      );

    updateFollowButton(
      Boolean(
        data.following
      )
    );

    showToast(
      data.following
        ? "Following creator"
        : "Unfollowed creator",
      "success"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


/* ======================================================
   COMMENTS
====================================================== */

async function loadComments() {

  if (!currentVideo) return;

  const list =
    $("commentsList");

  if (!list) return;

  list.innerHTML =
    `<div class="mini-loading">
      Loading comments...
    </div>`;


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/comments`
      );

    const comments =
      Array.isArray(
        data.comments
      )
        ? data.comments
        : [];


    if (!comments.length) {

      list.innerHTML =
        `<div class="empty-state">
          No comments yet.
        </div>`;

      return;
    }


    list.innerHTML =
      comments.map(
        comment => {

          const name =
            comment.username ||
            comment.first_name ||
            "User";

          const text =
            comment.comment ||
            comment.text ||
            "";


          return `
            <div class="comment-item">

              <div class="comment-author">
                @${escapeHTML(
                  name
                )}
              </div>

              <div class="comment-text">
                ${escapeHTML(
                  text
                )}
              </div>

              ${
                comment.created_at
                  ? `
                    <div class="comment-date">
                      ${escapeHTML(
                        formatDate(
                          comment.created_at
                        )
                      )}
                    </div>
                  `
                  : ""
              }

            </div>
          `;
        }
      ).join("");

  } catch (error) {

    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


async function addComment() {

  if (!currentVideo) return;

  const input =
    $("commentInput");

  const comment =
    String(
      input?.value || ""
    ).trim();


  if (!comment) {

    showToast(
      "Write a comment first.",
      "error"
    );

    return;
  }


  try {

    const data =
      await api(
        `/api/videos/${encodeURIComponent(
          currentVideo.id
        )}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            comment
          })
        }
      );


    if (input) {
      input.value = "";
    }


    showToast(
      "Comment added 💬",
      "success"
    );


    await loadComments();


    if ($("playerCommentsCount")) {

      $("playerCommentsCount").textContent =
        formatNumber(
          data.comments_count ??
          currentVideo.comments_count ??
          0
        );
    }

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   REPORT
====================================================== */

async function reportCurrentVideo() {

  if (!currentVideo) return;

  const reason =
    window.prompt(
      "Why are you reporting this video?"
    );


  if (reason === null) {
    return;
  }


  const cleanReason =
    String(
      reason
    ).trim();


  try {

    await api(
      `/api/videos/${encodeURIComponent(
        currentVideo.id
      )}/report`,
      {
        method: "POST",
        body: JSON.stringify({
          reason:
            cleanReason ||
            "Other"
        })
      }
    );


    showToast(
      "Report submitted.",
      "success"
    );

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   WATCH HISTORY
====================================================== */

async function loadWatchHistory() {

  if (!currentUser) return;

  const list =
    $("watchHistory");

  if (!list) return;

  list.innerHTML =
    `<div class="mini-loading">
      Loading history...
    </div>`;


  try {

    const data =
      await api(
        `/api/user/${encodeURIComponent(
          currentUser.id
        )}/watch-history`
      );


    const history =
      Array.isArray(
        data.history
      )
        ? data.history
        : [];


    if (!history.length) {

      list.innerHTML =
        `<div class="empty-state">
          No watch history yet.
        </div>`;

      return;
    }


    list.innerHTML =
      history.map(
        item => {

          const title =
            item.title ||
            "Video";

          const seconds =
            item.watch_seconds ||
            0;


          return `
            <div
              class="history-item"
              onclick="openVideo('${escapeHTML(
                item.video_id
              )}')"
            >

              <div class="history-title">
                ${escapeHTML(
                  title
                )}
              </div>

              <div class="history-meta">
                Watched ${formatNumber(
                  seconds
                )} sec
              </div>

            </div>
          `;
        }
      ).join("");

  } catch (error) {

    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDailyReward() {

  const button =
    $("dailyRewardBtn");

  if (button) {
    button.disabled = true;
  }


  try {

    const data =
      await api(
        "/api/rewards/daily",
        {
          method: "POST"
        }
      );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    showToast(
      `+${data.reward || 0} daily points 🎁`,
      "success"
    );


    await loadPointsHistory();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


/* ======================================================
   REWARDED AD DEMO
====================================================== */

async function claimRewardedAd() {

  const button =
    $("rewardedAdBtn");

  if (button) {

    button.disabled = true;

    button.textContent =
      "Adding reward...";
  }


  try {

    const data =
      await api(
        "/api/rewards/ad",
        {
          method: "POST"
        }
      );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    showToast(
      `+${data.reward || 0} points added 🎁`,
      "success"
    );


    await loadPointsHistory();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "🎁 Reward Ad Demo";
    }
  }
}


/* ======================================================
   POINTS HISTORY
====================================================== */

async function loadPointsHistory() {

  if (!currentUser) return;

  const list =
    $("pointsHistory");

  if (!list) return;

  list.innerHTML =
    `<div class="mini-loading">
      Loading...
    </div>`;


  try {

    const data =
      await api(
        "/api/points/history"
      );


    const history =
      Array.isArray(
        data.history
      )
        ? data.history
        : [];


    if (!history.length) {

      list.innerHTML =
        `<div class="empty-state">
          No points history yet.
        </div>`;

      return;
    }


    list.innerHTML =
      history.map(
        item => {

          const points =
            Number(
              item.points ??
              item.amount ??
              item.reward ??
              0
            );

          const source =
            item.reason ||
            item.type ||
            item.source ||
            "Reward";


          return `
            <div class="points-history-item">

              <div>

                <strong>
                  ${escapeHTML(
                    source
                  )}
                </strong>

                ${
                  item.created_at
                    ? `
                      <small>
                        ${escapeHTML(
                          formatDate(
                            item.created_at
                          )
                        )}
                      </small>
                    `
                    : ""
                }

              </div>

              <div class="points-value">
                +${formatNumber(
                  points
                )}
              </div>

            </div>
          `;
        }
      ).join("");

  } catch (error) {

    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


/* ======================================================
   VIDEO FILE HANDLING
====================================================== */

function handleVideoFile(
  file
) {

  if (!file) return;


  if (
    !file.type ||
    !file.type.startsWith(
      "video/"
    )
  ) {

    showToast(
      "Please select a valid video file.",
      "error"
    );

    return;
  }


  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {

    showToast(
      "Maximum video size is 100 MB.",
      "error"
    );

    return;
  }


  selectedVideoFile =
    file;

  selectedVideoDuration =
    0;


  if (uploadPreviewUrl) {

    URL.revokeObjectURL(
      uploadPreviewUrl
    );
  }


  uploadPreviewUrl =
    URL.createObjectURL(
      file
    );


  const preview =
    $("uploadVideoPreview");


  if (preview) {

    preview.src =
      uploadPreviewUrl;

    preview.classList.remove(
      "hidden"
    );

    preview.load();
  }


  if ($("selectedVideoName")) {

    $("selectedVideoName").textContent =
      file.name;
  }


  if ($("selectedVideoSize")) {

    $("selectedVideoSize").textContent =
      formatVideoSize(
        file.size
      );
  }


  updateUploadProgress(
    0,
    "Video selected"
  );


  uploadPreviewMetadata();
}


function uploadPreviewMetadata() {

  const preview =
    $("uploadVideoPreview");

  if (!preview) return;


  const readDuration =
    () => {

      const duration =
        Number(
          preview.duration
        );

      if (
        Number.isFinite(
          duration
        ) &&
        duration > 0
      ) {

        selectedVideoDuration =
          Math.round(
            duration
          );
      }
    };


  if (
    Number.isFinite(
      preview.duration
    ) &&
    preview.duration > 0
  ) {

    readDuration();

  } else {

    preview.addEventListener(
      "loadedmetadata",
      readDuration,
      {
        once: true
      }
    );
  }
}


/* ======================================================
   UPLOAD PROGRESS
====================================================== */

function updateUploadProgress(
  percent,
  text
) {

  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent) || 0
      )
    );


  const bar =
    $("uploadProgressBar");

  const percentText =
    $("uploadProgressPercent");

  const statusText =
    $("uploadProgressText");


  if (bar) {

    bar.style.width =
      `${safePercent}%`;
  }


  if (percentText) {

    percentText.textContent =
      `${Math.round(
        safePercent
      )}%`;
  }


  if (
    statusText &&
    text
  ) {

    statusText.textContent =
      text;
  }
}


/* ======================================================
   CLOUDINARY UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signature
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      if (!file) {

        reject(
          new Error(
            "Video file is missing."
          )
        );

        return;
      }


      if (!signature) {

        reject(
          new Error(
            "Cloudinary signature is missing."
          )
        );

        return;
      }


      const cloudName =
        String(
          signature.cloud_name ||
          ""
        ).trim();


      const apiKey =
        String(
          signature.api_key ||
          ""
        ).trim();


      const timestamp =
        String(
          signature.timestamp ||
          ""
        ).trim();


      const signedValue =
        String(
          signature.signature ||
          ""
        ).trim();


      if (
        !cloudName ||
        !apiKey ||
        !timestamp ||
        !signedValue
      ) {

        reject(
          new Error(
            "Cloudinary signature response is incomplete."
          )
        );

        return;
      }


      /*
       * Server can return upload_url directly.
       * Otherwise create it here.
       */

      const uploadUrl =
        signature.upload_url ||
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName
        )}/video/upload`;


      const form =
        new FormData();


      form.append(
        "file",
        file
      );


      form.append(
        "api_key",
        apiKey
      );


      form.append(
        "timestamp",
        timestamp
      );


      form.append(
        "signature",
        signedValue
      );


      /*
       * IMPORTANT:
       * folder must exactly match
       * the value signed by server.
       */

      if (
        signature.folder
      ) {

        form.append(
          "folder",
          signature.folder
        );
      }


      /*
       * Only send public_id if the server
       * explicitly returned it.
       */

      if (
        signature.public_id
      ) {

        form.append(
          "public_id",
          signature.public_id
        );
      }


      const xhr =
        new XMLHttpRequest();


      let completed =
        false;


      xhr.open(
        "POST",
        uploadUrl,
        true
      );


      xhr.timeout =
        CLOUDINARY_UPLOAD_TIMEOUT;


      xhr.upload.onprogress =
        event => {

          if (
            !event.lengthComputable
          ) {

            updateUploadProgress(
              0,
              "Uploading video..."
            );

            return;
          }


          const percent =
            (
              event.loaded /
              event.total
            ) * 100;


          updateUploadProgress(
            percent,
            `Uploading video... ${Math.round(
              percent
            )}%`
          );
        };


      xhr.onload =
        () => {

          if (completed) {
            return;
          }

          completed = true;


          let data = {};


          try {

            data =
              JSON.parse(
                xhr.responseText ||
                "{}"
              );

          } catch {

            data = {};
          }


          console.log(
            "Cloudinary response:",
            {
              status:
                xhr.status,
              data
            }
          );


          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {

            updateUploadProgress(
              100,
              "Video uploaded successfully."
            );

            resolve(
              data
            );

            return;
          }


          const message =
            data?.error?.message ||
            data?.message ||
            data?.error ||
            `HTTP ${xhr.status}`;


          reject(
            new Error(
              `Cloudinary upload failed: ${message}`
            )
          );
        };


      xhr.onerror =
        () => {

          if (completed) {
            return;
          }

          completed = true;


          console.error(
            "Cloudinary XHR network error"
          );


          reject(
            new Error(
              "Cloudinary network error. Please check internet connection and Cloudinary configuration."
            )
          );
        };


      xhr.ontimeout =
        () => {

          if (completed) {
            return;
          }

          completed = true;


          reject(
            new Error(
              "Cloudinary upload timed out after 10 minutes. Please try again with a smaller video or a better connection."
            )
          );
        };


      xhr.onabort =
        () => {

          if (completed) {
            return;
          }

          completed = true;


          reject(
            new Error(
              "Video upload was cancelled."
            )
          );
        };


      try {

        updateUploadProgress(
          0,
          "Connecting to Cloudinary..."
        );


        xhr.send(
          form
        );

      } catch (error) {

        if (!completed) {

          completed = true;


          reject(
            new Error(
              error?.message ||
              "Unable to start Cloudinary upload."
            )
          );
        }
      }
    }
  );
}


/* ======================================================
   UPLOAD VIDEO
====================================================== */

async function uploadVideo() {

  if (!currentUser) {

    showToast(
      "Please login first.",
      "error"
    );

    return;
  }


  if (!authToken) {

    showToast(
      "Your login session is missing. Please login again.",
      "error"
    );

    return;
  }


  if (!selectedVideoFile) {

    showToast(
      "Please select a video.",
      "error"
    );

    return;
  }


  const title =
    String(
      $("uploadTitle")?.value ||
      ""
    ).trim();


  const description =
    String(
      $("uploadDescription")?.value ||
      ""
    ).trim();


  if (!title) {

    showToast(
      "Please enter video title.",
      "error"
    );

    $("uploadTitle")?.focus();

    return;
  }


  if (
    selectedVideoFile.size >
    MAX_VIDEO_SIZE
  ) {

    showToast(
      "Maximum video size is 100 MB.",
      "error"
    );

    return;
  }


  const button =
    $("uploadVideoBtn");


  if (button) {

    button.disabled = true;

    button.textContent =
      "Uploading...";
  }


  try {

    /*
    ======================================================
    STEP 1
    CHECK CLOUDINARY CONFIGURATION
    ======================================================
    */

    updateUploadProgress(
      0,
      "Checking upload service..."
    );


    let statusData = null;


    try {

      statusData =
        await api(
          "/api/cloudinary/status"
        );

    } catch (statusError) {

      /*
       * Status endpoint may not exist on an
       * older server. Do not stop upload here.
       */

      console.warn(
        "Cloudinary status endpoint:",
        statusError
      );
    }


    if (
      statusData &&
      statusData.configured === false
    ) {

      throw new Error(
        "Cloudinary is not configured on the server. Please check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Render."
      );
    }


    /*
    ======================================================
    STEP 2
    GET SECURE CLOUDINARY SIGNATURE
    ======================================================
    */

    updateUploadProgress(
      0,
      "Preparing secure upload..."
    );


    let signature;


    try {

      /*
       * Server supports GET.
       */

      signature =
        await api(
          "/api/cloudinary/signature"
        );

    } catch (getError) {

      console.warn(
        "Cloudinary GET signature failed:",
        getError
      );


      /*
       * Compatibility fallback:
       * Try POST as well.
       */

      try {

        signature =
          await api(
            "/api/cloudinary/signature",
            {
              method: "POST",
              body: JSON.stringify({})
            }
          );

      } catch (postError) {

        console.error(
          "Cloudinary POST signature failed:",
          postError
        );

        throw new Error(
          `Secure upload setup failed: ${postError.message || getError.message}`
        );
      }
    }


    if (!signature) {

      throw new Error(
        "Cloudinary signature was not received."
      );
    }


    console.log(
      "Cloudinary signature received:",
      {
        cloud_name:
          signature.cloud_name,
        timestamp:
          signature.timestamp,
        folder:
          signature.folder,
        upload_url:
          signature.upload_url
      }
    );


    /*
    ======================================================
    STEP 3
    DIRECT CLOUDINARY UPLOAD
    ======================================================
    */

    updateUploadProgress(
      0,
      "Connecting to Cloudinary..."
    );


    const uploaded =
      await uploadToCloudinary(
        selectedVideoFile,
        signature
      );


    if (
      !uploaded ||
      !(
        uploaded.secure_url ||
        uploaded.url
      )
    ) {

      console.error(
        "Invalid Cloudinary response:",
        uploaded
      );


      throw new Error(
        "Cloudinary did not return a video URL."
      );
    }


    const videoUrl =
      uploaded.secure_url ||
      uploaded.url ||
      "";


    const publicId =
      uploaded.public_id ||
      "";


    /*
    ======================================================
    STEP 4
    CREATE CLOUDINARY THUMBNAIL
    ======================================================
    */

    let thumbnail =
      uploaded.thumbnail_url ||
      "";


    if (
      !thumbnail &&
      publicId
    ) {

      const encodedPublicId =
        publicId
          .split("/")
          .map(
            part =>
              encodeURIComponent(
                part
              )
          )
          .join("/");


      thumbnail =
        `https://res.cloudinary.com/${encodeURIComponent(
          signature.cloud_name
        )}/video/upload/so_1,f_jpg/${encodedPublicId}.jpg`;
    }


    /*
    ======================================================
    STEP 5
    SAVE VIDEO METADATA TO NEON
    ======================================================
    */

    updateUploadProgress(
      100,
      "Saving video information..."
    );


    const data =
      await api(
        "/api/videos",
        {
          method: "POST",
          body: JSON.stringify({

            title,

            description,

            video_url:
              videoUrl,

            thumbnail_url:
              thumbnail,

            cloudinary_public_id:
              publicId,

            cloudinary_resource_type:
              uploaded.resource_type ||
              "video",

            cloudinary_format:
              uploaded.format ||
              "",

            duration:
              selectedVideoDuration ||
              Number(
                uploaded.duration
              ) ||
              0,

            bytes:
              Number(
                uploaded.bytes
              ) ||
              selectedVideoFile.size
          })
        }
      );


    /*
    ======================================================
    SUCCESS
    ======================================================
    */

    showToast(
      data.message ||
      "Video uploaded successfully 🎉",
      "success"
    );


    /*
    ======================================================
    CLEAR FORM
    ======================================================
    */

    const titleInput =
      $("uploadTitle");

    const descriptionInput =
      $("uploadDescription");


    if (titleInput) {
      titleInput.value = "";
    }


    if (descriptionInput) {
      descriptionInput.value = "";
    }


    clearSelectedVideo();


    updateUploadProgress(
      100,
      "Upload complete 🎉"
    );


    /*
    ======================================================
    REFRESH DATA
    ======================================================
    */

    await refreshCurrentUser();

    await loadVideos();

    await loadMyVideos();


    showPage(
      "homeSection"
    );


  } catch (error) {

    console.error(
      "VIDEO UPLOAD ERROR:",
      error
    );


    updateUploadProgress(
      0,
      "Upload failed."
    );


    showToast(
      error.message ||
      "Video upload failed.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Upload Video";
    }
  }
}


/* ======================================================
   CLEAR SELECTED VIDEO
====================================================== */

function clearSelectedVideo() {

  selectedVideoFile =
    null;

  selectedVideoDuration =
    0;


  if (uploadPreviewUrl) {

    URL.revokeObjectURL(
      uploadPreviewUrl
    );

    uploadPreviewUrl =
      null;
  }


  const preview =
    $("uploadVideoPreview");


  if (preview) {

    preview.pause();

    preview.removeAttribute(
      "src"
    );

    preview.load();

    preview.classList.add(
      "hidden"
    );
  }


  if ($("selectedVideoName")) {

    $("selectedVideoName").textContent =
      "";
  }


  if ($("selectedVideoSize")) {

    $("selectedVideoSize").textContent =
      "";
  }


  const fileInput =
    $("videoFileInput");

  if (fileInput) {
    fileInput.value = "";
  }


  updateUploadProgress(
    0,
    "Choose a video to upload."
  );
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {

  if (!currentUser) return;

  const list =
    $("myVideosList");

  if (!list) return;

  list.innerHTML =
    `<div class="mini-loading">
      Loading your videos...
    </div>`;


  try {

    const data =
      await api(
        `/api/videos?creator_id=${encodeURIComponent(
          currentUser.id
        )}&mine=1`
      );


    const videos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    if (!videos.length) {

      list.innerHTML =
        `<div class="empty-state">
          You haven't uploaded any videos yet.
        </div>`;

      return;
    }


    list.innerHTML =
      videos.map(
        video => {

          const id =
            video.id ||
            video.video_id;

          const title =
            video.title ||
            "Untitled video";

          const views =
            video.views ||
            0;

          const status =
            video.status ||
            video.moderation_status ||
            "active";


          return `
            <div class="my-video-item">

              <div
                class="my-video-info"
                onclick="openVideo('${escapeHTML(
                  id
                )}')"
              >

                <strong>
                  ${escapeHTML(
                    title
                  )}
                </strong>

                <small>
                  ${formatNumber(
                    views
                  )} views
                  •
                  ${escapeHTML(
                    status
                  )}
                </small>

              </div>

              <button
                type="button"
                onclick="deleteMyVideo('${escapeHTML(
                  id
                )}')"
              >
                Delete
              </button>

            </div>
          `;
        }
      ).join("");

  } catch (error) {

    list.innerHTML =
      `<div class="empty-state">
        ${escapeHTML(
          error.message
        )}
      </div>`;
  }
}


async function deleteMyVideo(
  videoId
) {

  if (!videoId) return;

  const confirmed =
    window.confirm(
      "Delete this video permanently?"
    );


  if (!confirmed) {
    return;
  }


  try {

    await api(
      `/api/videos/${encodeURIComponent(
        videoId
      )}`,
      {
        method: "DELETE"
      }
    );


    showToast(
      "Video deleted.",
      "success"
    );


    await loadMyVideos();

    await loadVideos();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   CREATOR DASHBOARD
====================================================== */

async function loadCreatorDashboard() {

  if (!currentUser) return;

  try {

    const data =
      await api(
        `/api/creator/${encodeURIComponent(
          currentUser.id
        )}/stats`
      );


    const stats =
      data.stats ||
      data.creator ||
      data ||
      {};


    if ($("creatorFollowers")) {

      $("creatorFollowers").textContent =
        formatNumber(
          stats.followers ??
          currentUser.followers_count ??
          0
        );
    }


    if ($("creatorVideos")) {

      $("creatorVideos").textContent =
        formatNumber(
          stats.total_videos ??
          stats.videos ??
          currentUser.total_videos ??
          0
        );
    }


    if ($("creatorWatchHours")) {

      const seconds =
        Number(
          stats.total_watch_seconds ??
          currentUser.total_watch_seconds ??
          0
        );


      $("creatorWatchHours").textContent =
        (
          seconds /
          3600
        ).toFixed(1);
    }


    if ($("creatorEarnings")) {

      $("creatorEarnings").textContent =
        formatNumber(
          stats.creator_amount ??
          stats.total_earnings ??
          stats.earnings ??
          0
        );
    }


    if ($("creatorStatus")) {

      $("creatorStatus").textContent =
        stats.creator_status ||
        currentUser.creator_status ||
        "Not applied";
    }


    if ($("creatorEligibility")) {

      const eligible =
        Boolean(
          stats.eligible ??
          stats.monetization_eligible ??
          false
        );


      $("creatorEligibility").textContent =
        eligible
          ? "Eligible"
          : "Not eligible yet";
    }

  } catch (error) {

    console.warn(
      "Creator dashboard:",
      error
    );
  }
}


/* ======================================================
   CREATOR MONETIZATION APPLY
====================================================== */

async function applyMonetization() {

  const button =
    $("applyMonetizationBtn");


  if (button) {

    button.disabled = true;

    button.textContent =
      "Applying...";
  }


  try {

    const data =
      await api(
        "/api/creator/apply",
        {
          method: "POST"
        }
      );


    showToast(
      data.message ||
      "Creator application submitted.",
      "success"
    );


    if (data.user) {

      currentUser =
        data.user;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify(
          currentUser
        )
      );

      updateUserUI();
    }


    await loadCreatorDashboard();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Apply for Monetization";
    }
  }
}


/* ======================================================
   PWA INSTALL
====================================================== */

function setupPWAInstall() {

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      event.preventDefault();

      deferredPrompt =
        event;


      $("installAppBtn")
        ?.classList.remove(
          "hidden"
        );
    }
  );


  const installButton =
    $("installAppBtn");


  installButton?.addEventListener(
    "click",
    async () => {

      if (!deferredPrompt) {

        showToast(
          "Install option is not available right now.",
          "normal"
        );

        return;
      }


      deferredPrompt.prompt();


      try {

        await deferredPrompt.userChoice;

      } catch {
        // Ignore
      }


      deferredPrompt =
        null;


      installButton.classList.add(
        "hidden"
      );
    }
  );
}


/* ======================================================
   SERVICE WORKER
====================================================== */

function registerServiceWorker() {

  if (
    !("serviceWorker" in navigator)
  ) {
    return;
  }


  navigator.serviceWorker
    .register(
      "/sw.js?v=6"
    )
    .then(
      registration => {

        console.log(
          "Service worker registered:",
          registration.scope
        );
      }
    )
    .catch(
      error => {

        console.warn(
          "Service worker registration failed:",
          error
        );
      }
    );
}


/* ======================================================
   EVENT BINDING
====================================================== */

function bindEvents() {

  /*
   * AUTH
   */

  $("loginBtn")
    ?.addEventListener(
      "click",
      login
    );


  $("registerBtn")
    ?.addEventListener(
      "click",
      register
    );


  $("logoutBtn")
    ?.addEventListener(
      "click",
      logout
    );


  /*
   * AUTH SWITCH
   */

  $("showRegisterBtn")
    ?.addEventListener(
      "click",
      () => {
        showAuthScreen(
          "register"
        );
      }
    );


  $("showLoginBtn")
    ?.addEventListener(
      "click",
      () => {
        showAuthScreen(
          "login"
        );
      }
    );


  /*
   * LOGIN ENTER
   */

  $("loginPassword")
    ?.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          event.preventDefault();

          login();
        }
      }
    );


  /*
   * REGISTER ENTER
   */

  $("registerPassword")
    ?.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          event.preventDefault();

          register();
        }
      }
    );


  /*
   * NAVIGATION
   */

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const page =
              button.dataset.page;

            if (page) {
              showPage(page);
            }
          }
        );
      }
    );


  /*
   * PLAYER
   */

  $("likeBtn")
    ?.addEventListener(
      "click",
      toggleLike
    );


  $("followCreatorBtn")
    ?.addEventListener(
      "click",
      toggleFollow
    );


  $("commentSubmitBtn")
    ?.addEventListener(
      "click",
      addComment
    );


  $("reportVideoBtn")
    ?.addEventListener(
      "click",
      reportCurrentVideo
    );


  /*
   * REWARDS
   */

  $("dailyRewardBtn")
    ?.addEventListener(
      "click",
      claimDailyReward
    );


  $("rewardedAdBtn")
    ?.addEventListener(
      "click",
      claimRewardedAd
    );


  /*
   * UPLOAD
   */

  const fileInput =
    $("videoFileInput");


  fileInput?.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];

      handleVideoFile(
        file
      );
    }
  );


  $("uploadVideoBtn")
    ?.addEventListener(
      "click",
      uploadVideo
    );


  $("clearVideoBtn")
    ?.addEventListener(
      "click",
      clearSelectedVideo
    );


  /*
   * CREATOR
   */

  $("applyMonetizationBtn")
    ?.addEventListener(
      "click",
      applyMonetization
    );


  /*
   * PLAYER VIDEO
   */

  $("playerVideo")
    ?.addEventListener(
      "play",
      () => {

        if (currentVideo) {
          setupWatchTimer();
        }
      }
    );


  $("playerVideo")
    ?.addEventListener(
      "ended",
      () => {
        stopWatchTimer();
      }
    );
}


/* ======================================================
   GLOBAL FUNCTIONS
====================================================== */

window.login =
  login;

window.register =
  register;

window.logout =
  logout;

window.showPage =
  showPage;

window.openVideo =
  openVideo;

window.toggleLike =
  toggleLike;

window.toggleFollow =
  toggleFollow;

window.addComment =
  addComment;

window.reportCurrentVideo =
  reportCurrentVideo;

window.claimDailyReward =
  claimDailyReward;

window.claimRewardedAd =
  claimRewardedAd;

window.handleVideoFile =
  handleVideoFile;

window.uploadVideo =
  uploadVideo;

window.clearSelectedVideo =
  clearSelectedVideo;

window.deleteMyVideo =
  deleteMyVideo;

window.applyMonetization =
  applyMonetization;


/* ======================================================
   INITIALIZATION
====================================================== */

async function initApp() {

  console.log(
    "DekhoEarn Frontend v3.1.3 starting..."
  );


  bindEvents();

  setupPWAInstall();

  registerServiceWorker();


  await loadSession();


  console.log(
    "DekhoEarn Frontend initialized."
  );
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
    initApp,
    {
      once: true
    }
  );

} else {

  initApp();
}
