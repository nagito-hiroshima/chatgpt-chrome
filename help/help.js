// 動きを抑える設定では静止画にし、任意のタイミングで再生・停止できる。
const animation = document.getElementById('registration-animation');
const playback = document.getElementById('registration-playback');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let playing = true;
function setPlaying(value) {
  playing = value;
  animation.src = value ? '../assets/img/help/registration-guide.gif' : '../assets/img/help/registration-edit.png';
  playback.textContent = value ? 'GIFを停止' : 'GIFを再生';
}
if (reducedMotion.matches) setPlaying(false);
reducedMotion.addEventListener('change', event => { if (event.matches) setPlaying(false); });
playback.addEventListener('click', () => setPlaying(!playing));
