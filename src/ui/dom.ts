import { GAME_WIDTH } from '../config/view';

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

/** Tiny element builder. Text goes through `textContent`/text nodes, never innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<El<K>> & { class?: string } = {}, ...children: (Node | string)[]): El<K> {
    const { class: cls, ...rest } = props;
    const el = Object.assign(document.createElement(tag), rest);
    if (cls) el.className = cls;
    el.append(...children);
    return el;
}

/** 1234567 -> "1,234,567" (fixed, so it does not depend on the browser's locale). */
export const formatInt = (n: number): string => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export interface Rect { x: number; y: number; w: number; h: number }
export interface Box { left: number; top: number; width: number; height: number }

/** Dispatched on `window` by main.ts when Phaser changed the size or position of the canvas. */
export const LAYOUT_EVENT = 'nt-layout';

/**
 * Where an overlay goes, given where the canvas is on screen. The overlay keeps its design size
 * (`rect`, in game pixels) and is scaled with a CSS transform, so text and controls grow and
 * shrink together with the canvas instead of being re-laid-out.
 * `canvas` and `host` are viewport rectangles (getBoundingClientRect).
 */
export function overlayPlacement(canvas: Box, host: Box, rect: Rect): { left: number; top: number; scale: number } {
    const scale = canvas.width > 0 ? canvas.width / GAME_WIDTH : 1;
    return { left: canvas.left - host.left + rect.x * scale, top: canvas.top - host.top + rect.y * scale, scale };
}

/** Calls `cb` (at most once per frame) whenever the canvas may have moved or changed size. Returns a stop function. */
export function watchCanvasLayout(canvas: HTMLElement, cb: () => void): () => void {
    const hasRaf = typeof requestAnimationFrame === 'function';
    let raf = 0;
    const later = () => {
        if (!hasRaf) { cb(); return; }
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(cb);
    };
    window.addEventListener('resize', later);
    window.addEventListener(LAYOUT_EVENT, later);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : undefined;
    ro?.observe(canvas);
    if (canvas.parentElement) ro?.observe(canvas.parentElement);
    return () => {
        if (hasRaf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', later);
        window.removeEventListener(LAYOUT_EVENT, later);
        ro?.disconnect();
    };
}

/**
 * Lays `el` over a rectangle given in game coordinates (the canvas is 850x800) and keeps it there
 * when the canvas is scaled or moved. Returns a function that removes it again.
 */
export function pinToCanvas(canvas: HTMLCanvasElement, el: HTMLElement, rect: Rect): () => void {
    const host = canvas.parentElement ?? document.body;
    el.style.position = 'absolute';
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
    el.style.transformOrigin = '0 0';
    const place = () => {
        const hostRect = host.getBoundingClientRect();
        const p = overlayPlacement(canvas.getBoundingClientRect(), {
            left: hostRect.left + host.clientLeft, top: hostRect.top + host.clientTop, width: hostRect.width, height: hostRect.height,
        }, rect);
        el.style.left = `${p.left}px`;
        el.style.top = `${p.top}px`;
        el.style.transform = `scale(${p.scale})`;
    };
    place();
    const stop = watchCanvasLayout(canvas, place);
    host.append(el);
    return () => { stop(); el.remove(); };
}
