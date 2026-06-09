// ===== 設定 =====
const settings = {
  workDuration: 25,
  breakDuration: 5,
  theme: "light",
  sounds: {
    start: true,
    end: true,
    tick: false,
  },
};

const SOUND_VOLUME = {
  default: 0.03,
  tick: 0.012,
};

function buildPhases(workMin, breakMin) {
  return [
    { name: "作業中", duration: workMin * 60, isBreak: false },
    { name: "休憩中", duration: breakMin * 60, isBreak: true },
    { name: "作業中", duration: workMin * 60, isBreak: false },
    { name: "休憩中", duration: breakMin * 60, isBreak: true },
    { name: "作業中", duration: workMin * 60, isBreak: false },
    { name: "休憩中", duration: breakMin * 60, isBreak: true },
    { name: "作業中", duration: workMin * 60, isBreak: false },
    { name: "長い休憩中", duration: breakMin * 60, isBreak: true },
  ];
}

// ===== 状態 =====
let phases = buildPhases(settings.workDuration, settings.breakDuration);
let phaseIndex = 0;
let remaining = phases[0].duration;
let intervalId = null;
let isRunning = false;
let audioContext = null;

// ===== SVG 定数 =====
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ===== DOM 要素 =====
const timerDisplay = document.getElementById("timer-display");
const phaseLabel = document.getElementById("phase-label");
const startBtn = document.getElementById("start-btn");
const ringProgress = document.getElementById("ring-progress");
const completedCount = document.getElementById("completed-count");
const totalTimeEl = document.getElementById("total-time");
const workDurationSelect = document.getElementById("work-duration");
const breakDurationSelect = document.getElementById("break-duration");
const themeSelect = document.getElementById("theme-select");
const startSoundCheckbox = document.getElementById("sound-start");
const endSoundCheckbox = document.getElementById("sound-end");
const tickSoundCheckbox = document.getElementById("sound-tick");

// ===== 初期化 =====
ringProgress.style.strokeDasharray = CIRCUMFERENCE;
ringProgress.style.strokeDashoffset = 0;
bindSettingsControls();
applyTheme(settings.theme);
loadTodayProgress();
requestNotificationPermission();

// ===== SVG プログレスバー更新 =====
function setDashOffset(percent) {
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  ringProgress.style.strokeDashoffset = offset;
}

// ===== タイマー表示更新 =====
function updateDisplay() {
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  timerDisplay.textContent = `${m}:${s}`;

  const total = phases[phaseIndex].duration;
  const percent = (remaining / total) * 100;
  setDashOffset(percent);
}

// ===== フェーズ切替 =====
function switchPhase() {
  if (!phases[phaseIndex].isBreak) {
    const durationMin = phases[phaseIndex].duration / 60;
    recordSession(durationMin);
  }

  phaseIndex = (phaseIndex + 1) % phases.length;
  remaining = phases[phaseIndex].duration;
  const phase = phases[phaseIndex];

  phaseLabel.textContent = phase.name;
  ringProgress.classList.toggle("break", phase.isBreak);
  updateDisplay();
  sendNotification(`${phase.name}の時間です！`);
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
  playSound("start");

  intervalId = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      playSound("tick");
    }
    updateDisplay();

    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      isRunning = false;
      startBtn.textContent = "開始";
      playSound("end");
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
  remaining = phases[phaseIndex].duration;
  startBtn.textContent = "開始";
  updateDisplay();
}

function applyTimerSettings() {
  pauseTimer();
  phases = buildPhases(settings.workDuration, settings.breakDuration);
  phaseIndex = 0;
  remaining = phases[0].duration;
  phaseLabel.textContent = phases[0].name;
  ringProgress.classList.remove("break");
  startBtn.textContent = "開始";
  updateDisplay();
}

function applyTheme(theme) {
  document.body.classList.remove("theme-light", "theme-dark", "theme-focus");
  document.body.classList.add(`theme-${theme}`);
}

function bindSettingsControls() {
  workDurationSelect.addEventListener("change", (event) => {
    settings.workDuration = Number(event.target.value);
    applyTimerSettings();
  });

  breakDurationSelect.addEventListener("change", (event) => {
    settings.breakDuration = Number(event.target.value);
    applyTimerSettings();
  });

  themeSelect.addEventListener("change", (event) => {
    settings.theme = event.target.value;
    applyTheme(settings.theme);
  });

  startSoundCheckbox.addEventListener("change", (event) => {
    settings.sounds.start = event.target.checked;
  });

  endSoundCheckbox.addEventListener("change", (event) => {
    settings.sounds.end = event.target.checked;
  });

  tickSoundCheckbox.addEventListener("change", (event) => {
    settings.sounds.tick = event.target.checked;
  });
}

function playSound(type) {
  if (!settings.sounds[type] || !window.AudioContext) return;
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  const frequencies = { start: 660, end: 440, tick: 880 };
  const durations = { start: 0.08, end: 0.14, tick: 0.03 };
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequencies[type];
  gainNode.gain.value = type === "tick" ? SOUND_VOLUME.tick : SOUND_VOLUME.default;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + durations[type]);
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

// 初期表示
updateDisplay();
