/*自動ログイン*/

//chrome.storageに保存されているIDとPASSを取得して、ログイン
chrome.storage.sync.get(['user_id', 'user_pass'], function (value) {
    const YOUR_EMAIL = value.user_id;
    const YOUR_PASSWORD = value.user_pass;

    document.getElementById('username').value = YOUR_EMAIL;
    document.getElementById('password').value = YOUR_PASSWORD;

    if (YOUR_EMAIL && YOUR_PASSWORD) {
        if (!document.getElementById('loginerrormessage')) {
            document.getElementById('loginbtn').click();
        } else if (document.getElementById('loginerrormessage').innerHTML != "不正なログインです。再度ログインしてください。") {
            document.getElementById('loginbtn').click();
        }
    }
});