/**
 * Canvas drawing of the audio scope views. Everything is drawn in device pixels,
 * `px` scales line widths and fonts.
 */

export interface ScopeColors {
    background: string;
    foreground: string;
    grid: string;
    accent: string;
    ok: string;
    warn: string;
    clip: string;
}

export interface Frame {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    /** device pixel ratio */
    px: number;
    colors: ScopeColors;
}

const METER_MIN_DB = -60;

/** visible part of the spectrum, frequencies in Hz and levels in dB */
export interface SpectrumView {
    minFreq: number;
    maxFreq: number;
    minDb: number;
    maxDb: number;
}

/** log frequency axis, `t` in [0, 1] */
function freqAt(t: number, view: SpectrumView): number {
    return view.minFreq * Math.pow(view.maxFreq / view.minFreq, t);
}

function posOf(freq: number, view: SpectrumView): number {
    return (
        Math.log(freq / view.minFreq) / Math.log(view.maxFreq / view.minFreq)
    );
}

/** zooms the frequency axis by `factor` around the position `t` */
export function zoomFrequencies(
    view: SpectrumView,
    t: number,
    factor: number,
    limits: { minFreq: number; maxFreq: number },
): { minFreq: number; maxFreq: number } {
    const anchor = Math.log(freqAt(t, view));
    const span = Math.log(view.maxFreq / view.minFreq);
    const newSpan = Math.max(
        Math.log(1.2),
        Math.min(Math.log(limits.maxFreq / limits.minFreq), span * factor),
    );
    let lo = anchor - t * newSpan;
    let hi = lo + newSpan;
    if (lo < Math.log(limits.minFreq)) {
        lo = Math.log(limits.minFreq);
        hi = lo + newSpan;
    }
    if (hi > Math.log(limits.maxFreq)) {
        hi = Math.log(limits.maxFreq);
        lo = hi - newSpan;
    }
    return { minFreq: Math.exp(lo), maxFreq: Math.exp(hi) };
}

/** grid lines in a 1-2-5 sequence, or every integer multiple when zoomed in */
function freqTicks(view: SpectrumView): number[] {
    const ticks = (multipliers: number[]) => {
        const result: number[] = [];
        const first = Math.floor(Math.log10(view.minFreq));
        for (
            let decade = first;
            Math.pow(10, decade) <= view.maxFreq;
            decade++
        ) {
            for (const m of multipliers) {
                const freq = m * Math.pow(10, decade);
                if (freq >= view.minFreq && freq <= view.maxFreq) {
                    result.push(freq);
                }
            }
        }
        return result;
    };
    const coarse = ticks([1, 2, 5]);
    return coarse.length >= 4 ? coarse : ticks([1, 2, 3, 4, 5, 6, 7, 8, 9]);
}

function dbTicks(view: SpectrumView): number[] {
    const step = view.maxDb - view.minDb >= 60 ? 12 : 6;
    const result: number[] = [];
    for (let level = view.maxDb - step; level > view.minDb; level -= step) {
        result.push(level);
    }
    return result;
}

/**
 * The level of the band [t0, t1] of the log frequency axis: the loudest bin
 * within the band, or the closest bin if the band is narrower than a bin.
 */
function bandLevel(
    db: Float32Array,
    t0: number,
    t1: number,
    nyquist: number,
    view: SpectrumView,
): number {
    const binHz = nyquist / db.length;
    const b0 = Math.min(db.length - 1, Math.round(freqAt(t0, view) / binHz));
    const b1 = Math.min(db.length - 1, Math.round(freqAt(t1, view) / binHz));
    let level = db[b0];
    for (let b = b0 + 1; b <= b1; b++) {
        level = Math.max(level, db[b]);
    }
    return level;
}

function label(f: Frame, text: string, x: number, y: number): void {
    f.ctx.fillStyle = f.colors.grid;
    f.ctx.font = `${10 * f.px}px sans-serif`;
    f.ctx.fillText(text, x, y);
}

function freqLabel(freq: number): string {
    return freq >= 1000
        ? `${+(freq / 1000).toFixed(2)}k`
        : `${+freq.toFixed(1)}`;
}

function clear(f: Frame): void {
    f.ctx.fillStyle = f.colors.background;
    f.ctx.fillRect(0, 0, f.width, f.height);
}

