/*
=========================================================
 DEKHOEARN FRONTEND
 Version 2.0.0
 --------------------------------------------------------
 Connected to DekhoEarn Server v2.0.0
=========================================================
*/

const API_BASE = "";

let currentUser = null;
let currentVideo = null;
let watchSeconds = 0;
let watchRewardSent = false;
let deferredPrompt = null;


/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  const n = Number(value || 0);

  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + "M";
  }

  if (n >= 1000) {
    return (n / 1000).toFixed(1) + "K";
  }

  return Math.floor(n).toString();
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (currentUser?.id) {
    headers["x-user-id"] = String(currentUser.id);
  }

  const response = await fetch(API_BASE + url, {
    ...options,
    headers
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


/* ======================================================
   USER
====================================================== */

async function createUser() {
  const savedUser = localStorage.getItem("dekhoearn_user");

  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);

      if (currentUser?.id) {
        return currentUser;
      }
    } catch {
      localStorage.removeItem("dekhoearn_user");
    }
  }

  const username =
    localStorage.getItem("dekhoearn_username") || null;

  const firstName =
    localStorage.getItem("dekhoearn_first_name") || null;

  const referralCode =
    new URLSearchParams(window.location.search)
      .get("ref");

  const data = await api("/api/user", {
    method: "POST",
    body: JSON.stringify({
      username,
      first_name: firstName,
      referral_code: referralCode || null
    })
  });

  currentUser = data.user;

  localStorage.setItem(
    "dekhoearn_user",
    JSON.stringify(currentUser)
  );

  return currentUser;
}


async function loadUser(showMessage = false) {
  try {
    if (!currentUser?.id) {
      await createUser();
    }

    const data = await api(
      `/api/user/${currentUser.id}`
    );

    currentUser = data.user;

    localStorage.setItem(
      "dekhoearn_user",
      JSON.stringify(currentUser)
    );

    updateUserUI(data);

    if (showMessage) {
      showToast("Account refreshed.");
    }

  } catch (error) {
    console.error("User loading error:", error);
    showToast(error.message);
  }
}


function updateUserUI(data) {
  const user = data.user || currentUser;

  if (!user) return;

  const creator = data.creator || {};

  $("points").textContent =
    formatNumber(user.points);

  $("videosWatched").textContent =
    formatNumber(user.videos_watched);

  $("todayEarned").textContent =
    formatNumber(user.today_earned);

  $("welcomeName").textContent =
    user.first_name ||
    user.username ||
    "Welcome 👋";

  $("profileName").textContent =
    user.first_name ||
    user.username ||
    "DekhoEarn User";

  $("profileUsername").textContent =
    user.username
      ? "@" + user.username
      : "DekhoEarn User";

  $("profilePoints").textContent =
    formatNumber(user.points);

  $("profileVideos").textContent =
    formatNumber(user.videos_watched);

  const followers =
    creator.followers ??
    user.followers ??
    0;

  const watchHours =
    creator.watch_hours ??
    user.watch_hours ??
    0;

  $("followersCount").textContent =
    formatNumber(followers);

  $("watchHours").textContent =
    Number(watchHours || 0).toFixed(1);

  $("profileFollowers").textContent =
    formatNumber(followers);

  $("creatorFollowers").textContent =
    formatNumber(followers);

  $("creatorHours").textContent =
    Number(watchHours || 0).toFixed(1);

  $("creatorVideos").textContent =
    formatNumber(
      creator.videos_count ??
      creator.video_count ??
      0
    );
}


/* ======================================================
   PAGE NAVIGATION
====================================================== */

const pages = [
  "homeSection",
  "watchSection",
  "playerSection",
  "earnSection",
  "uploadSection",
  "profileSection",
  "creatorSection"
];

function showPage(pageId) {

  pages.forEach(id => {
    const section = $(id);

    if (section) {
      section.classList.toggle(
        "hidden",
        id !== pageId
      );
    }
  });

  updateNavigation(pageId);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "watchSection") {
    loadVideos();
  }

  if (pageId === "earnSection") {
    loadPointsHistory();
  }

  if (pageId === "uploadSection") {
    loadMyVideos();
  }

  if (pageId === "creatorSection") {
    loadCreatorStats();
  }
}


