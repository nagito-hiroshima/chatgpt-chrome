// 学習チャットの本文は端末内にのみ保存する。
class StudyChatHistory {
  constructor(storage) { this.storage = storage; this.queue = Promise.resolve(); }
  key(account) { return 'studyChatHistory:' + account; }
  async load(account) {
    await this.queue;
    const data = (await this.storage.get(this.key(account)))[this.key(account)];
    return data && Array.isArray(data.chats) ? data : { current: '', chats: [] };
  }
  save(account, data) {
    const snapshot = JSON.parse(JSON.stringify(data));
    const result = this.queue.then(() => this.storage.set({[this.key(account)]: snapshot}));
    this.queue = result.catch(() => {});
    return result;
  }
}
