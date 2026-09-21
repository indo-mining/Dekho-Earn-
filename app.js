/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.1.0
 --------------------------------------------------------
 Secure Login / Register
 Persistent Session
 Video Feed
 Watch Rewards
 Likes / Comments / Reports
 Follow
 Daily Reward
 Rewarded Ad
 Upload to Cloudinary
 My Videos
 Creator Dashboard
 Logout
=========================================================
*/

"use strict";

const API_BASE = "";

const AUTH_TOKEN_KEY =
  "dekhoearn_auth_token";

const USER_KEY =
  "dekhoearn_user";

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;

let authToken =
  localStorage.getItem(
    AUTH_TOKEN_KEY
  ) || "";

let currentUser =
  JSON.parse(
    localStorage.getItem(USER_KEY) || "null"
  );

let currentVideo = null;

let watchSeconds = 0;
let watchRewardSent = false;

let watchTimer = null;

let selectedVideoFile = null;

let uploadObjectUrl = null;

let deferredPrompt = null;

/* ======================================================
   HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat(
    "en-IN"
  ).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(value)
      .toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "short",
          year: "numeric"
        }
      );
  } catch {
    return "";
  }
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 2800);
}

function saveSession(token, user) {
  authToken = token || "";

  currentUser = user || null;

  if (authToken) {
    localStorage.setItem(
      AUTH_TOKEN_KEY,
      authToken
    );
  } else {
    localStorage.removeItem(
      AUTH_TOKEN_KEY
    );
  }

  if (currentUser) {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify(currentUser)
    );
  } else {
    localStorage.removeItem(
      USER_KEY
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
}

/* ======================================================
   API
====================================================== */

async function api(
  endpoint,
  options = {}
) {
  const headers = {
    ...(options.body
      ? {
          "Content-Type":
            "application/json"
        }
      : {}),
    ...(options.headers || {})
  };

  if (authToken) {
    headers.Authorization =
      `Bearer ${authToken}`;
  }

  const response = await fetch(
    API_BASE + endpoint,
    {
      ...options,
      headers
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (
    response.status === 401 &&
    endpoint !== "/api/auth/login" &&
    endpoint !== "/api/auth/register"
  ) {
    clearSession();
    showAuthScreen("login");

    throw new Error(
      data.message ||
      "Session expired. Please login again."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Something went wrong."
    );
  }

  return data;
}

/* ======================================================
   AUTH SCREEN
====================================================== */

function showAuthScreen(mode = "login") {
  const authScreen =
    $("authScreen");

  const appShell =
    $("appShell");

  if (authScreen) {
    authScreen.classList.remove(
      "hidden"
    );
  }

  if (appShell) {
    appShell.classList.add(
      "hidden"
    );
  }

  if (mode === "register") {
    $("loginBox")?.classList.add(
      "hidden"
    );

    $("registerBox")?.classList.remove(
      "hidden"
    );
  } else {
    $("registerBox")?.classList.add(
      "hidden"
    );

    $("loginBox")?.classList.remove(
      "hidden"
    );
  }
}

function showApp() {
  $("authScreen")?.classList.add(
    "hidden"
  );

  $("appShell")?.classList.remove(
    "hidden"
  );

  updateUserUI();
}

/* ======================================================
   LOGIN
====================================================== */

async function login() {
  const username = $(
    "loginUsername"
  )?.value.trim();

  const password = $(
    "loginPassword"
  )?.value || "";

  if (!username) {
    showToast(
      "Username enter karein."
    );
    return;
  }

  if (!password) {
    showToast(
      "Password enter karein."
    );
    return;
  }

  const button = $(
    "loginBtn"
  );

  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Logging in...";
  }

  try {
    const data = await api(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        })
      }
    );

    saveSession(
      data.token,
      data.user
    );

    showToast(
      "Login successful 🎉"
    );

    $("loginPassword").value = "";

    showApp();

    await loadUser();

    await loadVideos();
  } catch (error) {
    showToast(
      error.message ||
      "Login failed."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "🔐 Login";
    }
  }
}

/* ======================================================
   REGISTER
====================================================== */

