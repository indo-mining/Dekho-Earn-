/*
=========================================================
 DEKHOEARN FRONTEND
 Version 3.0.0
 --------------------------------------------------------
 Login / Register
 Video Feed
 Watch Reward
 Cloudinary Upload
 Neon Metadata
 Likes / Comments
 Daily Reward
 Creator
 Profile
 PWA
=========================================================
*/

"use strict";

const API_BASE = "";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

let currentUser = null;
let currentVideo = null;

let watchSeconds = 0;
let watchRewardSent = false;

let selectedVideoFile = null;
let uploadObjectUrl = null;

let watchTimer = null;


/* ======================================================
   DOM HELPER
====================================================== */

function $(id) {
  return document.getElementById(id);
}


/* ======================================================
   TOAST
====================================================== */

function showToast(message, type = "normal") {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove(
    "hidden",
    "success",
    "error"
  );

  if (type === "success") {
    toast.classList.add("success");
  }

  if (type === "error") {
    toast.classList.add("error");
  }

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}


/* ======================================================
   ESCAPE HTML
====================================================== */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ======================================================
   API
====================================================== */

async function api(
  endpoint,
  options = {}
) {
  const headers = {
    ...(options.headers || {}),
  };

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  if (currentUser?.id) {
    headers["x-user-id"] =
      String(currentUser.id);
  }

  const response = await fetch(
    API_BASE + endpoint,
    {
      ...options,
      headers,
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      ok: false,
      message: "Invalid server response.",
    };
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


/* ======================================================
   LOCAL STORAGE
====================================================== */

const AUTH_KEY =
  "dekhoearn_logged_user";


function saveCurrentUser(user) {
  currentUser = user;

  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify(user)
  );
}


function getSavedUser() {
  try {
    const value =
      localStorage.getItem(AUTH_KEY);

    if (!value) return null;

    return JSON.parse(value);
  } catch {
    return null;
  }
}


function clearSavedUser() {
  localStorage.removeItem(AUTH_KEY);
}


/* ======================================================
   AUTH SCREEN
====================================================== */

function showAuth() {
  $("authScreen")?.classList.remove("hidden");
  $("appShell")?.classList.add("hidden");
}


function showApp() {
  $("authScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");
}


/* ======================================================
   LOGIN / REGISTER SWITCH
====================================================== */

function setupAuthSwitches() {

  $("showRegisterBtn")?.addEventListener(
    "click",
    () => {
      $("loginBox")?.classList.add("hidden");
      $("registerBox")?.classList.remove("hidden");
    }
  );


  $("showLoginBtn")?.addEventListener(
    "click",
    () => {
      $("registerBox")?.classList.add("hidden");
      $("loginBox")?.classList.remove("hidden");
    }
  );

}


/* ======================================================
   LOGIN
====================================================== */

async function login() {

  const username =
    $("loginUsername")?.value.trim();

  const password =
    $("loginPassword")?.value || "";

  if (!username) {
    showToast(
      "Username enter karein.",
      "error"
    );
    return;
  }

  if (!password) {
    showToast(
      "Password enter karein.",
      "error"
    );
    return;
  }

  const button = $("loginBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Logging in...";
  }

  try {

    const data = await api(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
        }),
      }
    );

    saveCurrentUser(data.user);

    showApp();

    await loadUser();

    await loadVideos();

    showToast(
      "Login successful 🎉",
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
      button.textContent = "🔐 Login";
    }

  }
}


/* ======================================================
   REGISTER
====================================================== */

async function register() {

  const firstName =
    $("registerName")?.value.trim();

  const username =
    $("registerUsername")?.value.trim();

  const password =
    $("registerPassword")?.value || "";

  const referralCode =
    $("registerReferral")?.value.trim();

  if (!username) {
    showToast(
      "Username enter karein.",
      "error"
    );
    return;
  }

  if (username.length < 3) {
    showToast(
      "Username minimum 3 characters ka hona chahiye.",
      "error"
    );
    return;
  }

  if (password.length < 6) {
    showToast(
      "Password minimum 6 characters ka hona chahiye.",
      "error"
    );
    return;
  }

  const button = $("registerBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "Creating...";
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
          referral_code: referralCode,
        }),
      }
    );

    saveCurrentUser(data.user);

    showApp();

    await loadUser();

    await loadVideos();

    showToast(
      "Account created successfully 🎉",
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
      button.textContent =
        "🚀 Create Account";
    }

  }
}


