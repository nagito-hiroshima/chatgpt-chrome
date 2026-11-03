// Moodleのログインフォームが描画されてから、保存済みのMC2アカウントを入力する。
(() => {
    function showStatus(message) {
        let status = document.getElementById('oecu-login-status');
        if (!status) {
            status = document.createElement('p');
            status.id = 'oecu-login-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            const host = document.getElementById('login') || document.body;
            host.appendChild(status);
        }
        const text = '拡張機能：' + message;
        if (status.textContent !== text) status.textContent = text;
    }

    function hasLoginError() {
        const error = document.getElementById('loginerrormessage');
        const message = error ? error.textContent.replace(/\s+/g, ' ').trim() : '';
        // セッション切れは再ログインする。それ以外のエラー時には再送しない。
        return Boolean(message) && !/セッション.{0,30}(タイムアウト|有効期限)|session.{0,60}(timed?\s*out|expired)/i.test(message);
    }

    function start() {
        chrome.storage.sync.get(['user_id', 'user_pass'], function (saved) {
            if (chrome.runtime.lastError) {
                showStatus('ログイン情報を読み込めませんでした。拡張機能の各種設定で保存し直してください。');
                return;
            }
            const userId = typeof saved.user_id === 'string' ? saved.user_id.trim() : '';
            const password = typeof saved.user_pass === 'string' ? saved.user_pass : '';
            if (!userId || !password) {
                showStatus(!password
                    ? 'パスワードが未保存です。拡張機能の各種設定で保存してください。'
                    : 'ユーザーIDが未保存です。拡張機能の各種設定で保存してください。');
                return;
            }

            let autoTimer;
            let passwordNode;
            let stopped = false;
            let writing = false;
            let attempted = false;

            // core/togglesensitiveはouterHTMLからPW欄を再生成する。
            // 古いinputへの参照は保持せず、毎回現在のフォームを取得する。
            function getFields() {
                const usernameInput = document.querySelector('#login input[name="username"], input#username');
                const form = usernameInput?.form;
                const passwordInput = form?.querySelector('input[name="password"]');
                const button = form?.querySelector('#loginbtn, button[type="submit"], input[type="submit"]');
                const token = form?.querySelector('input[name="logintoken"]');
                if (!form || !passwordInput || !button || !token?.value ||
                    usernameInput.disabled || passwordInput.disabled || button.disabled) return null;
                return { form, usernameInput, passwordInput, button };
            }

            function stop() {
                stopped = true;
                clearTimeout(autoTimer);
                observer.disconnect();
                document.removeEventListener('input', onUserInput, true);
                document.removeEventListener('click', onLoginClick, true);
                document.removeEventListener('submit', onSubmit, true);
                window.removeEventListener('pagehide', stop);
            }

            function fillCurrentFields(schedule = true) {
                if (stopped || writing) return null;
                const fields = getFields();
                if (!fields) {
                    clearTimeout(autoTimer);
                    autoTimer = undefined;
                    showStatus('ログイン入力欄の準備を待っています。');
                    return null;
                }
                const { usernameInput, passwordInput } = fields;
                if ((usernameInput.value && usernameInput.value !== userId) ||
                    (passwordInput.value && passwordInput.value !== password)) {
                    stop();
                    showStatus('画面の入力内容が保存済みの情報と異なるため、自動入力を止めました。内容を確認してログインしてください。');
                    return null;
                }

                if (passwordNode !== passwordInput) {
                    passwordNode = passwordInput;
                    clearTimeout(autoTimer);
                    autoTimer = undefined;
                }
                writing = true;
                try {
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    for (const [input, value] of [[usernameInput, userId], [passwordInput, password]]) {
                        if (input.value === value) continue;
                        setter.call(input, value);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } finally {
                    writing = false;
                }
                const current = getFields();
                if (!current || current.usernameInput.value !== userId || current.passwordInput.value !== password) {
                    showStatus('PW欄への入力を確認できませんでした。手入力でログインしてください。');
                    return null;
                }
                if (hasLoginError()) {
                    clearTimeout(autoTimer);
                    autoTimer = undefined;
                    showStatus('現在のPW欄に入力済みです。前回のログインエラーがあるため、自動再送はせずログインボタンの操作を待っています。');
                } else {
                    showStatus('現在のPW欄に入力済みです。ログインします。');
                    if (schedule && !attempted && autoTimer === undefined) {
                        autoTimer = setTimeout(() => {
                            autoTimer = undefined;
                            const ready = fillCurrentFields(false);
                            if (!ready || hasLoginError()) return;
                            attempted = true;
                            ready.button.click();
                        }, 500);
                    }
                }
                return current;
            }

            function onUserInput(event) {
                if (!event.isTrusted || writing || !event.target.matches('input[name="username"], input[name="password"]')) return;
                if (!event.target.form?.querySelector('#loginbtn')) return;
                stop();
                showStatus('手入力を優先しています。内容を確認してログインしてください。');
            }
            function onLoginClick(event) {
                if (event.target.closest('#loginbtn')) fillCurrentFields(false);
            }
            function onSubmit(event) {
                if (!event.target.querySelector('#loginbtn')) return;
                fillCurrentFields(false);
                stop();
            }

            const observer = new MutationObserver(() => fillCurrentFields());
            observer.observe(document.documentElement, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['disabled', 'type', 'value']
            });
            document.addEventListener('input', onUserInput, true);
            document.addEventListener('click', onLoginClick, true);
            document.addEventListener('submit', onSubmit, true);
            window.addEventListener('pagehide', stop, { once: true });
            fillCurrentFields();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
