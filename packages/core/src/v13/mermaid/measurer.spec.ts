// @vitest-environment node
import { Style, type FontKey, type Measurer } from '../text/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in browser: an OffscreenCanvas whose measureText gives 10 px per character per
// 16 px when the web font "Brand" is loaded and 8 px with its fallback, and a document.fonts
// whose check() and size follow the font's loading state.
class FakeBrowser {
  loaded = false;
  size = 1;
  measured = 0;

  install(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the stubbed globals' callbacks need the fake browser
    const browser = this;
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return {
            font: '',
            measureText(this: { font: string }, text: string) {
              browser.measured++;
              const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
              const brand = this.font.includes('Brand') && browser.loaded;
              const bold = /\bbold\b|\b[6-9]00\b/.test(this.font) ? 1.1 : 1;
              const perChar = this.font.includes('monospace') ? 6 : brand ? 10 : 8;
              return {
                width: (text.length * perChar * bold * px) / 16,
                fontBoundingBoxAscent: px * 0.75,
                fontBoundingBoxDescent: px * 0.25,
              };
            },
          };
        }
      }
    );
    vi.stubGlobal('document', {
      fonts: {
        get size() {
          return browser.size;
        },
        check: (font: string) => !font.includes('Brand') || browser.loaded,
      },
    });
  }

  /** The web font finishes loading and is added to document.fonts. */
  finishLoading(): void {
    this.loaded = true;
    this.size++;
  }
}

const brand: FontKey = { family: 'Brand, sans-serif', size: 16, weight: 400 };

async function freshModule() {
  vi.resetModules();
  return import('./measurer.js');
}

let browser: FakeBrowser;
beforeEach(() => {
  browser = new FakeBrowser();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectMeasurer', () => {
  it('uses the table measurer in Node, where there is no canvas', async () => {
    const { selectMeasurer } = await freshModule();
    expect(selectMeasurer().id).toBe('table');
    expect(selectMeasurer({ deterministic: false }).id).toBe('table');
  });

  it('uses the canvas measurer in a browser', async () => {
    browser.install();
    const { selectMeasurer } = await freshModule();
    const m = selectMeasurer();
    expect(m.id).toBe('canvas');
    expect(m.width('abcd', { ...brand, family: 'Arial' }, 0)).toBe(32);
    expect(selectMeasurer()).toBe(m); // one shared cache across renders
  });

  it('forces the table measurer with deterministic: true, giving Node widths in a browser', async () => {
    const font: FontKey = { family: 'Arial', size: 16, weight: 400 };
    const node = (await freshModule()).selectMeasurer({ deterministic: true });
    const nodeWidth = node.width('Hello wörld', font, Style.Bold);
    browser.install();
    const inBrowser = (await freshModule()).selectMeasurer({ deterministic: true });
    expect(inBrowser.id).toBe('table');
    expect(inBrowser.width('Hello wörld', font, Style.Bold)).toBe(nodeWidth);
    expect(inBrowser.metrics(font)).toEqual(node.metrics(font));
  });

  it('uses a measurer passed by the integrator', async () => {
    browser.install();
    const { selectMeasurer } = await freshModule();
    const custom: Measurer = {
      id: 'custom',
      width: (text) => text.length,
      metrics: () => ({ ascent: 1, descent: 0, lineHeight: 1 }),
    };
    expect(selectMeasurer({ measurer: custom })).toBe(custom);
  });

  it('ignores an integrator measurer under deterministic: true (R-TEXT-7)', async () => {
    browser.install();
    const { selectMeasurer } = await freshModule();
    const custom: Measurer = {
      id: 'custom',
      width: (text) => text.length,
      metrics: () => ({ ascent: 1, descent: 0, lineHeight: 1 }),
    };
    expect(selectMeasurer({ measurer: custom, deterministic: true }).id).toBe('table');
  });
});

describe('canvasMeasurer', () => {
  it('is unavailable without a canvas', async () => {
    const { canvasMeasurer } = await freshModule();
    expect(canvasMeasurer()).toBeNull();
  });

  it('measures with the resolved font, weight, monospace family and smaller sub/sup size', async () => {
    browser.install();
    browser.finishLoading();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    expect(m.width('abcd', brand, 0)).toBe(40);
    expect(m.width('abcd', brand, Style.Bold)).toBeCloseTo(44, 9);
    expect(m.width('abcd', { ...brand, weight: 700 }, 0)).toBeCloseTo(44, 9);
    expect(m.width('abcd', brand, Style.Mono)).toBe(24);
    expect(m.width('abcd', brand, Style.Sub)).toBeCloseTo(40 / 1.2, 9);
  });

  it('takes vertical metrics from the canvas font box', async () => {
    browser.install();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    expect(m.metrics({ ...brand, size: 20 })).toEqual({ ascent: 15, descent: 5, lineHeight: 20 });
  });

  it('caches widths of a loaded font', async () => {
    browser.install();
    browser.finishLoading();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    m.width('cached', brand, 0);
    m.width('cached', brand, 0);
    expect(browser.measured).toBe(1);
  });

  it('answers a hit without measuring, even with the font cache nearly full', async () => {
    browser.install();
    browser.finishLoading();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    for (let i = 0; i < 19_999; i++) m.width(`label ${i}`, brand, 0);
    const before = browser.measured;
    expect(m.width('label 0', brand, 0)).toBe(70);
    expect(browser.measured).toBe(before);
  });

  it('clears a font cache whole at 20,000 entries rather than dropping one', async () => {
    browser.install();
    browser.finishLoading();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    for (let i = 0; i < 20_000; i++) m.width(`label ${i}`, brand, 0);
    m.width('label 20000', brand, 0); // one past the cap
    const before = browser.measured;
    m.width('label 1', brand, 0); // dropping only the oldest entry would have kept this one
    m.width('label 20000', brand, 0); // the entry that hit the cap is kept
    expect(browser.measured).toBe(before + 1);
  });

  it('re-measures once a late-loading web font arrives', async () => {
    browser.install();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    expect(m.width('abcd', brand, 0)).toBe(32); // fallback face while "Brand" loads
    browser.finishLoading();
    expect(m.width('abcd', brand, 0)).toBe(40);
  });

  it('does not keep widths measured while the font is still loading', async () => {
    browser.install();
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    expect(m.width('abcd', brand, 0)).toBe(32);
    browser.loaded = true; // loaded, but document.fonts.size has not changed
    expect(m.width('abcd', brand, 0)).toBe(40);
  });

  it('drops cached widths when document.fonts changes size', async () => {
    browser.install();
    const arial: FontKey = { ...brand, family: 'Arial' };
    const m = (await freshModule()).canvasMeasurer() as Measurer;
    m.width('abcd', arial, 0);
    browser.size++;
    m.width('abcd', arial, 0);
    expect(browser.measured).toBe(2);
  });
});