async function register() {
  const firstName = $(
    "registerName"
  )?.value.trim();

  const username = $(
    "registerUsername"
  )?.value.trim();

  const password = $(
    "registerPassword"
  )?.value || "";

  const referralCode = $(
    "registerReferral"
  )?.value.trim();

  if (!username) {
    showToast(
      "Username enter karein."
    );
    return;
  }

  if (username.length < 3) {
    showToast(
      "Username minimum 3 characters ka hona chahiye."
    );
    return;
  }

  if (password.length < 6) {
    showToast(
      "Password minimum 6 characters ka hona chahiye."
    );
    return;
  }

  const button = $(
    "registerBtn"
  );

  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Creating...";
  }

  try {
    const data = await api(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          first_name: firstName,
          username,
          password,
          referral_code:
            referralCode
        })
      }
    );

    saveSession(
      data.token,
      data.user
    );

    showToast(
      "Account created 🎉"
    );

    showApp();

    await loadUser();

    await loadVideos();
  } catch (error) {
    showToast(
      error.message ||
      "Registration failed."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "🚀 Create Account";
    }
  }
}

/* ======================================================
   SESSION
====================================================== */

async function restoreSession() {
  if (!authToken) {
    showAuthScreen("login");
    return false;
  }

  try {
    const data = await api(
      "/api/auth/me"
    );

    saveSession(
      authToken,
      data.user
    );

    showApp();

    return true;
  } catch {
    clearSession();
    showAuthScreen("login");
    return false;
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
  } catch {}

  stopWatchTimer();

  clearSession();

  currentVideo = null;

  showAuthScreen("login");

  showToast(
    "Logout successful."
  );
}

/* ======================================================
   USER UI
====================================================== */

function updateUserUI() {
  if (!currentUser) return;

  const name =
    currentUser.first_name ||
    currentUser.username ||
    "User";

  const username =
    currentUser.username ||
    "";

  $("headerGreeting").textContent =
    `Welcome ${name} 👋`;

  $("headerPoints").textContent =
    formatNumber(
      currentUser.points
    );

  $("profileName").textContent =
    name;

  $("profileUsername").textContent =
    `@${username}`;

  $("profilePoints").textContent =
    formatNumber(
      currentUser.points
    );

  $("profileVideos").textContent =
    formatNumber(
      currentUser.watched_videos
    );

  $("profileEarned").textContent =
    formatNumber(
      currentUser.total_earned
    );
}

