// Moodle gets answers, never authentication tokens or an arbitrary fetch proxy.
import { validImages } from './chat-content.mjs';
export function isMoodleSender(sender, extensionId) {
  if (!sender || sender.id !== extensionId || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.mc2\.osakac\.ac\.jp$/i.test(url.hostname) && (!url.port || url.port === '443');
  } catch { return false; }
}
const fail = message => { throw Object.assign(new Error(message), { chatSafe: true }); };
export function usableQuestion(question) {
  if (!question || !['single', 'multiple', 'fields'].includes(question.kind) || !Array.isArray(question.choices) || !Array.isArray(question.fields) || question.choices.length > 100 || question.fields.length > 30 || JSON.stringify(question).length > 32000) return false;
  if (!question.choices.every((item, index) => item.id === `choice-${index}` && typeof item.text === 'string' && item.text.length <= 5000)) return false;
  if (!question.fields.every((item, index) => item.id === `field-${index}` && ['text', 'number', 'select'].includes(item.type) && typeof item.label === 'string' && item.label.length <= 2000 && (item.type !== 'select' || (Array.isArray(item.options) && item.options.length <= 100 && item.options.every((option, i) => option.id === `option-${i}` && typeof option.text === 'string' && option.text.length <= 2000))))) return false;
  return question.kind === 'fields' ? question.fields.length > 0 && !question.choices.length : question.choices.length > 0 && !question.fields.length;
}
export function decodeAnswer(raw, question) {
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return { explanation: raw }; }
  if (!parsed || typeof parsed.explanation !== 'string' || !parsed.explanation.trim()) return { explanation: raw };
  const fallback = { explanation: parsed.explanation };
  if (!usableQuestion(question) || !Array.isArray(parsed.selection) || !Array.isArray(parsed.inputs)) return fallback;
  if (new Set(parsed.selection).size !== parsed.selection.length || parsed.selection.some(id => !question.choices.some(item => item.id === id))) return fallback;
  if (question.kind === 'single' && (parsed.selection.length !== 1 || parsed.inputs.length)) return fallback;
  if (question.kind === 'multiple' && (!parsed.selection.length || parsed.inputs.length)) return fallback;
  if (question.kind === 'fields' && (parsed.selection.length || parsed.inputs.length !== question.fields.length || new Set(parsed.inputs.map(item => item?.id)).size !== question.fields.length || parsed.inputs.some(item => !item || typeof item.value !== 'string' || item.value.length > 10000 || !question.fields.some(field => field.id === item.id && (field.type !== 'select' || field.options.some(option => option.id === item.value)))))) return fallback;
  return { explanation: parsed.explanation, autofill: { selection: parsed.selection, inputs: parsed.inputs } };
}
export function createMoodleAI({ client, sync, local }) {
  return {
    async status() {
      const api = await client;
      const state = await api.status();
      const { etcModel = '' } = await local.get('etcModel');
      const result = { connected: state.connected, email: state.account?.email || '', models: [], model: etcModel };
      if (state.connected) {
        try {
          result.models = (await api.models()).models;
          result.model = result.models.find(m => m.id === etcModel)?.id || result.models[0]?.id || '';
        } catch (e) { result.error = e.chatSafe ? e.message : 'モデルを取得できませんでした。ChatGPTの接続を確認してください。'; }
      }
      return result;
    },
    async ask(text, onEvent, signal, question, images = []) {
      if (typeof text !== 'string' || !text.trim() || text.length > 32000) fail('問題文が空か、長すぎます。');
      if (!validImages(images)) fail('問題の画像の形式・枚数・サイズを確認してください。');
      const { ncheak, etcAutoFill } = await sync.get(['ncheak', 'etcAutoFill']);
      if (ncheak !== true) fail('AI設定で機能をONにして保存してください。');
      const api = await client;
      if (!(await api.status()).connected) fail('ChatGPTにログインしてください。拡張機能のChatGPT画面からログインできます。');
      const { etcModel } = await local.get('etcModel');
      const models = (await api.models()).models;
      const model = models.find(m => m.id === etcModel)?.id || models[0]?.id;
      if (!model) fail('利用できるモデルがありません。ChatGPTの接続を確認してください。');
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const structured = etcAutoFill === true && usableQuestion(question);
      const format = structured ? '\n自動入力用に次のJSONだけを返してください。{"selection":["choice-0"],"inputs":[{"id":"field-0","value":"回答"}],"explanation":"日本語の回答と簡潔な解説"}。selectionは正解のchoice ID（単一選択は1つ、複数選択は必要な全て）、inputsは全入力欄のIDと入力値です。選択問題はinputsを空配列、入力問題はselectionを空配列にしてください。select欄のvalueはoption IDを使ってください。分からない場合は推測で欄を埋めずselectionとinputsを空配列にし、explanationに説明してください。\n回答欄：' + JSON.stringify(question) : '';
      let raw = '';
      const prompt = `次の問題に日本語で簡潔に回答してください。回答を確認してから答えてください。${images.length ? '\n添付画像には問題中の数式・図・選択肢が含まれます。画像1から順に本文の[画像1]などに対応します。画像も読み取って回答してください。' : ''}${format}\n\n${text.trim()}`;
      const content = images.length ? [{type: 'input_text', text: prompt}, ...images.map(image_url => ({type: 'input_image', image_url, detail: 'high'}))] : prompt;
      await api.chat({ model, messages: [{ role: 'user', content }] }, event => {
        if (!structured) { onEvent(event); return; }
        if (event.delta) raw += event.delta;
        if (event.done) {
          const decoded = decodeAnswer(raw, question);
          onEvent({ delta: decoded.explanation });
          if (decoded.autofill) onEvent({ autofill: decoded.autofill });
          onEvent({ done: true });
        }
      }, signal);
    }
  };
}
