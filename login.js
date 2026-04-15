/*自動ログイン*/
console.log("login.js Strted");
//chrome.storageに保存されているIDとPASSを取得して、ログイン
chrome.storage.sync.get(['user_id', 'user_pass'], function (value) {
    const USER_ID = value.user_id;
    const USER_PASS = value.user_pass;


    document.getElementById('username').value = USER_ID;
    document.getElementById('password').value = USER_PASS;

    if (USER_ID && USER_PASS) {
        const errorEl = document.getElementById('loginerrormessage');
        const errorMessage = errorEl ? errorEl.innerHTML : '';
        const shouldLogin = !errorEl || errorMessage === "あなたのセッションがタイムアウトしました。再度ログインしてください。" || errorMessage != "不正なログインです。再度ログインしてください。";

        if (shouldLogin) {
            // 0.5秒遅延してからログインボタンをクリック
            setTimeout(function () {
                document.getElementById('loginbtn').click();
            }, 500);
        }
    }
});

console.log("login.js Ended");