/* ======================================================
   LOGOUT
====================================================== */

async function logout() {

  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );
  } catch {
    // Local logout should still work.
  }

  currentUser = null;
  currentVideo = null;

  clearSavedUser();

  localStorage.removeItem(
    "dekhoearn_user"
  );

  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }

  $("loginPassword").value = "";

  showAuth();

  showToast(
    "Logout successful.",
    "success"
  );
}


/* ======================================================
   LOAD USER
====================================================== */

async function loadUser() {

  if (!currentUser?.id) {
    return;
  }

  try {

    const data = await api(
      `/api/user/${encodeURIComponent(
        currentUser.id
      )}`
    );

    currentUser = data.user;

    saveCurrentUser(
      currentUser
    );

    updateUserUI();

  } catch (error) {

    console.error(
      "LOAD USER:",
      error
    );

    clearSavedUser();
    currentUser = null;

    showAuth();
  }
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
    currentUser.username || "";

  const points =
    Number(currentUser.points || 0);

  const watched =
    Number(
      currentUser.watched_videos || 0
    );

  const earned =
    Number(
      currentUser.total_earned || 0
    );

  if ($("headerGreeting")) {
    $("headerGreeting").textContent =
      `Hello, ${name} 👋`;
  }

  if ($("headerPoints")) {
    $("headerPoints").textContent =
      points.toLocaleString();
  }

  if ($("profileName")) {
    $("profileName").textContent =
      name;
  }

  if ($("profileUsername")) {
    $("profileUsername").textContent =
      `@${username}`;
  }

  if ($("profilePoints")) {
    $("profilePoints").textContent =
      points.toLocaleString();
  }

  if ($("profileVideos")) {
    $("profileVideos").textContent =
      watched.toLocaleString();
  }

  if ($("profileEarned")) {
    $("profileEarned").textContent =
      earned.toLocaleString();
  }
}


/* ======================================================
   NAVIGATION
====================================================== */

const pages = [
  "homeSection",
  "watchSection",
  "playerSection",
  "earnSection",
  "uploadSection",
  "profileSection",
  "creatorSection",
];


function showPage(pageId) {

  pages.forEach((id) => {
    $(id)?.classList.toggle(
      "active",
      id === pageId
    );
  });

  document
    .querySelectorAll(".nav-btn")
    .forEach((button) => {

      button.classList.toggle(
        "active",
        button.dataset.page === pageId
      );

    });


  if (pageId === "homeSection") {
    loadVideos();
  }

  if (pageId === "watchSection") {
    loadWatchHistory();
  }

  if (pageId === "earnSection") {
    loadPointsHistory();
  }

  if (pageId === "profileSection") {
    loadMyVideos();
  }

  if (pageId === "creatorSection") {
    loadCreatorDashboard();
  }
}


function setupNavigation() {

  document
    .querySelectorAll(".nav-btn")
    .forEach((button) => {

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

    });

}


/* ======================================================
   VIDEO FEED
====================================================== */

async function loadVideos() {

  const feed = $("videoFeed");

  if (!feed) return;

  feed.innerHTML = `
    <div class="loading-card">
      Loading videos...
    </div>
  `;

  try {

    const data =
      await api("/api/videos");

    renderVideos(
      data.videos || [],
      feed
    );

  } catch (error) {

    feed.innerHTML = `
      <div class="empty-card">
        ${escapeHTML(error.message)}
      </div>
    `;

  }
}


