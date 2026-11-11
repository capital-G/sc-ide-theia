import { inject, injectable } from "@theia/core/shared/inversify";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { MonacoThemingService } from "@theia/monaco/lib/browser/monaco-theming-service";

/**
 * The built-in color themes of the Qt based SC IDE, ported as Theia color themes.
 *
 * The palettes are transcribed from `editors/sc-ide/core/settings/default_themes.cpp`.
 * Each `f(...)` mirrors scide's `Theme::add(key, fg, bg, bold, italic, underline)`,
 * so the tables can be diffed against the C++ source.
 */

/** A text format as in scide's `Theme::add` - an undefined color is `Qt::transparent` */
interface Fmt {
    fg?: string;
    bg?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

const f = (
    fg?: string,
    bg?: string,
    bold = false,
    italic = false,
    underline = false,
): Fmt => ({ fg, bg, bold, italic, underline });

type FormatKey =
    | "text"
    | "currentLine"
    | "searchResult"
    | "matchingBrackets"
    | "mismatchedBrackets"
    | "evaluatedCode"
    | "whitespace"
    | "keyword"
    | "built-in"
    | "env-var"
    | "class"
    | "number"
    | "symbol"
    | "string"
    | "char"
    | "comment"
    | "primitive"
    | "lineNumbers"
    | "selection"
    | "postwindowtext"
    | "postwindowerror"
    | "postwindowwarning"
    | "postwindowsuccess"
    | "postwindowemphasis";

interface ScTheme {
    id: string;
    label: string;
    dark: boolean;
    /** name of the SCDoc theme, see `HelpSource/static/themes` */
    docs: string;
    /** used for UI elements which scide takes from the native Qt palette (buttons, focus, ...) */
    accent: string;
    accentForeground: string;
    formats: Record<FormatKey, Fmt>;
}

const BLACK = "#000000";
const WHITE = "#ffffff";

function scDefault(): ScTheme {
    const background = "#f7f7f7";
    const currentLine = "#eaeaea";
    const selection = "#d6d6d6";
    const foreground = "#1a1a1a";
    const lineNumber = "#c7c4c2";
    const comment = "#848484";
    const red = "#cc3626";
    const orange = "#c07f00";
    const green = "#3f831e";
    const cyan = "#3478bc";
    const blue = "#3f39c9";
    const purple = "#af33a6";
    return {
        id: "sc-default",
        label: "SuperCollider Default",
        dark: false,
        docs: "default",
        accent: cyan,
        accentForeground: WHITE,
        formats: {
            text: f(foreground, background),
            currentLine: f(foreground, currentLine),
            searchResult: f(background, blue),
            matchingBrackets: f(foreground, currentLine, true),
            mismatchedBrackets: f(background, red),
            evaluatedCode: f(background, orange),
            whitespace: f(background),
            keyword: f(red),
            "built-in": f(purple),
            "env-var": f(orange),
            class: f(cyan),
            number: f(purple),
            symbol: f(green),
            string: f(blue),
            char: f(purple),
            comment: f(comment),
            primitive: f(orange),
            lineNumbers: f(lineNumber),
            selection: f(foreground, selection),
            postwindowtext: f(foreground),
            postwindowerror: f(red),
            postwindowwarning: f(orange),
            postwindowsuccess: f(green),
            postwindowemphasis: f(foreground, undefined, true),
        },
    };
}

function scClassic(): ScTheme {
    const orange = "#F8A200";
    const paleBlue = "#3333bf";
    const green = "#007300";
    return {
        id: "sc-classic",
        label: "SuperCollider Classic",
        dark: false,
        docs: "classic",
        accent: "#308cc6",
        accentForeground: WHITE,
        formats: {
            text: f(BLACK, WHITE),
            currentLine: f(BLACK, "#f4f4f4"),
            searchResult: f(BLACK, orange),
            matchingBrackets: f("#2bc93d", "#ffff00", true),
            mismatchedBrackets: f(WHITE, "#960000"),
            evaluatedCode: f(BLACK, orange),
            whitespace: f("#888888"),
            keyword: f("#0000e6", undefined, true),
            "built-in": f(paleBlue),
            "env-var": f("#8c4614"),
            class: f("#0000d2"),
            number: f("#980099"),
            symbol: f(green),
            string: f("#5f5f5f"),
            char: f(green),
            comment: f("#bf0000"),
            primitive: f(paleBlue),
            lineNumbers: f(BLACK, "#b8b8b8"),
            selection: f(WHITE, "#308cc6"),
            postwindowtext: f(BLACK),
            postwindowerror: f("#d11c24"),
            postwindowwarning: f("#a57706"),
            postwindowsuccess: f("#738a05"),
            postwindowemphasis: f(BLACK, undefined, true),
        },
    };
}

function scDark(): ScTheme {
    return {
        id: "sc-dark",
        label: "SuperCollider Dark",
        dark: true,
        docs: "dark",
        accent: "#3a6ea5",
        accentForeground: WHITE,
        formats: {
            text: f("#ffa4e2", BLACK),
            currentLine: f("#e4e4e4", "#393939"),
            searchResult: f("#e4e4e4", "#194c7f"),
            matchingBrackets: f("#ff5500", "#001d49", true),
            mismatchedBrackets: f("#ffaa00", "#980000"),
            evaluatedCode: f("#e4e4e4", "#636397"),
            whitespace: f("#e4e4e4"),
            keyword: f("#aaaaff", undefined, true),
            "built-in": f("#ffa4e2"),
            "env-var": f("#73e7ad"),
            class: f("#00abff", undefined, true),
            number: f("#4aff00"),
            symbol: f("#ddde00"),
            string: f("#d7d7d7"),
            char: f("#ff55ff"),
            comment: f("#d4b982"),
            primitive: f("#aaff7f"),
            lineNumbers: f("#cfcfcf"),
            selection: f("#ff5500"),
            postwindowtext: f("#e4e4e4"),
            postwindowerror: f("#ff1f2a"),
            postwindowwarning: f("#de7100"),
            postwindowsuccess: f("#b0d206"),
            postwindowemphasis: f("#e4e4e4", undefined, true),
        },
    };
}

function scDracula(): ScTheme {
    return {
        id: "sc-dracula",
        label: "SuperCollider Dracula",
        dark: true,
        docs: "dracula",
        accent: "#6071a6",
        accentForeground: "#f7fdff",
        formats: {
            text: f("#f7fdff", "#282a36"),
            currentLine: f("#909194", "#282a36"),
            searchResult: f("#e4e4e4", "#194c7f"),
            matchingBrackets: f("#ff5500", "#001d49", true),
            mismatchedBrackets: f("#ffaa00", "#980000"),
            evaluatedCode: f("#e4e4e4", "#636397"),
            whitespace: f("#e4e4e4"),
            keyword: f("#ff76c7", undefined, true),
            "built-in": f("#e2e37a"),
            "env-var": f("#ffb965"),
            class: f("#65e5ff", undefined, true),
            number: f("#be90fc"),
            symbol: f("#45fc75"),
            string: f("#5df884"),
            char: f("#ff55ff"),
            comment: f("#6071a6"),
            primitive: f("#aaff7f"),
            lineNumbers: f("#909194"),
            selection: f("#e0eeff"),
            postwindowtext: f("#dfe0fc"),
            postwindowerror: f("#ff1f2a"),
            postwindowwarning: f("#de7100"),
            postwindowsuccess: f("#b0d206"),
            postwindowemphasis: f("#e4e4e4", undefined, true),
        },
    };
}

function scMonokai(): ScTheme {
    return {
        id: "sc-monokai",
        label: "SuperCollider Monokai",
        dark: true,
        docs: "monokai",
        accent: "#A6E22E",
        accentForeground: "#272822",
        formats: {
            text: f("#F8F8F2", "#272822"),
            currentLine: f(undefined, "#3E3D32"),
            searchResult: f(BLACK, "#FFE792"),
            matchingBrackets: f("#66d9ef", "#1b1c18", true, false, true),
            mismatchedBrackets: f("#F44747", undefined, true),
            evaluatedCode: f(WHITE, BLACK),
            whitespace: f("#75715E"),
            keyword: f("#F92672", undefined, true),
            "built-in": f("#AE81FF"),
            "env-var": f("#FD971F", undefined, false, true),
            class: f("#A6E22E", undefined, true, false, true),
            number: f("#AE81FF"),
            symbol: f("#E6DB74"),
            string: f("#E6DB74"),
            char: f("#E6DB74"),
            comment: f("#75715E"),
            primitive: f("#A6E22E"),
            lineNumbers: f("#75715E"),
            selection: f(undefined, "#49483E"),
            postwindowtext: f("#F8F8F2"),
            postwindowerror: f("#F44747"),
            postwindowwarning: f("#FD971F"),
            postwindowsuccess: f("#A6E22E"),
            postwindowemphasis: f("#F8F8F2", undefined, true),
        },
    };
}

function scSolarizedLight(): ScTheme {
    return {
        id: "sc-solarized-light",
        label: "SuperCollider Solarized Light",
        dark: false,
        docs: "solarizedLight",
        accent: "#268bd2",
        accentForeground: WHITE,
        formats: {
            text: f("#657b83", "#fdf6e3"),
            currentLine: f(undefined, "#eee8d5"),
            searchResult: f("#93a1a1", "#073642"),
            matchingBrackets: f("#002b36", "#eee8d5", true),
            mismatchedBrackets: f("#eee8d5", "#586e75"),
            evaluatedCode: f("#586e75", "#eee8d5"),
            whitespace: f(),
            keyword: f("#dc322f", undefined, true),
            "built-in": f("#b58900"),
            "env-var": f("#d33682"),
            class: f("#268bd2"),
            number: f("#6c71c4"),
            symbol: f("#b58900"),
            string: f("#93a1a1"),
            char: f("#cb4b16"),
            comment: f("#586e75", undefined, false, true),
            primitive: f("#2aa198"),
            lineNumbers: f("#839496", "#eee8d5"),
            selection: f("#fdf6e3", "#657b83"),
            postwindowtext: f("#657b83"),
            postwindowerror: f("#dc322f"),
            postwindowwarning: f("#cb4b16"),
            postwindowsuccess: f("#859900"),
            postwindowemphasis: f("#b58900", undefined, true),
        },
    };
}

function scSolarizedDark(): ScTheme {
    return {
        id: "sc-solarized-dark",
        label: "SuperCollider Solarized Dark",
        dark: true,
        docs: "solarizedDark",
        accent: "#268bd2",
        accentForeground: WHITE,
        formats: {
            text: f("#839496", "#002b36"),
            currentLine: f(undefined, "#073642"),
            searchResult: f("#586e75", "#eee8d5"),
            matchingBrackets: f("#fdf6e3", "#073642", true),
            mismatchedBrackets: f("#073642", "#93a1a1"),
            evaluatedCode: f("#93a1a1", "#073642"),
            whitespace: f(),
            keyword: f("#dc322f", undefined, true),
            "built-in": f("#b58900"),
            "env-var": f("#d33682"),
            class: f("#268bd2"),
            number: f("#6c71c4"),
            symbol: f("#b58900"),
            string: f("#586e75"),
            char: f("#cb4b16"),
            comment: f("#93a1a1", undefined, false, true),
            primitive: f("#2aa198"),
            lineNumbers: f("#657b83", "#073642"),
            selection: f("#002b36", "#839496"),
            postwindowtext: f("#839496"),
            postwindowerror: f("#dc322f"),
            postwindowwarning: f("#cb4b16"),
            postwindowsuccess: f("#859900"),
            postwindowemphasis: f("#b58900", undefined, true),
        },
    };
}

export const SC_THEMES: ScTheme[] = [
    scDefault(),
    scClassic(),
    scDark(),
    scDracula(),
    scMonokai(),
    scSolarizedLight(),
    scSolarizedDark(),
];

/** the SCDoc theme matching an IDE color theme, if any */
export function scDocsThemeOf(themeId: string): string | undefined {
    return SC_THEMES.find((t) => t.id === themeId)?.docs;
}

// --- color helpers ---

function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1, 7), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** linear interpolation from `a` to `b`, `t` in [0, 1] */
function mix(a: string, b: string, t: number): string {
    const [ar, ag, ab] = rgb(a);
    const [br, bg, bb] = rgb(b);
    const c = (x: number, y: number) =>
        Math.round(x + (y - x) * t)
            .toString(16)
            .padStart(2, "0");
    return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * scide draws some highlights inverted (own foreground on a background close to the text color).
 * Monaco keeps the token colors on top of a highlight, so such a background is made translucent
 * to keep the code readable.
 */
function highlight(fmt: Fmt, text: Fmt): string | undefined {
    if (!fmt.bg) {
        return undefined;
    }
    const lowContrast =
        Math.abs(luminance(fmt.bg) - luminance(text.fg!)) < 0.35;
    return lowContrast ? `${fmt.bg.slice(0, 7)}55` : fmt.bg;
}

function fontStyle(fmt: Fmt): string | undefined {
    const styles = [
        fmt.bold && "bold",
        fmt.italic && "italic",
        fmt.underline && "underline",
    ].filter(Boolean);
    return styles.length ? styles.join(" ") : undefined;
}

/** scide format key -> TextMate scopes of `supercollider.tmLanguage.json` (and generic fallbacks for other languages) */
const TOKEN_SCOPES: Partial<Record<FormatKey, string[]>> = {
    // the grammar does not distinguish scide's keywords and built-ins
    keyword: ["keyword", "storage"],
    "built-in": ["constant.language", "variable.language"],
    "env-var": ["variable.environment"],
    class: ["entity.name.class", "entity.name.type", "support.class"],
    number: ["constant.numeric"],
    symbol: ["constant.other.symbol"],
    string: ["string", "constant.character.escape"],
    char: ["constant.character"],
    comment: ["comment"],
    primitive: ["support.function.primitive"],
};

function toThemeJson(t: ScTheme): object {
    const fm = t.formats;
    const text = fm.text;
    const bg = text.bg!;
    const fg = text.fg!;
    const uiFg = fm.postwindowtext.fg ?? fg;
    // the Qt IDE takes the window chrome from the OS palette, approximate it by
    // the gutter, which is the editor background unless the theme defines one
    const gutter = fm.lineNumbers.bg ?? bg;
    const chrome = gutter;
    const border = mix(chrome, uiFg, 0.2);
    const muted = mix(uiFg, chrome, 0.4);
    const hover = mix(chrome, uiFg, 0.08);
    const selection = highlight(fm.selection, text) ?? mix(bg, fg, 0.25);
    const search = highlight(fm.searchResult, text);
    const rainbow = [fm.class.fg, fm.number.fg, fm["env-var"].fg].map(
        (c) => c ?? fg,
    );

    const colors: Record<string, string | undefined> = {
        // editor
        "editor.background": bg,
        "editor.foreground": fg,
        "editorCursor.foreground": fg,
        "editor.lineHighlightBackground": fm.currentLine.bg,
        "editor.lineHighlightBorder": "#00000000",
        "editor.selectionBackground": selection,
        "editor.inactiveSelectionBackground": selection,
        "editor.findMatchBackground": search,
        "editor.findMatchHighlightBackground":
            search && `${search.slice(0, 7)}44`,
        "editorLineNumber.foreground": fm.lineNumbers.fg,
        "editorLineNumber.activeForeground": fm.lineNumbers.bg
            ? fm.lineNumbers.fg
            : fg,
        "editorGutter.background": gutter,
        "editorWhitespace.foreground": fm.whitespace.fg,
        "editorBracketMatch.background": highlight(fm.matchingBrackets, text),
        "editorBracketMatch.border": "#00000000",
        // rainbow brackets, cycling through distinct colors of the palette
        "editorBracketHighlight.foreground1": rainbow[0],
        "editorBracketHighlight.foreground2": rainbow[1],
        "editorBracketHighlight.foreground3": rainbow[2],
        "editorBracketHighlight.foreground4": rainbow[0],
        "editorBracketHighlight.foreground5": rainbow[1],
        "editorBracketHighlight.foreground6": rainbow[2],
        "editorBracketHighlight.unexpectedBracket.foreground":
            fm.postwindowerror.fg,
        "editorWidget.background": chrome,
        "editorWidget.border": border,
        "editorSuggestWidget.background": chrome,
        "editorSuggestWidget.border": border,
        "editorHoverWidget.background": chrome,
        "editorHoverWidget.border": border,

        // sclang specific colors, see sc-color-contribution.ts
        "sc.evaluatedCodeBackground": highlight(fm.evaluatedCode, text),
        "sc.statusRunning": fm.postwindowsuccess.fg,
        "sc.statusBooting": fm.postwindowwarning.fg,
        "sc.statusStopped": fm.postwindowerror.fg,
        "sc.statusUnresponsive": fm.postwindowwarning.fg,

        // workbench chrome
        foreground: uiFg,
        focusBorder: t.accent,
        "widget.border": border,
        "textLink.foreground": fm.class.fg,
        "textLink.activeForeground": fm.class.fg,
        "titleBar.activeBackground": chrome,
        "titleBar.activeForeground": uiFg,
        "titleBar.inactiveBackground": chrome,
        "titleBar.inactiveForeground": muted,
        "titleBar.border": border,
        "menu.background": chrome,
        "menu.foreground": uiFg,
        "menu.selectionBackground": t.accent,
        "menu.selectionForeground": t.accentForeground,
        "menubar.selectionBackground": hover,
        "activityBar.background": chrome,
        "activityBar.foreground": uiFg,
        "activityBar.inactiveForeground": muted,
        "activityBar.border": border,
        "activityBar.activeBorder": t.accent,
        "activityBarBadge.background": t.accent,
        "activityBarBadge.foreground": t.accentForeground,
        "sideBar.background": chrome,
        "sideBar.foreground": uiFg,
        "sideBar.border": border,
        "sideBarTitle.foreground": uiFg,
        "sideBarSectionHeader.background": chrome,
        "sideBarSectionHeader.foreground": uiFg,
        "sideBarSectionHeader.border": border,
        "editorGroup.border": border,
        "editorGroupHeader.tabsBackground": chrome,
        "editorGroupHeader.tabsBorder": border,
        "tab.activeBackground": bg,
        // the chrome may equal the editor background, so mark the active tab
        "tab.activeBorderTop": t.accent,
        "tab.activeForeground": uiFg,
        "tab.inactiveBackground": chrome,
        "tab.inactiveForeground": muted,
        "tab.border": border,
        "tab.hoverBackground": hover,
        "tab.unfocusedActiveForeground": uiFg,
        "panel.background": bg,
        "panel.border": border,
        "panelTitle.activeForeground": uiFg,
        "panelTitle.inactiveForeground": muted,
        "panelTitle.activeBorder": t.accent,
        "statusBar.background": chrome,
        "statusBar.foreground": uiFg,
        "statusBar.border": border,
        "statusBar.noFolderBackground": chrome,
        "statusBar.noFolderForeground": uiFg,
        "statusBarItem.hoverBackground": hover,
        "input.background": bg,
        "input.foreground": uiFg,
        "input.border": border,
        "input.placeholderForeground": muted,
        "dropdown.background": bg,
        "dropdown.foreground": uiFg,
        "dropdown.border": border,
        "button.background": t.accent,
        "button.foreground": t.accentForeground,
        "button.hoverBackground": mix(t.accent, t.dark ? WHITE : BLACK, 0.15),
        "badge.background": t.accent,
        "badge.foreground": t.accentForeground,
        "progressBar.background": t.accent,
        "list.activeSelectionBackground": t.accent,
        "list.activeSelectionForeground": t.accentForeground,
        "list.inactiveSelectionBackground": hover,
        "list.inactiveSelectionForeground": uiFg,
        "list.hoverBackground": hover,
        "list.focusOutline": t.accent,
        "quickInput.background": chrome,
        "quickInput.foreground": uiFg,
        "quickInputList.focusBackground": t.accent,
        "quickInputList.focusForeground": t.accentForeground,
        "scrollbarSlider.background": `${uiFg.slice(0, 7)}22`,
        "scrollbarSlider.hoverBackground": `${uiFg.slice(0, 7)}44`,
        "scrollbarSlider.activeBackground": `${uiFg.slice(0, 7)}66`,
        errorForeground: fm.postwindowerror.fg,
        "editorError.foreground": fm.postwindowerror.fg,
        "editorWarning.foreground": fm.postwindowwarning.fg,
    };
    for (const key of Object.keys(colors)) {
        if (colors[key] === undefined) {
            delete colors[key];
        }
    }

    const tokenColors = [
        { scope: ["keyword.operator"], settings: { foreground: fg } },
        ...Object.entries(TOKEN_SCOPES).map(([key, scope]) => {
            const fmt = fm[key as FormatKey];
            return {
                scope,
                settings: {
                    foreground: fmt.fg,
                    fontStyle: fontStyle(fmt),
                },
            };
        }),
    ];

    return { colors, tokenColors };
}

/**
 * Registers the SC IDE color themes, selectable via `Preferences: Color Theme`.
 */
@injectable()
export class ScThemeContribution implements FrontendApplicationContribution {
    @inject(MonacoThemingService)
    protected readonly theming!: MonacoThemingService;

    initialize(): void {
        for (const theme of SC_THEMES) {
            this.theming.registerParsedTheme({
                id: theme.id,
                label: theme.label,
                uiTheme: theme.dark ? "vs-dark" : "vs",
                json: toThemeJson(theme),
            });
        }
    }
}