async function loadUser() {
  if (!currentUser) return;

  try {
    const data = await api(
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
    console.error(
      "LOAD USER:",
      error
    );
  }
}

/* ======================================================
   NAVIGATION
====================================================== */

function showPage(pageId) {
  document
    .querySelectorAll(
      ".page-section"
    )
    .forEach((section) => {
      section.classList.remove(
        "active"
      );
    });

  const page =
    $(pageId);

  if (page) {
    page.classList.add(
      "active"
    );
  }

  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.page ===
          pageId
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (
    pageId === "earnSection"
  ) {
    loadPointsHistory();
  }

  if (
    pageId === "profileSection"
  ) {
    loadUser();
  }

  if (
    pageId === "creatorSection"
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

  feed.innerHTML = `
    <div class="loading-card">
      🎬 Videos load ho rahe hain...
    </div>
  `;

  try {
    const data = await api(
      "/api/videos"
    );

    const videos =
      data.videos || [];

    if (!videos.length) {
      feed.innerHTML = `
        <div class="empty-card">
          <div class="empty-icon">🎬</div>
          <h3>Abhi videos nahi hain</h3>
          <p>Pehla video aap upload karein.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML =
      videos
        .map(renderVideoCard)
        .join("");
  } catch (error) {
    feed.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">⚠️</div>
        <h3>Videos load nahi ho paaye</h3>
        <p>${escapeHTML(
          error.message
        )}</p>
      </div>
    `;
  }
}

function renderVideoCard(video) {
  const creator =
    video.creator_name ||
    video.creator_username ||
    "Creator";

  return `
    <article
      class="video-card"
      data-video-id="${video.id}"
    >

      <button
        type="button"
        class="video-card-main"
        onclick="openVideo(${video.id})"
      >

        <div class="video-thumbnail">

          ${
            video.thumbnail_url
              ? `
                <img
                  src="${escapeHTML(
                    video.thumbnail_url
                  )}"
                  alt=""
                  loading="lazy"
                />
              `
              : `
                <div class="video-placeholder">
                  ▶
                </div>
              `
          }

          <span class="play-overlay">
            ▶
          </span>

        </div>

        <div class="video-card-info">

          <h3>
            ${escapeHTML(
              video.title
            )}
          </h3>

          <p class="creator-line">
            👤 ${escapeHTML(
              creator
            )}
          </p>

          <div class="video-meta">
            <span>
              👁️ ${formatNumber(
                video.views
              )}
            </span>

            <span>
              ❤️ ${formatNumber(
                video.likes_count
              )}
            </span>

            <span>
              💬 ${formatNumber(
                video.comments_count
              )}
            </span>
          </div>

        </div>

      </button>

    </article>
  `;
}

/* ======================================================
   OPEN VIDEO
====================================================== */

async function openVideo(videoId) {
  showPage(
    "playerSection"
  );

  stopWatchTimer();

  const videoElement =
    $("mainVideo");

  if (videoElement) {
    videoElement.pause();
    videoElement.removeAttribute(
      "src"
    );
    videoElement.load();
  }

  $("playerTitle").textContent =
    "Loading...";

  $("playerDescription").textContent =
    "";

  $("commentsList").innerHTML =
    "";

  try {
    const data = await api(
      `/api/videos/${videoId}`
    );

    currentVideo =
      data.video;

    renderPlayer(
      currentVideo
    );

    await loadComments(
      currentVideo.id
    );

    startWatchTracking();
  } catch (error) {
    showToast(
      error.message
    );
    showPage(
      "homeSection"
    );
  }
}

function renderPlayer(video) {
  const player =
    $("mainVideo");

  if (player) {
    player.src =
      video.video_url;

    player.load();
  }

  $("playerTitle").textContent =
    video.title;

  $("playerDescription").textContent =
    video.description ||
    "No description.";

  $("playerViews").textContent =
    formatNumber(
      video.views
    );

  $("playerLikes").textContent =
    formatNumber(
      video.likes_count
    );

  $("playerCommentsCount").textContent =
    formatNumber(
      video.comments_count
    );

  const followBtn =
    $("followCreatorBtn");

  if (followBtn) {
    followBtn.dataset.creatorId =
      video.user_id;
  }
}

/* ======================================================
   WATCH TRACKING
====================================================== */

function startWatchTracking() {
  stopWatchTimer();

  watchSeconds = 0;
  watchRewardSent = false;

  const player =
    $("mainVideo");

  if (!player) return;

  player.addEventListener(
    "timeupdate",
    handleVideoTime,
    {
      passive: true
    }
  );
}

function handleVideoTime() {
  const player =
    $("mainVideo");

  if (!player) return;

  watchSeconds = Math.floor(
    player.currentTime || 0
  );

  if (
    watchSeconds >= 10 &&
    !watchRewardSent
  ) {
    completeWatch();
  }
}

function stopWatchTimer() {
  const player =
    $("mainVideo");

  if (player) {
    player.removeEventListener(
      "timeupdate",
      handleVideoTime
    );
  }
}

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
    const data = await api(
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

    if (data.reward > 0) {
      showToast(
        `+${data.reward} point earned 🎉`
      );

      await loadUser();
    }
  } catch (error) {
    watchRewardSent = false;

    console.error(
      "WATCH REWARD:",
      error
    );
  }
}

/* ======================================================
   LIKE
====================================================== */

