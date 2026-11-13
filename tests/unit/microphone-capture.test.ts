import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMicrophoneCapture, PCM_CAPTURE_PROCESSOR_NAME, PCM_CAPTURE_PROCESSOR_SOURCE,
  type CaptureContext, type CaptureEnvironment, type CaptureNode, type CaptureStream,
} from "@/adapters/web-audio";
import { AudioCaptureError } from "@/application";

class FakeTrack {
  stopped = false;
  private ended: (() => void)[] = [];
  stop() { this.stopped = true; }
  addEventListener(type: string, listener: () => void) { if (type === "ended") this.ended.push(listener); }
  removeEventListener(type: string, listener: () => void) { this.ended = this.ended.filter((item) => item !== listener); }
  end() { this.ended.forEach((listener) => listener()); }
}
function fakes(sampleRate = 48000) {
  const track = new FakeTrack();
  const stream: CaptureStream = { getTracks: () => [track] };
  const node: CaptureNode & { disconnected: boolean; connectedTo: unknown[] } = {
    port: { onmessage: null },
    disconnected: false, connectedTo: [],
    connect(target) { this.connectedTo.push(target); },
    disconnect() { this.disconnected = true; },
  };
  const source = { connected: [] as unknown[], disconnected: false,
    connect(target: unknown) { this.connected.push(target); }, disconnect() { this.disconnected = true; } };
  const context: CaptureContext & { closed: boolean } = {
    sampleRate, state: "running", closed: false, destination: {},
    createMediaStreamSource: () => source,
    resume: async () => {},
    close: async () => { context.closed = true; },
  };
  const getUserMedia = vi.fn(async (constraints: unknown) => { void constraints; return stream; });
  const environment: CaptureEnvironment = {
    getUserMedia, createContext: vi.fn(() => context), loadWorklet: vi.fn(async () => {}), createWorkletNode: vi.fn(() => node),
  };
  const push = (values: number[] | Float32Array) => node.port.onmessage?.({ data: Float32Array.from(values) });
  return { track, stream, node, source, context, getUserMedia, environment, push };
}
const released = (f: ReturnType<typeof fakes>) => f.track.stopped && f.node.disconnected && f.source.disconnected &&
  f.node.port.onmessage === null && f.context.closed;

afterEach(() => vi.unstubAllGlobals());

