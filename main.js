chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        //拡張機能バッジ
        if(request.greeting == "none"){
            chrome.action.setBadgeText({ "text": "" });
            chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 255] });    
        }else if(request.greeting == "error"){
            chrome.action.setBadgeText({ "text": "!" });
            chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    }});


chrome.storage.sync.get({ "nkey": "", "ncheak": "" }, function (value) {
    console.log(value)
    API_KEY = value.nkey;
    if (API_KEY == "") {
        chrome.action.setBadgeText({ "text": " " });

    } else {
        chrome.action.setBadgeText({ "text": "" });
    }

})