function renderVideos(
  videos,
  container
) {

  if (!videos.length) {

    container.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">🎬</div>
        <h3>No videos yet</h3>
        <p>Sabse pehle apna video upload karein.</p>
      </div>
    `;

    return;
  }


  container.innerHTML =
    videos.map((video) => {

      const title =
        escapeHTML(video.title);

      const description =
        escapeHTML(
          video.description || ""
        );

      const creator =
        escapeHTML(
          video.creator_name ||
          video.creator_username ||
          "Creator"
        );

      return `
        <article
          class="video-card"
          data-video-id="${video.id}"
        >

          <div
            class="video-thumbnail"
            onclick="openVideo(${video.id})"
          >

            ${
              video.thumbnail_url
                ? `
                  <img
                    src="${escapeHTML(
                      video.thumbnail_url
                    )}"
                    alt="${title}"
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

          <div class="video-card-body">

            <h3>
              ${title}
            </h3>

            <p>
              ${description}
            </p>

            <div class="video-card-meta">

              <span>
                👤 ${creator}
              </span>

              <span>
                👁️ ${formatNumber(video.views)}
              </span>

              <span>
                ❤️ ${formatNumber(video.likes_count)}
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

async function openVideo(videoId) {

  try {

    const data =
      await api(
        `/api/videos/${videoId}`
      );

    currentVideo =
      data.video;

    setupPlayer(
      currentVideo
    );

    showPage(
      "playerSection"
    );

    await loadComments(
      videoId
    );

    startWatchTracking();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

  }
}


function setupPlayer(video) {

  if (!video) return;

  const player =
    $("mainVideo");

  if (player) {

    player.pause();

    player.src =
      video.video_url;

    player.load();

  }

  if ($("playerTitle")) {
    $("playerTitle").textContent =
      video.title || "Video";
  }

  if ($("playerDescription")) {
    $("playerDescription").textContent =
      video.description || "";
  }

  if ($("playerViews")) {
    $("playerViews").textContent =
      formatNumber(video.views);
  }

  if ($("playerLikes")) {
    $("playerLikes").textContent =
      formatNumber(video.likes_count);
  }

  if ($("playerCommentsCount")) {
    $("playerCommentsCount").textContent =
      formatNumber(
        video.comments_count
      );
  }

  watchSeconds = 0;
  watchRewardSent = false;
}


/* ======================================================
   WATCH TRACKING
====================================================== */

function startWatchTracking() {

  if (watchTimer) {
    clearInterval(watchTimer);
  }

  watchTimer =
    setInterval(() => {

      const player =
        $("mainVideo");

      if (!player) return;

      if (
        !player.paused &&
        !player.ended
      ) {

        watchSeconds++;

        if (
          watchSeconds >= 10 &&
          !watchRewardSent
        ) {
          completeWatch();
        }

      }

    }, 1000);
}


async function completeWatch() {

  if (
    !currentVideo ||
    watchRewardSent ||
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
          body: JSON.stringify({
            video_id:
              currentVideo.id,
            watch_seconds:
              watchSeconds,
          }),
        }
      );

    if (data.reward > 0) {

      showToast(
        `+${data.reward} point earned 🎉`,
        "success"
      );

      await loadUser();
    }

  } catch (error) {

    console.error(
      "WATCH REWARD:",
      error
    );

    watchRewardSent = false;
  }
}


/* ======================================================
   LIKE
====================================================== */

async function likeCurrentVideo() {

  if (!currentVideo) return;

  try {

    const data =
      await api(
        `/api/videos/${currentVideo.id}/like`,
        {
          method: "POST",
        }
      );

    currentVideo.likes_count =
      data.likes_count;

    if ($("playerLikes")) {
      $("playerLikes").textContent =
        formatNumber(
          data.likes_count
        );
    }

    showToast(
      data.liked
        ? "Liked ❤️"
        : "Like removed.",
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
   COMMENTS
====================================================== */

async function loadComments(videoId) {

  const container =
    $("commentsList");

  if (!container) return;

  container.innerHTML =
    `<div class="loading-card">
      Loading comments...
    </div>`;

  try {

    const data =
      await api(
        `/api/videos/${videoId}/comments`
      );

    const comments =
      data.comments || [];

    if (!comments.length) {

      container.innerHTML =
        `<div class="empty-comment">
          No comments yet.
        </div>`;

      return;
    }

    container.innerHTML =
      comments.map(
        (comment) => {

          const name =
            escapeHTML(
              comment.first_name ||
              comment.username ||
              "User"
            );

          const text =
            escapeHTML(
              comment.comment
            );

          return `
            <div class="comment-item">

              <div class="comment-avatar">
                👤
              </div>

              <div>

                <strong>
                  ${name}
                </strong>

                <p>
                  ${text}
                </p>

              </div>

            </div>
          `;

        }
      ).join("");

  } catch (error) {

    container.innerHTML =
      `<div class="empty-comment">
        ${escapeHTML(error.message)}
      </div>`;
  }
}


async function addComment() {

  if (!currentVideo) return;

  const input =
    $("commentInput");

  const comment =
    input?.value.trim();

  if (!comment) {

    showToast(
      "Comment likhein.",
      "error"
    );

    return;
  }

  try {

    await api(
      `/api/videos/${currentVideo.id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          comment,
        }),
      }
    );

    input.value = "";

    await loadComments(
      currentVideo.id
    );

    currentVideo.comments_count++;

    if ($("playerCommentsCount")) {
      $("playerCommentsCount").textContent =
        formatNumber(
          currentVideo.comments_count
        );
    }

    showToast(
      "Comment added 💬",
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
   REPORT
====================================================== */

async function reportCurrentVideo() {

  if (!currentVideo) return;

  const reason =
    prompt(
      "Report reason:"
    );

  if (reason === null) {
    return;
  }

  try {

    await api(
      `/api/videos/${currentVideo.id}/report`,
      {
        method: "POST",
        body: JSON.stringify({
          reason,
        }),
      }
    );

    showToast(
      "Report submitted 🚩",
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
   FOLLOW
====================================================== */

async function followCreator() {

  if (!currentVideo) return;

  const creatorId =
    currentVideo.user_id ||
    currentVideo.creator_id;

  if (!creatorId) return;

  try {

    const data =
      await api(
        `/api/creator/${creatorId}/follow`,
        {
          method: "POST",
        }
      );

    showToast(
      data.message,
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
   DAILY REWARD
====================================================== */

async function claimDailyReward() {

  try {

    const data =
      await api(
        "/api/daily/claim",
        {
          method: "POST",
        }
      );

    showToast(
      data.message,
      data.reward > 0
        ? "success"
        : "normal"
    );

    if (data.reward > 0) {
      await loadUser();
    }

  } catch (error) {

    showToast(
      error.message,
      "error"
    );

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
      "Advertisement...";
  }

  try {

    /*
      Real ad network ko later yahan connect
      kiya ja sakta hai.

      Abhi demo completion endpoint call
      kiya ja raha hai.
    */

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 3000)
    );

    const data =
      await api(
        "/api/rewarded-ad/complete",
        {
          method: "POST",
        }
      );

    showToast(
      data.message,
      "success"
    );

    await loadUser();

  } catch (error) {

    showToast(
      error.message,
      "error"
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
   POINTS HISTORY
====================================================== */

async function loadPointsHistory() {

  const container =
    $("pointsHistory");

  if (!container || !currentUser) {
    return;
  }

  try {

    const data =
      await api(
        `/api/user/${currentUser.id}/points/history`
      );

    const history =
      data.history || [];

    if (!history.length) {

      container.innerHTML =
        `<div class="empty-card">
          No points history yet.
        </div>`;

      return;
    }

    container.innerHTML =
      history.map(
        (item) => {

          return `
            <div class="history-row">

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

              <strong class="points-positive">
                +${formatNumber(
                  item.points
                )}
              </strong>

            </div>
          `;

        }
      ).join("");

  } catch (error) {

    container.innerHTML =
      `<div class="empty-card">
        ${escapeHTML(error.message)}
      </div>`;
  }
}


/* ======================================================
   WATCH HISTORY
====================================================== */

async function loadWatchHistory() {

  const container =
    $("watchHistoryList");

  if (!container || !currentUser) {
    return;
  }

  try {

    const data =
      await api(
        `/api/videos`
      );

    const videos =
      data.videos || [];

    const watched =
      videos.filter(
        (video) =>
          Number(video.views || 0) > 0
      );

    renderVideos(
      watched,
      container
    );

  } catch (error) {

    container.innerHTML =
      `<div class="empty-card">
        ${escapeHTML(error.message)}
      </div>`;
  }
}


/* ======================================================
   UPLOAD ELEMENTS
====================================================== */

function setupVideoFileInput() {

  const input =
    $("videoFile");

  if (!input) return;

  input.addEventListener(
    "change",
    () => {

      const file =
        input.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          "video/"
        )
      ) {

        showToast(
          "Please select a video file.",
          "error"
        );

        input.value = "";

        return;
      }

      if (
        file.size >
        MAX_VIDEO_SIZE
      ) {

        showToast(
          "Video maximum 100 MB ka hona chahiye.",
          "error"
        );

        input.value = "";

        return;
      }

      selectedVideoFile =
        file;

      if ($("videoFileName")) {

        $("videoFileName").textContent =
          `${file.name} • ${formatVideoSize(
            file.size
          )}`;

      }

      if (uploadObjectUrl) {
        URL.revokeObjectURL(
          uploadObjectUrl
        );
      }

      uploadObjectUrl =
        URL.createObjectURL(file);

      const preview =
        $("uploadPreview");

      const previewVideo =
        $("uploadPreviewVideo");

      if (preview && previewVideo) {

        previewVideo.src =
          uploadObjectUrl;

        preview.classList.remove(
          "hidden"
        );
      }

    }
  );
}


/* ======================================================
   UPLOAD PROGRESS
====================================================== */

function updateUploadProgress(
  percent,
  message
) {

  const value =
    Math.max(
      0,
      Math.min(100, percent)
    );

  if ($("uploadProgressBox")) {
    $("uploadProgressBox")
      .classList.remove("hidden");
  }

  if ($("uploadProgressBar")) {
    $("uploadProgressBar").style.width =
      `${value}%`;
  }

  if ($("uploadProgressPercent")) {
    $("uploadProgressPercent")
      .textContent =
      `${Math.round(value)}%`;
  }

  if ($("uploadProgressText")) {
    $("uploadProgressText")
      .textContent =
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
      method: "POST",
      body: JSON.stringify({
        user_id:
          currentUser?.id || null,
      }),
    }
  );
}


/* ======================================================
   CLOUDINARY DIRECT UPLOAD
====================================================== */

function uploadToCloudinary(
  file,
  signatureData
) {

  return new Promise(
    (resolve, reject) => {

      const cloudName =
        signatureData.cloud_name;

      const url =
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName
        )}/video/upload`;

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

      if (signatureData.folder) {

        formData.append(
          "folder",
          signatureData.folder
        );

      }

      const xhr =
        new XMLHttpRequest();

      xhr.open(
        "POST",
        url,
        true
      );

      xhr.upload.onprogress =
        (event) => {

          if (!event.lengthComputable) {
            return;
          }

          const percent =
            (event.loaded /
              event.total) *
            100;

          updateUploadProgress(
            percent,
            "Cloudinary par video upload ho raha hai..."
          );

        };

      xhr.onload = () => {

        let data;

        try {
          data =
            JSON.parse(
              xhr.responseText
            );
        } catch {
          reject(
            new Error(
              "Cloudinary invalid response."
            )
          );
          return;
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
   SAVE VIDEO METADATA
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

        user_id:
          currentUser.id,

        creator_id:
          currentUser.id,

        title,

        description,

        video_url:
          cloudinaryData.secure_url,

        thumbnail_url:
          cloudinaryData.thumbnail_url ||
          "",

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
          ),

      }),
    }
  );
}


/* ======================================================
   RESET UPLOAD
====================================================== */

function resetUploadForm() {

  $("videoTitle").value = "";
  $("videoDescription").value = "";

  $("videoFile").value = "";

  selectedVideoFile = null;

  if (uploadObjectUrl) {

    URL.revokeObjectURL(
      uploadObjectUrl
    );

    uploadObjectUrl = null;
  }

  $("videoFileName").textContent =
    "Gallery se video choose karein";

  $("uploadPreview")
    ?.classList.add("hidden");

  $("uploadProgressBox")
    ?.classList.add("hidden");

  if ($("uploadProgressBar")) {
    $("uploadProgressBar").style.width =
      "0%";
  }

  if ($("uploadProgressPercent")) {
    $("uploadProgressPercent").textContent =
      "0%";
  }

}


/* ======================================================
   UPLOAD VIDEO
====================================================== */

async function uploadUserVideo() {

  if (!currentUser) {

    showToast(
      "Please login first.",
      "error"
    );

    return;
  }

  const title =
    $("videoTitle")
      ?.value.trim();

  const description =
    $("videoDescription")
      ?.value.trim() || "";

  const file =
    selectedVideoFile;

  if (!title) {

    showToast(
      "Video title enter karein.",
      "error"
    );

    return;
  }

  if (!file) {

    showToast(
      "Please video select karein.",
      "error"
    );

    return;
  }

  if (
    file.size >
    MAX_VIDEO_SIZE
  ) {

    showToast(
      "Video maximum 100 MB ka hona chahiye.",
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

    updateUploadProgress(
      0,
      "Upload prepare ho raha hai..."
    );

    const signature =
      await getCloudinarySignature();

    updateUploadProgress(
      0,
      "Cloudinary upload start ho raha hai..."
    );

    const cloudinary =
      await uploadToCloudinary(
        file,
        signature
      );

    updateUploadProgress(
      100,
      "Cloudinary upload complete. Database save ho raha hai..."
    );

    const saved =
      await saveVideoMetadata(
        cloudinary,
        title,
        description
      );

    updateUploadProgress(
      100,
      "Video successfully uploaded 🎉"
    );

    showToast(
      "Video successfully uploaded 🎉",
      "success"
    );

    resetUploadForm();

    await loadUser();

    await loadVideos();

    showPage(
      "homeSection"
    );

  } catch (error) {

    console.error(
      "UPLOAD ERROR:",
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

    if (button) {

      button.disabled = false;

      button.textContent =
        "🎥 Upload Video";

    }

  }
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {

  const container =
    $("myVideosList");

  if (!container || !currentUser) {
    return;
  }

  container.innerHTML =
    `<div class="loading-card">
      Loading your videos...
    </div>`;

  try {

    const data =
      await api(
        `/api/videos?creator_id=${encodeURIComponent(
          currentUser.id
        )}`
      );

    const videos =
      data.videos || [];

    renderMyVideos(
      videos,
      container
    );

  } catch (error) {

    container.innerHTML =
      `<div class="empty-card">
        ${escapeHTML(error.message)}
      </div>`;
  }
}


function renderMyVideos(
  videos,
  container
) {

  if (!videos.length) {

    container.innerHTML =
      `<div class="empty-card">
        <div class="empty-icon">🎥</div>
        <h3>No uploaded videos</h3>
        <p>Apna pehla video upload karein.</p>
      </div>`;

    return;
  }

  container.innerHTML =
    videos.map(
      (video) => {

        return `
          <div class="my-video-card">

            <div
              class="my-video-info"
              onclick="openVideo(${video.id})"
            >

              <div class="mini-video-icon">
                ▶
              </div>

              <div>

                <strong>
                  ${escapeHTML(video.title)}
                </strong>

                <small>
                  👁️ ${formatNumber(video.views)}
                  • ❤️ ${formatNumber(video.likes_count)}
                </small>

              </div>

            </div>

            <button
              type="button"
              class="delete-btn"
              onclick="deleteVideo(${video.id})"
            >
              🗑️
            </button>

          </div>
        `;

      }
    ).join("");
}


/* ======================================================
   DELETE VIDEO
====================================================== */

async function deleteVideo(videoId) {

  const confirmDelete =
    confirm(
      "Kya aap ye video delete karna chahte hain?"
    );

  if (!confirmDelete) {
    return;
  }

  try {

    await api(
      `/api/videos/${videoId}`,
      {
        method: "DELETE",
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

  const container =
    $("creatorStats");

  if (!container || !currentUser) {
    return;
  }

  container.innerHTML =
    `<div class="loading-card">
      Loading dashboard...
    </div>`;

  try {

    const data =
      await api(
        `/api/creator/${currentUser.id}`
      );

    const creator =
      data.creator;

    container.innerHTML = `

      <div class="stat-card">
        <strong>
          ${formatNumber(
            creator.video_count
          )}
        </strong>
        <span>Videos</span>
      </div>

      <div class="stat-card">
        <strong>
          ${formatNumber(
            creator.total_views
          )}
        </strong>
        <span>Views</span>
      </div>

      <div class="stat-card">
        <strong>
          ${formatNumber(
            creator.total_likes
          )}
        </strong>
        <span>Likes</span>
      </div>

      <div class="stat-card">
        <strong>
          ${formatNumber(
            creator.followers
          )}
        </strong>
        <span>Followers</span>
      </div>

      <div class="stat-card">
        <strong>
          ${formatNumber(
            creator.total_comments
          )}
        </strong>
        <span>Comments</span>
      </div>

      <div class="stat-card">
        <strong>
          ₹${formatNumber(
            creator.earnings
          )}
        </strong>
        <span>Earnings</span>
      </div>

    `;

  } catch (error) {

    container.innerHTML =
      `<div class="empty-card">
        ${escapeHTML(error.message)}
      </div>`;
  }
}


/* ======================================================
   MONETIZATION
====================================================== */

async function applyMonetization() {

  if (!currentUser) return;

  try {

    const data =
      await api(
        `/api/creator/${currentUser.id}/monetization/apply`,
        {
          method: "POST",
        }
      );

    showToast(
      data.message,
      "success"
    );

    await loadUser();

  } catch (error) {

    showToast(
      error.message,
      "error"
    );
  }
}


/* ======================================================
   FORMATTERS
====================================================== */

function formatNumber(value) {

  const number =
    Number(value || 0);

  return number.toLocaleString(
    "en-IN"
  );
}


function formatVideoSize(bytes) {

  if (!bytes) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  let size =
    Number(bytes);

  let index = 0;

  while (
    size >= 1024 &&
    index < units.length - 1
  ) {

    size /= 1024;
    index++;
  }

  return `${size.toFixed(
    index === 0 ? 0 : 2
  )} ${units[index]}`;
}


function formatDate(value) {

  if (!value) {
    return "";
  }

  try {

    return new Date(value)
      .toLocaleString(
        "en-IN",
        {
          dateStyle: "medium",
          timeStyle: "short",
        }
      );

  } catch {

    return "";
  }
}


/* ======================================================
   BUTTON EVENTS
====================================================== */

function setupButtons() {

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

  $("refreshFeedBtn")
    ?.addEventListener(
      "click",
      loadVideos
    );

  $("likeVideoBtn")
    ?.addEventListener(
      "click",
      likeCurrentVideo
    );

  $("commentBtn")
    ?.addEventListener(
      "click",
      addComment
    );

  $("reportVideoBtn")
    ?.addEventListener(
      "click",
      reportCurrentVideo
    );

  $("followCreatorBtn")
    ?.addEventListener(
      "click",
      followCreator
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

  $("uploadVideoBtn")
    ?.addEventListener(
      "click",
      uploadUserVideo
    );

  $("myVideosBtn")
    ?.addEventListener(
      "click",
      () => {

        $("myVideosContainer")
          ?.classList.toggle(
            "hidden"
          );

        loadMyVideos();

      }
    );

  $("creatorDashboardBtn")
    ?.addEventListener(
      "click",
      () => {
        showPage(
          "creatorSection"
        );
      }
    );

  $("applyMonetizationBtn")
    ?.addEventListener(
      "click",
      applyMonetization
    );

  $("backFromPlayerBtn")
    ?.addEventListener(
      "click",
      () => {
        if (watchTimer) {
          clearInterval(
            watchTimer
          );
          watchTimer = null;
        }

        showPage(
          "homeSection"
        );
      }
    );

}


/* ======================================================
   ENTER KEY LOGIN
====================================================== */

function setupKeyboard() {

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
          addComment();
        }

      }
    );

}


/* ======================================================
   START APP
====================================================== */

async function startApp() {

  setupAuthSwitches();
  setupButtons();
  setupNavigation();
  setupKeyboard();
  setupVideoFileInput();

  const savedUser =
    getSavedUser();

  if (!savedUser?.id) {

    showAuth();

    return;
  }

  currentUser =
    savedUser;

  showApp();

  await loadUser();

  if (!currentUser) {
    return;
  }

  updateUserUI();

  await loadVideos();
}


/* ======================================================
   START
====================================================== */

document.addEventListener(
  "DOMContentLoaded",
  startApp
);