describe("createMicrophoneCapture", () => {
  it("records PCM chunks until stop, then returns them in order and releases every device resource", async () => {
    const f = fakes();
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10 });
    expect(f.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ noiseSuppression: false, autoGainControl: false }) });
    expect(session.sampleRate).toBe(48000);
    f.push([0.1, 0.2]); f.push([0.3]);
    const recording = await session.stop();
    expect(Array.from(recording.samples)).toEqual([0.1, 0.2, 0.3].map(Math.fround));
    expect(recording).toMatchObject({ sampleRate: 48000, stoppedBy: "user" });
    expect(recording.durationSeconds).toBeCloseTo(3 / 48000, 12);
    expect(released(f)).toBe(true);
  });

  it("stops by itself at the length limit and keeps exactly that many samples", async () => {
    const f = fakes(1000);
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 0.5 });
    for (let index = 0; index < 3; index += 1) f.push(new Float32Array(200).fill(0.25));
    const recording = await session.finished;
    expect(recording.samples).toHaveLength(500);
    expect(recording.stoppedBy).toBe("limit");
    expect(released(f)).toBe(true);
    expect(await session.stop()).toBe(recording);
  });

  it("reports the input level of every chunk", async () => {
    const f = fakes();
    const levels: { rms: number; peak: number }[] = [];
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10, onLevel: (level) => levels.push(level) });
    f.push([0.5, -0.5, 0.5, -0.5]); f.push([0, 0]);
    await session.stop();
    expect(levels).toEqual([{ rms: 0.5, peak: 0.5 }, { rms: 0, peak: 0 }]);
  });

  it("maps getUserMedia failures to capture error codes without opening an audio context", async () => {
    const cases: [string, string][] = [["NotAllowedError", "PERMISSION_DENIED"], ["SecurityError", "PERMISSION_DENIED"],
      ["NotFoundError", "NO_DEVICE"], ["OverconstrainedError", "NO_DEVICE"], ["NotReadableError", "DEVICE_BUSY"],
      ["AbortError", "DEVICE_BUSY"], ["TypeError", "FAILED"]];
    for (const [name, code] of cases) {
      const f = fakes();
      f.getUserMedia.mockRejectedValueOnce(new DOMException("denied", name));
      const error = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10 }).catch((caught: unknown) => caught);
      expect(error, name).toBeInstanceOf(AudioCaptureError);
      expect((error as AudioCaptureError).code, name).toBe(code);
      expect(f.environment.createContext).not.toHaveBeenCalled();
    }
  });

  it("is UNSUPPORTED without getUserMedia, including the default environment outside a browser", async () => {
    const f = fakes();
    const error = await createMicrophoneCapture({ ...f.environment, getUserMedia: undefined }).startCapture({ maxSeconds: 10 })
      .catch((caught: unknown) => caught);
    expect((error as AudioCaptureError).code).toBe("UNSUPPORTED");
    const fallback = await createMicrophoneCapture().startCapture({ maxSeconds: 10 }).catch((caught: unknown) => caught);
    expect((fallback as AudioCaptureError).code).toBe("UNSUPPORTED");
  });

  it("releases the microphone when the audio graph cannot be set up after permission", async () => {
    const f = fakes();
    vi.mocked(f.environment.loadWorklet).mockRejectedValueOnce(new Error("module failed"));
    const error = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10 }).catch((caught: unknown) => caught);
    expect((error as AudioCaptureError).code).toBe("FAILED");
    expect(f.track.stopped).toBe(true);
    expect(f.context.closed).toBe(true);
  });

  it("fails with DEVICE_LOST when the microphone goes away mid-recording", async () => {
    const f = fakes();
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10 });
    f.push([0.1]);
    f.track.end();
    await expect(session.finished).rejects.toMatchObject({ code: "DEVICE_LOST" });
    await expect(session.stop()).rejects.toMatchObject({ code: "DEVICE_LOST" });
    expect(released(f)).toBe(true);
  });

  it("cancels on abort or cancel(), discarding the audio", async () => {
    const f = fakes();
    const controller = new AbortController();
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10, signal: controller.signal });
    f.push([0.1]);
    controller.abort();
    await expect(session.finished).rejects.toMatchObject({ code: "ABORTED" });
    expect(released(f)).toBe(true);
    const g = fakes();
    const other = await createMicrophoneCapture(g.environment).startCapture({ maxSeconds: 10 });
    other.cancel();
    await expect(other.stop()).rejects.toMatchObject({ code: "ABORTED" });
    expect(released(g)).toBe(true);
    const h = fakes();
    const aborted = new AbortController(); aborted.abort();
    await expect(createMicrophoneCapture(h.environment).startCapture({ maxSeconds: 10, signal: aborted.signal }))
      .rejects.toMatchObject({ code: "ABORTED" });
    expect(h.getUserMedia).not.toHaveBeenCalled();
  });

  it("ignores audio after stop and returns the same recording to every stop call", async () => {
    const f = fakes();
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10 });
    f.push([0.1]);
    const [first, second] = await Promise.all([session.stop(), session.stop()]);
    expect(second).toBe(first);
    f.push([0.9]);
    expect(Array.from(first.samples)).toEqual([Math.fround(0.1)]);
  });

  it("never touches the network or browser storage", async () => {
    const fetch = vi.fn(); const storage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal("fetch", fetch); vi.stubGlobal("localStorage", storage); vi.stubGlobal("indexedDB", { open: vi.fn() });
    const f = fakes();
    const session = await createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 10 });
    f.push([0.1, 0.2]);
    await session.stop();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect((globalThis.indexedDB as unknown as { open: ReturnType<typeof vi.fn> }).open).not.toHaveBeenCalled();
  });

  it("rejects a non-positive length limit before asking for the microphone", async () => {
    const f = fakes();
    await expect(createMicrophoneCapture(f.environment).startCapture({ maxSeconds: 0 })).rejects.toThrow(RangeError);
    expect(f.getUserMedia).not.toHaveBeenCalled();
  });
});

describe("PCM capture worklet processor", () => {
  it("mixes the input to mono and posts it in fixed-size chunks", () => {
    const posted: Float32Array[] = [];
    let Processor: (new () => { process(inputs: Float32Array[][]): boolean }) | undefined;
    class AudioWorkletProcessor { port = { postMessage: (data: Float32Array) => posted.push(data) }; }
    new Function("AudioWorkletProcessor", "registerProcessor", PCM_CAPTURE_PROCESSOR_SOURCE)(
      AudioWorkletProcessor, (name: string, processor: typeof Processor) => { expect(name).toBe(PCM_CAPTURE_PROCESSOR_NAME); Processor = processor; });
    const processor = new Processor!();
    const left = new Float32Array(128).fill(0.5), right = new Float32Array(128).fill(-0.25);
    for (let index = 0; index < 4; index += 1) expect(processor.process([[left, right]])).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toHaveLength(512);
    expect(posted[0][0]).toBeCloseTo(0.125, 6);
    expect(processor.process([[]])).toBe(true); // no input yet (device starting): nothing posted, keep running
    expect(posted).toHaveLength(1);
  });
});
