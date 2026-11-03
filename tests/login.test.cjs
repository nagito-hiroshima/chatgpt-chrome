// Run with: node --test tests/login.test.cjs
// Uses an installed Chromium browser and synthetic credentials. No network login.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { once } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, '..', 'login.js'), 'utf8');
const password = 'demo-password<&+ with spaces ';
// Moodle's toggle-sensitive module serializes this input using outerHTML.
// The DOM value property is deliberately absent from the serialized value attribute.
const form = `<form id="login"><input name="logintoken" type="hidden" value="dummy-token">
<input name="username" id="username" value="">
<span><input name="password" id="password" type="password" value=""></span>
<button type="submit" id="loginbtn">Log in</button></form>`;
const replacePassword = `window.oldPassword = document.getElementById('password');
    window.oldPassword.outerHTML = window.oldPassword.outerHTML;`;

async function startBrowser() {
    const executable = [process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'
    ].filter(Boolean).find(candidate => fs.existsSync(candidate));
    assert.ok(executable, 'Install Chromium or set CHROME_PATH');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'login-regression-'));
    const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu',
        '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const keepAlive = setInterval(() => {}, 1000);
    let ws;
    const closeProcess = () => {
        clearInterval(keepAlive);
        ws?.close();
        child.kill();
    };
    try {
        const endpoint = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Browser startup timeout')), 15000);
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.stderr.on('data', data => {
                const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
        });
        ws = new WebSocket(endpoint);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        });
        let serial = 0;
        const pending = new Map();
        ws.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (!message.id) return;
            const callback = pending.get(message.id);
            pending.delete(message.id);
            clearTimeout(callback.timer);
            if (message.error) callback.reject(Error(JSON.stringify(message.error)));
            else callback.resolve(message.result);
        });
        const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            const id = ++serial;
            const timer = setTimeout(() => reject(Error(`${method} timeout`)), 10000);
            pending.set(id, { resolve, reject, timer });
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        return {
            async page({ error = false, savedPassword = password, setup = '' } = {}) {
                const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
                const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
                await call('Runtime.enable', {}, sessionId);
                const evaluate = async expression => {
                    const result = await call('Runtime.evaluate', {
                        expression, awaitPromise: true, returnByValue: true
                    }, sessionId);
                    assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
                    return result.result.value;
                };
                await evaluate(`document.body.innerHTML = ${JSON.stringify(form)};
                    window.submissions = 0;
                    document.addEventListener('submit', event => {
                        event.preventDefault(); window.submissions++;
                        window.posted = Object.fromEntries(new FormData(event.target));
                    });
                    Object.assign(window.chrome, { runtime: {}, storage: { sync: {
                        get: (keys, cb) => cb({ user_id: 'demo-user', user_pass: ${JSON.stringify(savedPassword)} })
                    } } });
                    ${error ? `const error = document.createElement('div');
                        error.id = 'loginerrormessage'; error.textContent = 'Invalid login, please try again';
                        document.body.appendChild(error);` : ''}
                    ${setup}`);
                await evaluate(source);
                return {
                    evaluate,
                    command: (method, params) => call(method, params, sessionId),
                    close: () => call('Target.closeTarget', { targetId })
                };
            },
            async close() {
                try {
                    await call('Browser.close');
                    if (child.exitCode === null) await Promise.race([once(child, 'exit'), delay(2000)]);
                } finally { closeProcess(); }
                // Only remove the temporary browser profile created by this test.
                if (path.dirname(profile) === path.resolve(os.tmpdir()) &&
                    path.basename(profile).startsWith('login-regression-')) {
                    try {
                        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
                    } catch (error) {
                        // Windows may keep Chromium's files locked briefly after exit.
                        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
                    }
                }
            }
        };
    } catch (error) { closeProcess(); throw error; }
}

test('Moodle password input lifecycle', async t => {
    const browser = await startBrowser();
    t.after(() => browser.close());
    async function pageFor(t, options) {
        const page = await browser.page(options);
        t.after(() => page.close());
        return page;
    }
    const assertSubmitted = async page => {
        assert.equal(await page.evaluate('window.submissions'), 1);
        assert.equal(await page.evaluate('window.posted.password'), password);
        assert.equal(await page.evaluate('window.posted.logintoken'), 'dummy-token');
    };

    await t.test('submits the current input after Moodle recreates it', async t => {
        const page = await pageFor(t);
        await delay(150);
        await page.evaluate(replacePassword);
        await delay(850);
        await assertSubmitted(page);
        assert.equal(await page.evaluate('window.oldPassword.isConnected'), false);
        assert.equal(await page.evaluate("document.getElementById('password').getAttribute('value')"), '');
    });
    await t.test('error page keeps filling replacement inputs after the old delay', async t => {
        const page = await pageFor(t, { error: true });
        await delay(800);
        await page.evaluate(replacePassword);
        await delay(30);
        assert.equal(await page.evaluate("document.getElementById('password').value"), password);
        assert.equal(await page.evaluate('window.submissions'), 0);
        await page.evaluate("document.getElementById('loginbtn').click()");
        await assertSubmitted(page);
    });
    await t.test('manual click immediately after replacement fills the live input', async t => {
        const page = await pageFor(t, { error: true });
        await page.evaluate(`${replacePassword} document.getElementById('loginbtn').click()`);
        await assertSubmitted(page);
    });
    await t.test('Enter submission also fills the live input', async t => {
        const page = await pageFor(t, { error: true });
        await page.evaluate(`${replacePassword} document.getElementById('login').requestSubmit()`);
        await assertSubmitted(page);
    });
    await t.test('real user edits are preserved', async t => {
        const page = await pageFor(t);
        await page.evaluate("document.getElementById('password').focus()");
        await page.command('Input.insertText', { text: 'manual-edit' });
        const edited = await page.evaluate("document.getElementById('password').value");
        await delay(650);
        assert.equal(await page.evaluate('window.submissions'), 0);
        assert.equal(await page.evaluate("document.getElementById('password').value"), edited);
        assert.notEqual(edited, password);
    });
    await t.test('missing saved password does not submit', async t => {
        const page = await pageFor(t, { savedPassword: '' });
        await delay(650);
        assert.equal(await page.evaluate('window.submissions'), 0);
        assert.equal(await page.evaluate("document.getElementById('password').value"), '');
        assert.ok(await page.evaluate("document.getElementById('oecu-login-status').textContent"));
    });
});