/** magnitude over a log frequency axis, like `FreqScope` */
export function drawSpectrum(
    f: Frame,
    db: Float32Array,
    nyquist: number,
    view: SpectrumView,
): void {
    const { ctx, width, height, px, colors } = f;
    clear(f);
    const yOf = (level: number) =>
        ((view.maxDb - level) / (view.maxDb - view.minDb)) * height;
    const freqs = freqTicks(view);
    const levels = dbTicks(view);

    ctx.strokeStyle = colors.grid;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = px;
    ctx.beginPath();
    for (const freq of freqs) {
        const x = Math.round(posOf(freq, view) * width) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (const level of levels) {
        const y = Math.round(yOf(level)) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const freq of freqs) {
        label(
            f,
            freqLabel(freq),
            posOf(freq, view) * width + 3 * px,
            height - 4 * px,
        );
    }
    for (const level of levels) {
        label(f, `${level} dB`, 3 * px, yOf(level) - 3 * px);
    }

    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x < width; x++) {
        const level = bandLevel(db, x / width, (x + 1) / width, nyquist, view);
        ctx.lineTo(x, Math.max(0, Math.min(height, yOf(level))));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
}

/** inferno-like colormap, readable on light and dark themes */
const COLORMAP_STOPS = [
    [0, 0, 4],
    [66, 10, 104],
    [147, 38, 103],
    [221, 81, 58],
    [252, 165, 10],
    [252, 255, 164],
];
const COLORMAP: Uint8ClampedArray = (() => {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
        const t = (i / 255) * (COLORMAP_STOPS.length - 1);
        const k = Math.min(Math.floor(t), COLORMAP_STOPS.length - 2);
        const a = COLORMAP_STOPS[k];
        const b = COLORMAP_STOPS[k + 1];
        for (let c = 0; c < 3; c++) {
            lut[i * 3 + c] = a[c] + (b[c] - a[c]) * (t - k);
        }
    }
    return lut;
})();

/** scrolling time x log frequency heatmap, keeps its history in an offscreen canvas */
export class Spectrogram {
    protected history: HTMLCanvasElement | undefined;
    protected column: ImageData | undefined;
    /** the history gets cleared once the size or the view changes */
    protected key = "";
    /** fractional columns of a speed below one column per frame */
    protected pending = 0;

    /** `speed` is the number of columns per frame */
    draw(
        f: Frame,
        db: Float32Array,
        nyquist: number,
        view: SpectrumView,
        speed: number,
    ): void {
        const { width, height } = f;
        const key = JSON.stringify([width, height, view]);
        if (!this.history || this.key !== key) {
            this.key = key;
            this.history = document.createElement("canvas");
            this.history.width = width;
            this.history.height = height;
            const ctx = this.history.getContext("2d")!;
            ctx.fillStyle = `rgb(${COLORMAP[0]}, ${COLORMAP[1]}, ${COLORMAP[2]})`;
            ctx.fillRect(0, 0, width, height);
            this.column = ctx.createImageData(1, height);
        }
        const ctx = this.history.getContext("2d")!;
        this.pending += speed;
        const columns = Math.floor(this.pending);
        this.pending -= columns;
        if (columns > 0) {
            const column = this.column!;
            for (let y = 0; y < height; y++) {
                // low frequencies at the bottom
                const t0 = (height - y - 1) / height;
                const level = bandLevel(db, t0, t0 + 1 / height, nyquist, view);
                const t = (level - view.minDb) / (view.maxDb - view.minDb);
                const i = Math.max(0, Math.min(255, Math.round(t * 255))) * 3;
                column.data[y * 4] = COLORMAP[i];
                column.data[y * 4 + 1] = COLORMAP[i + 1];
                column.data[y * 4 + 2] = COLORMAP[i + 2];
                column.data[y * 4 + 3] = 255;
            }
            ctx.drawImage(this.history, -columns, 0);
            for (let c = 1; c <= columns; c++) {
                ctx.putImageData(column, width - c, 0);
            }
        }

        f.ctx.drawImage(this.history, 0, 0);
        f.ctx.fillStyle = "#ffffffaa";
        f.ctx.font = `${10 * f.px}px sans-serif`;
        for (const freq of freqTicks(view)) {
            const y = (1 - posOf(freq, view)) * height;
            f.ctx.fillText(freqLabel(freq), 3 * f.px, y - 2 * f.px);
        }
    }
}

export interface OscilloscopeView {
    /** number of samples across the width */
    samples: number;
    gain: number;
    sampleRate: number;
}

