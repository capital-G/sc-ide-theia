import { BaseWidget, Message, StatefulWidget } from "@theia/core/lib/browser";
import { ThemeService } from "@theia/core/lib/browser/theming";
import {
    inject,
    injectable,
    postConstruct,
} from "@theia/core/shared/inversify";
import { ScServiceBrowser } from "./sc-service-browser";
import { ScsynthOutput } from "./scsynth-wasm";
import {
    drawMeters,
    drawOscilloscope,
    drawSpectrum,
    Frame,
    measure,
    MeterLevel,
    ScopeColors,
    Spectrogram,
    SpectrumView,
    zoomFrequencies,
} from "./sc-audio-scope-render";
import "../../src/browser-only/style/audio-scope.css";

export const SC_AUDIO_SCOPE_FACTORY_ID = "sc-audio-scope";

/** identity of a scope, each instance is a separate tab */
export const ScAudioScopeOptions = Symbol("ScAudioScopeOptions");
export interface ScAudioScopeOptions {
    instance: number;
}

export type ScopeMode = "spectrum" | "spectrogram" | "oscilloscope" | "meters";

export const SCOPE_MODES: { mode: ScopeMode; label: string }[] = [
    { mode: "spectrum", label: "Spectrum" },
    { mode: "spectrogram", label: "Spectrogram" },
    { mode: "oscilloscope", label: "Oscilloscope" },
    { mode: "meters", label: "Meters" },
];

interface ScopeSettings {
    /** fft size of the spectrum and the spectrogram */
    fftSize: number;
    /** smoothing of the spectrum over time, 0..1 */
    smoothing: number;
    /** displayed dynamic range below 0 dB */
    range: number;
    /** columns per frame of the spectrogram */
    speed: number;
    /** zoomed frequency range, the full range if undefined */
    minFreq?: number;
    maxFreq?: number;
    /** visible time of the oscilloscope in ms */
    timeSpan: number;
    gain: number;
    /** integration time of the meters in ms */
    meterWindow: number;
}

const DEFAULT_SETTINGS: ScopeSettings = {
    fftSize: 8192,
    smoothing: 0.75,
    range: 100,
    speed: 1,
    timeSpan: 20,
    gain: 1,
    meterWindow: 50,
};

const FFT_SIZES = [1024, 2048, 4096, 8192, 16384, 32768];
const SMOOTHINGS = [0, 0.5, 0.75, 0.9];
const RANGES = [60, 80, 100, 120];
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const TIME_SPANS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const GAINS = [1, 2, 4, 8, 16, 32];
const METER_WINDOWS = [10, 50, 100, 300];
const LOWEST_FREQ = 10;
/** the maximum fft size of an AnalyserNode */
const MAX_ANALYSER_SIZE = 32768;
/** deltaY of a wheel event per step of a discrete zoom */
const WHEEL_STEP = 40;

/** peak hold of the meters, in seconds */
const HOLD_TIME = 1.5;
/** decay of the peak hold after {@link HOLD_TIME}, in dB per second */
const HOLD_DECAY = 20;

/** analyser nodes which tap the output of scsynth w/o changing it */
interface Tap {
    output: ScsynthOutput;
    /** downmix of all channels for the spectral views */
    mix: AnalyserNode;
    splitter: ChannelSplitterNode;
    channels: AnalyserNode[];
}

interface ScopeState {
    mode: ScopeMode;
    settings: ScopeSettings;
}

interface Choice<T> {
    label: string;
    values: T[];
    format(value: T): string;
    get(): T;
    set(value: T): void;
}

function nextPowerOfTwo(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(32, n))));
}

/**
 * Visualizes the audio output of the wasm scsynth via Web Audio analyser nodes,
 * similar to `FreqScope`, `Stethoscope` and the server meter of the Qt IDE.
 */
