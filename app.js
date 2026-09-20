/*
=========================================================
 DEKHOEARN FRONTEND
 Version 2.1.0
 --------------------------------------------------------
 Connected to DekhoEarn Server
 --------------------------------------------------------
 FEATURES
 - Login / User System
 - Video Feed
 - Video Watch + Points
 - Like / Comment / Report
 - Daily Reward
 - Rewarded Ad
 - Points History
 - My Videos
 - Creator Dashboard
 - Monetization
 - Gallery Video Upload
 - Cloudinary Direct Upload
 - Upload Progress %
 - Video Preview
 - Neon Metadata Save
 - 100 MB Video Limit
 - PWA Install
 - Mobile Friendly
 --------------------------------------------------------
 UPLOAD FLOW
 Gallery
    ↓
 Browser validation
    ↓
 Cloudinary signed upload
    ↓
 Cloudinary secure_url
    ↓
 Neon metadata save
    ↓
 Video published
=========================================================
*/

const API_BASE = "";


/* ======================================================
   GLOBAL STATE
====================================================== */

let currentUser = null;
let currentVideo = null;

let watchSeconds = 0;
let watchRewardSent = false;

let deferredPrompt = null;

let selectedVideoFile = null;

const MAX_VIDEO_SIZE =
  100 * 1024 * 1024;


/* ======================================================
   BASIC HELPERS
====================================================== */

function $(id) {
  return document.getElementById(id);
}


function showToast(message) {

  const toast = $("toast");

  if (!toast) {
    console.log("Toast:", message);
    return;
  }

  toast.textContent =
    String(message ?? "");

  toast.classList.add("show");

  clearTimeout(window.toastTimer);

  window.toastTimer =
    setTimeout(() => {
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

  const n =
    Number(value || 0);

  if (n >= 1000000) {
    return (
      (n / 1000000).toFixed(1) +
      "M"
    );
  }

  if (n >= 1000) {
    return (
      (n / 1000).toFixed(1) +
      "K"
    );
  }

  return Math.floor(n).toString();
}


function formatVideoSize(bytes) {

  if (!bytes) {
    return "0 B";
  }

  const mb =
    bytes / 1024 / 1024;

  if (mb < 1) {

    return (
      Math.round(bytes / 1024) +
      " KB"
    );
  }

  return (
    mb.toFixed(1) +
    " MB"
  );
}


/* ======================================================
   API HELPER
====================================================== */

async function api(url, options = {}) {

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };


  if (currentUser?.id) {

    headers["x-user-id"] =
      String(currentUser.id);

  }


  const response =
    await fetch(
      API_BASE + url,
      {
        ...options,
        headers
      }
    );


  let data = {};

  try {

    data =
      await response.json();

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
   USER SYSTEM
====================================================== */

async function createUser() {

  const savedUser =
    localStorage.getItem(
      "dekhoearn_user"
    );


  if (savedUser) {

    try {

      currentUser =
        JSON.parse(savedUser);

      if (currentUser?.id) {
        return currentUser;
      }

    } catch {

      localStorage.removeItem(
        "dekhoearn_user"
      );

    }
  }


  const username =
    localStorage.getItem(
      "dekhoearn_username"
    ) || null;


  const firstName =
    localStorage.getItem(
      "dekhoearn_first_name"
    ) || null;


  const referralCode =
    new URLSearchParams(
      window.location.search
    ).get("ref");


  const data =
    await api(
      "/api/user",
      {
        method: "POST",

        body:
          JSON.stringify({
            username,
            first_name: firstName,
            referral_code:
              referralCode || null
          })
      }
    );


  currentUser =
    data.user;


  localStorage.setItem(
    "dekhoearn_user",
    JSON.stringify(currentUser)
  );


  return currentUser;
}


async function loadUser(
  showMessage = false
) {

  try {

    if (!currentUser?.id) {
      await createUser();
    }


    const data =
      await api(
        `/api/user/${currentUser.id}`
      );


    currentUser =
      data.user;


    localStorage.setItem(
      "dekhoearn_user",
      JSON.stringify(currentUser)
    );


    updateUserUI(data);


    if (showMessage) {
      showToast(
        "Account refreshed."
      );
    }

  } catch (error) {

    console.error(
      "User loading error:",
      error
    );

    showToast(
      error.message
    );

  }
}


function updateUserUI(data) {

  const user =
    data.user ||
    currentUser;


  if (!user) {
    return;
  }


  const creator =
    data.creator ||
    {};


  if ($("points")) {

    $("points").textContent =
      formatNumber(user.points);

  }


  if ($("videosWatched")) {

    $("videosWatched").textContent =
      formatNumber(
        user.videos_watched
      );

  }


  if ($("todayEarned")) {

    $("todayEarned").textContent =
      formatNumber(
        user.today_earned
      );

  }


  const displayName =
    user.first_name ||
    user.username ||
    "Welcome 👋";


  if ($("welcomeName")) {

    $("welcomeName").textContent =
      displayName;

  }


  if ($("profileName")) {

    $("profileName").textContent =
      user.first_name ||
      user.username ||
      "DekhoEarn User";

  }


  if ($("profileUsername")) {

    $("profileUsername").textContent =
      user.username
        ? "@" + user.username
        : "DekhoEarn User";

  }


  if ($("profilePoints")) {

    $("profilePoints").textContent =
      formatNumber(
        user.points
      );

  }


  if ($("profileVideos")) {

    $("profileVideos").textContent =
      formatNumber(
        user.videos_watched
      );

  }


  const followers =
    creator.followers ??
    user.followers ??
    0;


  const watchHours =
    creator.watch_hours ??
    user.watch_hours ??
    0;


  if ($("followersCount")) {

    $("followersCount").textContent =
      formatNumber(followers);

  }


  if ($("watchHours")) {

    $("watchHours").textContent =
      Number(
        watchHours || 0
      ).toFixed(1);

  }


  if ($("profileFollowers")) {

    $("profileFollowers").textContent =
      formatNumber(followers);

  }


  if ($("creatorFollowers")) {

    $("creatorFollowers").textContent =
      formatNumber(followers);

  }


  if ($("creatorHours")) {

    $("creatorHours").textContent =
      Number(
        watchHours || 0
      ).toFixed(1);

  }


  if ($("creatorVideos")) {

    $("creatorVideos").textContent =
      formatNumber(
        creator.videos_count ??
        creator.video_count ??
        0
      );

  }
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

    const section =
      $(id);

    if (section) {

      section.classList.toggle(
        "hidden",
        id !== pageId
      );

    }

  });


  updateNavigation(
    pageId
  );


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

    homeSection:
      "navHome",

    watchSection:
      "navWatch",

    earnSection:
      "navEarn",

    uploadSection:
      "navUpload",

    profileSection:
      "navProfile"

  };


  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(button => {

      button.classList.remove(
        "active"
      );

    });


  const activeButton =
    $(
      navMap[pageId] ||
      "navHome"
    );


  if (activeButton) {

    activeButton.classList.add(
      "active"
    );

  }
}


