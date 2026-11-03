// ポップアップのフォーカスを保ち、ガイドは背面タブに一度だけ用意する。
async function openFirstRunGuide() {
  const { usageGuideOpened } = await chrome.storage.local.get('usageGuideOpened');
  if (usageGuideOpened === true) return;
  // タブを開いて画面が破棄されても、初回案内が繰り返されないよう先に記録する。
  await chrome.storage.local.set({ usageGuideOpened: true });
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html'), active: false });
  } catch (error) {
    await chrome.storage.local.set({ usageGuideOpened: false });
    throw error;
  }
}
openFirstRunGuide().catch(error => console.error('使い方ガイドを開けませんでした', error));
