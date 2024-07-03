chrome.runtime.onMessage.addListener(//拡張機能バッジ
    function (request, sender, sendResponse) {
        //拡張機能バッジ
        if(request.greeting == "none"){
            chrome.action.setBadgeText({ "text": "" });
            chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 255] });    
        }else if(request.greeting == "error"){
            chrome.action.setBadgeText({ "text": "!" });
            chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    }});


chrome.storage.sync.get({ "nkey": "", "ncheak": "" }, function (value) {//nkeyがない場合は初期化
    console.log(value)
    API_KEY = value.nkey;
    if (API_KEY == "") {
        chrome.action.setBadgeText({ "text": " " });
        chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 255] });   

    } else {
        chrome.action.setBadgeText({ "text": "" });
    }

})

// 拡張機能をインストールした時に１度だけ実行
chrome.runtime.onInstalled.addListener(() => {
    console.log("nowInstall");
    storage_set("setting2",true);
    storage_set("setting3",true);
  })
  
  
  function storage_set(key, value) {
    chrome.storage.local.set({ [key]: value }, function () {
    });
  }