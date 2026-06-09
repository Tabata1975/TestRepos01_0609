// ===== フェーズ定義 =====
const PHASES = [
  { name: "作業中", duration: 25 * 60, isBreak: false },
  { name: "休憩中", duration: 5 * 60, isBreak: true },
  { name: "作業中", duration: 25 * 60, isBreak: false },
  { name: "休憩中", duration: 5 * 60, isBreak: true },
  { name: "作業中", duration: 25 * 60, isBreak: false },
  { name: "休憩中", duration: 5 * 60, isBreak: true },
  { name: "作業中", duration: 25 * 60, isBreak: false },
  { name: "長い休憩中", duration: 15 * 60, isBreak: true },
];

// ===== 状態 =====
let phaseIndex = 0;
let remaining = PHASES[0].duration;
let intervalId = null;
let isRunning = false;

// ===== SVG 定数 =====
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ===== DOM 要素 =====
const timerDisplay = document.getElementById("timer-display");
const phaseLabel = document.getElementById("phase-label");
const startBtn = document.getElementById("start-btn");
const ringProgress = document.getElementById("ring-progress");
const ringGradientStart = document.getElementById("ring-gradient-start");
const ringGradientEnd = document.getElementById("ring-gradient-end");
const completedCount = document.getElementById("completed-count");
const totalTimeEl = document.getElementById("total-time");

// ===== 色補間 =====
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function interpolateColor(from, to, ratio) {
  const t = clamp(ratio, 0, 1);
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}

function toRgb(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function getFocusGradientColors(elapsedRatio) {
  const blue = { r: 47, g: 128, b: 237 };
  const yellow = { r: 242, g: 201, b: 76 };
  const red = { r: 235, g: 87, b: 87 };

  if (elapsedRatio <= 0.5) {
    const t = elapsedRatio * 2;
    return {
      start: interpolateColor(blue, yellow, t),
      end: interpolateColor({ r: 86, g: 204, b: 242 }, yellow, t),
    };
  }

  const t = (elapsedRatio - 0.5) * 2;
  return {
    start: interpolateColor(yellow, red, t),
    end: interpolateColor({ r: 242, g: 153, b: 74 }, red, t),
  };
}

function setRingGradient(remainingRatio, isBreakPhase) {
  if (isBreakPhase) {
    ringGradientStart.setAttribute("stop-color", "#56ab2f");
    ringGradientEnd.setAttribute("stop-color", "#a8e063");
    return;
  }

  const elapsedRatio = 1 - clamp(remainingRatio, 0, 1);
  const colors = getFocusGradientColors(elapsedRatio);
  ringGradientStart.setAttribute("stop-color", toRgb(colors.start));
  ringGradientEnd.setAttribute("stop-color", toRgb(colors.end));
}

// ===== SVG プログレスバー更新 =====
function setDashOffset(percent) {
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  ringProgress.style.strokeDashoffset = offset;
}

// ===== エフェクト状態更新 =====
function updateFocusEffectState() {
  const isFocusPhase = !PHASES[phaseIndex].isBreak;
  document.body.classList.toggle("focus-mode", isRunning && isFocusPhase);
}

// ===== タイマー表示更新 =====
function updateDisplay() {
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  timerDisplay.textContent = `${m}:${s}`;

  const total = PHASES[phaseIndex].duration;
  const ratio = clamp(remaining / total, 0, 1);
  setDashOffset(ratio * 100);
  setRingGradient(ratio, PHASES[phaseIndex].isBreak);
}

// ===== フェーズ切替 =====
function switchPhase() {
  if (!PHASES[phaseIndex].isBreak) {
    const durationMin = PHASES[phaseIndex].duration / 60;
    recordSession(durationMin);
  }

  phaseIndex = (phaseIndex + 1) % PHASES.length;
  remaining = PHASES[phaseIndex].duration;
  phaseLabel.textContent = PHASES[phaseIndex].name;

  updateDisplay();
  updateFocusEffectState();
  sendNotification(`${PHASES[phaseIndex].name}の時間です！`);
}

// ===== タイマー開始・一時停止トグル =====
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
  updateFocusEffectState();

  intervalId = setInterval(() => {
    remaining -= 1;
    updateDisplay();

    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      isRunning = false;
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
  updateFocusEffectState();
}

// ===== リセット =====
function resetTimer() {
  pauseTimer();
  remaining = PHASES[phaseIndex].duration;
  startBtn.textContent = "開始";
  updateDisplay();
}

// ===== セッション記録 =====
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
      totalTimeEl.textContent = formatMinutes(data.total_minutes);
    })
    .catch((err) => console.error(err));
}

// ===== 今日の進捗取得 =====
function loadTodayProgress() {
  fetch("/api/today")
    .then((res) => res.json())
    .then((data) => {
      completedCount.textContent = data.completed;
      totalTimeEl.textContent = formatMinutes(data.total_minutes);
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

// ===== ブラウザ通知 =====
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

// ===== 初期化 =====
phaseLabel.textContent = PHASES[phaseIndex].name;
ringProgress.style.strokeDasharray = CIRCUMFERENCE;
ringProgress.style.strokeDashoffset = 0;
loadTodayProgress();
requestNotificationPermission();
updateDisplay();