/** waveform per channel, triggered on the rising zero crossing of the first channel */
export function drawOscilloscope(
    f: Frame,
    channels: Float32Array[],
    view: OscilloscopeView,
): void {
    const { ctx, width, height, px, colors } = f;
    clear(f);
    if (!channels.length) {
        return;
    }
    const length = channels[0].length;
    const samples = Math.min(view.samples, length);
    // the most recent trigger which still leaves enough samples to draw
    let offset = length - samples;
    for (let i = length - samples; i > 0; i--) {
        if (channels[0][i - 1] < 0 && channels[0][i] >= 0) {
            offset = i;
            break;
        }
    }
    const lane = height / channels.length;
    channels.forEach((data, c) => {
        const mid = lane * c + lane / 2;
        ctx.strokeStyle = colors.grid;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = px;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(mid) + 0.5);
        ctx.lineTo(width, Math.round(mid) + 0.5);
        if (c > 0) {
            ctx.moveTo(0, Math.round(lane * c) + 0.5);
            ctx.lineTo(width, Math.round(lane * c) + 0.5);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        label(f, `${c}`, 3 * px, lane * c + 12 * px);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, lane * c, width, lane);
        ctx.clip();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        // one point per pixel, or per sample when zoomed in
        const points = Math.min(width, samples);
        for (let p = 0; p <= points; p++) {
            const i = Math.min(
                length - 1,
                offset + Math.floor((p / points) * samples),
            );
            const x = (p / points) * width;
            const y = mid - data[i] * view.gain * (lane / 2) * 0.9;
            if (p === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.restore();
    });

    const ms = (samples / view.sampleRate) * 1000;
    const readout = `${+ms.toFixed(1)} ms${view.gain !== 1 ? `  ×${view.gain}` : ""}`;
    ctx.font = `${10 * px}px sans-serif`;
    label(f, readout, width - ctx.measureText(readout).width - 4 * px, 12 * px);
}

export interface MeterLevel {
    peak: number;
    rms: number;
    /** decaying peak hold */
    hold: number;
}

export function measure(data: Float32Array): { peak: number; rms: number } {
    let peak = 0;
    let sum = 0;
    for (const sample of data) {
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
    }
    return { peak, rms: Math.sqrt(sum / data.length) };
}

function toDb(amp: number): number {
    return amp > 0 ? 20 * Math.log10(amp) : -Infinity;
}

/**
 * Peak and rms per channel w/ a peak hold, like the server meter of the Qt IDE.
 * The bars follow the longer side of the canvas: vertical bars side by side,
 * or horizontal bars stacked on top of each other.
 */
export function drawMeters(f: Frame, levels: MeterLevel[]): void {
    const { ctx, width, height, px, colors } = f;
    clear(f);
    const vertical = height >= width;
    // the level axis runs from METER_MIN_DB to 0 dB, the bars are laid out across it
    const levelStart = vertical ? height - 18 * px : 64 * px;
    const levelEnd = vertical ? 8 * px : width - 12 * px;
    const crossStart = vertical ? 36 * px : 6 * px;
    const crossEnd = vertical ? width : height - 18 * px;
    const posOf = (db: number) =>
        levelStart +
        ((Math.max(METER_MIN_DB, Math.min(0, db)) - METER_MIN_DB) /
            -METER_MIN_DB) *
            (levelEnd - levelStart);
    /** a rectangle in level and cross coordinates */
    const fill = (l0: number, l1: number, c0: number, c1: number) =>
        vertical
            ? ctx.fillRect(c0, Math.min(l0, l1), c1 - c0, Math.abs(l1 - l0))
            : ctx.fillRect(Math.min(l0, l1), c0, Math.abs(l1 - l0), c1 - c0);
    /** a line across the level axis at `l` */
    const line = (l: number, c0: number, c1: number) => {
        ctx.beginPath();
        if (vertical) {
            ctx.moveTo(c0, l);
            ctx.lineTo(c1, l);
        } else {
            ctx.moveTo(l, c0);
            ctx.lineTo(l, c1);
        }
        ctx.stroke();
    };

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = px;
    ctx.font = `${10 * px}px sans-serif`;
    for (let db = 0; db >= METER_MIN_DB; db -= 6) {
        const pos = Math.round(posOf(db)) + 0.5;
        ctx.globalAlpha = 0.35;
        line(pos, crossStart, crossEnd);
        ctx.globalAlpha = 1;
        if (vertical) {
            label(f, `${db}`, 4 * px, pos + 3 * px);
        } else {
            const text = `${db}`;
            const textWidth = ctx.measureText(text).width;
            label(
                f,
                text,
                Math.min(width - textWidth, pos - textWidth / 2),
                height - 4 * px,
            );
        }
    }

    const zones: [number, number, string][] = [
        [METER_MIN_DB, -12, colors.ok],
        [-12, -3, colors.warn],
        [-3, 0, colors.clip],
    ];
    const gap = 6 * px;
    const bar = Math.min(
        48 * px,
        (crossEnd - crossStart - gap) / levels.length - gap,
    );
    levels.forEach((level, c) => {
        const c0 = crossStart + gap + c * (bar + gap);
        // rms as a solid bar, the peak as a translucent bar on top
        for (const [amp, alpha] of [
            [level.peak, 0.4],
            [level.rms, 1],
        ] as const) {
            ctx.globalAlpha = alpha;
            const db = toDb(amp);
            for (const [lo, hi, color] of zones) {
                const top = Math.min(hi, db);
                if (top > lo) {
                    ctx.fillStyle = color;
                    fill(posOf(lo), posOf(top), c0, c0 + bar);
                }
            }
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = level.hold >= 1 ? colors.clip : colors.foreground;
        ctx.lineWidth = 2 * px;
        line(Math.round(posOf(toDb(level.hold))) + 0.5, c0, c0 + bar);

        const db = toDb(level.hold);
        const text = `${c}: ${Number.isFinite(db) ? db.toFixed(1) : "-inf"}`;
        if (vertical) {
            label(f, text, c0, height - 4 * px);
        } else {
            label(f, text, 4 * px, c0 + bar / 2 + 3 * px);
        }
    });
}