async function likeVideo() {
  if (!currentVideo) return;

  try {
    const data = await api(
      `/api/videos/${currentVideo.id}/like`,
      {
        method: "POST"
      }
    );

    currentVideo.likes_count =
      data.likes_count;

    $("playerLikes").textContent =
      formatNumber(
        data.likes_count
      );

    showToast(
      data.liked
        ? "Liked ❤️"
        : "Like removed"
    );
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* ======================================================
   COMMENTS
====================================================== */

async function loadComments(
  videoId
) {
  const list =
    $("commentsList");

  if (!list) return;

  list.innerHTML = `
    <div class="comment-loading">
      Comments load ho rahe hain...
    </div>
  `;

  try {
    const data = await api(
      `/api/videos/${videoId}/comments`
    );

    const comments =
      data.comments || [];

    if (!comments.length) {
      list.innerHTML = `
        <div class="no-comments">
          Abhi koi comment nahi hai.
          Aap first comment karein 💬
        </div>
      `;
      return;
    }

    list.innerHTML =
      comments
        .map((comment) => {
          const name =
            comment.first_name ||
            comment.username ||
            "User";

          return `
            <div class="comment-item">
              <div class="comment-avatar">
                👤
              </div>

              <div class="comment-content">
                <strong>
                  ${escapeHTML(
                    name
                  )}
                </strong>

                <p>
                  ${escapeHTML(
                    comment.comment
                  )}
                </p>

                <small>
                  ${formatDate(
                    comment.created_at
                  )}
                </small>
              </div>
            </div>
          `;
        })
        .join("");
  } catch (error) {
    list.innerHTML = `
      <div class="no-comments">
        Comments load nahi ho paaye.
      </div>
    `;
  }
}

async function postComment() {
  if (!currentVideo) return;

  const input =
    $("commentInput");

  const comment =
    input?.value.trim();

  if (!comment) {
    showToast(
      "Comment likhein."
    );
    return;
  }

  try {
    await api(
      `/api/videos/${currentVideo.id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          comment
        })
      }
    );

    input.value = "";

    await loadComments(
      currentVideo.id
    );

    showToast(
      "Comment added 💬"
    );
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* ======================================================
   REPORT
====================================================== */

async function reportVideo() {
  if (!currentVideo) return;

  const reason =
    prompt(
      "Report reason likhein:"
    );

  if (reason === null) return;

  try {
    await api(
      `/api/videos/${currentVideo.id}/report`,
      {
        method: "POST",
        body: JSON.stringify({
          reason
        })
      }
    );

    showToast(
      "Report submitted 🚩"
    );
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* ======================================================
   FOLLOW
====================================================== */

async function followCreator() {
  const button =
    $("followCreatorBtn");

  const creatorId =
    button?.dataset.creatorId;

  if (!creatorId) return;

  try {
    const data = await api(
      `/api/creator/${creatorId}/follow`,
      {
        method: "POST"
      }
    );

    button.textContent =
      data.following
        ? "👤 Following"
        : "👤 Follow";

    showToast(
      data.message
    );
  } catch (error) {
    showToast(
      error.message
    );
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
    button.textContent =
      "⏳ Checking...";
  }

  try {
    const data = await api(
      "/api/daily/claim",
      {
        method: "POST"
      }
    );

    showToast(
      data.message
    );

    await loadUser();
  } catch (error) {
    showToast(
      error.message
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "Claim +10";
    }
  }
}

/* ======================================================
   REWARDED AD
====================================================== */

async function rewardedAd() {
  const button =
    $("rewardedAdBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Ad complete...";
  }

  /*
   IMPORTANT:
   This endpoint should only be called after
   a real rewarded advertisement confirms completion.
   This demo button is kept as the existing app flow.
  */

  try {
    const data = await api(
      "/api/rewarded-ad/complete",
      {
        method: "POST"
      }
    );

    showToast(
      data.message
    );

    await loadUser();
  } catch (error) {
    showToast(
      error.message
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "Watch Ad +5";
    }
  }
}

/* ======================================================
   POINT HISTORY
====================================================== */

async function loadPointsHistory() {
  const container =
    $("pointsHistory");

  if (!container ||
      !currentUser) {
    return;
  }

  container.innerHTML = `
    <div class="loading-card">
      History load ho rahi hai...
    </div>
  `;

  try {
    const data = await api(
      `/api/user/${currentUser.id}/points/history`
    );

    const history =
      data.history || [];

    if (!history.length) {
      container.innerHTML = `
        <div class="empty-small">
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
                ${escapeHTML(
                  item.description ||
                  item.type
                )}
              </strong>

              <small>
                ${formatDate(
                  item.created_at
                )}
              </small>
            </div>

            <b class="history-points">
              +${formatNumber(
                item.points
              )}
            </b>

          </div>
        `)
        .join("");
  } catch (error) {
    container.innerHTML = `
      <div class="empty-small">
        History load nahi ho paayi.
      </div>
    `;
  }
}

/* ======================================================
   UPLOAD ELEMENTS
====================================================== */

function setupUpload() {
  const input =
    $("videoFile");

  if (!input) return;

  input.addEventListener(
    "change",
    handleVideoSelect
  );

  $("uploadVideoBtn")
    ?.addEventListener(
      "click",
      uploadUserVideo
    );
}

function handleVideoSelect(event) {
  const file =
    event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith(
    "video/"
  )) {
    showToast(
      "Sirf video file select karein."
    );

    event.target.value = "";
    return;
  }

  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {
    showToast(
      "Video maximum 100 MB ho sakta hai."
    );

    event.target.value = "";
    return;
  }

  selectedVideoFile =
    file;

  $("videoFileName").textContent =
    file.name;

  if (uploadObjectUrl) {
    URL.revokeObjectURL(
      uploadObjectUrl
    );
  }

  uploadObjectUrl =
    URL.createObjectURL(file);

  const preview =
    $("uploadPreviewVideo");

  if (preview) {
    preview.src =
      uploadObjectUrl;
  }

  $("uploadPreview")
    ?.classList.remove(
      "hidden"
    );
}

function updateUploadProgress(
  percent,
  message
) {
  $("uploadProgressBox")
    ?.classList.remove(
      "hidden"
    );

  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent || 0)
      )
    );

  if ($("uploadProgressBar")) {
    $("uploadProgressBar").style.width =
      `${safePercent}%`;
  }

  if ($("uploadProgressPercent")) {
    $("uploadProgressPercent").textContent =
      `${Math.round(
        safePercent
      )}%`;
  }

  if ($("uploadProgressText")) {
    $("uploadProgressText").textContent =
      message ||
      "Uploading...";
  }
}

/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

async function getCloudinarySignature() {
  return api(
    "/api/cloudinary/signature",
    {
      method: "POST"
    }
  );
}

/* ======================================================
   CLOUDINARY UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signatureData
) {
  return new Promise(
    (resolve, reject) => {
      const cloudName =
        signatureData.cloud_name;

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

      const xhr =
        new XMLHttpRequest();

      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName
        )}/video/upload`
      );

      xhr.upload.onprogress =
        (event) => {
          if (!event.lengthComputable) {
            return;
          }

          const percent =
            event.loaded /
            event.total *
            100;

          updateUploadProgress(
            percent,
            "Cloudinary par video upload ho rahi hai..."
          );
        };

      xhr.onload = () => {
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
        } else {
          reject(
            new Error(
              data.error?.message ||
              "Cloudinary upload failed."
            )
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            "Cloudinary network error."
          )
        );
      };

      xhr.onabort = () => {
        reject(
          new Error(
            "Upload cancelled."
          )
        );
      };

      xhr.send(formData);
    }
  );
}

