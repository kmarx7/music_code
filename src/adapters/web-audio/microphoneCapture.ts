/**
 * Microphone capture through an AudioWorklet (Phase 4, P4-05, decision 8). Implements AudioTranscriptionPort.
 * PCM stays in memory; nothing here writes to storage or the network. Browser objects are injected so the
 * lifecycle can be tested without a microphone.
 */
import {
  AudioCaptureError, type AudioCaptureErrorCode, type AudioCaptureOptions, type AudioCaptureSession, type AudioRecording,
  type AudioTranscriptionPort, type CaptureMetronome,
} from "@/application/ports";

export const PCM_CAPTURE_PROCESSOR_NAME = "pcm-capture";
/** Frames per message (about 11 ms at 48 kHz). Audio still buffered in the worklet at stop (< one chunk) is not kept. */
const CHUNK_FRAMES = 512;

/**
 * AudioWorkletGlobalScope code: mixes the first input to mono and posts fixed-size chunks with the context frame of
 * their first sample (`currentFrame`), so the main thread can place clicks and samples on one clock.
 */
export const PCM_CAPTURE_PROCESSOR_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(${CHUNK_FRAMES}); this.filled = 0; this.frame = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const frames = channels[0].length;
    for (let i = 0; i < frames; i += 1) {
      if (this.filled === 0) this.frame = currentFrame + i;
      let sum = 0;
      for (let c = 0; c < channels.length; c += 1) sum += channels[c][i];
      this.buffer[this.filled++] = sum / channels.length;
      if (this.filled === this.buffer.length) {
        this.port.postMessage({ samples: this.buffer, frame: this.frame }, [this.buffer.buffer]);
        this.buffer = new Float32Array(${CHUNK_FRAMES}); this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("${PCM_CAPTURE_PROCESSOR_NAME}", PcmCaptureProcessor);
`;

/** The small part of MediaStream / AudioContext / AudioWorkletNode this adapter uses. */
export interface CaptureTrack {
  stop(): void;
  addEventListener(type: "ended", listener: () => void): void;
  removeEventListener(type: "ended", listener: () => void): void;
}
export interface CaptureStream { getTracks(): CaptureTrack[] }
export interface CaptureAudioNode { connect(target: unknown): unknown; disconnect(): void }
export interface CaptureNode extends CaptureAudioNode {
  port: { onmessage: ((event: { data: { samples: Float32Array; frame: number } }) => void) | null };
}
export interface CaptureOscillator extends CaptureAudioNode {
  frequency: { value: number };
  start(when: number): void;
  stop(when: number): void;
}
export interface CaptureGain extends CaptureAudioNode {
  gain: { setValueAtTime(value: number, when: number): void; exponentialRampToValueAtTime(value: number, when: number): void };
}
export interface CaptureContext {
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  readonly currentTime: number;
  readonly outputLatency?: number;
  readonly baseLatency?: number;
  createMediaStreamSource(stream: CaptureStream): CaptureAudioNode;
  createOscillator(): CaptureOscillator;
  createGain(): CaptureGain;
  resume(): Promise<void>;
  close(): Promise<void>;
}
export interface CaptureEnvironment {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<CaptureStream>;
  createContext(): CaptureContext;
  loadWorklet(context: CaptureContext): Promise<void>;
  createWorkletNode(context: CaptureContext): CaptureNode;
}

/**
 * Voice-friendly constraints: automatic gain and noise suppression change the level and can cut sustained hums.
 * Echo cancellation keeps its browser default (it can remove metronome bleed from speakers). Implementation default.
 */
const CONSTRAINTS: MediaStreamConstraints = { audio: { channelCount: 1, noiseSuppression: false, autoGainControl: false } };

function browserEnvironment(): CaptureEnvironment {
  const scope = globalThis as typeof globalThis & { AudioContext?: typeof AudioContext; AudioWorkletNode?: typeof AudioWorkletNode };
  const mediaDevices = scope.navigator?.mediaDevices;
  const supported = typeof mediaDevices?.getUserMedia === "function" && typeof scope.AudioContext === "function" &&
    typeof scope.AudioWorkletNode === "function";
  return {
    getUserMedia: supported ? (constraints) => mediaDevices.getUserMedia(constraints) as Promise<CaptureStream> : undefined,
    createContext: () => new scope.AudioContext!() as unknown as CaptureContext,
    async loadWorklet(context) {
      const url = URL.createObjectURL(new Blob([PCM_CAPTURE_PROCESSOR_SOURCE], { type: "text/javascript" }));
      try { await (context as unknown as AudioContext).audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    },
    createWorkletNode: (context) => new scope.AudioWorkletNode!(context as unknown as AudioContext, PCM_CAPTURE_PROCESSOR_NAME,
      { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }) as unknown as CaptureNode,
  };
}

const MESSAGES: Record<AudioCaptureErrorCode, string> = {
  UNSUPPORTED: "이 브라우저에서는 녹음을 사용할 수 없습니다.",
  PERMISSION_DENIED: "마이크 사용이 허용되지 않았습니다. 브라우저 설정에서 마이크 권한을 허용해 주세요.",
  NO_DEVICE: "사용할 수 있는 마이크를 찾지 못했습니다.",
  DEVICE_BUSY: "마이크를 열 수 없습니다. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.",
  DEVICE_LOST: "녹음 중 마이크 연결이 끊어졌습니다.",
  ABORTED: "녹음을 취소했습니다.",
  FAILED: "녹음을 시작하지 못했습니다.",
};
const captureError = (code: AudioCaptureErrorCode) => new AudioCaptureError(code, MESSAGES[code]);

/** Delay between the first chunk arriving and the first click, so the click is always scheduled in the future. */
const CLICK_LEAD_SECONDS = 0.2;
const CLICK_SECONDS = 0.03;

function assertMetronome(metronome: CaptureMetronome): void {
  const { beatSeconds, beatsPerMeasure, countInBeats, recordingBeats } = metronome;
  if (!Number.isFinite(beatSeconds) || beatSeconds <= 0) throw new RangeError(`beatSeconds must be a positive number: ${beatSeconds}`);
  for (const [name, value] of [["beatsPerMeasure", beatsPerMeasure], ["countInBeats", countInBeats], ["recordingBeats", recordingBeats]] as const) {
    if (!Number.isInteger(value) || value < (name === "beatsPerMeasure" ? 1 : 0)) throw new RangeError(`${name} must be a non-negative integer: ${value}`);
  }
}

/** Schedules every click up front on the capture context; returns the nodes so release() can silence them. */
function scheduleClicks(context: CaptureContext, metronome: CaptureMetronome, startAt: number): CaptureOscillator[] {
  const beats = metronome.countInBeats + (metronome.audibleDuringRecording ? metronome.recordingBeats : 0);
  const oscillators: CaptureOscillator[] = [];
  for (let beat = 0; beat < beats; beat += 1) {
    const at = startAt + beat * metronome.beatSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = beat % metronome.beatsPerMeasure === 0 ? 1200 : 800;
    gain.gain.setValueAtTime(0.3, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + CLICK_SECONDS);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + CLICK_SECONDS);
    oscillators.push(oscillator);
  }
  return oscillators;
}

function mediaErrorCode(error: unknown): AudioCaptureErrorCode {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "PERMISSION_DENIED";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "NO_DEVICE";
  if (name === "NotReadableError" || name === "AbortError") return "DEVICE_BUSY";
  return "FAILED";
}

export function createMicrophoneCapture(environment: CaptureEnvironment = browserEnvironment()): AudioTranscriptionPort {
  return {
    async startCapture(options: AudioCaptureOptions): Promise<AudioCaptureSession> {
      const { maxSeconds, onLevel, signal, metronome } = options;
      if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new RangeError(`maxSeconds must be a positive number: ${maxSeconds}`);
      if (metronome) assertMetronome(metronome);
      if (signal?.aborted) throw captureError("ABORTED");
      if (!environment.getUserMedia) throw captureError("UNSUPPORTED");

      let stream: CaptureStream;
      try { stream = await environment.getUserMedia(CONSTRAINTS); }
      catch (error) { throw captureError(mediaErrorCode(error)); }
      const tracks = stream.getTracks();
      let context: CaptureContext | undefined;
      let source: CaptureAudioNode | undefined;
      let node: CaptureNode | undefined;
      let clicks: CaptureOscillator[] = [];
      let metronomeStartSeconds: number | undefined;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        tracks.forEach((track) => { track.removeEventListener("ended", onEnded); track.stop(); });
        if (node) { node.port.onmessage = null; node.disconnect(); }
        clicks.forEach((click) => { try { click.stop(0); } catch { /* already stopped */ } click.disconnect(); });
        source?.disconnect();
        void context?.close().catch(() => {});
      };
      function onEnded() { finish(captureError("DEVICE_LOST")); }

      const chunks: Float32Array[] = [];
      let captured = 0;
      let limitSamples = 0;
      let settle!: (result: AudioRecording | AudioCaptureError) => void;
      const finished = new Promise<AudioRecording>((resolve, reject) => {
        settle = (result) => (result instanceof AudioCaptureError ? reject(result) : resolve(result));
      });
      finished.catch(() => {}); // callers may only use stop(); never leave an unhandled rejection behind
      let done = false;
      function finish(result: "user" | "limit" | AudioCaptureError) {
        if (done) return;
        done = true;
        release();
        signal?.removeEventListener("abort", onAbort);
        if (result instanceof AudioCaptureError) { settle(result); return; }
        const samples = new Float32Array(captured);
        let offset = 0;
        for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
        chunks.length = 0;
        settle({ samples, sampleRate: context!.sampleRate, durationSeconds: captured / context!.sampleRate, stoppedBy: result,
          ...(metronomeStartSeconds === undefined ? {} : { metronomeStartSeconds }) });
      }
      function onAbort() { finish(captureError("ABORTED")); }

      try {
        tracks.forEach((track) => track.addEventListener("ended", onEnded));
        context = environment.createContext();
        if (context.state === "suspended") await context.resume();
        await environment.loadWorklet(context);
        source = context.createMediaStreamSource(stream);
        node = environment.createWorkletNode(context);
        limitSamples = Math.max(1, Math.round(maxSeconds * context.sampleRate));
        node.port.onmessage = ({ data }) => {
          if (done) return;
          if (captured === 0 && metronome && context) {
            // Place the first click on the capture clock, then express it in recording time (first sample = data.frame).
            const startAt = context.currentTime + CLICK_LEAD_SECONDS;
            clicks = scheduleClicks(context, metronome, startAt);
            const latency = (context.outputLatency ?? 0) + (context.baseLatency ?? 0);
            metronomeStartSeconds = startAt - data.frame / context.sampleRate + latency;
          }
          const chunk = data.samples.length > limitSamples - captured ? data.samples.slice(0, limitSamples - captured) : data.samples;
          let energy = 0, peak = 0;
          for (let index = 0; index < chunk.length; index += 1) {
            energy += chunk[index] * chunk[index]; peak = Math.max(peak, Math.abs(chunk[index]));
          }
          chunks.push(chunk); captured += chunk.length;
          onLevel?.({ rms: chunk.length ? Math.sqrt(energy / chunk.length) : 0, peak, seconds: captured / context!.sampleRate,
            ...(metronomeStartSeconds === undefined ? {} : { metronomeStartSeconds }) });
          if (captured >= limitSamples) finish("limit");
        };
        source.connect(node);
        // The processor writes silence; connecting to the destination keeps the node pulled in every browser.
        node.connect(context.destination);
      } catch {
        release();
        throw captureError("FAILED");
      }
      signal?.addEventListener("abort", onAbort);

      return {
        sampleRate: context.sampleRate,
        finished,
        stop() { finish("user"); return finished; },
        cancel() { finish(captureError("ABORTED")); },
      };
    },
  };
}
