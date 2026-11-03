// 寝屋川キャンパスに統一された授業時刻を使う。
const timestable = [
  ["9:00", "10:45"],
  ["10:55", "12:40"],
  ["13:25", "15:10"],
  ["15:20", "17:05"],
  ["17:15", "19:00"]
];

// 入力欄からフォーカスを外さずポップアップを閉じても保存する。
let loginSaveVersion = 0;
function saveLoginOptions() {
  const version = ++loginSaveVersion;
  const user_id = document.getElementById('user_id').value.trim();
  const user_pass = document.getElementById('user_pass').value;
  const status = document.getElementById('login-status');
  status.textContent = '保存中...';
  chrome.storage.sync.set({ user_id, user_pass }, function () {
    if (version !== loginSaveVersion) return;
    status.textContent = chrome.runtime.lastError
      ? '保存できませんでした。もう一度保存してください。'
      : user_id && user_pass
        ? '保存しました。Moodleで自動ログインします。'
        : 'IDとパスワードの両方を入力してください。';
  });
}
for (const id of ['user_id', 'user_pass']) {
  document.getElementById(id).addEventListener('input', saveLoginOptions);
  document.getElementById(id).addEventListener('change', saveLoginOptions);
}
document.getElementById('save-login').addEventListener('click', saveLoginOptions);

/*apiキー購入ボタンが押されたら*/
document.addEventListener('DOMContentLoaded', function () {
  // タブに対してクリックイベントを適用
  const tabs = document.getElementsByClassName('tab');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', tabSwitch, false);
    tabs[i].addEventListener('keydown', function (event) {
      let index = i;
      if (event.key === 'ArrowRight') index = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (i + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[index].click();
      tabs[index].focus();
    });
  }

  // タブをクリックすると実行する関数
  function tabSwitch() {
    // タブのclassの値を変更
    document.getElementsByClassName('is-active')[0].classList.remove('is-active');
    this.classList.add('is-active');
    Array.from(tabs).forEach(tab => {
      const active = tab === this;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    // コンテンツのclassの値を変更
    document.getElementsByClassName('is-show')[0].classList.remove('is-show');
    const arrayTabs = Array.prototype.slice.call(tabs);
    const index = arrayTabs.indexOf(this);
    document.getElementsByClassName('panel')[index].classList.add('is-show');
  };
}, false);




document.getElementById("switch2").addEventListener("change", function () {
  storage_set("setting2", document.getElementById("switch2").checked)
});
document.getElementById("switch3").addEventListener("change", function () {
  storage_set("setting3", document.getElementById("switch3").checked)
});




// popup.js内で
function send_data(data_, bool_) {
  // popup.js内で
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { data: data_, bool: bool_ });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const setting2Value = await read_data("setting2");
    document.getElementById("switch2").checked = JSON.parse(setting2Value);
  } catch (error) {
    console.error('Error reading setting2:', error);
  }
  try {
    const setting2Value = await read_data("setting3");
    document.getElementById("switch3").checked = JSON.parse(setting2Value);
  } catch (error) {
    console.error('Error reading setting3:', error);
  }
});

function read_data(key) {
  return new Promise((resolve, reject) => {
    timetableStorage.get(key, function (data) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.info(data);
        console.log(data[key]);
        resolve(data[key]);
      }
    });
  });
}

function storage_set(key, value) {
  timetableStorage.set({ [key]: value }, function () {
  });
}

function normalizeMoodleUrl(url) {
  if (typeof url !== "string") {
    return "https://moodle2026.mc2.osakac.ac.jp/2026/";
  }

  // 過去年度の保存URLでも、現行年度(2026)のMoodleに寄せて開く
  return url
    .replace(/moodle\d+\.mc2\.osakac\.ac\.jp/, "moodle2026.mc2.osakac.ac.jp")
    .replace(/\/20\d{2}(?=\/|$)/, "/2026");
}


function departmentMoodleUrl(userId) {
  const department = moodleDepartment(userId);
  const root = normalizeMoodleUrl();
  return department ? `${root}course/index.php?categoryid=${department.id}` : root;
}

