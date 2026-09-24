/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.1.4
 --------------------------------------------------------
 Compatible with:
 - DekhoEarn Server v3.1.3+
 - Secure Bearer Authentication
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
 - Detailed Upload Diagnostics
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

const CLOUDINARY_UPLOAD_TIMEOUT = 15 * 60 * 1000;


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

let uploadInProgress = false;


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
  }, 4500);
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

    return new Date(value).toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }
    );

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

  localStorage.removeItem(
    AUTH_TOKEN_KEY
  );

  localStorage.removeItem(
    USER_KEY
  );

  stopWatchTimer();
}


/* ======================================================
   API ERROR PARSER
====================================================== */

async function parseApiResponse(response) {

  const contentType =
    response.headers.get("content-type") || "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {

    try {

      return await response.json();

    } catch {

      return {};
    }
  }

  try {

    const text =
      await response.text();

    return {
      message: text
    };

  } catch {

    return {};
  }
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


  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {

    headers["Content-Type"] =
      "application/json";
  }


  if (authToken) {

    headers.Authorization =
      `Bearer ${authToken}`;
  }


  requestOptions.headers = headers;

  /*
   * Prevent stale GET responses.
   */

  if (
    !requestOptions.cache &&
    String(options.method || "GET")
      .toUpperCase() === "GET"
  ) {

    requestOptions.cache = "no-store";
  }


  let response;

  try {

    response = await fetch(
      `${API_BASE}${path}`,
      requestOptions
    );

  } catch (error) {

    console.error(
      "API FETCH ERROR:",
      {
        path,
        error
      }
    );

    throw new Error(
      "Network error while connecting to DekhoEarn server."
    );
  }


  const data =
    await parseApiResponse(
      response
    );


  if (
    response.status === 401 &&
    !path.startsWith(
      "/api/auth/login"
    ) &&
    !path.startsWith(
      "/api/auth/register"
    )
  ) {

    clearSession();

    showAuthScreen(
      "login",
      "Session expired. Please login again."
    );

    throw new Error(
      "Session expired. Please login again."
    );
  }


  if (!response.ok) {

    const message =
      data?.message ||
      data?.error ||
      `Request failed with HTTP ${response.status}`;

    throw new Error(
      message
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

  $("authScreen")
    ?.classList.remove(
      "hidden"
    );

  $("appScreen")
    ?.classList.add(
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

  $("authScreen")
    ?.classList.add(
      "hidden"
    );

  $("appScreen")
    ?.classList.remove(
      "hidden"
    );

  updateUserUI();

  showPage(
    "homeSection"
  );

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
        "Invalid login response from server."
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
      "LOGIN ERROR:",
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
      "REGISTER ERROR:",
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

    clearSession();

    showAuthScreen(
      "login"
    );

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
      "SESSION LOAD:",
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
      "LOGOUT API:",
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
      "REFRESH USER:",
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
    .forEach(
      section => {

        section.classList.toggle(
          "active",
          section.id === sectionId
        );
      }
    );


  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page === sectionId
        );
      }
    );


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
      "LOAD VIDEOS:",
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


function renderVideoFeed(videos) {

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
    videos.map(
      video => {

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
      }
    ).join("");
}


/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(videoId) {

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
      "OPEN VIDEO:",
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


  if (!current