/* ======================================================
   VIDEO FEED
====================================================== */

async function loadVideos() {

  const feed =
    $("videoFeed");


  if (!feed) {
    return;
  }


  feed.innerHTML =
    `<div class="loading">
      Videos load ho rahe hain...
    </div>`;


  try {

    const data =
      await api(
        "/api/videos"
      );


    const videos =
      data.videos ||
      data.data ||
      [];


    if (!videos.length) {

      feed.innerHTML = `
        <div class="empty-state">
          <div style="font-size:40px">🎬</div>

          <h3>
            Abhi videos nahi hain
          </h3>

          <p>
            Jab creators videos upload karenge,
            yahan dikhenge.
          </p>
        </div>
      `;

      return;
    }


    feed.innerHTML =
      videos
        .map(renderVideoCard)
        .join("");


  } catch (error) {

    console.error(
      "Video feed error:",
      error
    );


    feed.innerHTML = `
      <div class="empty-state">

        <div style="font-size:35px">
          ⚠️
        </div>

        <h3>
          Videos load nahi ho paaye
        </h3>

        <p>
          ${escapeHTML(
            error.message
          )}
        </p>

        <button
          class="primary-btn"
          onclick="loadVideos()"
          style="margin-top:10px">
          Retry
        </button>

      </div>
    `;

  }
}