@injectable()
export class ScAudioScopeWidget extends BaseWidget implements StatefulWidget {
    @inject(ScServiceBrowser) protected readonly sc!: ScServiceBrowser;
    @inject(ThemeService) protected readonly themeService!: ThemeService;
    @inject(ScAudioScopeOptions)
    protected readonly options!: ScAudioScopeOptions;

    protected _mode: ScopeMode = "spectrum";
    protected settings: ScopeSettings = { ...DEFAULT_SETTINGS };
    protected tap: Tap | undefined;
    protected frameRequest: number | undefined;
    protected colors: ScopeColors | undefined;

    protected canvas!: HTMLCanvasElement;
    protected placeholder!: HTMLElement;
    protected controls!: HTMLElement;
    protected buttons = new Map<ScopeMode, HTMLButtonElement>();
    protected readonly spectrogram = new Spectrogram();
    protected readonly resizeObserver = new ResizeObserver(() =>
        this.resizeCanvas(),
    );

    protected mixData = new Float32Array(0);
    protected channelData: Float32Array[] = [];
    protected levels: MeterLevel[] = [];
    protected holdSince: number[] = [];
    protected lastFrame = 0;
    protected wheelDelta = 0;

    get instance(): number {
        return this.options?.instance ?? 0;
    }

    get mode(): ScopeMode {
        return this._mode;
    }

    @postConstruct()
    protected init(): void {
        this.id = `${SC_AUDIO_SCOPE_FACTORY_ID}:${this.instance}`;
        this.title.caption = "Audio output of scsynth";
        this.title.iconClass = "codicon codicon-pulse";
        this.title.closable = true;
        this.addClass("sc-audio-scope");

        const header = document.createElement("div");
        header.className = "sc-audio-scope-header";
        const modes = document.createElement("div");
        modes.className = "sc-audio-scope-modes";
        for (const { mode, label } of SCOPE_MODES) {
            const button = document.createElement("button");
            button.className = "sc-audio-scope-mode";
            button.textContent = label;
            button.addEventListener("click", () => this.setMode(mode));
            this.buttons.set(mode, button);
            modes.appendChild(button);
        }
        header.appendChild(modes);
        this.controls = document.createElement("div");
        this.controls.className = "sc-audio-scope-controls";
        header.appendChild(this.controls);
        this.node.appendChild(header);

        const body = document.createElement("div");
        body.className = "sc-audio-scope-body";
        this.canvas = document.createElement("canvas");
        this.canvas.addEventListener("wheel", (e) => this.onWheel(e), {
            passive: false,
        });
        this.canvas.addEventListener("dblclick", () => this.resetZoom());
        body.appendChild(this.canvas);
        this.placeholder = document.createElement("div");
        this.placeholder.className = "sc-audio-scope-placeholder";
        this.placeholder.textContent =
            "Boot the server to see its output, e.g. via s.boot";
        body.appendChild(this.placeholder);
        this.node.appendChild(body);
        this.resizeObserver.observe(body);

        const transport = this.sc.serverTransport;
        if (transport.output) {
            this.connect(transport.output);
        }
        this.toDispose.push(
            transport.onBooted((output) => this.connect(output)),
        );
        this.toDispose.push(
            this.themeService.onDidColorThemeChange(() =>
                // the css variables get updated by another listener
                requestAnimationFrame(() => this.readColors()),
            ),
        );
        this.toDispose.push({
            dispose: () => {
                this.stop();
                this.resizeObserver.disconnect();
                this.disconnect();
            },
        });
        this.setMode(this._mode);
    }

    setMode(mode: ScopeMode): void {
        this._mode = mode;
        for (const [m, button] of this.buttons) {
            button.classList.toggle("active", m === mode);
        }
        this.title.label =
            SCOPE_MODES.find((m) => m.mode === mode)?.label ?? "Scope";
        this.buildControls();
        this.configureAnalysers();
    }

    storeState(): ScopeState {
        return { mode: this._mode, settings: this.settings };
    }