/* ======================================================
   SAVE VIDEO
====================================================== */

async function saveVideoMetadata(
  cloudinaryData,
  title,
  description
) {
  return api(
    "/api/videos",
    {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        video_url:
          cloudinaryData.secure_url ||
          "",
        thumbnail_url:
          cloudinaryData.secure_url
            ? cloudinaryData.secure_url
                .replace(
                  "/video/upload/",
                  "/video/upload/so_0/"
                )
                .replace(
                  /\.(mp4|mov|webm)$/i,
                  ".jpg"
                )
            : "",
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
            cloudinaryData.duration || 0
          ),
        bytes:
          Number(
            cloudinaryData.bytes || 0
          )
      })
    }
  );
}

/* ======================================================
   RESET UPLOAD
====================================================== */

function resetUploadForm() {
  selectedVideoFile = null;

  if (uploadObjectUrl) {
    URL.revokeObjectURL(
      uploadObjectUrl
    );

    uploadObjectUrl = null;
  }

  if ($("videoFile")) {
    $("videoFile").value = "";
  }

  if ($("videoTitle")) {
    $("videoTitle").value = "";
  }

  if ($("videoDescription")) {
    $("videoDescription").value =
      "";
  }

  if ($("videoFileName")) {
    $("videoFileName").textContent =
      "Gallery se video choose karein";
  }

  $("uploadPreview")
    ?.classList.add(
      "hidden"
    );

  $("uploadProgressBox")
    ?.classList.add(
      "hidden"
    );

  if ($("uploadProgressBar")) {
    $("uploadProgressBar")
      .style.width = "0%";
  }
}

/* ======================================================
   UPLOAD
====================================================== */