function renderVideoCard(video) {

  const id =
    Number(video.id);


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


  const thumbnailHTML =
    thumbnail

      ? `
        <img
          src="${escapeHTML(thumbnail)}"
          alt="${escapeHTML(title)}"
          loading="lazy"
          onerror="
            this.parentElement.innerHTML =
            '<div class=play-icon>▶️</div>'
          ">
      `

      : `
        <div class="play-icon">
          ▶️
        </div>
      `;


  return `
    <article class="video-card-full">

      <div class="video-thumb">
        ${thumbnailHTML}
      </div>

      <div class="video-card-body">

        <h3>
          ${escapeHTML(title)}
        </h3>

        <p>
          ${escapeHTML(description)}
        </p>

        <div class="creator-line">
          👤 ${escapeHTML(creator)}
        </div>

        <div class="video-meta">

          <span>
            👁️ ${formatNumber(views)} views
          </span>

          <span>
            ❤️ ${formatNumber(likes)} likes
          </span>

        </div>

        <button
          class="watch-full-btn"
          onclick="openVideo(${id})">

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

    const data =
      await api(
        `/api/videos/${videoId}`
      );


    currentVideo =
      data.video ||
      data;


    const video =
      currentVideo;


    if ($("playerTitle")) {

      $("playerTitle").textContent =
        video.title ||
        "Video";

    }


    if ($("playerVideoTitle")) {

      $("playerVideoTitle").textContent =
        video.title ||
        "Video";

    }


    if ($("playerCreator")) {

      $("playerCreator").textContent =
        video.creator_name ||
        video.username ||
        "Creator";

    }


    if ($("playerDescription")) {

      $("playerDescription").textContent =
        video.description ||
        "";

    }


    if ($("playerViews")) {

      $("playerViews").textContent =
        `${formatNumber(
          video.views ||
          video.view_count ||
          0
        )} views`;

    }


    if ($("playerLikes")) {

      $("playerLikes").textContent =
        `${formatNumber(
          video.likes ||
          video.like_count ||
          0
        )} likes`;

    }


    const player =
      $("videoPlayer");


    if (!player) {

      showToast(
        "Video player nahi mila."
      );

      return;

    }


    player.pause();


    player.src =
      video.video_url ||
      "";


    player.load();


    watchSeconds =
      0;


    watchRewardSent =
      false;


    if ($("watchProgress")) {

      $("watchProgress").textContent =
        "Watch at least 10 seconds to become eligible for the watch reward.";

    }


    showPage(
      "playerSection"
    );


    await loadComments();


  } catch (error) {

    console.error(
      "Open video error:",
      error
    );


    showToast(
      "Video open nahi ho paaya: " +
      error.message
    );

  }
}


/* ======================================================
   WATCH TRACKING
====================================================== */

function setupVideoTracking() {

  const player =
    $("videoPlayer");


  if (!player) {
    return;
  }


  player.addEventListener(
    "timeupdate",
    async () => {

      if (
        !currentVideo ||
        watchRewardSent
      ) {
        return;
      }


      watchSeconds =
        Math.floor(
          player.currentTime || 0
        );


      if (
        watchSeconds < 10
      ) {

        if ($("watchProgress")) {

          $("watchProgress").textContent =
            `Watch ${
              10 - watchSeconds
            } more seconds for eligibility.`;

        }

        return;
      }


      if ($("watchProgress")) {

        $("watchProgress").textContent =
          "✓ Eligible watch reached. Reward processing...";

      }


      await completeWatchReward();

    }
  );
}


async function completeWatchReward() {

  if (
    !currentUser?.id ||
    !currentVideo?.id ||
    watchRewardSent
  ) {
    return;
  }


  watchRewardSent =
    true;


  try {

    const data =
      await api(
        "/api/watch/complete",
        {
          method: "POST",

          body:
            JSON.stringify({
              user_id:
                currentUser.id,

              video_id:
                currentVideo.id,

              watch_seconds:
                watchSeconds
            })
        }
      );


    const reward =
      data.reward ??
      data.points_added ??
      1;


    if ($("watchProgress")) {

      $("watchProgress").textContent =
        `🎉 Watch reward +${reward} point added!`;

    }


    showToast(
      `🎉 +${reward} point earned`
    );


    await loadUser();


  } catch (error) {

    watchRewardSent =
      false;


    if ($("watchProgress")) {

      $("watchProgress").textContent =
        error.message;

    }


    console.log(
      "Watch reward:",
      error.message
    );

  }
}


/* ======================================================
   LIKE
====================================================== */

function setupLikeButton() {

  const button =
    $("likeBtn");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    async () => {

      if (!currentVideo?.id) {
        return;
      }


      try {

        const data =
          await api(
            `/api/videos/${currentVideo.id}/like`,
            {
              method: "POST",

              body:
                JSON.stringify({
                  user_id:
                    currentUser.id
                })
            }
          );


        showToast(
          data.message ||
          "Like updated ❤️"
        );


        await openVideo(
          currentVideo.id
        );


      } catch (error) {

        showToast(
          error.message
        );

      }

    }
  );
}


/* ======================================================
   COMMENTS
====================================================== */

async function showComments() {

  const box =
    document.querySelector(
      ".comments-box"
    );


  if (box) {

    box.scrollIntoView({
      behavior: "smooth"
    });

  }


  await loadComments();
}


async function loadComments() {

  if (!currentVideo?.id) {
    return;
  }


  const list =
    $("commentsList");


  if (!list) {
    return;
  }


  list.innerHTML =
    `<div class="loading">
      Comments loading...
    </div>`;


  try {

    const data =
      await api(
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
      comments
        .map(
          comment => `
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
          `
        )
        .join("");


  } catch (error) {

    list.innerHTML =
      `<p style="color:#b91c1c;font-size:12px">
        ${escapeHTML(
          error.message
        )}
      </p>`;

  }
}


async function addComment() {

  const input =
    $("commentInput");


  if (!input) {
    return;
  }


  const comment =
    input.value.trim();


  if (!comment) {

    showToast(
      "Comment likho."
    );

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

        body:
          JSON.stringify({
            user_id:
              currentUser.id,

            comment
          })
      }
    );


    input.value =
      "";


    showToast(
      "Comment added 💬"
    );


    await loadComments();


  } catch (error) {

    showToast(
      error.message
    );

  }
}


/* ======================================================
   REPORT
====================================================== */

function setupReportButton() {

  const button =
    $("reportBtn");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    async () => {

      if (!currentVideo?.id) {
        return;
      }


      const reason =
        prompt(
          "Report reason likhiye:"
        );


      if (!reason) {
        return;
      }


      try {

        const data =
          await api(
            `/api/videos/${currentVideo.id}/report`,
            {
              method: "POST",

              body:
                JSON.stringify({
                  user_id:
                    currentUser.id,

                  reason
                })
            }
          );


        showToast(
          data.message ||
          "Report submitted."
        );


      } catch (error) {

        showToast(
          error.message
        );

      }

    }
  );
}


/* ======================================================
   DAILY REWARD
====================================================== */

async function claimDaily() {

  const button =
    $("dailyBtn");


  if (button) {
    button.disabled =
      true;
  }


  try {

    const data =
      await api(
        "/api/daily/claim",
        {
          method: "POST",

          body:
            JSON.stringify({
              user_id:
                currentUser.id
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

    showToast(
      error.message
    );


  } finally {

    if (button) {

      button.disabled =
        false;

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
    a genuine rewarded-ad SDK confirms completion.

    Do NOT reward ad clicks.
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

    const data =
      await api(
        "/api/rewarded-ad/complete",
        {
          method: "POST",

          body:
            JSON.stringify({
              user_id:
                currentUser.id
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

    showToast(
      error.message
    );

  }
}


/* ======================================================
   POINT HISTORY
====================================================== */

async function loadPointsHistory() {

  const box =
    $("pointsHistory");


  if (!box) {
    return;
  }


  box.innerHTML =
    `<div class="loading">
      History loading...
    </div>`;


  try {

    const data =
      await api(
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
      history
        .map(item => {

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
                <b>
                  ${escapeHTML(
                    description
                  )}
                </b>
              </div>

              <div class="history-positive">
                +${amount}
              </div>

            </div>
          `;

        })
        .join("");


  } catch (error) {

    box.innerHTML =
      `<p style="color:#b91c1c;font-size:12px">
        ${escapeHTML(
          error.message
        )}
      </p>`;

  }
}