    restoreState(state: object): void {
        const { mode, settings } = state as Partial<ScopeState>;
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        if (mode && SCOPE_MODES.some((m) => m.mode === mode)) {
            this.setMode(mode);
        } else {
            this.setMode(this._mode);
        }
    }

    protected get sampleRate(): number {
        return this.tap?.output.context.sampleRate ?? 48000;
    }

    protected get nyquist(): number {
        return this.sampleRate / 2;
    }

    protected get spectrumView(): SpectrumView {
        return {
            minFreq: this.settings.minFreq ?? 20,
            maxFreq: Math.min(
                this.settings.maxFreq ?? this.nyquist,
                this.nyquist,
            ),
            minDb: -this.settings.range,
            maxDb: 0,
        };
    }

    /** the settings of the current mode as selects in the header */
    protected buildControls(): void {
        const s = this.settings;
        const ms = (samples: number) =>
            `${+((samples / this.sampleRate) * 1000).toFixed(1)} ms`;
        const fft: Choice<number> = {
            label: "FFT",
            values: FFT_SIZES,
            format: (v) => `${v} (${ms(v)})`,
            get: () => s.fftSize,
            set: (v) => (s.fftSize = v),
        };
        const range: Choice<number> = {
            label: "Range",
            values: RANGES,
            format: (v) => `${v} dB`,
            get: () => s.range,
            set: (v) => (s.range = v),
        };
        const choices: Record<ScopeMode, Choice<number>[]> = {
            spectrum: [
                fft,
                {
                    label: "Smoothing",
                    values: SMOOTHINGS,
                    format: (v) => `${v}`,
                    get: () => s.smoothing,
                    set: (v) => (s.smoothing = v),
                },
                range,
            ],
            spectrogram: [
                fft,
                {
                    label: "Speed",
                    values: SPEEDS,
                    format: (v) => `${v}×`,
                    get: () => s.speed,
                    set: (v) => (s.speed = v),
                },
                range,
            ],
            oscilloscope: [
                {
                    label: "Time",
                    values: TIME_SPANS,
                    format: (v) => `${v} ms`,
                    get: () => s.timeSpan,
                    set: (v) => (s.timeSpan = v),
                },
                {
                    label: "Gain",
                    values: GAINS,
                    format: (v) => `×${v}`,
                    get: () => s.gain,
                    set: (v) => (s.gain = v),
                },
            ],
            meters: [
                {
                    label: "Window",
                    values: METER_WINDOWS,
                    format: (v) => `${v} ms`,
                    get: () => s.meterWindow,
                    set: (v) => (s.meterWindow = v),
                },
            ],
        };

        this.controls.replaceChildren();
        for (const choice of choices[this._mode]) {
            const label = document.createElement("label");
            label.textContent = choice.label;
            const select = document.createElement("select");
            select.className = "theia-select";
            choice.values.forEach((value, i) => {
                const option = document.createElement("option");
                option.value = `${i}`;
                option.textContent = choice.format(value);
                option.selected = value === choice.get();
                select.appendChild(option);
            });
            select.addEventListener("change", () => {
                choice.set(choice.values[Number(select.value)]);
                this.configureAnalysers();
            });
            label.appendChild(select);
            this.controls.appendChild(label);
        }
        this.canvas.title =
            this._mode === "oscilloscope"
                ? "Wheel: time, Shift+Wheel: gain, double-click: reset"
                : this._mode === "meters"
                  ? ""
                  : "Wheel: zoom frequencies, double-click: reset";
    }

