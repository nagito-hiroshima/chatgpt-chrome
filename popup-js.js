let timestable = 1;
//時間割1
const timetable1 = [
  ["9:00", "10:45"],
  ["10:55", "12:40"],
  ["13:25", "15:10"],
  ["15:20", "17:05"],
  ["17:15", "19:00"]
];
//時間割2
const timetable2 = [
  ["9:30", "11:15"],
  ["11:25", "13:10"],
  ["13:55", "15:40"],
  ["15:50", "17:35"],
  ["17:45", "19:30"]
];

//保存ボタンが押されたら
//chrome.storageにnkeyとncheakを保存する
//nkeyはAPIキー
//ncheakはモードがONかどうかのチェック
function save_options() {
  //nkey-inputの値を取得
  var nkey_input = document.getElementById('nkey-input').value;
  //nkey-checkboxの値を取得
  var nkey_cheak = document.getElementById('nkey-checkbox').checked;

  //loaderを表示させる
  document.getElementById('loader').style.display = "block";
  //savesのテキストを変更
  document.getElementById('saves').textContent = "";
  //statusのテキストを変更
  document.getElementById('status').textContent = '保存中...';

  //APIキーが正しいかどうかを確認する
  const endpoint = 'https://api.openai.com/v1/chat/completions';
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${nkey_input}`
    },
    body: JSON.stringify({
      messages: [{ "role": "system", "content": "これは何ですか？" },
      { "role": "system", "content": "日本語で答えてください" },
      { "role": "user", "content": "これはペンです" }],
      model: "gpt-3.5-turbo",
      max_tokens: 500,
      temperature: 1,
      n: 1,
      stop: '###'
    })
  })
    // レスポンスをJSONとしてパースする
    .then(response => response.json())

    // レスポンスのJSONをコンソールに出力する

    .then(data => {
      const text = data.choices[0].message.content;
      console.log(text)
      //正しいAPIキーだったら
      //chrome.storageにnkeyとncheakを保存する
      chrome.storage.sync.set({
        nkey: nkey_input,
        ncheak: nkey_cheak
      }, function () {
        // 保存後の処理
        //statusのテキストを変更
        document.getElementById('status').textContent = '保存されました';
        //apiキー購入ボタンを非表示にする
        document.getElementById("keystore").style.display = "none";

        //background.jsにメッセージを送る
        chrome.runtime.sendMessage({
          greeting: "none"
        })

      });

      //loaderを非表示にする
      document.getElementById('loader').style.display = "none";
      //savesのテキストを変更
      document.getElementById('saves').textContent = "保存";

    })
    // エラー処理
    .catch(error => {
      //background.jsにメッセージを送る
      chrome.runtime.sendMessage({
        greeting: "error"
      })
      //statusのテキストを変更
      document.getElementById('status').textContent = 'APIが正しくありません';
      //nkey-inputの値を空にする
      document.getElementById('nkey-input').value = "";

      //chrome.storageにnkeyとncheakを保存する
      chrome.storage.sync.set({
        nkey: document.getElementById('nkey-input').value,
        ncheak: document.getElementById('nkey-checkbox').checked
      }, function () { })
      //loaderを非表示にする
      document.getElementById('loader').style.display = "none";
      //savesのテキストを変更
      document.getElementById('saves').textContent = "保存";
      //apiキー購入ボタンを表示する
      document.getElementById("keystore").style.display = "block";
    });

}

//chrome.storageからnkeyとncheakを取得する
//nkeyはAPIキー
//ncheakはモードがONかどうかのチェック
//nkey-inputとnkey-checkboxにそれぞれ代入する
function restore_options() {
  //chrome.storageからnkeyとncheakを取得する
  chrome.storage.sync.get({ "nkey": "", "ncheak": "", "user_id": "", "user_pass": "", "campus": "" }, function (items) {
    //nkey-inputとnkey-checkboxにそれぞれ代入する
    document.getElementById('nkey-input').value = items.nkey;
    document.getElementById('nkey-checkbox').checked = items.ncheak;


    //user_idにuser_idに入っている値を代入
    document.getElementById("user_id").value = items.user_id;
    //user_passにuser_passに入っている値を代入
    document.getElementById("user_pass").value = items.user_pass;

    document.getElementById("campus_select").value = items.campus;

    if(items.campus == 1){
      timestable = timetable1;
    }else{
      timestable = timetable2;
    }

    //nkeyが空だったら
    if (items.nkey != "") {
      //apiキー購入ボタンを非表示にする
      document.getElementById("keystore").style.display = "none";
    } else {
      //apiキー購入ボタンを表示する
      document.getElementById("keystore").style.display = "block";
    }

  });
}

//popup.htmlが読み込まれたら
document.addEventListener('DOMContentLoaded', function () {
  restore_options();
});

//保存ボタンが押されたら
document.getElementById('save').addEventListener('click',
  save_options);

//範囲選択禁止
document.addEventListener('selectstart', function (e) {
  e.preventDefault();
}
  , false);
//nkey-inputは範囲選択可能
document.getElementById('nkey-input').addEventListener('selectstart', function (e) {
  e.stopPropagation();
}
  , false);




/*user_idが変更されたら*/
document.getElementById('user_id').addEventListener('change', function () {
  var user_id = document.getElementById('user_id').value;
  //chrome.storage にuser_idとして保存する
  chrome.storage.sync.set({
    user_id: user_id
  }, function () {
  });
});


/*campusが変更されたら*/
document.getElementById('campus_select').addEventListener('change', function () {
  var campus = document.getElementById('campus_select').value;
  //chrome.storage にcampusとして保存する
  chrome.storage.sync.set({
    campus: campus
  }, function () {
  });
  //ページをリロード
  location.reload();
}
);

/*user_passが変更されたら*/
document.getElementById('user_pass').addEventListener('change', function () {
  var user_pass = document.getElementById('user_pass').value;
  //chrome.storage にuser_passとして保存する
  chrome.storage.sync.set({
    user_pass: user_pass
  }, function () {
  });
});

/*apiキー購入ボタンが押されたら*/
document.addEventListener('DOMContentLoaded', function () {
  // タブに対してクリックイベントを適用
  const tabs = document.getElementsByClassName('tab');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', tabSwitch, false);
  }

  // タブをクリックすると実行する関数
  function tabSwitch() {
    // タブのclassの値を変更
    document.getElementsByClassName('is-active')[0].classList.remove('is-active');
    this.classList.add('is-active');
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
    chrome.storage.local.get(key, function (data) {
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
  chrome.storage.local.set({ [key]: value }, function () {
  });
}


document.getElementById("curriculum").addEventListener("click", function () {
  //現在の時刻を取得
  const now = new Date();
  //曜日を取得
  const week = now.getDay();
  //時間を取得
  const hour = now.getHours();
  //分を取得
  const min = now.getMinutes();

  let code = "0-0"

  //現在の時間が時間割1のどこに該当するかを調べる
  for (let i = 0; i < timestable.length; i++) {
    //時間割の開始時間と終了時間を取得
    const start = timestable[i][0].split(":");
    const end = timestable[i][1].split(":");

    //現在の時間が時間割1のどこに該当するかを調べる(5分前から5分後まで)
    if (isTimeInRange(hour, min, start, end)) {
      //時間割1のｎ曜日i限目に該当する
      code = week + "-" + (i+1);
      console.log("時間割1の" + week + "曜日" + (i + 1) + "限目");

    }
  }

  chrome.storage.local.get(null, ((data) => {
    for (let value in data) {
      console.log(value + ":" + data[value]);
      if (data[value] == code) {
        console.log("該当あり")
        window.open("https://moodle2024.mc2.osakac.ac.jp/2024/course/view.php?id=" + value, '_blank');
        return;
      }
    }
    window.open("https://moodle2024.mc2.osakac.ac.jp/2024/", '_blank');
  }))


});


function isTimeInRange(hour, min, start, end) {
  const currentTime = hour * 60 + min; // 現在時刻を分単位に変換
  const startTime = start[0] * 60 + start[1]; // 開始時間を分単位に変換
  const endTime = end[0] * 60 + end[1]; // 終了時間を分単位に変換

  // 時間をまたぐ場合 (例: 13:50 ～ 14:10)
  if (startTime > endTime) {
    return (
      currentTime >= startTime - 5 || // 開始時間から早めた範囲
      currentTime <= endTime + 5     // 終了時間を遅らせた範囲
    );
  }
  // 時間がまたがない場合 (例: 13:50 ～ 13:55)
  else {
    return (
      currentTime >= startTime - 5 && // 開始時間から早めた範囲
      currentTime <= endTime + 5     // 終了時間を遅らせた範囲
    );
  }
}


document.getElementById("myportal").addEventListener("click", function () {
  window.open("https://myportal.osakac.ac.jp/", '_blank');
});

document.getElementById("chatgpt").addEventListener("click", function () {
  window.open("https://chat.openai.com/", '_blank');
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