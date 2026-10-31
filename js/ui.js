// ============================================================
// ui.js — fælles UI-hjælpere (kun ét sted bygger knapper)
// btn(type, ikon, tekst, opts)
//   type: 'primary' | 'secondary' | 'danger' | 'icon'
//   ikon: Lucide-ikonnavn (fx 'plus', 'trash-2', 'arrow-left')
//   opts: { onclick, id, title, small, attrs }
// Regler: maks ÉN primary pr. visning (hovedhandlingen),
// alt andet secondary; danger = hvid m. rød tekst/ikon (rød
// baggrund kun ved hover); ingen ◀ ▶ tegn — brug Lucide-ikoner.
// ============================================================
window.btn = function (type, icon, text, opts) {
    opts = opts || {};
    const cls = ['btn', type === 'icon' ? 'btn-icon' + (opts.small ? ' btn-icon-sm' : '') : 'btn-' + type];
    if (opts.small && type !== 'icon') cls.push('btn-sm');
    const id = opts.id ? ` id="${opts.id}"` : '';
    const title = opts.title ? ` title="${opts.title}"` : '';
    const onclick = opts.onclick ? ` onclick="${opts.onclick}"` : '';
    const attrs = opts.attrs || '';
    const iconHtml = icon ? `<i data-lucide="${icon}"></i>` : '';
    if (type === 'icon') {
        return `<button${id}${onclick}${title} class="${cls.join(' ')}"${attrs}>${iconHtml}</button>`;
    }
    const label = text ? `<span>${text}</span>` : '';
    return `<button${id}${onclick}${title} class="${cls.join(' ')}"${attrs}>${iconHtml}${label}</button>`;
};