    protected onWheel(e: WheelEvent): void {
        if (this._mode === "meters") {
            return;
        }
        e.preventDefault();
        // shift turns a vertical wheel into a horizontal one on some systems
        const delta = e.deltaY || e.deltaX;
        const rect = this.canvas.getBoundingClientRect();
        if (this._mode === "oscilloscope") {
            this.wheelDelta += delta;
            const steps = Math.trunc(this.wheelDelta / WHEEL_STEP);
            if (steps === 0) {
                return;
            }
            this.wheelDelta -= steps * WHEEL_STEP;
            const step = (values: number[], value: number, by: number) =>
                values[
                    Math.max(
                        0,
                        Math.min(values.length - 1, values.indexOf(value) + by),
                    )
                ];
            if (e.shiftKey) {
                // wheel up amplifies
                this.settings.gain = step(GAINS, this.settings.gain, -steps);
            } else {
                // wheel down shows more time, like zooming out
                this.settings.timeSpan = step(
                    TIME_SPANS,
                    this.settings.timeSpan,
                    steps,
                );
            }
        } else {
            const t =
                this._mode === "spectrum"
                    ? (e.clientX - rect.left) / rect.width
                    : 1 - (e.clientY - rect.top) / rect.height;
            const { minFreq, maxFreq } = zoomFrequencies(
                this.spectrumView,
                t,
                Math.exp(delta * 0.002),
                { minFreq: LOWEST_FREQ, maxFreq: this.nyquist },
            );
            this.settings.minFreq = minFreq;
            this.settings.maxFreq = maxFreq;
        }
        this.buildControls();
        this.configureAnalysers();
    }

    protected resetZoom(): void {
        if (this._mode === "oscilloscope") {
            this.settings.timeSpan = DEFAULT_SETTINGS.timeSpan;
            this.settings.gain = DEFAULT_SETTINGS.gain;
        } else {
            this.settings.minFreq = undefined;
            this.settings.maxFreq = undefined;
        }
        this.buildControls();
        this.configureAnalysers();
    }

    protected connect(output: ScsynthOutput): void {
        if (this.tap?.output === output) {
            return;
        }
        this.disconnect();
        const { context, node, channels } = output;
        const mix = context.createAnalyser();
        const splitter = context.createChannelSplitter(channels);
        const analysers = Array.from({ length: channels }, (_, c) => {
            const analyser = context.createAnalyser();
            splitter.connect(analyser, c);
            return analyser;
        });
        node.connect(mix);
        node.connect(splitter);

        this.tap = { output, mix, splitter, channels: analysers };
        this.levels = analysers.map(() => ({ peak: 0, rms: 0, hold: 0 }));
        this.holdSince = analysers.map(() => 0);
        this.placeholder.hidden = true;
        // the labels depend on the sample rate
        this.buildControls();
        this.configureAnalysers();
        this.start();
    }

    /** sizes the analysers for the current mode and its settings */
    protected configureAnalysers(): void {
        const tap = this.tap;
        if (!tap) {
            return;
        }
        const s = this.settings;
        tap.mix.fftSize = s.fftSize;
        // a smoothed spectrum is easier to read, the spectrogram shows changes over time
        tap.mix.smoothingTimeConstant =
            this._mode === "spectrum" ? s.smoothing : 0;
        if (this.mixData.length !== tap.mix.frequencyBinCount) {
            this.mixData = new Float32Array(tap.mix.frequencyBinCount);
        }

        // the oscilloscope needs some room to search for a trigger
        const samples =
            this._mode === "oscilloscope"
                ? 2 * this.oscilloscopeSamples
                : this.meterSamples;
        const size = Math.min(MAX_ANALYSER_SIZE, nextPowerOfTwo(samples));
        for (const analyser of tap.channels) {
            analyser.fftSize = size;
            analyser.smoothingTimeConstant = 0;
        }
        if (this.channelData[0]?.length !== size) {
            this.channelData = tap.channels.map(() => new Float32Array(size));
        }
    }

    protected get oscilloscopeSamples(): number {
        return Math.round((this.settings.timeSpan / 1000) * this.sampleRate);
    }

    protected get meterSamples(): number {
        return Math.round((this.settings.meterWindow / 1000) * this.sampleRate);
    }

    protected disconnect(): void {
        if (!this.tap) {
            return;
        }
        const { output, mix, splitter } = this.tap;
        output.node.disconnect(mix);
        output.node.disconnect(splitter);
        splitter.disconnect();
        this.tap = undefined;
        this.placeholder.hidden = false;
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.readColors();
        this.resizeCanvas();
        this.start();
    }