/* ======================================================
   UPLOAD ELEMENTS
====================================================== */

const videoFileInput =
  $("videoFile");


const videoFileName =
  $("videoFileName");


const uploadPreview =
  $("uploadPreview");


const uploadPreviewVideo =
  $("uploadPreviewVideo");


const uploadProgressBox =
  $("uploadProgressBox");


const uploadProgressBar =
  $("uploadProgressBar");


const uploadProgressText =
  $("uploadProgressText");


const uploadProgressPercent =
  $("uploadProgressPercent");


const uploadVideoBtn =
  $("uploadVideoBtn");


/* ======================================================
   UPLOAD INPUT COMPATIBILITY
====================================================== */

function getUploadTitleInput() {

  return (
    $("videoTitle") ||
    $("uploadTitle")
  );
}


function getUploadDescriptionInput() {

  return (
    $("videoDescription") ||
    $("uploadDescription")
  );
}


/* ======================================================
   SELECT VIDEO FROM GALLERY
====================================================== */

function setupVideoFileInput() {

  if (!videoFileInput) {
    return;
  }


  videoFileInput.addEventListener(
    "change",
    function () {

      const file =
        this.files &&
        this.files[0];


      if (!file) {

        selectedVideoFile =
          null;


        if (videoFileName) {

          videoFileName.textContent =
            "Gallery se video choose karein";

        }


        if (uploadPreview) {

          uploadPreview.classList.add(
            "hidden"
          );

        }


        return;
      }


      /* -----------------------------------------------
         VIDEO TYPE CHECK
      ------------------------------------------------ */

      if (
        !file.type ||
        !file.type.startsWith("video/")
      ) {

        showToast(
          "Sirf video file select karein."
        );


        this.value =
          "";


        selectedVideoFile =
          null;


        return;
      }


      /* -----------------------------------------------
         100 MB SIZE CHECK
      ------------------------------------------------ */

      if (
        file.size >
        MAX_VIDEO_SIZE
      ) {

        showToast(
          "Video maximum 100 MB ka ho sakta hai."
        );


        this.value =
          "";


        selectedVideoFile =
          null;


        return;
      }


      selectedVideoFile =
        file;


      if (videoFileName) {

        videoFileName.textContent =
          `${file.name} • ${formatVideoSize(
            file.size
          )}`;

      }


      /* -----------------------------------------------
         LOCAL PREVIEW
      ------------------------------------------------ */

      if (
        uploadPreview &&
        uploadPreviewVideo
      ) {

        if (
          uploadPreviewVideo.dataset.objectUrl
        ) {

          URL.revokeObjectURL(
            uploadPreviewVideo.dataset.objectUrl
          );

        }


        const objectUrl =
          URL.createObjectURL(file);


        uploadPreviewVideo.src =
          objectUrl;


        uploadPreviewVideo.dataset.objectUrl =
          objectUrl;


        uploadPreview.classList.remove(
          "hidden"
        );

      }

    }
  );
}


