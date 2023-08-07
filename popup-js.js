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
  //chrome.storageからnkeyとncheak,selectkeyを取得する
  chrome.storage.sync.get({ "nkey": "", "ncheak": "","selectkey":"btn-g1-f","user_id":"","user_pass":""}, function (items) {
    //nkey-inputとnkey-checkboxにそれぞれ代入する
    document.getElementById('nkey-input').value = items.nkey;
    document.getElementById('nkey-checkbox').checked = items.ncheak;
    //carsにselectkeyに入っている値を代入
    document.getElementById("cars").value = items.selectkey;

    //user_idにuser_idに入っている値を代入
    document.getElementById("user_id").value = items.user_id;
    //user_passにuser_passに入っている値を代入
    document.getElementById("user_pass").value = items.user_pass;
    
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
document.addEventListener('DOMContentLoaded', restore_options);
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


//carsのselect値が変更されたら
document.getElementById('cars').addEventListener('change', function () {
  //選択されたoption要素を取得する
  var selected = document.getElementById('cars').options[document.getElementById('cars').selectedIndex].value;
  //選択されたoption要素のvalue属性値を取得する
  console.log(selected);

  //chrome.storage にselectkeyとして保存する
  chrome.storage.sync.set({
      selectkey: selected
  }, function () {

  });
});

//user_idが変更されたら
document.getElementById('user_id').addEventListener('change', function () {
 var user_id = document.getElementById('user_id').value;
  //chrome.storage にuser_idとして保存する
  chrome.storage.sync.set({
      user_id: user_id
  }, function () {
  });
});

//user_passが変更されたら
document.getElementById('user_pass').addEventListener('change', function () {
  var user_pass = document.getElementById('user_pass').value;
  //chrome.storage にuser_passとして保存する
  chrome.storage.sync.set({
      user_pass: user_pass
  }, function () {
  });
});


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