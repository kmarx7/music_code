/** Isolated monophonic audition voice. Never owns or mutates a Score/transport. */
export interface PianoPreview {
  prepare(): Promise<void>;
  play(midi: number): Promise<boolean>;
  stop(): void;
  dispose(): void;
}

export function createPianoPreview(): PianoPreview {
  let tone: typeof import("tone") | undefined;
  let loading: Promise<void> | undefined;
  let oscillator: InstanceType<typeof import("tone").Oscillator> | undefined;
  let gain: InstanceType<typeof import("tone").Gain> | undefined;
  let generation = 0;
  let disposed = false;

  function prepare(): Promise<void> {
    if (disposed) return Promise.resolve();
    // Loading the library does not resume audio or create a sounding voice.
    loading ??= import("tone").then((module) => { tone = module; }).catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
    return loading;
  }
  function releaseNodes() {
    oscillator?.dispose(); oscillator = undefined;
    gain?.dispose(); gain = undefined;
  }
  function sound(midi: number, request: number): Promise<boolean> {
    const Tone = tone!;
    // With the preloaded library, start() is invoked directly in the user gesture.
    return Tone.start().then(() => {
      if (disposed || request !== generation) return false;
      if (Tone.getContext().state !== "running") throw new Error("AudioContext is not running");
      if (!gain) {
        gain = new Tone.Gain(0).toDestination();
        oscillator = new Tone.Oscillator({ type: "triangle" });
        oscillator.connect(gain);
        oscillator.start(Tone.immediate());
      }
      const now = Tone.immediate();
      oscillator!.frequency.setValueAtTime(Tone.Frequency(midi, "midi").toFrequency(), now);
      // Cancel the previous note's entire envelope, including its future note-off.
      // One continuous oscillator means rapid notes cannot stack voices or stale stops.
      gain.gain.cancelAndHoldAtTime(now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.005);
      gain.gain.setValueAtTime(0.15, now + 0.16);
      gain.gain.linearRampToValueAtTime(0, now + 0.20);
      return true;
    });
  }
  return {
    prepare,
    play(midi) {
      if (disposed) return Promise.resolve(false);
      if (!Number.isInteger(midi) || midi < 0 || midi > 127) return Promise.reject(new Error("Invalid MIDI pitch"));
      const request = ++generation;
      // Call sound synchronously when preloaded so Safari's gesture activation is retained.
      let result: Promise<boolean>;
      try {
        result = tone ? sound(midi, request) : prepare().then(() =>
          disposed || request !== generation ? false : sound(midi, request));
      } catch (error) { result = Promise.reject(error); }
      return result.catch((error: unknown) => {
        if (disposed || request !== generation) return false;
        releaseNodes();
        throw error;
      });
    },
    stop() {
      generation += 1;
      if (gain && tone) {
        const now = tone.immediate();
        gain.gain.cancelAndHoldAtTime(now);
        gain.gain.linearRampToValueAtTime(0, now + 0.01);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1;
      releaseNodes();
    },
  };
}
