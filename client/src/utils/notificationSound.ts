let audioContext: AudioContext | null = null;

export const playNotificationSound = (): void => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContext;
    
    // Create a pleasant two-tone notification sound
    const now = ctx.currentTime;
    
    // First tone
    const oscillator1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    oscillator1.connect(gain1);
    gain1.connect(ctx.destination);
    oscillator1.type = 'sine';
    oscillator1.frequency.setValueAtTime(600, now);
    oscillator1.frequency.setValueAtTime(800, now + 0.1);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    oscillator1.start(now);
    oscillator1.stop(now + 0.2);
    
    // Second tone (slightly delayed for a pleasant chime effect)
    const oscillator2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    oscillator2.connect(gain2);
    gain2.connect(ctx.destination);
    oscillator2.type = 'sine';
    oscillator2.frequency.setValueAtTime(800, now + 0.15);
    oscillator2.frequency.setValueAtTime(1000, now + 0.25);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    oscillator2.start(now + 0.15);
    oscillator2.stop(now + 0.45);
    
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