function updateNavigation(pageId) {

  const navMap = {
    homeSection: "navHome",
    watchSection: "navWatch",
    earnSection: "navEarn",
    uploadSection: "navUpload",
    profileSection: "navProfile"
  };

  document
    .querySelectorAll(".bottom-nav button")
    .forEach(btn => {
      btn.classList.remove("active");
    });

  const activeButton =
    $(navMap[pageId] || "navHome");

  if (activeButton) {
    activeButton.classList.add("active");
  }
}


/* ======================================================
   VIDEO FEED
====================================================== */

async function loadVideos() {

  const feed = $("videoFeed");

  feed.innerHTML =
    `<div class="loading">Videos load ho rahe hain...</div>`;

  try {

    const data = await api("/api/videos");

    const videos =
      data.videos ||
      data.data ||
      [];

    if (!videos.length) {

      feed.innerHTML = `
        <div class="empty-state">
          <div style="font-size:40px">🎬</div>
          <h3>Abhi videos nahi hain</h3>
          <p>Jab creators videos upload karenge, yahan dikhenge.</p>
        </div>
      `;

      return;
    }

    feed.innerHTML = videos
      .map(renderVideoCard)
      .join("");

  } catch (error) {

    console.error("Video feed error:", error);

    feed.innerHTML = `
      <div class="empty-state">
        <div style="font-size:35px">⚠️</div>
        <h3>Videos load nahi ho paaye</h3>
        <p>${escapeHTML(error.message)}</p>
        <button class="primary-btn"
                onclick="loadVideos()"
                style="margin-top:10px">
          Retry
        </button>
      </div>
    `;
  }
}


function renderVideoCard(video) {

  const id = video.id;

  const title =
    video.title ||
    "Untitled Video";

  const description =
    video.description ||
    "Watch this video on DekhoEarn.";

  const creator =
    video.creator_name ||
    video.first_name ||
    video.username ||
    "Creator";

  const views =
    video.views ||
    video.view_count ||
    0;

  const likes =
    video.likes ||
    video.like_count ||
    0;

  const thumbnail =
    video.thumbnail_url ||
    "";

  const thumbnailHTML = thumbnail
    ? `<img src="${escapeHTML(thumbnail)}"
             alt="${escapeHTML(title)}"
             loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=play-icon>▶️</div>'">`
    : `<div class="play-icon">▶️</div>`;

  return `
    <article class="video-card-full">

      <div class="video-thumb">
        ${thumbnailHTML}
      </div>

      <div class="video-card-body">

        <h3>${escapeHTML(title)}</h3>

        <p>${escapeHTML(description)}</p>

        <div class="creator-line">
          👤 ${escapeHTML(creator)}
        </div>

        <div class="video-meta">
          <span>👁️ ${formatNumber(views)} views</span>
          <span>❤️ ${formatNumber(likes)} likes</span>
        </div>

        <button
          class="watch-full-btn"
          onclick="openVideo(${Number(id)})">
          ▶ Watch Video
        </button>

      </div>

    </article>
  `;
}


/* ======================================================
   VIDEO PLAYER
====================================================== */

async function openVideo(videoId) {

  try {

    const data = await api(
      `/api/videos/${videoId}`
    );

    currentVideo =
      data.video ||
      data;

    const video = currentVideo;

    $("playerTitle").textContent =
      video.title || "Video";

    $("playerVideoTitle").textContent =
      video.title || "Video";

    $("playerCreator").textContent =
      video.creator_name ||
      video.username ||
      "Creator";

    $("playerDescription").textContent =
      video.description || "";

    $("playerViews").textContent =
      `${formatNumber(
        video.views ||
        video.view_count ||
        0
      )} views`;

    $("playerLikes").textContent =
      `${formatNumber(
        video.likes ||
        video.like_count ||
        0
      )} likes`;

    const player = $("videoPlayer");

    player.pause();

    player.src = video.video_url;

    player.load();

    watchSeconds = 0;
    watchRewardSent = false;

    $("watchProgress").textContent =
      "Watch at least 10 seconds to become eligible for the watch reward.";

    showPage("playerSection");

    loadComments();

  } catch (error) {

    console.error(error);

    showToast(
      "Video open nahi ho paaya: " +
      error.message
    );
  }
}


/* ======================================================
   WATCH TRACKING
====================================================== */

