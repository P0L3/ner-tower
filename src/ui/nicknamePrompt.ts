import './leaderboard.css';
import { h } from './dom';
import { NICKNAME_MAX, normalizeNickname } from '../leaderboard/protocol';

export interface NicknamePromptOptions {
    /** Called with the cleaned, valid nickname. The caller stores it. */
    onSave(nickname: string): void;
    onSkip(): void;
}

/**
 * Asks for a nickname. Keystrokes are kept away from the game: Phaser listens on `window`, and
 * typing "r", "s" or "n" here must not restart the game or leave the screen.
 */
export function mountNicknamePrompt(host: HTMLElement, opts: NicknamePromptOptions): { destroy(): void } {
    const input = h('input', { class: 'nt-code', type: 'text', maxLength: NICKNAME_MAX, placeholder: 'Your name', spellcheck: false, autocomplete: 'off' });
    input.setAttribute('aria-label', 'Nickname');
    const error = h('div', { class: 'nt-hint is-error' });
    const save = () => {
        const name = normalizeNickname(input.value);
        if (name === undefined) { error.textContent = `Use 1 to ${NICKNAME_MAX} characters.`; input.focus(); return; }
        opts.onSave(name);
    };
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
        input.addEventListener(type, e => { e.stopPropagation(); if (type === 'keydown' && (e as KeyboardEvent).key === 'Enter') save(); });
    }
    const root = h('div', { class: 'nt-prompt' },
        h('h2', { class: 'nt-h', textContent: 'Choose a nickname' }),
        h('p', { class: 'nt-hint', textContent: 'It is shown next to your scores on the leaderboard. You can change it later in the menu.' }),
        input, error,
        h('div', { class: 'nt-actions' },
            h('button', { type: 'button', class: 'nt-btn is-primary', textContent: 'Save and submit', onclick: save }),
            h('button', { type: 'button', class: 'nt-btn', textContent: 'Not now', onclick: () => opts.onSkip() })));
    host.append(root);
    input.focus();
    return { destroy: () => root.remove() };
}
