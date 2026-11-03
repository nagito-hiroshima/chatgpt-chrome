(() => {
  'use strict';
  // Match the worker's limits in chat-content.mjs. Convert displayed images
  // locally so Moodle session URLs and cookies never go to OpenAI.
  const limits = { count: 8, each: 4 * 1024 * 1024, total: 12 * 1024 * 1024 };
  function list(root) {
    return [...root.querySelectorAll('img')].filter(image => !image.closest('.feedbacktrigger, .questionflag, .oecu-etc-error, [hidden]') && !image.classList.contains('icon') && Boolean(image.currentSrc || image.getAttribute('src')));
  }
  async function encodeImage(image) {
    let timeout;
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('画像の読み込みがタイムアウトしました。')), 10000); })]);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('画像を読み込めませんでした。');
      const source = image.currentSrc || image.src;
      if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source) && source.length <= limits.each) return source;
      const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像を変換できませんでした。');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/png');
      if (data.length > limits.each) data = canvas.toDataURL('image/jpeg', .9);
      if (data.length > limits.each) throw new Error('画像が大きすぎます。');
      return data;
    } catch {
      throw new Error('問題の画像を読み取れませんでした。画像の読み込みを確認して再度お試しください。外部サイトの画像は取得できない場合があります。');
    } finally { clearTimeout(timeout); }
  }
  async function collect(images) {
    if (images.length > limits.count) throw new Error('画像は1問につき8枚まで対応しています。');
    const results = [];
    let size = 0;
    for (const image of images) {
      const data = await encodeImage(image); size += data.length;
      if (size > limits.total) throw new Error('問題内の画像の合計サイズが大きすぎます。');
      results.push(data);
    }
    return results;
  }
  globalThis.OecuEtcImages = { list, collect };
})();