$("videoPlayer").addEventListener(
  "timeupdate",
  async () => {

    const player = $("videoPlayer");

    if (!currentVideo || watchRewardSent) {
      return;
    }

    watchSeconds =
      Math.floor(player.currentTime || 0);

    if (watchSeconds < 10) {

      $("watchProgress").textContent =
        `Watch ${10 - watchSeconds} more seconds for eligibility.`;

      return;
    }

    $("watchProgress").textContent =
      "✓ Eligible watch reached. Reward processing...";

    await completeWatchReward();
  }
);


async function completeWatchReward() {

  if (
    !currentUser?.id ||
    !currentVideo?.id ||
    watchRewardSent
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
          user_id: currentUser.id,
          video_id: currentVideo.id,
          watch_seconds: watchSeconds
        })
      }
    );

    const reward =
      data.reward ??
      data.points_added ??
      1;

    $("watchProgress").textContent =
      `🎉 Watch reward +${reward} point added!`;

    showToast(
      `🎉 +${reward} point earned`
    );

    await loadUser();

  } catch (error) {

    watchRewardSent = false;

    $("watchProgress").textContent =
      error.message;

    console.log(
      "Watch reward:",
      error.message
    );
  }
}


/* ======================================================
   LIKE
====================================================== */

$("likeBtn").addEventListener(
  "click",
  async () => {

    if (!currentVideo?.id) return;

    try {

      const data = await api(
        `/api/videos/${currentVideo.id}/like`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: currentUser.id
          })
        }
      );

      showToast(
        data.message ||
        "Like updated ❤️"
      );

      await openVideo(currentVideo.id);

    } catch (error) {

      showToast(error.message);
    }
  }
);


/* ======================================================
   COMMENTS
====================================================== */

async function showComments() {

  const box =
    document.querySelector(".comments-box");

  if (box) {
    box.scrollIntoView({
      behavior: "smooth"
    });
  }

  await loadComments();
}


async function loadComments() {

  if (!currentVideo?.id) return;

  const list = $("commentsList");

  list.innerHTML =
    `<div class="loading">Comments loading...</div>`;

  try {

    const data = await api(
      `/api/videos/${currentVideo.id}/comments`
    );

    const comments =
      data.comments ||
      data.data ||
      [];

    if (!comments.length) {

      list.innerHTML =
        `<p style="color:#68716b;font-size:12px">
          Abhi koi comment nahi hai.
        </p>`;

      return;
    }

    list.innerHTML =
      comments.map(comment => `
        <div class="comment-item">
          <b>
            ${escapeHTML(
              comment.first_name ||
              comment.username ||
              "User"
            )}
          </b>
          <p>
            ${escapeHTML(
              comment.comment ||
              comment.text ||
              ""
            )}
          </p>
        </div>
      `).join("");

  } catch (error) {

    list.innerHTML =
      `<p style="color:#b91c1c;font-size:12px">
        ${escapeHTML(error.message)}
      </p>`;
  }
}


