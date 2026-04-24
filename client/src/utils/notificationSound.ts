let audioContext: AudioContext | null = null;

export const playNotificationSound = (): void => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContext;
    const now = ctx.currentTime;
    
    // Melody notes: frequencies and start times
    const notes = [
      { freq: 523.25, time: 0 },      // C5
      { freq: 587.33, time: 0.15 },   // D5
      { freq: 659.25, time: 0.3 },    // E5
      { freq: 783.99, time: 0.45 },   // G5
      { freq: 659.25, time: 0.65 },   // E5
      { freq: 587.33, time: 0.8 },    // D5
    ];
    
    notes.forEach((note) => {
      // Main oscillator
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.time);
      
      // Add slight upward glide for musicality
      osc.frequency.exponentialRampToValueAtTime(
        note.freq * 1.01, 
        now + note.time + 0.05
      );
      osc.frequency.exponentialRampToValueAtTime(
        note.freq, 
        now + note.time + 0.1
      );
      
      // Envelope: quick attack, smooth decay
      const noteDuration = 0.2;
      gain.gain.setValueAtTime(0, now + note.time);
      gain.gain.linearRampToValueAtTime(0.2, now + note.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + note.time + noteDuration);
      
      osc.start(now + note.time);
      osc.stop(now + note.time + noteDuration);
      
      // Harmonic overtone (one octave higher, quieter)
      const oscHarmonic = ctx.createOscillator();
      const gainHarmonic = ctx.createGain();
      oscHarmonic.connect(gainHarmonic);
      gainHarmonic.connect(ctx.destination);
      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(note.freq * 2, now + note.time);
      
      gainHarmonic.gain.setValueAtTime(0, now + note.time);
      gainHarmonic.gain.linearRampToValueAtTime(0.1, now + note.time + 0.02);
      gainHarmonic.gain.exponentialRampToValueAtTime(0.01, now + note.time + noteDuration);
      
      oscHarmonic.start(now + note.time);
      oscHarmonic.stop(now + note.time + noteDuration);
    });
    
    // Final sustained tone for completion feeling
    const finalOsc = ctx.createOscillator();
    const finalGain = ctx.createGain();
    finalOsc.connect(finalGain);
    finalGain.connect(ctx.destination);
    finalOsc.type = 'sine';
    finalOsc.frequency.setValueAtTime(587.33, now + 1.0);
    finalGain.gain.setValueAtTime(0, now + 1.0);
    finalGain.gain.linearRampToValueAtTime(0.15, now + 1.05);
    finalGain.gain.exponentialRampToValueAtTime(0.01, now + 1.3);
    finalOsc.start(now + 1.0);
    finalOsc.stop(now + 1.3);
    
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
