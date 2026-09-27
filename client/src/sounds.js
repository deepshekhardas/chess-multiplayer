let audioCtx = null;

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function tone(freq, duration, type = 'sine', volume = 0.15, when = 0) {
  const ctx = getContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, ctx.currentTime + when);
  gain.gain.setValueAtTime(volume, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + when);
  oscillator.stop(ctx.currentTime + when + duration);
}

export const playMove = () => {
  tone(440, 0.1, 'sine', 0.12);
  tone(660, 0.08, 'sine', 0.08, 0.02);
};

export const playCapture = () => {
  tone(220, 0.12, 'triangle', 0.18);
  tone(180, 0.15, 'square', 0.08, 0.03);
};

export const playCheck = () => {
  tone(520, 0.15, 'triangle', 0.16);
  tone(780, 0.2, 'triangle', 0.14, 0.12);
};

export const playGameOver = () => {
  tone(330, 0.25, 'sine', 0.16);
  tone(392, 0.25, 'sine', 0.14, 0.2);
  tone(494, 0.4, 'sine', 0.16, 0.4);
};

export const playError = () => {
  tone(150, 0.2, 'square', 0.1);
};