function moodleShortcutUrl(userId, timetable, now = new Date()) {
  if (typeof userId !== 'string' || !userId.trim()) return normalizeMoodleUrl();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = time => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const period = timestable.findIndex(([start, end]) =>
    minutes >= toMinutes(start) && minutes < toMinutes(end));
  if (period >= 0) {
    const slot = `${now.getDay()}-${period + 1}`;
    for (const [key, value] of Object.entries(timetable)) {
      if (value !== slot) continue;
      const course = key.match(/^9999(\d+)$/);
      if (course) return `${normalizeMoodleUrl()}course/view.php?id=${course[1]}`;
      if (/^https:\/\/moodle\d+\.mc2\.osakac\.ac\.jp\/20\d{2}\/course\/view\.php\?id=\d+$/.test(key)) {
        return normalizeMoodleUrl(key);
      }
    }
  }
  return departmentMoodleUrl(userId);
}

document.getElementById("curriculum").addEventListener("click", async function (event) {
  event.preventDefault();
  const now = new Date();
  const [login, timetable] = await Promise.all([
    chrome.storage.sync.get('user_id').catch(() => ({})),
    timetableStorage.get(null).catch(() => ({}))
  ]);
  chrome.tabs.create({ url: moodleShortcutUrl(login.user_id, timetable, now) });
});


document.getElementById("myportal").addEventListener("click", function () {
  window.open("https://myportal.osakac.ac.jp/", '_blank');
});

document.getElementById("chatgpt").addEventListener("click", function (event) {
  event.preventDefault();
  // Call open directly in the click handler to retain Chrome's user gesture.
  chrome.windows.getCurrent().then(currentWindow =>
    chrome.sidePanel.open({ windowId: currentWindow.id })
  ).then(() => window.close()).catch(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('chat/chat-panel.html') });
  });
});
document.getElementById("genemi").addEventListener("click", function () {
  window.open("https://gemini.google.com/app", '_blank');
});







// タイムスタンプ
function getNow() {

  const now = new Date();
  const year = now.getFullYear();
  const mon = now.getMonth() + 1; // 1を足すこと
  const day = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();

  // 現在時刻を表示用にフォーマット
  const currentTime = `${hour}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  document.getElementById("timestamp").textContent = currentTime;

  let currentPeriod = null; // 現在の時間帯を指すインデックス
  let remainingMinutes = null; // 残り時間

  // 現在時刻を分単位に変換
  const currentMinutes = hour * 60 + min;

  // 現在の時間が timestable のどの時間帯に該当するかチェック
  for (let i = 0; i < timestable.length; i++) {
    const [start, end] = timestable[i];
    const [startHour, startMin] = start.split(":").map(Number);
    const [endHour, endMin] = end.split(":").map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      currentPeriod = i; // 現在の時間帯
      remainingMinutes = endMinutes - currentMinutes; // 終了までの残り時間
      break;
    }
  }

  // 出力用
  if (currentPeriod !== null) {
    document.getElementById("timestamp2").textContent =
      `${currentPeriod + 1}限目 (${timestable[currentPeriod][0]} - ${timestable[currentPeriod][1]})`;
    document.getElementById("timestamp3").textContent = `あと ${remainingMinutes} 分`;
  } else {
    document.getElementById("timestamp2").textContent = "現在、授業時間外です";
    document.getElementById("timestamp3").textContent = "";
  }
}

setInterval(getNow, 1000);

const syncToggle = document.getElementById('timetable-sync');
chrome.storage.local.get('timetableSyncEnabled').then(data => {
  syncToggle.checked = data.timetableSyncEnabled === true;
});
syncToggle.addEventListener('change', async () => {
  const enabled = syncToggle.checked;
  const status = document.getElementById('sync-status');
  syncToggle.disabled = true;
  status.textContent = '切り替え中…';
  try {
    await timetableStorage.setEnabled(enabled);
    status.textContent = enabled ? '同期をONにしました。' : '同期をOFFにしました。';
  } catch (error) {
    syncToggle.checked = !enabled;
    status.textContent = '切り替えできませんでした。もう一度お試しください。';
  } finally {
    syncToggle.disabled = false;
  }
});
