// ===== フェーズ定義 =====
const PHASES = [
  { name: "作業中",     duration: 25 * 60, isBreak: false },
  { name: "休憩中",     duration:  5 * 60, isBreak: true  },
  { name: "作業中",     duration: 25 * 60, isBreak: false },
  { name: "休憩中",     duration:  5 * 60, isBreak: true  },
  { name: "作業中",     duration: 25 * 60, isBreak: false },
  { name: "休憩中",     duration:  5 * 60, isBreak: true  },
  { name: "作業中",     duration: 25 * 60, isBreak: false },
  { name: "長い休憩中", duration: 15 * 60, isBreak: true  },
];

// ===== 状態 =====
let phaseIndex   = 0;
let remaining    = PHASES[0].duration;
let intervalId   = null;
let isRunning    = false;

// ===== SVG 定数 =====
const RADIUS      = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ===== DOM 要素 =====
const timerDisplay   = document.getElementById("timer-display");
const phaseLabel     = document.getElementById("phase-label");
const startBtn       = document.getElementById("start-btn");
const ringProgress   = document.getElementById("ring-progress");
const completedCount = document.getElementById("completed-count");
const totalTimeEl    = document.getElementById("total-time");

// ===== 初期化 =====
ringProgress.style.strokeDasharray  = CIRCUMFERENCE;
ringProgress.style.strokeDashoffset = 0;
loadTodayProgress();
requestNotificationPermission();

// ===== SVG プログレスバー更新 (Phase 3) =====
function setDashOffset(percent) {
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  ringProgress.style.strokeDashoffset = offset;
}

// ===== タイマー表示更新 =====
function updateDisplay() {
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  timerDisplay.textContent = `${m}:${s}`;

  const total = PHASES[phaseIndex].duration;
  const percent = (remaining / total) * 100;
  setDashOffset(percent);
}

// ===== フェーズ切替 (Phase 5) =====
function switchPhase() {
  // 作業フェーズが完了した場合に記録
  if (!PHASES[phaseIndex].isBreak) {
    const durationMin = PHASES[phaseIndex].duration / 60;
    recordSession(durationMin);
  }

  phaseIndex = (phaseIndex + 1) % PHASES.length;
  remaining  = PHASES[phaseIndex].duration;
  const phase = PHASES[phaseIndex];

  phaseLabel.textContent = phase.name;

  if (phase.isBreak) {
    ringProgress.classList.add("break");
  } else {
    ringProgress.classList.remove("break");
  }

  updateDisplay();
  sendNotification(`${phase.name}の時間です！`);
}

// ===== タイマー開始・一時停止トグル (Phase 4) =====
function toggleTimer() {
  if (isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  startBtn.textContent = "一時停止";

  intervalId = setInterval(() => {
    remaining -= 1;
    updateDisplay();

    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      isRunning  = false;
      startBtn.textContent = "開始";
      switchPhase();
    }
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(intervalId);
  intervalId = null;
  startBtn.textContent = "再開";
}

// ===== リセット =====
function resetTimer() {
  pauseTimer();
  remaining = PHASES[phaseIndex].duration;
  startBtn.textContent = "開始";
  updateDisplay();
}

// ===== セッション記録 (Phase 6) =====
function recordSession(durationMin) {
  fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration: durationMin }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`POST /api/session failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      completedCount.textContent = data.completed;
      totalTimeEl.textContent    = formatMinutes(data.total_minutes);
    })
    .catch((err) => console.error(err));

// ===== 今日の進捗取得 (Phase 6) =====
function loadTodayProgress() {
  fetch("/api/today")
    .then((res) => res.json())
    .then((data) => {
      completedCount.textContent = data.completed;
      totalTimeEl.textContent    = formatMinutes(data.total_minutes);
    })
    .catch(() => {});
}

// ===== 時間フォーマット =====
function formatMinutes(totalMin) {
  if (totalMin < 60) return `${totalMin}分`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// ===== ブラウザ通知 (Phase 7) =====
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendNotification(message) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("ポモドーロタイマー", { body: message });
  }
}

// 初期表示
updateDisplay();
