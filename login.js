/*自動ログイン*/
console.log("login.js Strted");
//chrome.storageに保存されているIDとPASSを取得して、ログイン
chrome.storage.sync.get(['user_id', 'user_pass'], function (value) {
    const USER_ID = value.user_id;
    const USER_PASS = value.user_pass;


    document.getElementById('username').value = USER_ID;
    document.getElementById('password').value = USER_PASS;

    if (USER_ID && USER_PASS) {
        //ログインボタンをクリック
        if (document.getElementById('loginerrormessage').innerHTML != "不正なログインです。再度ログインしてください。") {
            document.getElementById('loginbtn').click();
        } else if (!document.getElementById('loginerrormessage')) {
            document.getElementById('loginbtn').click();
        } else if (document.getElementById('loginerrormessage').innerHTML == "あなたのセッションがタイムアウトしました。再度ログインしてください。") {
            document.getElementById('loginbtn').click();
        }
    }
});

console.log("login.js Ended");