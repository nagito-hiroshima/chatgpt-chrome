(() => {
  'use strict';
  const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
  const labelFor = (control, root) => {
    const labelled = (control.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)).filter(node => node && root.contains(node));
    if (labelled.length) return normalize(labelled.map(node => node.textContent).join(' '));
    if (control.labels?.length) return normalize([...control.labels].map(node => node.textContent).join(' '));
    const row = control.closest('.r0, .r1, tr');
    return normalize(row?.textContent || control.getAttribute('aria-label') || '');
  };
  const usable = control => !control.disabled && !control.readOnly && !control.hidden && control.getAttribute('aria-hidden') !== 'true' && !control.closest('.qtype_multichoice_clearchoice, [hidden], [aria-hidden="true"], .oecu-etc-error');
  const hasFieldAnswer = field => field.type !== 'select' ? Boolean(field.control.value.trim()) : field.control.value !== '' && !(field.control.selectedIndex === 0 && /(選択|choose|select|未選択)/i.test(field.control.selectedOptions[0]?.textContent || ''));
  function describe(root) {
    const choices = [...root.querySelectorAll('input[type="radio"], input[type="checkbox"]')]
      .filter(control => usable(control) && control.value !== '-1')
      .map((control, index) => ({ id: `choice-${index}`, text: labelFor(control, root) || String.fromCharCode(65 + index), control, initial: control.checked }));
    const fields = [...root.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], textarea, select')]
      .filter(usable).map((control, index) => ({
        id: `field-${index}`, type: control.tagName === 'SELECT' ? 'select' : control.type === 'number' ? 'number' : 'text',
        label: labelFor(control, root), control, initial: control.value,
        options: control.tagName === 'SELECT' ? [...control.options].filter(option => !option.disabled && option.value !== '').map((option, optionIndex) => ({ id: `option-${optionIndex}`, text: normalize(option.textContent), value: option.value })) : undefined
      }));
    // Mixed radio/text question types require a richer mapping and are left
    // for manual entry rather than applying only part of an answer.
    const kind = choices.length && fields.length ? 'unsupported' : choices.length ? (choices.every(item => item.control.type === 'radio') ? 'single' : choices.every(item => item.control.type === 'checkbox') ? 'multiple' : 'unsupported') : fields.length ? 'fields' : 'unsupported';
    const metadata = { kind, choices: choices.map(({id, text}) => ({id, text})), fields: fields.map(({id, type, label, options}) => ({id, type, label, ...(options ? {options: options.map(({id, text}) => ({id, text}))} : {})})) };
    return { root, choices, fields, metadata, questionText: normalize(root.querySelector('.qtext')?.textContent) };
  }
  function apply(snapshot, answer, overwrite = false) {
    const { root, choices, fields, metadata } = snapshot;
    if (!root.isConnected || [...choices, ...fields].some(item => !item.control.isConnected || !root.contains(item.control) || !usable(item.control))) return { applied: false, message: '問題の表示が変わったため、自動反映しませんでした。' };
    const current = describe(root);
    if (current.questionText !== snapshot.questionText || JSON.stringify(current.metadata) !== JSON.stringify(metadata)) return { applied: false, message: '問題の内容が変わったため、自動反映しませんでした。' };
    if (metadata.kind === 'unsupported') return { applied: false, message: 'この問題形式は自動反映に対応していません。' };
    // Protect edits made while inference was running, even when replacement
    // of previously saved answers was explicitly enabled.
    if (choices.some(item => item.control.checked !== item.initial) || fields.some(item => item.control.value !== item.initial)) return { applied: false, message: '回答中に手動で変更されたため、自動反映しませんでした。' };
    if (!overwrite && (choices.some(item => item.control.checked) || fields.some(hasFieldAnswer))) return { applied: false, message: '入力済みの回答を保持しました。置き換える場合はAI設定を変更してください。' };
    const selection = answer?.selection;
    const inputs = answer?.inputs;
    if (metadata.kind === 'single' || metadata.kind === 'multiple') {
      if (!Array.isArray(selection) || !selection.length || new Set(selection).size !== selection.length || (metadata.kind === 'single' && selection.length !== 1) || selection.some(id => !choices.some(item => item.id === id)) || (inputs?.length)) return { applied: false, message: '選択する回答を特定できなかったため、自動反映しませんでした。' };
      const names = new Set(choices.map(item => item.control.name));
      if (metadata.kind === 'single' && names.size !== 1) return { applied: false, message: '選択肢のグループを特定できませんでした。' };
      for (const item of choices) {
        const checked = selection.includes(item.id);
        if (item.control.checked !== checked && (item.control.type === 'checkbox' || checked)) item.control.click();
      }
    } else {
      if (!Array.isArray(inputs) || inputs.length !== fields.length || new Set(inputs.map(item => item.id)).size !== fields.length || selection?.length) return { applied: false, message: '入力する回答を特定できなかったため、自動反映しませんでした。' };
      const planned = [];
      for (const field of fields) {
        const input = inputs.find(item => item.id === field.id);
        if (!input || typeof input.value !== 'string' || !input.value.trim() || input.value.length > 10000) return { applied: false, message: '入力する回答の形式を確認できませんでした。' };
        const value = field.type === 'select' ? field.options.find(option => option.id === input.value)?.value : input.value;
        if (value === undefined || (field.type === 'number' && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))) || (field.control.maxLength >= 0 && value.length > field.control.maxLength)) return { applied: false, message: '回答が入力欄の形式に合わないため、自動反映しませんでした。' };
        planned.push({ control: field.control, value });
      }
      for (const {control, value} of planned) {
        const prototype = control.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value);
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return { applied: true, message: metadata.kind === 'fields' ? 'ChatGPTの回答を入力しました。' : 'ChatGPTの回答を選択しました。' };
  }
  globalThis.OecuEtcAnswer = { describe, apply };
})();