async function uploadUserVideo() {
  if (!currentUser) {
    showAuthScreen("login");
    return;
  }

  const title =
    $("videoTitle")
      ?.value.trim();

  const description =
    $("videoDescription")
      ?.value.trim() || "";

  if (!title) {
    showToast(
      "Video title enter karein."
    );
    return;
  }

  if (!selectedVideoFile) {
    showToast(
      "Video select karein."
    );
    return;
  }

  if (
    selectedVideoFile.size >
    MAX_VIDEO_SIZE
  ) {
    showToast(
      "Video maximum 100 MB ho sakta hai."
    );
    return;
  }

  const button =
    $("uploadVideoBtn");

  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Uploading...";
  }

  try {
    updateUploadProgress(
      0,
      "Upload prepare ho raha hai..."
    );

    const signature =
      await getCloudinarySignature();

    updateUploadProgress(
      1,
      "Cloudinary upload start..."
    );

    const cloudinary =
      await uploadToCloudinary(
        selectedVideoFile,
        signature
      );

    updateUploadProgress(
      100,
      "Video upload complete. Database mein save ho raha hai..."
    );

    const saved =
      await saveVideoMetadata(
        cloudinary,
        title,
        description
      );

    showToast(
      saved.message ||
      "Video uploaded 🎉"
    );

    resetUploadForm();

    await loadVideos();

    showPage(
      "homeSection"
    );
  } catch (error) {
    console.error(
      "UPLOAD ERROR:",
      error
    );

    showToast(
      error.message ||
      "Video upload failed."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "🎥 Upload Video";
    }
  }
}

const uploadVideo =
  uploadUserVideo;