async function addComment() {

  const input = $("commentInput");

  const comment =
    input.value.trim();

  if (!comment) {
    showToast("Comment likho.");
    return;
  }

  if (!currentVideo?.id) {
    return;
  }

  try {

    await api(
      `/api/videos/${currentVideo.id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUser.id,
          comment
        })
      }
    );

    input.value = "";

    showToast("Comment added 💬");

    await loadComments();

  } catch (error) {

    showToast(error.message);
  }
}


/* ======================================================
   REPORT
====================================================== */

$("reportBtn").addEventListener(
  "click",
  async () => {

    if (!currentVideo?.id) return;

    const reason = prompt(
      "Report reason likhiye:"
    );

    if (!reason) return;

    try {

      const data = await api(
        `/api/videos/${currentVideo.id}/report`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: currentUser.id,
            reason
          })
        }
      );

      showToast(
        data.message ||
        "Report submitted."
      );

    } catch (error) {

      showToast(error.message);
    }
  }
);


/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDaily() {

  const button = $("dailyBtn");

  if (button) {
    button.disabled = true;
  }

  try {

    const data = await api(
      "/api/daily/claim",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUser.id
        })
      }
    );

    const reward =
      data.reward ??
      data.points_added ??
      10;

    showToast(
      `🎉 Daily Bonus +${reward} Points`
    );

    await loadUser();

  } catch (error) {

    showToast(error.message);

  } finally {

    if (button) {
      button.disabled = false;
    }
  }
}


/* ======================================================
   REWARDED AD
====================================================== */

async function completeRewardedAd() {

  /*
    IMPORTANT:
    This endpoint should only be called after
    the real rewarded-ad SDK confirms completion.

    Do not reward ad clicks.
  */

  const confirmed =
    confirm(
      "Rewarded ad complete hone ke baad hi Continue karein.\n\n" +
      "Kya aapne genuine rewarded ad poora dekha hai?"
    );

  if (!confirmed) {
    return;
  }

  try {

    const data = await api(
      "/api/rewarded-ad/complete",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUser.id
        })
      }
    );

    const reward =
      data.reward ??
      data.points_added ??
      5;

    showToast(
      `📺 +${reward} points`
    );

    await loadUser();

  } catch (error) {

    showToast(error.message);
  }
}


/* ======================================================
   POINT HISTORY
====================================================== */

async function loadPointsHistory() {

  const box = $("pointsHistory");

  box.innerHTML =
    `<div class="loading">History loading...</div>`;

  try {

    const data = await api(
      `/api/user/${currentUser.id}/points/history`
    );

    const history =
      data.history ||
      data.ledger ||
      data.data ||
      [];

    if (!history.length) {

      box.innerHTML =
        `<p style="color:#68716b;font-size:12px">
          Abhi points history empty hai.
        </p>`;

      return;
    }

    box.innerHTML =
      history.map(item => {

        const amount =
          Number(
            item.points ??
            item.amount ??
            0
          );

        const description =
          item.description ||
          item.reason ||
          item.type ||
          "Reward";

        return `
          <div class="history-row">
            <div>
              <b>${escapeHTML(description)}</b>
            </div>
            <div class="history-positive">
              +${amount}
            </div>
          </div>
        `;
      }).join("");

  } catch (error) {

    box.innerHTML =
      `<p style="color:#b91c1c;font-size:12px">
        ${escapeHTML(error.message)}
      </p>`;
  }
}


/* ======================================================
   UPLOAD
====================================================== */

async function uploadVideo() {

  const title =
    $("uploadTitle").value.trim();

  const description =
    $("uploadDescription").value.trim();

  const videoUrl =
    $("uploadUrl").value.trim();

  const thumbnailUrl =
    $("uploadThumbnail").value.trim();

  if (!title) {
    showToast("Video title required.");
    return;
  }

  if (!videoUrl) {
    showToast("Video URL required.");
    return;
  }

  try {

    const data = await api(
      "/api/videos",
      {
        method: "POST",
        body: JSON.stringify({
          creator_id: currentUser.id,
          title,
          description,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl || null
        })
      }
    );

    showToast(
      data.message ||
      "Video published."
    );

    $("uploadTitle").value = "";
    $("uploadDescription").value = "";
    $("uploadUrl").value = "";
    $("uploadThumbnail").value = "";

    await loadMyVideos();

  } catch (error) {

    showToast(error.message);
  }
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {

  const box = $("myVideosList");

  try {

    const data = await api(
      `/api/videos?creator_id=${currentUser.id}`
    );

    const videos =
      data.videos ||
      data.data ||
      [];

    const mine =
      videos.filter(
        video =>
          Number(
            video.creator_id ||
            video.user_id
          ) === Number(currentUser.id)
      );

    if (!mine.length) {

      box.innerHTML =
        `<p style="color:#68716b;font-size:12px">
          Aapne abhi koi video upload nahi kiya.
        </p>`;

      return;
    }

    box.innerHTML =
      mine.map(video => `
        <div class="my-video-row">

          <h4>
            ${escapeHTML(
              video.title ||
              "Untitled Video"
            )}
          </h4>

          <p>
            ${formatNumber(
              video.views ||
              video.view_count ||
              0
            )} views
            •
            ${formatNumber(
              video.likes ||
              video.like_count ||
              0
            )} likes
          </p>

          <button
            class="delete-video-btn"
            onclick="deleteMyVideo(${Number(video.id)})">
            Delete
          </button>

        </div>
      `).join("");

  } catch (error) {

    box.innerHTML =
      `<p style="color:#b91c1c;font-size:12px">
        ${escapeHTML(error.message)}
      </p>`;
  }
}


async function deleteMyVideo(videoId) {

  const confirmed =
    confirm(
      "Kya aap apna video delete karna chahte hain?"
    );

  if (!confirmed) return;

  try {

    await api(
      `/api/videos/${videoId}`,
      {
        method: "DELETE"
      }
    );

    showToast("Video deleted.");

    await loadMyVideos();

  } catch (error) {

    showToast(error.message);
  }
}


/* ======================================================
   CREATOR
====================================================== */

async function loadCreatorStats() {

  try {

    const data = await api(
      `/api/creator/${currentUser.id}`
    );

    const creator =
      data.creator ||
      data;

    $("creatorFollowers").textContent =
      formatNumber(
        creator.followers ||
        creator.follower_count ||
        0
      );

    $("creatorHours").textContent =
      Number(
        creator.watch_hours ||
        creator.eligible_watch_hours ||
        0
      ).toFixed(1);

    $("creatorVideos").textContent =
      formatNumber(
        creator.videos_count ||
        creator.video_count ||
        0
      );

    updateMonetizationUI(creator);

  } catch (error) {

    console.error(
      "Creator stats:",
      error.message
    );

    /*
      If the endpoint isn't available yet,
      don't break the rest of the application.
    */

    updateMonetizationUI({});
  }
}


function updateMonetizationUI(creator) {

  const followers =
    Number(
      creator.followers ||
      creator.follower_count ||
      0
    );

  const hours =
    Number(
      creator.watch_hours ||
      creator.eligible_watch_hours ||
      0
    );

  const status =
    creator.monetization_status ||
    creator.status ||
    "";

  const eligible =
    followers >= 1000 &&
    hours >= 1000;

  if (status === "approved") {

    $("monetizationStatus").innerHTML =
      "✅ <b>Monetization Approved</b><br>" +
      "Your creator account is monetized.";

    $("monetizationBtn").disabled = true;
    $("monetizationBtn").textContent =
      "Monetization Approved";

    return;
  }

  if (status === "pending") {

    $("monetizationStatus").innerHTML =
      "⏳ <b>Application Pending</b><br>" +
      "Your monetization application is under review.";

    $("monetizationBtn").disabled = true;
    $("monetizationBtn").textContent =
      "Application Pending";

    return;
  }

  if (eligible) {

    $("monetizationStatus").innerHTML =
      "🎉 <b>You are eligible.</b><br>" +
      "You have reached 1,000 followers and 1,000 eligible watch-hours.";

    $("monetizationBtn").disabled = false;
    $("monetizationBtn").textContent =
      "Apply for Monetization";

  } else {

    $("monetizationStatus").innerHTML =
      "📊 <b>Not eligible yet</b><br><br>" +
      `Followers: ${formatNumber(followers)} / 1,000<br>` +
      `Watch Hours: ${hours.toFixed(1)} / 1,000`;

    $("monetizationBtn").disabled = true;
    $("monetizationBtn").textContent =
      "Requirements Not Reached";
  }
}


async function applyMonetization() {

  try {

    const data = await api(
      `/api/creator/${currentUser.id}/monetization/apply`,
      {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUser.id
        })
      }
    );

    showToast(
      data.message ||
      "Application submitted."
    );

    await loadCreatorStats();

  } catch (error) {

    showToast(error.message);
  }
}


/* ======================================================
   PWA INSTALL
====================================================== */

window.addEventListener(
  "beforeinstallprompt",
  event => {

    event.preventDefault();

    deferredPrompt = event;

    const installBtn =
      $("installBtn");

    installBtn.hidden = false;

    installBtn.onclick = async () => {

      if (!deferredPrompt) {
        return;
      }

      deferredPrompt.prompt();

      try {
        await deferredPrompt.userChoice;
      } catch {}

      deferredPrompt = null;

      installBtn.hidden = true;
    };
  }
);


window.addEventListener(
  "appinstalled",
  () => {

    const installBtn =
      $("installBtn");

    if (installBtn) {
      installBtn.hidden = true;
    }

    showToast(
      "DekhoEarn installed successfully 📱"
    );
  }
);


/* ======================================================
   START APPLICATION
====================================================== */

async function startApp() {

  try {

    await createUser();

    await loadUser();

    await loadVideos();

  } catch (error) {

    console.error(
      "Application startup error:",
      error
    );

    showToast(
      "App start error: " +
      error.message
    );
  }
}


startApp();