/* ======================================================
   UPLOAD PROGRESS UI
====================================================== */

function updateUploadProgress(
  percent,
  message
) {

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent) || 0
      )
    );


  if (uploadProgressBar) {

    uploadProgressBar.style.width =
      `${value}%`;

  }


  if (uploadProgressPercent) {

    uploadProgressPercent.textContent =
      `${value}%`;

  }


  if (uploadProgressText) {

    uploadProgressText.textContent =
      message ||
      "Uploading...";

  }
}


/* ======================================================
   CLOUDINARY SIGNATURE
====================================================== */

async function getCloudinarySignature() {

  const response =
    await fetch(
      `${API_BASE}/api/cloudinary/signature`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          ...(currentUser?.id
            ? {
                "x-user-id":
                  String(
                    currentUser.id
                  )
              }
            : {})
        },

        body:
          JSON.stringify({
            user_id:
              currentUser?.id ||
              null
          })
      }
    );


  let data;


  try {

    data =
      await response.json();

  } catch {

    throw new Error(
      "Server ka response invalid hai."
    );

  }


  if (
    !response.ok ||
    !data ||
    !data.ok
  ) {

    throw new Error(
      data?.error ||
      data?.message ||
      "Cloudinary signature nahi mili."
    );

  }


  if (
    !data.cloud_name ||
    !data.api_key ||
    !data.timestamp ||
    !data.signature
  ) {

    throw new Error(
      "Cloudinary signature response incomplete hai."
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
            "Video file missing hai."
          )
        );

        return;
      }


      if (
        file.size >
        MAX_VIDEO_SIZE
      ) {

        reject(
          new Error(
            "Video maximum 100 MB ka ho sakta hai."
          )
        );

        return;
      }


      const cloudName =
        signatureData.cloud_name;


      const uploadUrl =
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName
        )}/video/upload`;


      const xhr =
        new XMLHttpRequest();


      xhr.open(
        "POST",
        uploadUrl,
        true
      );


      /* -----------------------------------------------
         UPLOAD PROGRESS
      ------------------------------------------------ */

      xhr.upload.addEventListener(
        "progress",
        event => {

          if (
            !event.lengthComputable
          ) {
            return;
          }


          const percent =
            Math.round(
              (
                event.loaded /
                event.total
              ) * 100
            );


          updateUploadProgress(
            percent,
            "Video upload ho raha hai..."
          );

        }
      );


      /* -----------------------------------------------
         SUCCESS
      ------------------------------------------------ */

      xhr.onload =
        function () {

          let data =
            null;


          try {

            data =
              JSON.parse(
                xhr.responseText
              );

          } catch {

            data =
              null;

          }


          if (
            xhr.status >= 200 &&
            xhr.status < 300 &&
            data &&
            data.secure_url
          ) {

            resolve(data);

            return;
          }


          const cloudinaryMessage =
            data?.error?.message ||
            data?.message ||
            "";


          reject(
            new Error(
              cloudinaryMessage
                ? `Cloudinary: ${cloudinaryMessage}`
                : `Cloudinary upload failed (${xhr.status}).`
            )
          );

        };


      /* -----------------------------------------------
         NETWORK ERROR
      ------------------------------------------------ */

      xhr.onerror =
        function () {

          reject(
            new Error(
              "Network error. Cloudinary upload failed."
            )
          );

        };


      /* -----------------------------------------------
         ABORT
      ------------------------------------------------ */

      xhr.onabort =
        function () {

          reject(
            new Error(
              "Upload cancel ho gaya."
            )
          );

        };


      /* -----------------------------------------------
         FORM DATA
      ------------------------------------------------ */

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


      /*
        If backend provides a folder,
        preserve it.
      */

      if (
        signatureData.folder
      ) {

        formData.append(
          "folder",
          signatureData.folder
        );

      }


      xhr.send(
        formData
      );

    }
  );
}


/* ======================================================
   SAVE VIDEO METADATA TO NEON
====================================================== */

async function saveVideoMetadata(
  cloudinaryData,
  title,
  description
) {

  if (
    !currentUser ||
    !currentUser.id
  ) {

    throw new Error(
      "User session nahi mili."
    );

  }


  if (
    !cloudinaryData ||
    !cloudinaryData.secure_url
  ) {

    throw new Error(
      "Cloudinary video URL nahi mili."
    );

  }


  const result =
    await api(
      "/api/videos",
      {
        method: "POST",

        body:
          JSON.stringify({

            /*
              Send both IDs for compatibility
              with the existing backend.
            */

            user_id:
              currentUser.id,

            creator_id:
              currentUser.id,

            title:
              title,

            description:
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
              cloudinaryData.duration ||
              null,

            bytes:
              cloudinaryData.bytes ||
              null

          })
      }
    );


  if (
    result &&
    result.ok === false
  ) {

    throw new Error(
      result.error ||
      result.message ||
      "Video Neon database mein save nahi hua."
    );

  }


  return result;
}


/* ======================================================
   RESET UPLOAD FORM
====================================================== */

function resetUploadForm() {

  const titleInput =
    getUploadTitleInput();


  const descriptionInput =
    getUploadDescriptionInput();


  if (titleInput) {

    titleInput.value =
      "";

  }


  if (descriptionInput) {

    descriptionInput.value =
      "";

  }


  if (videoFileInput) {

    videoFileInput.value =
      "";

  }


  selectedVideoFile =
    null;


  if (videoFileName) {

    videoFileName.textContent =
      "Gallery se video choose karein";

  }


  if (
    uploadPreviewVideo
  ) {

    const oldUrl =
      uploadPreviewVideo.dataset.objectUrl;


    if (oldUrl) {

      URL.revokeObjectURL(
        oldUrl
      );

    }


    uploadPreviewVideo.pause();

    uploadPreviewVideo.removeAttribute(
      "src"
    );

    uploadPreviewVideo.removeAttribute(
      "data-object-url"
    );

    uploadPreviewVideo.load();

  }


  if (uploadPreview) {

    uploadPreview.classList.add(
      "hidden"
    );

  }
}


/* ======================================================
   MAIN GALLERY UPLOAD
====================================================== */

async function uploadUserVideo() {

  let uploadSucceeded =
    false;


  try {

    /* -----------------------------------------------
       USER SESSION
    ------------------------------------------------ */

    if (
      !currentUser ||
      !currentUser.id
    ) {

      showToast(
        "User session load nahi hui."
      );

      await createUser();

      if (
        !currentUser ||
        !currentUser.id
      ) {

        return;

      }

    }


    /* -----------------------------------------------
       INPUTS
    ------------------------------------------------ */

    const titleInput =
      getUploadTitleInput();


    const descriptionInput =
      getUploadDescriptionInput();


    const title =
      titleInput
        ?.value
        ?.trim() ||
      "";


    const description =
      descriptionInput
        ?.value
        ?.trim() ||
      "";


    /* -----------------------------------------------
       TITLE
    ------------------------------------------------ */

    if (!title) {

      showToast(
        "Video title likhiye."
      );


      titleInput?.focus();


      return;
    }


    /* -----------------------------------------------
       FILE
    ------------------------------------------------ */

    if (!selectedVideoFile) {

      showToast(
        "Gallery se video select karein."
      );


      return;
    }


    /* -----------------------------------------------
       TYPE
    ------------------------------------------------ */

    if (
      !selectedVideoFile.type ||
      !selectedVideoFile.type.startsWith(
        "video/"
      )
    ) {

      showToast(
        "Sirf video file upload karein."
      );


      return;
    }


    /* -----------------------------------------------
       SIZE
    ------------------------------------------------ */

    if (
      selectedVideoFile.size >
      MAX_VIDEO_SIZE
    ) {

      showToast(
        `Video maximum 100 MB ka ho sakta hai. Current size: ${formatVideoSize(
          selectedVideoFile.size
        )}`
      );


      return;
    }


    /* -----------------------------------------------
       LOCK BUTTON
    ------------------------------------------------ */

    if (uploadVideoBtn) {

      uploadVideoBtn.disabled =
        true;


      uploadVideoBtn.textContent =
        "Preparing...";

    }


    if (uploadProgressBox) {

      uploadProgressBox.classList.remove(
        "hidden"
      );

    }


    updateUploadProgress(
      0,
      "Secure upload prepare ho raha hai..."
    );


    /* -----------------------------------------------
       CLOUDINARY SIGNATURE
    ------------------------------------------------ */

    const signatureData =
      await getCloudinarySignature();


    updateUploadProgress(
      0,
      "Cloudinary upload ready..."
    );


    if (uploadVideoBtn) {

      uploadVideoBtn.textContent =
        "Uploading...";

    }


    /* -----------------------------------------------
       CLOUDINARY DIRECT UPLOAD
    ------------------------------------------------ */

    const cloudinaryData =
      await uploadToCloudinary(
        selectedVideoFile,
        signatureData
      );


    /* -----------------------------------------------
       CLOUDINARY SUCCESS
    ------------------------------------------------ */

    updateUploadProgress(
      100,
      "Upload complete. Video database mein save ho raha hai..."
    );


    if (uploadVideoBtn) {

      uploadVideoBtn.textContent =
        "Saving...";

    }


    /* -----------------------------------------------
       NEON
    ------------------------------------------------ */

    await saveVideoMetadata(
      cloudinaryData,
      title,
      description
    );


    uploadSucceeded =
      true;


    /* -----------------------------------------------
       SUCCESS
    ------------------------------------------------ */

    showToast(
      "🎉 Video successfully upload ho gaya!"
    );


    resetUploadForm();


    /* -----------------------------------------------
       REFRESH USER
    ------------------------------------------------ */

    await loadUser();


    /* -----------------------------------------------
       REFRESH FEED
    ------------------------------------------------ */

    if (
      typeof loadVideos ===
      "function"
    ) {

      await loadVideos();

    }


    /* -----------------------------------------------
       REFRESH MY VIDEOS
    ------------------------------------------------ */

    if (
      typeof loadMyVideos ===
      "function"
    ) {

      await loadMyVideos();

    }


    /* -----------------------------------------------
       BUTTON
    ------------------------------------------------ */

    if (uploadVideoBtn) {

      uploadVideoBtn.disabled =
        false;


      uploadVideoBtn.textContent =
        "🎥 Upload Video";

    }


    /* -----------------------------------------------
       HIDE PROGRESS
    ------------------------------------------------ */

    setTimeout(
      () => {

        if (
          uploadProgressBox
        ) {

          uploadProgressBox.classList.add(
            "hidden"
          );

        }


        updateUploadProgress(
          0,
          "Uploading..."
        );

      },
      1500
    );


  } catch (error) {

    console.error(
      "DekhoEarn upload error:",
      error
    );


    /*
      IMPORTANT:
      If Cloudinary upload succeeds but
      Neon save fails, the Cloudinary video
      already exists. We show the exact error
      instead of pretending success.
    */

    const message =
      error?.message ||
      "Video upload failed.";


    showToast(
      "❌ " + message
    );


    if (uploadProgressBox) {

      uploadProgressBox.classList.remove(
        "hidden"
      );

    }


    updateUploadProgress(
      0,
      "❌ Upload failed: " +
      message
    );


    if (uploadVideoBtn) {

      uploadVideoBtn.disabled =
        false;


      uploadVideoBtn.textContent =
        "🎥 Upload Video";

    }


  } finally {

    /*
      Do not hide progress immediately
      after an error so the user can see
      what went wrong.
    */

    if (
      uploadSucceeded
    ) {

      /*
        Success cleanup is already handled
        above.
      */

    }

  }
}


/*
  Keep one public function name for
  existing HTML onclick handlers.
*/
async function uploadVideo() {

  return uploadUserVideo();
}


/* ======================================================
   UPLOAD BUTTON
====================================================== */

function setupUploadButton() {

  if (!uploadVideoBtn) {
    return;
  }


  /*
    Prevent duplicate event listeners.
  */

  if (
    uploadVideoBtn.dataset.listenerAttached ===
    "true"
  ) {

    return;

  }


  uploadVideoBtn.dataset.listenerAttached =
    "true";


  uploadVideoBtn.addEventListener(
    "click",
    uploadUserVideo
  );
}


/* ======================================================
   MY VIDEOS
====================================================== */

async function loadMyVideos() {

  const box =
    $("myVideosList");


  if (!box) {
    return;
  }


  box.innerHTML =
    `<div class="loading">
      My videos loading...
    </div>`;


  try {

    const data =
      await api(
        `/api/videos?creator_id=${encodeURIComponent(
          currentUser.id
        )}`
      );


    const videos =
      data.videos ||
      data.data ||
      [];


    /*
      Backend may already filter by creator.
      Keep the local filter for compatibility.
    */

    const mine =
      videos.filter(
        video => {

          const creatorId =
            video.creator_id ??
            video.user_id;


          return (
            Number(creatorId) ===
            Number(currentUser.id)
          );

        }
      );


    /*
      If backend returned only creator videos
      but omitted creator_id, use the result.
    */

    const finalVideos =
      mine.length
        ? mine
        : videos;


    if (!finalVideos.length) {

      box.innerHTML =
        `<p style="color:#68716b;font-size:12px">
          Aapne abhi koi video upload nahi kiya.
        </p>`;


      return;
    }


    box.innerHTML =
      finalVideos
        .map(video => {

          const videoId =
            Number(video.id);


          return `
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
                )}
                views
                •
                ${formatNumber(
                  video.likes ||
                  video.like_count ||
                  0
                )}
                likes
              </p>

              <button
                class="delete-video-btn"
                onclick="deleteMyVideo(${videoId})">
                Delete
              </button>

            </div>
          `;

        })
        .join("");


  } catch (error) {

    console.error(
      "My videos error:",
      error
    );


    box.innerHTML =
      `<p style="color:#b91c1c;font-size:12px">
        ${escapeHTML(
          error.message
        )}
      </p>`;

  }
}


/* ======================================================
   DELETE VIDEO
====================================================== */

async function deleteMyVideo(
  videoId
) {

  const confirmed =
    confirm(
      "Kya aap apna video delete karna chahte hain?"
    );


  if (!confirmed) {
    return;
  }


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

async function loadCreatorStats() {

  if (!currentUser?.id) {
    return;
  }


  try {

    const data =
      await api(
        `/api/creator/${currentUser.id}`
      );


    const creator =
      data.creator ||
      data;


    if ($("creatorFollowers")) {

      $("creatorFollowers").textContent =
        formatNumber(
          creator.followers ||
          creator.follower_count ||
          0
        );

    }


    if ($("creatorHours")) {

      $("creatorHours").textContent =
        Number(
          creator.watch_hours ||
          creator.eligible_watch_hours ||
          0
        ).toFixed(1);

    }


    if ($("creatorVideos")) {

      $("creatorVideos").textContent =
        formatNumber(
          creator.videos_count ||
          creator.video_count ||
          0
        );

    }


    updateMonetizationUI(
      creator
    );


  } catch (error) {

    console.error(
      "Creator stats:",
      error.message
    );


    /*
      Do not break the application
      if creator endpoint isn't ready.
    */

    updateMonetizationUI(
      {}
    );

  }
}


function updateMonetizationUI(
  creator
) {

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


  const statusElement =
    $("monetizationStatus");


  const button =
    $("monetizationBtn");


  if (status === "approved") {

    if (statusElement) {

      statusElement.innerHTML =
        "✅ <b>Monetization Approved</b><br>" +
        "Your creator account is monetized.";

    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Monetization Approved";

    }


    return;
  }


  if (status === "pending") {

    if (statusElement) {

      statusElement.innerHTML =
        "⏳ <b>Application Pending</b><br>" +
        "Your monetization application is under review.";

    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Application Pending";

    }


    return;
  }


  if (eligible) {

    if (statusElement) {

      statusElement.innerHTML =
        "🎉 <b>You are eligible.</b><br>" +
        "You have reached 1,000 followers and 1,000 eligible watch-hours.";

    }


    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Apply for Monetization";

    }


  } else {

    if (statusElement) {

      statusElement.innerHTML =
        "📊 <b>Not eligible yet</b><br><br>" +
        `Followers: ${formatNumber(
          followers
        )} / 1,000<br>` +
        `Watch Hours: ${hours.toFixed(
          1
        )} / 1,000`;

    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Requirements Not Reached";

    }

  }
}


async function applyMonetization() {

  if (!currentUser?.id) {
    return;
  }


  try {

    const data =
      await api(
        `/api/creator/${currentUser.id}/monetization/apply`,
        {
          method: "POST",

          body:
            JSON.stringify({
              user_id:
                currentUser.id
            })
        }
      );


    showToast(
      data.message ||
      "Application submitted."
    );


    await loadCreatorStats();


  } catch (error) {

    showToast(
      error.message
    );

  }
}


/* ======================================================
   PWA INSTALL
====================================================== */

window.addEventListener(
  "beforeinstallprompt",
  event => {

    event.preventDefault();


    deferredPrompt =
      event;


    const installBtn =
      $("installBtn");


    if (!installBtn) {
      return;
    }


    installBtn.hidden =
      false;


    installBtn.onclick =
      async () => {

        if (!deferredPrompt) {
          return;
        }


        deferredPrompt.prompt();


        try {

          await deferredPrompt.userChoice;

        } catch {
          // User closed install prompt.
        }


        deferredPrompt =
          null;


        installBtn.hidden =
          true;

      };

  }
);


window.addEventListener(
  "appinstalled",
  () => {

    const installBtn =
      $("installBtn");


    if (installBtn) {

      installBtn.hidden =
        true;

    }


    showToast(
      "DekhoEarn installed successfully 📱"
    );

  }
);


/* ======================================================
   SAFE INITIALIZATION
====================================================== */

function initializeDekhoEarn() {

  setupVideoTracking();

  setupLikeButton();

  setupReportButton();

  setupVideoFileInput();

  setupUploadButton();

}


/* ======================================================
   START APPLICATION
====================================================== */

async function startApp() {

  try {

    initializeDekhoEarn();


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


/* ======================================================
   START
====================================================== */

startApp();
