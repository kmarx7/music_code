/**
 * Frame-wise fundamental frequency of a monophonic voice (Phase 4, P4-02).
 * Pure TypeScript YIN (de Cheveigné & Kawahara, 2002): no browser, audio or runtime dependency.
 * Input is mono PCM held in memory; nothing here stores or transmits it.
 */

export interface PitchTrackOptions {
  /** Lowest fundamental searched, Hz. Default 70 (below a low male hum). */
  minHz?: number;
  /** Highest fundamental searched, Hz. Default 1100 (above C6). */
  maxHz?: number;
  /** Distance between frame centres, seconds. Default 0.01. */
  hopSeconds?: number;
  /** Frames quieter than this RMS (full scale = 1) are unvoiced. Default 0.01 (about −40 dBFS). */
  minRms?: number;
  /** Frames whose YIN aperiodicity exceeds this are unvoiced. Default 0.2. */
  maxAperiodicity?: number;
}

export interface PitchFrame {
  /** Centre of the analysis window, seconds from the first sample. */
  timeSeconds: number;
  voiced: boolean;
  /** Fundamental in Hz; null when unvoiced. */
  frequencyHz: number | null;
  /** Fractional MIDI number (69 = A4 = 440 Hz); null when unvoiced. */
  midi: number | null;
  /** 1 − aperiodicity, 0–1. Reported for unvoiced frames too. */
  confidence: number;
  rms: number;
}

const DEFAULTS = { minHz: 70, maxHz: 1100, hopSeconds: 0.01, minRms: 0.01, maxAperiodicity: 0.2 };
/** Analysis runs at no less than this rate; higher input rates are decimated by an integer factor. */
const MIN_ANALYSIS_RATE = 11000;
/** First YIN dip below this is taken as the period (standard absolute threshold). */
const DIP_THRESHOLD = 0.1;
/** Voiced runs shorter than this many frames are treated as spurious. */
const MIN_RUN_FRAMES = 3;
/** Half-width of the neighbourhood used to detect octave slips, frames. */
const OCTAVE_RADIUS = 4;
/** Half-width of the median smoothing window, frames. */
const SMOOTH_RADIUS = 2;

const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

