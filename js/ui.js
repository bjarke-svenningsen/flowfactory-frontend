// ============================================================
// ui.js — fælles UI-hjælpere (kun ét sted bygger knapper)
//
// btn('primary', 'plus', 'Nyt Materiale', { onclick, title, small })
// btn({ type:'primary', icon:'plus', label:'Nyt Materiale', title:'...', onclick:'...', small:true, attrs:'...' })
//   type: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
//   icon: Lucide-ikonnavn (fx 'plus', 'trash-2', 'eye', 'download')
// Regler: maks ÉN primary pr. visning (hovedhandlingen).
// Ghost til små handlinger (Preview, Download, Se, Rediger).
// Danger = ghost-udseende m. rød tekst — ALDRIG fyldt rød.
// Icon-knapper får altid title OG aria-label (tooltip/skærmlæser).
// ============================================================
window.btn = function (type, icon, text, opts) {
    // Objekt-API: btn({ type, icon, label, title, ... })
    if (type && typeof type === 'object') {
        const o = type;
        return window.btn(o.type || 'secondary', o.icon, o.label !== undefined ? o.label : o.text, {
            onclick: o.onclick, title: o.title, small: o.small,
            id: o.id, attrs: o.attrs, danger: o.danger
        });
    }
    opts = opts || {};
    const isIcon = type === 'icon';
    const cls = ['btn', isIcon ? 'btn-icon' : 'btn-' + type];
    if (isIcon && opts.small) cls.push('btn-icon-sm');
    if (!isIcon && opts.small) cls.push('btn-sm');
    if (isIcon && (opts.danger || type === 'danger')) cls.push('btn-icon-danger');
    const id = opts.id ? ` id="${opts.id}"` : '';
    const title = opts.title ? ` title="${opts.title}"` : '';
    const aria = isIcon ? ` aria-label="${opts.title || text || 'Knap'}"` : '';
    const onclick = opts.onclick ? ` onclick="${opts.onclick}"` : '';
    const attrs = opts.attrs || '';
    const iconHtml = icon ? `<i data-lucide="${icon}"></i>` : '';
    if (isIcon) {
        return `<button${id}${onclick}${title}${aria} class="${cls.join(' ')}"${attrs}>${iconHtml}</button>`;
    }
    const label = text ? `<span>${text}</span>` : '';
    return `<button${id}${onclick}${title} class="${cls.join(' ')}"${attrs}>${iconHtml}${label}</button>`;
};
// Central ikon-opdatering: kald efter HVER dynamisk rendering
window.refreshIcons = function (root) {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons(root ? { root } : undefined);
    }
};
