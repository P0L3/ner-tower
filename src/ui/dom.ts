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

/**
 * Lays `el` over a rectangle given in game coordinates (the canvas is 850x800) and keeps it there
 * when the page is resized. Returns a function that removes it again.
 */
export function pinToCanvas(canvas: HTMLCanvasElement, el: HTMLElement, rect: Rect): () => void {
    const host = canvas.parentElement ?? document.body;
    el.style.position = 'absolute';
    const place = () => {
        const scale = canvas.clientWidth / (canvas.width || 850) || 0;
        el.style.left = `${canvas.offsetLeft + rect.x * scale}px`;
        el.style.top = `${canvas.offsetTop + rect.y * scale}px`;
        el.style.width = `${rect.w * scale}px`;
        el.style.height = `${rect.h * scale}px`;
    };
    place();
    window.addEventListener('resize', place);
    host.append(el);
    return () => { window.removeEventListener('resize', place); el.remove(); };
}