function positive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number: ${value}`);
  return value;
}

/** Windowed-sinc low-pass then keep every `factor`-th sample. */
function decimate(samples: Float32Array, factor: number): Float32Array {
  if (factor === 1) return samples;
  const half = 8 * factor;
  const cutoff = 0.45 / factor; // cycles per input sample
  const taps = new Float64Array(2 * half + 1);
  let sum = 0;
  for (let k = -half; k <= half; k += 1) {
    const sinc = k === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k);
    const hann = 0.5 + 0.5 * Math.cos((Math.PI * k) / (half + 1));
    taps[k + half] = sinc * hann; sum += taps[k + half];
  }
  for (let k = 0; k < taps.length; k += 1) taps[k] /= sum;
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let m = 0; m < out.length; m += 1) {
    const centre = m * factor;
    let value = 0;
    for (let k = -half; k <= half; k += 1) {
      const index = centre + k;
      if (index >= 0 && index < samples.length) value += taps[k + half] * samples[index];
    }
    out[m] = value;
  }
  return out;
}

interface RawFrame { timeSeconds: number; rms: number; aperiodicity: number; hz: number }

/**
 * YIN difference d(τ) = Σ_{j<size} (x[j] − x[j+τ])² for τ = 0..maxLag, computed per frame as
 * E(0) + E(τ) − 2·c(τ): window energies from a prefix sum and the cross-correlation c(τ) from one complex FFT
 * (the window goes in the imaginary part, the whole frame in the real part) and one inverse FFT.
 */
class DifferenceFunction {
  private readonly n: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reversed: Uint32Array;
  private readonly energy: Float64Array;

  constructor(private readonly size: number, private readonly maxLag: number) {
    let n = 1;
    // The window never reaches past the frame, so a transform as long as the frame has no circular wrap-around.
    while (n < size + maxLag) n *= 2;
    this.n = n;
    this.re = new Float64Array(n); this.im = new Float64Array(n);
    this.cos = new Float64Array(n / 2); this.sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k += 1) { this.cos[k] = Math.cos((2 * Math.PI * k) / n); this.sin[k] = Math.sin((2 * Math.PI * k) / n); }
    this.reversed = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let k = 0; k < n; k += 1) {
      let r = 0;
      for (let b = 0; b < bits; b += 1) r |= ((k >> b) & 1) << (bits - 1 - b);
      this.reversed[k] = r;
    }
    this.energy = new Float64Array(size + maxLag + 1);
  }

  /** In-place radix-2 FFT; `inverse` uses the conjugate twiddles (unscaled). */
  private fft(inverse: boolean): void {
    const { n, re, im, reversed } = this;
    for (let k = 0; k < n; k += 1) {
      const r = reversed[k];
      if (r > k) {
        const tr = re[k]; re[k] = re[r]; re[r] = tr;
        const ti = im[k]; im[k] = im[r]; im[r] = ti;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let length = 2; length <= n; length *= 2) {
      const half = length / 2, step = n / length;
      for (let base = 0; base < n; base += length) {
        for (let k = 0; k < half; k += 1) {
          const wr = this.cos[k * step], wi = sign * this.sin[k * step];
          const p = base + k, q = p + half;
          const xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr;
          re[q] = re[p] - xr; im[q] = im[p] - xi;
          re[p] += xr; im[p] += xi;
        }
      }
    }
  }

  /** Fills `d[0..maxLag]` for the frame `x[start .. start + size + maxLag)`. */
  compute(x: Float32Array, start: number, d: Float64Array): void {
    const { n, re, im, size, maxLag, energy } = this;
    const length = size + maxLag;
    re.fill(0); im.fill(0);
    for (let j = 0; j < length; j += 1) re[j] = x[start + j];
    for (let j = 0; j < size; j += 1) im[j] = x[start + j];
    this.fft(false);
    // Split the packed spectrum: frame F = (Z_k + conj Z_{n−k}) / 2, window W = (Z_k − conj Z_{n−k}) / 2i.
    // The cross-correlation spectrum is conj(W)·F; work on k and n−k together so both stay available.
    for (let k = 0; k <= n / 2; k += 1) {
      const m = (n - k) % n;
      const zr = re[k], zi = im[k], yr = re[m], yi = im[m];
      const fr = (zr + yr) / 2, fi = (zi - yi) / 2, wr = (zi + yi) / 2, wi = (yr - zr) / 2;
      // conj(W)·F at k, and at n−k (where F and W are the conjugates of their values at k).
      const pr = wr * fr + wi * fi, pi = wr * fi - wi * fr;
      re[k] = pr; im[k] = pi;
      if (m !== k) { re[m] = pr; im[m] = -pi; }
    }
    this.fft(true);
    energy[0] = 0;
    for (let j = 0; j < length; j += 1) energy[j + 1] = energy[j] + x[start + j] * x[start + j];
    const windowEnergy = energy[size];
    for (let tau = 0; tau <= maxLag && tau + size <= length; tau += 1) {
      const correlation = re[tau] / n;
      d[tau] = Math.max(0, windowEnergy + (energy[tau + size] - energy[tau]) - 2 * correlation);
    }
  }
}

/** YIN on one frame: `x[start .. start + size + tauMax + 2)`. `d` is scratch space of length tauMax + 2. */
function yinFrame(x: Float32Array, start: number, tauMin: number, tauMax: number, rate: number,
  difference: DifferenceFunction, d: Float64Array): { aperiodicity: number; hz: number } {
  difference.compute(x, start, d);
  // Cumulative mean normalised difference, in place.
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= tauMax + 1; tau += 1) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    if (d[tau] < DIP_THRESHOLD) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau += 1;
      best = tau; break;
    }
  }
  if (best < 0) {
    best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau += 1) if (d[tau] < d[best]) best = tau;
  }
  // Parabolic interpolation around the chosen lag.
  const a = d[best - 1], b = d[best], c = d[best + 1];
  const denominator = a - 2 * b + c;
  const shift = denominator > 0 ? Math.max(-1, Math.min(1, (a - c) / (2 * denominator))) : 0;
  return { aperiodicity: Math.max(0, Math.min(1, b)), hz: rate / (best + shift) };
}

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((x, y) => x - y);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Octave-slip correction then median smoothing of one continuous voiced run (fractional MIDI per frame).
 * A value about 12 semitones away from its ±4-frame median is folded back; a sustained leap moves the median and is kept.
 */
export function smoothPitchContour(midi: readonly number[]): number[] {
  const corrected = midi.map((value, index) => {
    const around = medianOf(midi.slice(Math.max(0, index - OCTAVE_RADIUS), index + OCTAVE_RADIUS + 1));
    if (Math.abs(value - around - 12) < 1) return value - 12;
    if (Math.abs(value - around + 12) < 1) return value + 12;
    return value;
  });
  return corrected.map((_, index) =>
    medianOf(corrected.slice(Math.max(0, index - SMOOTH_RADIUS), index + SMOOTH_RADIUS + 1)));
}

export function estimatePitchTrack(samples: Float32Array, sampleRate: number, options: PitchTrackOptions = {}): PitchFrame[] {
  positive("sampleRate", sampleRate);
  const minHz = positive("minHz", options.minHz ?? DEFAULTS.minHz);
  const maxHz = positive("maxHz", options.maxHz ?? DEFAULTS.maxHz);
  const hopSeconds = positive("hopSeconds", options.hopSeconds ?? DEFAULTS.hopSeconds);
  const minRms = options.minRms ?? DEFAULTS.minRms;
  const maxAperiodicity = options.maxAperiodicity ?? DEFAULTS.maxAperiodicity;
  if (!Number.isFinite(minRms) || minRms < 0) throw new RangeError(`minRms must be a non-negative number: ${minRms}`);
  if (!Number.isFinite(maxAperiodicity) || maxAperiodicity < 0 || maxAperiodicity > 1) {
    throw new RangeError(`maxAperiodicity must be within 0–1: ${maxAperiodicity}`);
  }
  if (minHz >= maxHz) throw new RangeError(`minHz must be below maxHz: ${minHz} ≥ ${maxHz}`);
  for (let index = 0; index < samples.length; index += 1) {
    if (!Number.isFinite(samples[index])) throw new RangeError(`Sample ${index} is not a finite number`);
  }

  const factor = Math.max(1, Math.floor(sampleRate / MIN_ANALYSIS_RATE));
  const rate = sampleRate / factor;
  if (maxHz >= rate / 2) throw new RangeError(`maxHz must be below the analysis Nyquist frequency (${rate / 2} Hz)`);
  const tauMax = Math.ceil(rate / minHz);
  const tauMin = Math.max(2, Math.floor(rate / maxHz));
  // The integration window spans one period of the lowest pitch; the frame adds the largest lag (+2 for interpolation).
  const size = tauMax;
  const frameLength = size + tauMax + 2;
  const x = decimate(samples, factor);
  if (x.length < frameLength) return [];
  const hop = Math.max(1, Math.round(hopSeconds * rate));
  const d = new Float64Array(tauMax + 2);
  const difference = new DifferenceFunction(size, tauMax + 1);

  const raw: RawFrame[] = [];
  for (let start = 0; start + frameLength <= x.length; start += hop) {
    let energy = 0;
    for (let j = 0; j < frameLength; j += 1) energy += x[start + j] * x[start + j];
    const rms = Math.sqrt(energy / frameLength);
    const timeSeconds = (start + frameLength / 2) / rate;
    if (rms < minRms) { raw.push({ timeSeconds, rms, aperiodicity: 1, hz: 0 }); continue; }
    raw.push({ timeSeconds, rms, ...yinFrame(x, start, tauMin, tauMax, rate, difference, d) });
  }

  const isVoiced = raw.map((frame) => frame.hz > 0 && frame.aperiodicity <= maxAperiodicity);
  const midi: (number | null)[] = raw.map(() => null);
  for (let from = 0; from < raw.length;) {
    if (!isVoiced[from]) { from += 1; continue; }
    let to = from;
    while (to < raw.length && isVoiced[to]) to += 1;
    if (to - from >= MIN_RUN_FRAMES) {
      const smoothed = smoothPitchContour(raw.slice(from, to).map((frame) => hzToMidi(frame.hz)));
      smoothed.forEach((value, offset) => { midi[from + offset] = value; });
    }
    from = to;
  }
  return raw.map((frame, index) => {
    const value = midi[index];
    return {
      timeSeconds: frame.timeSeconds, voiced: value !== null,
      frequencyHz: value === null ? null : midiToHz(value), midi: value,
      confidence: 1 - frame.aperiodicity, rms: frame.rms,
    };
  });
}
