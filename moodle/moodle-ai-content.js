(() => {
  'use strict';
  const header = document.querySelector('.usertext.mr-1, .usertext.me-1');
  const originalName = header?.textContent || '';
  const requests = new Map();
  const lifecycle = new AbortController();
  const on = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...(typeof options === 'boolean' ? { capture: options } : options), signal: lifecycle.signal });
  let invalidated = false, observer, keepalive;
  const reloadMessage = '拡張機能が更新されました。Moodleのページを再読み込みしてください。';
  function contextAvailable() {
    try { return !invalidated && Boolean(chrome.runtime?.id); } catch { return false; }
  }
  function stopForReload() {
    if (invalidated) return;
    invalidated = true; enabled = false;
    clearInterval(keepalive); observer?.disconnect(); lifecycle.abort();
    try { chrome.storage.onChanged.removeListener(storageChanged); } catch { /* The old context is already unavailable. */ }
    for (const request of [...requests.values()]) request.cancel(reloadMessage);
    hideTooltip();
    document.querySelectorAll('[data-oecu-etc]').forEach(button => { button.disabled = true; button.title = reloadMessage; });
    const first = document.querySelector('.formulation');
    if (first) showError(first, reloadMessage).classList.add('oecu-etc-context-invalid');
  }
  function sendRuntime(message) {
    if (!contextAvailable()) { stopForReload(); return Promise.resolve(null); }
    // sendMessage can throw before returning a Promise after extension reload.
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(error => {
        if (!contextAvailable() || /Extension context invalidated/i.test(error?.message || '')) stopForReload();
        return null;
      });
    } catch (error) {
      if (!contextAvailable() || /Extension context invalidated/i.test(error?.message || '')) stopForReload();
      return Promise.resolve(null);
    }
  }
  let enabled = false;
  let autoFill = false, overwriteAnswers = false;
  const answers = new WeakMap();
  let tooltipBox, tooltipAnchor, tooltipHide;
  const tooltipId = 'oecu-etc-answer-tooltip';
  function hideTooltip() {
    clearTimeout(tooltipHide);
    if (tooltipBox) tooltipBox.hidden = true;
    if (tooltipAnchor) {
      const ids = (tooltipAnchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tooltipId);
      if (ids.length) tooltipAnchor.setAttribute('aria-describedby', ids.join(' '));
      else tooltipAnchor.removeAttribute('aria-describedby');
    }
    tooltipAnchor = null;
  }
  function showTooltip(anchor, text) {
    if (!text) return;
    clearTimeout(tooltipHide);
    if (!tooltipBox) {
      tooltipBox = document.createElement('div'); tooltipBox.id = tooltipId;
      tooltipBox.className = 'oecu-etc-tooltip'; tooltipBox.setAttribute('role', 'tooltip'); tooltipBox.tabIndex = 0;
      const heading = document.createElement('div'); heading.className = 'oecu-etc-tooltip-heading'; heading.textContent = 'ChatGPTの回答';
      const body = document.createElement('div'); body.className = 'oecu-etc-tooltip-body';
      tooltipBox.append(heading, body); document.body.append(tooltipBox);
      on(tooltipBox, 'mouseenter', () => clearTimeout(tooltipHide));
      on(tooltipBox, 'mouseleave', () => { tooltipHide = setTimeout(hideTooltip, 180); });
      on(tooltipBox, 'focusin', () => clearTimeout(tooltipHide));
    }
    if (tooltipAnchor && tooltipAnchor !== anchor) hideTooltip();
    tooltipAnchor = anchor;
    tooltipBox.querySelector('.oecu-etc-tooltip-body').textContent = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    tooltipBox.hidden = false;
    const ids = new Set((anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(tooltipId); anchor.setAttribute('aria-describedby', [...ids].join(' '));
    const rect = anchor.getBoundingClientRect();
    tooltipBox.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - tooltipBox.offsetWidth - 12)) + 'px';
    const below = rect.bottom + 8;
    tooltipBox.style.top = Math.max(12, below + tooltipBox.offsetHeight <= window.innerHeight - 12 ? below : Math.min(rect.top - tooltipBox.offsetHeight - 8, window.innerHeight - tooltipBox.offsetHeight - 12)) + 'px';
  }
  function hoverAnswer(event) {
    const anchor = event.target.closest?.('.questionflag a, .questionflag button, .questionflag');
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    const question = anchor.closest('.que');
    const text = answers.get(question);
    if (text) showTooltip(anchor, text);
  }
  on(document, 'mouseover', hoverAnswer);
  on(document, 'focusin', hoverAnswer);
  on(document, 'mouseout', event => {
    if (!tooltipAnchor || tooltipAnchor.contains(event.relatedTarget) || tooltipBox?.contains(event.relatedTarget)) return;
    if (tooltipAnchor.contains(event.target) || tooltipBox?.contains(event.target)) tooltipHide = setTimeout(hideTooltip, 180);
  });
  on(document, 'focusout', event => {
    if (tooltipAnchor && !tooltipAnchor.contains(event.relatedTarget) && !tooltipBox?.contains(event.relatedTarget)) tooltipHide = setTimeout(hideTooltip, 180);
  });
  on(document, 'keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  on(window, 'resize', hideTooltip);
  on(document, 'scroll', event => { if (event.target !== tooltipBox) hideTooltip(); }, true);
  function maintainSession() {
    clearInterval(keepalive);
    if (!enabled || invalidated || document.hidden) return;
    const ping = () => sendRuntime({ channel: 'etc', action: 'keepalive' });
    ping(); if (!invalidated) keepalive = setInterval(ping, 20000);
  }

  function nameStatus(answer) {
    if (!header) return;
    header.textContent = answer === null ? originalName :
      /^[0-9０-９]/.test(answer) ? originalName.slice(0, 7) + answer[0] + originalName.slice(8) :
      originalName.slice(0, 6) + '89' + originalName.slice(8);
  }
  function showError(formulation, message) {
    let notice = formulation.querySelector('.oecu-etc-error');
    if (!notice) {
      notice = document.createElement('div'); notice.className = 'oecu-etc-error'; notice.setAttribute('role', 'status');
      const text = document.createElement('span'); text.className = 'oecu-etc-error-text';
      const login = document.createElement('button'); login.type = 'button'; login.textContent = 'ChatGPTを開く';
      // This button remains usable after lifecycle listeners are stopped.
      login.addEventListener('click', () => {
        if (invalidated) window.location.reload();
        else sendRuntime({ channel: 'etc', action: 'open-chat' });
      });
      notice.append(text, login); formulation.append(notice);
    }
    notice.querySelector('.oecu-etc-error-text').textContent = message;
    notice.querySelector('button').textContent = invalidated ? 'Moodleを再読み込み' : 'ChatGPTを開く';
    return notice;
  }
  function ask(formulation, trigger) {
    if (!contextAvailable()) { stopForReload(); return; }
    if (!enabled || requests.has(trigger)) return;
    // Exclude controls, previous output and the extension's own notices.
    const images = globalThis.OecuEtcImages.list(formulation);
    const clone = formulation.cloneNode(true);
    clone.querySelectorAll('.adblock, .oecu-etc-error, .oecu-etc-fill-status, script, style, button, textarea, input').forEach(node => node.remove());
    globalThis.OecuEtcImages.list(clone).forEach((image, index) => image.replaceWith(document.createTextNode(` [画像${index + 1}${image.alt ? ': ' + image.alt : ''}] `)));
    const text = (clone.textContent || '').replace(/私の選択をクリアする|問題テキスト/g, '').trim();
    if (!text) { showError(formulation, '問題文を読み取れませんでした。'); return; }
    const question = formulation.closest('.que');
    const snapshot = autoFill ? globalThis.OecuEtcAnswer.describe(formulation) : null;
    const tooltip = question?.querySelector('.info .questionflag label') || question?.querySelector('.info .questionflag');
    formulation.querySelector('.oecu-etc-error')?.remove();
    formulation.querySelector('.oecu-etc-fill-status')?.remove();
    trigger.removeAttribute('title'); trigger.disabled = true; trigger.setAttribute('aria-busy', 'true');
    if (tooltip) tooltip.title = 'ChatGPTに問い合わせています…';
    if (question) answers.set(question, 'ChatGPTに問い合わせています…');
    if (header) header.textContent = originalName.slice(0, 7) + '0' + originalName.slice(8);
    let answer = '', completed = false, settled = false, ping, port, fillAnswer;
    const finish = failure => {
      if (settled) return; settled = true;
      clearInterval(ping); requests.delete(trigger); trigger.disabled = false; trigger.removeAttribute('aria-busy');
      if (failure) { if (tooltip) tooltip.title = failure; if (question) answers.set(question, failure); nameStatus(null); showError(formulation, failure); }
      else {
        if (tooltip) tooltip.title = answer;
        if (question) answers.set(question, answer);
        if (autoFill && snapshot) {
          const result = fillAnswer ? globalThis.OecuEtcAnswer.apply(snapshot, fillAnswer, overwriteAnswers) : { applied: false, message: '回答の形式を判別できなかったため、自動反映しませんでした。' };
          if (!result.applied) {
            const notice = document.createElement('p'); notice.className = 'oecu-etc-fill-status'; notice.setAttribute('role', 'status');
            notice.dataset.applied = 'false'; notice.textContent = result.message; formulation.append(notice);
          }
        }
        nameStatus(answer);
      }
      if (tooltipAnchor?.closest('.que') === question) showTooltip(tooltipAnchor, answers.get(question));
      try { port?.disconnect(); } catch { /* The extension may have reloaded. */ }
    };
    try {
      port = chrome.runtime.connect({ name: 'etc-stream' });
      requests.set(trigger, { port, cancel: (message = '送信を停止しました。') => finish(message) });
      port.onMessage.addListener(item => {
        if (settled || item.pong) return;
        if (item.delta) answer += item.delta;
        if (item.autofill) fillAnswer = item.autofill;
        if (item.error) finish(item.error);
        if (item.done) { completed = true; finish(answer ? null : '回答が空でした。もう一度お試しください。'); }
      });
      port.onDisconnect.addListener(() => {
        let error;
        try { error = chrome.runtime.lastError; } catch { /* Invalid context. */ }
        if (!contextAvailable() || /Extension context invalidated/i.test(error?.message || '')) stopForReload();
        else if (!completed) finish('接続が切れました。ChatGPTにログインして、もう一度お試しください。');
      });
      ping = setInterval(() => {
        if (!contextAvailable()) { stopForReload(); return; }
        try { port.postMessage({ type: 'ping' }); }
        catch (error) {
          if (!contextAvailable() || /Extension context invalidated/i.test(error?.message || '')) stopForReload();
          else finish('接続が切れました。もう一度お試しください。');
        }
      }, 15000);
      globalThis.OecuEtcImages.collect(images).then(data => {
        if (settled) return;
        if (!contextAvailable()) { stopForReload(); return; }
        port.postMessage({ type: 'start', text, images: data, ...(snapshot ? { question: snapshot.metadata } : {}) });
      }).catch(error => {
        if (!contextAvailable() || /Extension context invalidated/i.test(error?.message || '')) stopForReload();
        else finish(error.message || '問題の画像を読み取れませんでした。');
      });
    } catch (error) {
      if (!contextAvailable() || /Extension context invalidated/i.test(error?.message || '')) { finish(reloadMessage); stopForReload(); }
      else finish('拡張機能を更新し、ページを再読み込みしてください。');
    }
  }
  function updateButtons() {
    if (invalidated) return;
    document.querySelectorAll('.formulation').forEach(formulation => {
      const existing = formulation.querySelector('[data-oecu-etc]');
      if (!enabled) { existing?.remove(); return; }
      if (existing) return;
      const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'adblock';
      trigger.dataset.oecuEtc = '1'; trigger.textContent = 'ChatGPTに質問';
      trigger.setAttribute('aria-label', 'この問題をChatGPTに送信する');
      on(trigger, 'click', event => { event.preventDefault(); event.stopPropagation(); ask(formulation, trigger); });
      formulation.append(trigger);
    });
  }
  function storageChanged(changes, area) {
    if (!contextAvailable()) { stopForReload(); return; }
    if (area !== 'sync') return;
    if (changes.etcAutoFill) autoFill = changes.etcAutoFill.newValue === true;
    if (changes.etcOverwriteAnswers) overwriteAnswers = changes.etcOverwriteAnswers.newValue === true;
    if (!changes.ncheak) return;
    enabled = changes.ncheak.newValue === true;
    if (!enabled) { for (const request of [...requests.values()]) request.cancel(); hideTooltip(); }
    updateButtons();
    maintainSession();
  }
  try {
    chrome.storage.sync.get({ ncheak: false, etcAutoFill: false, etcOverwriteAnswers: false }, value => {
      if (!contextAvailable()) { stopForReload(); return; }
      if (chrome.runtime.lastError) return;
      enabled = value.ncheak === true; autoFill = value.etcAutoFill === true; overwriteAnswers = value.etcOverwriteAnswers === true;
      updateButtons(); maintainSession();
    });
    chrome.storage.onChanged.addListener(storageChanged);
  } catch { stopForReload(); }
  if (invalidated) return;
  // Moodle may insert questions after initial rendering. Adding a trigger
  // never rewrites Moodle's HTML or attaches AI requests to its own links.
  observer = new MutationObserver(updateButtons);
  observer.observe(document.body, { childList: true, subtree: true });
  on(document, 'visibilitychange', maintainSession);
  on(window, 'pagehide', () => { clearInterval(keepalive); observer.disconnect(); for (const request of [...requests.values()]) request.cancel(); });
})();