/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {
  if (!currentUser) return;

  const container =
    $("myVideosList");

  if (!container) return;

  container.innerHTML = `
    <div class="loading-card">
      My videos load ho rahe hain...
    </div>
  `;

  try {
    const data = await api(
      `/api/videos?creator_id=${encodeURIComponent(
        currentUser.id
      )}`
    );

    const videos =
      data.videos || [];

    if (!videos.length) {
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-icon">🎥</div>
          <h3>Abhi aapne koi video upload nahi kiya</h3>
          <p>Upload section se apna first video share karein.</p>
        </div>
      `;
      return;
    }

    container.innerHTML =
      videos
        .map(
          (video) => `
            <div class="my-video-item">

              <div class="my-video-info">
                <strong>
                  ${escapeHTML(
                    video.title
                  )}
                </strong>

                <small>
                  👁️ ${formatNumber(
                    video.views
                  )}
                  · ❤️ ${formatNumber(
                    video.likes_count
                  )}
                </small>
              </div>

              <button
                type="button"
                class="danger-small-btn"
                onclick="deleteMyVideo(${video.id})"
              >
                Delete
              </button>

            </div>
          `
        )
        .join("");
  } catch (error) {
    container.innerHTML = `
      <div class="empty-small">
        ${escapeHTML(
          error.message
        )}
      </div>
    `;
  }
}

async function deleteMyVideo(
  videoId
) {
  const confirmed =
    confirm(
      "Kya aap ye video delete karna chahte hain?"
    );

  if (!confirmed) return;

  try {
    await api(
      `/api/videos/${videoId}`,
      {
        method: "DELETE"
      }
    );

    showToast(
      "Video deleted."
    );

    await loadMyVideos();
    await loadVideos();
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* ======================================================
   CREATOR DASHBOARD
====================================================== */

async function loadCreatorDashboard() {
  if (!currentUser) return;

  const container =
    $("creatorStats");

  if (!container) return;

  container.innerHTML = `
    <div class="loading-card">
      Dashboard load ho raha hai...
    </div>
  `;

  try {
    const data = await api(
      `/api/creator/${currentUser.id}`
    );

    const creator =
      data.creator;

    container.innerHTML = `
      <div class="stat-card">
        <span>🎥</span>
        <strong>
          ${formatNumber(
            creator.video_count
          )}
        </strong>
        <small>Videos</small>
      </div>

      <div class="stat-card">
        <span>👁️</span>
        <strong>
          ${formatNumber(
            creator.total_views
          )}
        </strong>
        <small>Views</small>
      </div>

      <div class="stat-card">
        <span>❤️</span>
        <strong>
          ${formatNumber(
            creator.total_likes
          )}
        </strong>
        <small>Likes</small>
      </div>

      <div class="stat-card">
        <span>👥</span>
        <strong>
          ${formatNumber(
            creator.followers
          )}
        </strong>
        <small>Followers</small>
      </div>

      <div class="stat-card">
        <span>💬</span>
        <strong>
          ${formatNumber(
            creator.total_comments
          )}
        </strong>
        <small>Comments</small>
      </div>

      <div class="stat-card">
        <span>💰</span>
        <strong>
          ₹${Number(
            creator.earnings || 0
          ).toFixed(2)}
        </strong>
        <small>Earnings</small>
      </div>
    `;

    const applyBtn =
      $("applyMonetizationBtn");

    if (
      currentUser.monetization_status ===
      "pending"
    ) {
      applyBtn.textContent =
        "⏳ Monetization Pending";

      applyBtn.disabled = true;
    } else if (
      currentUser.monetization_status ===
      "approved"
    ) {
      applyBtn.textContent =
        "✅ Monetization Active";

      applyBtn.disabled = true;
    }
  } catch (error) {
    container.innerHTML = `
      <div class="empty-small">
        Dashboard load nahi ho paaya.
      </div>
    `;
  }
}

async function applyMonetization() {
  if (!currentUser) return;

  const button =
    $("applyMonetizationBtn");

  try {
    button.disabled = true;

    const data = await api(
      `/api/creator/${currentUser.id}/monetization/apply`,
      {
        method: "POST"
      }
    );

    showToast(
      data.message
    );

    await loadUser();
    await loadCreatorDashboard();
  } catch (error) {
    button.disabled = false;

    showToast(
      error.message
    );
  }
}

/* ======================================================
   EVENT LISTENERS
====================================================== */

function setupEvents() {
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

  $("showRegisterBtn")
    ?.addEventListener(
      "click",
      () =>
        showAuthScreen(
          "register"
        )
    );

  $("showLoginBtn")
    ?.addEventListener(
      "click",
      () =>
        showAuthScreen(
          "login"
        )
    );

  $("logoutBtn")
    ?.addEventListener(
      "click",
      logout
    );

  $("likeVideoBtn")
    ?.addEventListener(
      "click",
      likeVideo
    );

  $("commentBtn")
    ?.addEventListener(
      "click",
      postComment
    );

  $("reportVideoBtn")
    ?.addEventListener(
      "click",
      reportVideo
    );

  $("followCreatorBtn")
    ?.addEventListener(
      "click",
      followCreator
    );

  $("backFromPlayerBtn")
    ?.addEventListener(
      "click",
      () => {
        stopWatchTimer();
        showPage(
          "homeSection"
        );
      }
    );

  $("dailyRewardBtn")
    ?.addEventListener(
      "click",
      claimDailyReward
    );

  $("rewardedAdBtn")
    ?.addEventListener(
      "click",
      rewardedAd
    );

  $("refreshFeedBtn")
    ?.addEventListener(
      "click",
      loadVideos
    );

  $("myVideosBtn")
    ?.addEventListener(
      "click",
      async () => {
        const box =
          $("myVideosContainer");

        if (!box) return;

        box.classList.toggle(
          "hidden"
        );

        if (
          !box.classList.contains(
            "hidden"
          )
        ) {
          await loadMyVideos();
        }
      }
    );

  $("creatorDashboardBtn")
    ?.addEventListener(
      "click",
      () =>
        showPage(
          "creatorSection"
        )
    );

  $("applyMonetizationBtn")
    ?.addEventListener(
      "click",
      applyMonetization
    );

  document
    .querySelectorAll(
      ".nav-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          showPage(
            button.dataset.page
          );
        }
      );
    });

  $("loginPassword")
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter"
        ) {
          login();
        }
      }
    );

  $("registerPassword")
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter"
        ) {
          register();
        }
      }
    );

  $("commentInput")
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter"
        ) {
          postComment();
        }
      }
    );
}

/* ======================================================
   PWA
====================================================== */

window.addEventListener(
  "beforeinstallprompt",
  (event) => {
    event.preventDefault();
    deferredPrompt = event;
  }
);

async function installApp() {
  if (!deferredPrompt) {
    showToast(
      "Install option browser menu mein available ho sakta hai."
    );
    return;
  }

  deferredPrompt.prompt();

  await deferredPrompt.userChoice;

  deferredPrompt = null;
}

/* ======================================================
   START
====================================================== */

async function startApp() {
  setupEvents();
  setupUpload();

  const loggedIn =
    await restoreSession();

  if (!loggedIn) {
    return;
  }

  await loadUser();
  await loadVideos();
}

document.addEventListener(
  "DOMContentLoaded",
  startApp
);
