let audioContext: AudioContext | null = null;

export const playNotificationSound = (): void => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContext;
    const now = ctx.currentTime;
    
    // First beep (like microwave)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.setValueAtTime(0.25, now + 0.08);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc1.start(now);
    osc1.stop(now + 0.1);
    
    // Second beep (after short pause)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(880, now + 0.16);
    gain2.gain.setValueAtTime(0, now + 0.14);
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.16);
    gain2.gain.setValueAtTime(0.25, now + 0.24);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.26);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.26);
    
    // Final confirmation tone (higher pitch, like "it's done")
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.type = 'square';
    osc3.frequency.setValueAtTime(1200, now + 0.3);
    gain3.gain.setValueAtTime(0, now + 0.28);
    gain3.gain.linearRampToValueAtTime(0.3, now + 0.3);
    gain3.gain.setValueAtTime(0.3, now + 0.4);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc3.start(now + 0.3);
    osc3.stop(now + 0.5);
    
  } catch (error) {
    console.warn('Failed to play notification sound:', error);
  }
};

export const stopNotificationSound = (): void => {
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
};
