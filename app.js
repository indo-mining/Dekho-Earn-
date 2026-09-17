let points = Number(localStorage.getItem("dekhoearn_points")) || 0;
let videosWatched =
  Number(localStorage.getItem("dekhoearn_videos")) || 0;

let todayEarned =
  Number(localStorage.getItem("dekhoearn_today")) || 0;

const pointsEl = document.getElementById("points");
const videosEl = document.getElementById("videosWatched");
const todayEl = document.getElementById("todayEarned");

function saveData() {
  localStorage.setItem("dekhoearn_points", points);
  localStorage.setItem("dekhoearn_videos", videosWatched);
  localStorage.setItem("dekhoearn_today", todayEarned);
}

function updateUI() {
  pointsEl.textContent = points;
  videosEl.textContent = videosWatched;
  todayEl.textContent = todayEarned;
}

document.getElementById("watchBtn").addEventListener("click", () => {

  alert(
    "Reward video system yahan connect hoga.\n\n" +
    "Abhi testing ke liye video reward system placeholder hai."
  );

});

document.getElementById("dailyBtn").addEventListener("click", () => {

  const today = new Date().toDateString();
  const claimed =
    localStorage.getItem("dekhoearn_daily");

  if (claimed === today) {
    alert("Aaj ka bonus already claim ho chuka hai.");
    return;
  }

  const reward = 10;

  points += reward;
  todayEarned += reward;

  localStorage.setItem("dekhoearn_daily", today);

  saveData();
  updateUI();

  alert(`🎉 Daily Bonus +${reward} Points`);
});

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {

  event.preventDefault();

  deferredPrompt = event;

  const installBtn =
    document.getElementById("installBtn");

  installBtn.hidden = false;

  installBtn.onclick = async () => {

    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    await deferredPrompt.userChoice;

    deferredPrompt = null;

    installBtn.hidden = true;
  };
});

updateUI();