    protected override onBeforeHide(msg: Message): void {
        super.onBeforeHide(msg);
        this.stop();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.readColors();
        this.start();
    }

    protected override onBeforeDetach(msg: Message): void {
        this.stop();
        super.onBeforeDetach(msg);
    }

    protected start(): void {
        if (
            this.frameRequest === undefined &&
            this.tap &&
            this.isAttached &&
            this.isVisible
        ) {
            this.frameRequest = requestAnimationFrame((t) => this.render(t));
        }
    }

    protected stop(): void {
        if (this.frameRequest !== undefined) {
            cancelAnimationFrame(this.frameRequest);
            this.frameRequest = undefined;
        }
    }

    protected resizeCanvas(): void {
        const body = this.canvas.parentElement!;
        const px = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.round(body.clientWidth * px));
        this.canvas.height = Math.max(1, Math.round(body.clientHeight * px));
    }

    protected readColors(): void {
        const style = getComputedStyle(this.node);
        const css = (name: string, fallback: string) =>
            style.getPropertyValue(`--theia-${name}`).trim() || fallback;
        this.colors = {
            background: css("editor-background", "#ffffff"),
            foreground: css("editor-foreground", "#000000"),
            grid: css("editorLineNumber-foreground", "#888888"),
            accent: css("focusBorder", "#3478bc"),
            ok: css("sc-statusRunning", "#3f831e"),
            warn: css("sc-statusBooting", "#c07f00"),
            clip: css("sc-statusStopped", "#cc3626"),
        };
    }

    protected render(time: number): void {
        this.frameRequest = undefined;
        const tap = this.tap;
        const ctx = this.canvas.getContext("2d");
        if (!tap || !ctx) {
            return;
        }
        if (!this.colors) {
            this.readColors();
        }
        const frame: Frame = {
            ctx,
            width: this.canvas.width,
            height: this.canvas.height,
            px: window.devicePixelRatio || 1,
            colors: this.colors!,
        };
        const dt = this.lastFrame ? (time - this.lastFrame) / 1000 : 0;
        this.lastFrame = time;

        switch (this._mode) {
            case "spectrum":
                tap.mix.getFloatFrequencyData(this.mixData);
                drawSpectrum(
                    frame,
                    this.mixData,
                    this.nyquist,
                    this.spectrumView,
                );
                break;
            case "spectrogram":
                tap.mix.getFloatFrequencyData(this.mixData);
                this.spectrogram.draw(
                    frame,
                    this.mixData,
                    this.nyquist,
                    this.spectrumView,
                    this.settings.speed,
                );
                break;
            case "oscilloscope":
                this.readChannels(tap);
                drawOscilloscope(frame, this.channelData, {
                    samples: this.oscilloscopeSamples,
                    gain: this.settings.gain,
                    sampleRate: this.sampleRate,
                });
                break;
            case "meters":
                this.readChannels(tap);
                this.updateLevels(time / 1000, dt);
                drawMeters(frame, this.levels);
                break;
        }
        this.start();
    }

    protected readChannels(tap: Tap): void {
        tap.channels.forEach((analyser, c) =>
            analyser.getFloatTimeDomainData(this.channelData[c]),
        );
    }

    protected updateLevels(now: number, dt: number): void {
        const window = Math.min(this.meterSamples, this.channelData[0].length);
        this.channelData.forEach((data, c) => {
            const { peak, rms } = measure(data.subarray(data.length - window));
            const level = this.levels[c];
            level.peak = peak;
            level.rms = rms;
            if (peak >= level.hold) {
                level.hold = peak;
                this.holdSince[c] = now;
            } else if (now - this.holdSince[c] > HOLD_TIME) {
                level.hold = Math.max(
                    peak,
                    level.hold * Math.pow(10, (-HOLD_DECAY * dt) / 20),
                );
            }
        });
    }
}
