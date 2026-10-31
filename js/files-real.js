// js/files-real.js - Rigtig fil upload integration
let allFiles = [];
let allFolders = [];
let selectedFileId = null;
let currentFilter = 'all'; // 'all', 'root', 'documents', 'images', 'shared', 'folder'
let currentFolderId = null; // null = root level
let currentFolderName = '';

async function loadRealFiles() {
    try {
        const token = sessionStorage.getItem('token');
        
        // Load folders first
        await loadFolders();
        
        // Load all files (mine + shared will be filtered in UI)
        const response = await fetch('/api/files?view=my', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load files');
        
        allFiles = await response.json();
        // Haent filer delt med mig saa "Delt med mig"-sektionen i traet kan vise antal
        sharedFilesCache = await loadSharedFiles();
        renderFolderTree();
        renderRealFiles();
        
        // Show admin-only buttons
        showAdminButtons();
        
        // Initialize resizable columns
        initResizableColumns();
    } catch (error) {
        console.error('Error loading files:', error);
        await winAlert('Kunne ikke indlæse filer: ' + error.message, 'Fejl');
    }
}

// Show admin buttons if user is admin
function showAdminButtons() {
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (user && user.is_admin) {
        document.querySelectorAll('.admin-only').forEach(btn => {
            btn.style.display = 'inline-block';
        });
    }
}

// Create SG Seest Gulvteknik company folder (admin only)
async function createCompanyFolder() {
    const user = JSON.parse(sessionStorage.getItem('user'));
    console.log('Portal: User data:', user); // DEBUG
    console.log('Portal: is_admin value:', user?.is_admin, 'type:', typeof user?.is_admin); // DEBUG
    
    if (!user || (user.is_admin !== 1 && user.is_admin !== true)) {
        winAlert('Kun admins kan oprette firma mapper');
        return;
    }
    
    // Check if company folder already exists
    const existingCompanyFolder = allFolders.find(f => f.is_company_folder && f.name === 'SG Seest Gulvteknik');
    if (existingCompanyFolder) {
        await winAlert('Firma mappen findes allerede!');
        return;
    }
    
    if (!await winConfirm('Opret firma mappe?\nDenne mappe vil være synlig for alle brugere i firmaet.', 'Opret firma mappe')) {
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: 'SG Seest Gulvteknik',
                is_company_folder: true
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create company folder');
        }
        
        await winAlert('Firma mappe oprettet!\nAlle brugere kan nu se og bruge denne mappe.', 'Succes');
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create company folder error:', error);
        await winAlert('Kunne ikke oprette firma mappe: ' + error.message, 'Fejl');
    }
}

// Track expanded folders (tilstand gemmes i localStorage, sa traeet bevarer fold-ud/fold-sammen efter F5)
let expandedFolders = new Set();
(function loadExpandedFolders() {
    try {
        const saved = JSON.parse(localStorage.getItem('filesTreeExpanded') || '[]');
        if (Array.isArray(saved)) saved.forEach(function (id) { expandedFolders.add(id); });
    } catch (e) { /* ignore */ }
})();
function persistExpandedFolders() {
    try { localStorage.setItem('filesTreeExpanded', JSON.stringify(Array.from(expandedFolders))); } catch (e) { /* ignore */ }
}

// --- Fælles filer-hjælpere ---
// Primær firmamappe = top-level firmamappe med LAVESTE id (vises som "Fælles filer").
// Robust: findes der flere øverste (fx fra gammel admin-knap + auto-oprettelse),
// vises de øvrige med deres rigtige navn - intet slettes eller rettes i DB.
function getPrimaryCompanyFolder() {
    const tops = allFolders.filter(f => f.is_company_folder && !f.parent_id);
    if (tops.length === 0) return null;
    return tops.reduce((a, b) => (a.id <= b.id ? a : b));
}

function isTopCompanyFolder(folder) {
    return !!(folder && folder.is_company_folder && !folder.parent_id);
}

function isInCompanyTreeClient(folder) {
    let cur = folder;
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        if (cur.is_company_folder) return true;
        cur = cur.parent_id ? allFolders.find(f => f.id === cur.parent_id) : null;
    }
    return false;
}

// Visningsnavn: kun den primære top-firmamappe hedder "Fælles filer"
function folderDisplayName(folder) {
    const primary = getPrimaryCompanyFolder();
    if (primary && folder.id === primary.id) return 'Fælles filer';
    return folder.name || 'Mappe';
}

// Render folder tree: kun rigtige steder - Fælles filer, Mine filer (roden), Mine mapper
function renderFolderTree() {
    const tree = document.getElementById('folderTree');
    if (!tree) {
        console.log('Folder tree element not found - not on files page');
        return;
    }

    let html = '';

    // Sortér mapper efter brugerens træk-rækkefølge (sort_order), derefter navn
    const bySortOrder = (a, b) => {
        const sa = (a.sort_order === null || a.sort_order === undefined) ? 2147483647 : a.sort_order;
        const sb = (b.sort_order === null || b.sort_order === undefined) ? 2147483647 : b.sort_order;
        if (sa !== sb) return sa - sb;
        return (a.name || '').localeCompare(b.name || '');
    };

    // Fælles filer (firmamappe) - fast øverst
    const companyTops = allFolders.filter(f => isTopCompanyFolder(f)).sort((a, b) => a.id - b.id);
    html += '<div class="tree-section-label">Fælles filer</div>';
    if (companyTops.length > 0) {
        const primary = companyTops[0];
        const rest = companyTops.slice(1);
        let branch = renderFolderBranch([primary], 0, { companyTop: true });
        if (rest.length > 0) {
            // Flere øverste firmamapper: vis med rigtige navne indrykket under den primære
            branch += renderFolderBranch(rest, 1);
        }
        html += branch;
    } else {
        html += '<div class="tree-empty-note">Oprettes automatisk</div>';
    }

    // Mine filer = roden (filer uden mappe)
    const meId = getCurrentUserId();
    const rootCount = allFiles.filter(f => !f.folder_id && (!meId || f.owner_id === meId)).length;
    html += '<div class="tree-section-label">Mine filer</div>';
    html += '<div class="tree-node ' + (currentFilter === 'root' ? 'active' : '') + '"' +
        ' onclick="filterFiles(\'root\')" id="mineFilerNode"' +
        ' ondrop="handleRootDrop(event)" ondragover="handleRootDragOver(event)" ondragleave="handleFolderDragLeave(event)">' +
        '<span class="tree-chevron"></span><i data-lucide="folder"></i>' +
        '<span class="tree-label">Mine filer</span>' +
        '<span class="tree-count">' + rootCount + '</span></div>';

    // Delt med mig - visningsnode (ikke en rigtig mappe); kun naar der findes delte filer
    if (sharedFilesCache.length > 0) {
        html += '<div class="tree-section-label">Delt med mig</div>';
        html += '<div class="tree-node ' + (currentFilter === 'shared' ? 'active' : '') + '" onclick="filterFiles(\'shared\')" id="deltMedMigNode">' +
            '<span class="tree-chevron"></span><i data-lucide="users"></i>' +
            '<span class="tree-label">Delt med mig</span>' +
            '<span class="tree-count">' + sharedFilesCache.length + '</span></div>';
    }

    // Mine mapper
    const personalFolders = allFolders.filter(f => !f.is_company_folder && !f.parent_id).sort(bySortOrder);
    if (personalFolders.length > 0) {
        html += '<div class="tree-section-label">Mine mapper</div>';
        html += renderFolderBranch(personalFolders, 0, false);
    }

    tree.innerHTML = html;
    refreshIcons();
}

// Render folder branch recursively (tree-node markup m. Lucide-ikoner)
// opts.companyTop = sand KUN for den øverste "Fælles filer"-node; børn vises med rigtige navne
function renderFolderBranch(folders, level, opts = {}) {
    const companyTop = !!(opts && opts.companyTop);
    let html = '';

    folders.forEach(folder => {
        const fileCount = allFiles.filter(f => f.folder_id === folder.id).length;
        const childFolders = allFolders.filter(f => f.parent_id === folder.id)
            .sort((a, b) => {
                const sa = (a.sort_order === null || a.sort_order === undefined) ? 2147483647 : a.sort_order;
                const sb = (b.sort_order === null || b.sort_order === undefined) ? 2147483647 : b.sort_order;
                if (sa !== sb) return sa - sb;
                return (a.name || '').localeCompare(b.name || '');
            });
        const hasChildren = childFolders.length > 0;
        const isExpanded = expandedFolders.has(folder.id);
        const isSelected = currentFolderId === folder.id;
        const displayName = companyTop ? 'Fælles filer' : folderDisplayName(folder);
        const safeName = displayName.replace(/'/g, "\\'");
        const indent = level * 16;
        const canDragFolder = !companyTop;

        html += `
            <div class="tree-node ${isSelected ? 'active' : ''} ${companyTop ? 'company-node' : ''}" style="padding-left: ${indent}px;"
                 onclick="openFolder(${folder.id}, '${safeName}')"
                 oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${safeName}'); return false;"
                 data-folder-id="${folder.id}"
                 ${canDragFolder ? 'draggable="true" ondragstart="handleFolderDragStart(event, ' + folder.id + ')"' : ''}
                 ondrop="handleFolderDrop(event, ${folder.id}${companyTop ? ', { companyTop: true }' : ''})"
                 ondragover="handleFolderDragOver(event, ${folder.id}${companyTop ? ', { companyTop: true }' : ''})"
                 ondragleave="handleFolderDragLeave(event)">
                <span class="tree-chevron" onclick="toggleFolder(event, ${folder.id})">${hasChildren ? '<i data-lucide="' + (isExpanded ? 'chevron-down' : 'chevron-right') + '"></i>' : ''}</span>
                <i data-lucide="${companyTop ? 'building-2' : 'folder'}"></i>
                <span class="tree-label">${escapeFileName(displayName)}</span>
                ${fileCount > 0 ? '<span class="tree-count">' + fileCount + '</span>' : ''}
            </div>
        `;

        // Render children if expanded
        if (hasChildren && isExpanded) {
            html += renderFolderBranch(childFolders, level + 1);
        }
    });

    return html;
}

// Toggle folder expansion
function toggleFolder(event, folderId) {
    event.stopPropagation();
    
    if (expandedFolders.has(folderId)) {
        expandedFolders.delete(folderId);
    } else {
        expandedFolders.add(folderId);
    }
    persistExpandedFolders();

    renderFolderTree();
}

// Filter files by category
async function filterFiles(category) {
    currentFilter = category;
    currentFolderId = null;
    currentFolderName = '';
    selectedFileId = null; // ryd markering ved visningsskift

    // Hent delte filer når "Delte filer" vælges
    if (category === 'shared') {
        sharedFilesCache = await loadSharedFiles();
    }

    renderFolderTree();
    renderRealFiles();
}

function isDocument(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext);
}

function isImage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'bmp', 'webp'].includes(ext);
}

// .jfif/.pjpeg/.pjp er almindelige JPEG-varianter - tving altid rigtig MIME-type
function getImageMime(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp'].includes(ext) ? 'image/jpeg' : '';
}

async function loadSharedFiles() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/files?view=shared', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load shared files');
        
        return await response.json();
    } catch (error) {
        console.error('Error loading shared files:', error);
        return [];
    }
}

let sharedFilesCache = [];
let filesSearchQuery = '';
let currentFilesView = 'list';

// Enkelt indgangspunkt til at (gen)tegne Lucide-ikoner efter hver render
function refreshIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function escapeFileName(name) {
    return String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fileTypeInfo(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        return { cls: 'ti-image', label: ext === 'jpeg' ? 'JPG' : ext.toUpperCase().slice(0, 4) };
    }
    if (ext === 'pdf') return { cls: 'ti-pdf', label: 'PDF' };
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return { cls: 'ti-word', label: ext === 'doc' ? 'DOC' : ext.toUpperCase().slice(0, 4) };
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return { cls: 'ti-excel', label: ext.toUpperCase().slice(0, 4) };
    return { cls: 'ti-other', label: (ext || 'FIL').slice(0, 4).toUpperCase() };
}

function fileTypeIconHtml(name) {
    const t = fileTypeInfo(name);
    return '<span class="file-type-icon ' + t.cls + '">' + t.label + '</span>';
}

function folderIconHtml() {
    return '<span class="file-type-icon ti-folder"><i data-lucide="folder"></i></span>';
}

function getFilteredFiles() {
    let files;
    if (currentFilter === 'folder' && currentFolderId) {
        files = allFiles.filter(f => f.folder_id === currentFolderId);
    } else if (currentFilter === 'root') {
        // Mine filer = roden: egne filer uden mappe
        const meId = getCurrentUserId();
        files = allFiles.filter(f => !f.folder_id && (!meId || f.owner_id === meId));
    } else if (currentFilter === 'documents') {
        files = allFiles.filter(f => isDocument(f.original_name));
    } else if (currentFilter === 'images') {
        files = allFiles.filter(f => isImage(f.original_name));
    } else if (currentFilter === 'shared') {
        files = sharedFilesCache;
    } else {
        files = allFiles;
    }

    // Fritekst-søgning (toolbar)
    if (filesSearchQuery) {
        const q = filesSearchQuery.toLowerCase();
        files = files.filter(f => f.original_name.toLowerCase().includes(q));
    }

    // Sortering
    const dir = currentSortDirection === 'desc' ? -1 : 1;
    files = [...files].sort((a, b) => {
        switch (currentSortColumn) {
            case 'size': return ((a.file_size || 0) - (b.file_size || 0)) * dir;
            case 'type': return getFileType(a.original_name).localeCompare(getFileType(b.original_name), 'da') * dir;
            case 'date': return (new Date(a.created_at) - new Date(b.created_at)) * dir;
            default: return a.original_name.localeCompare(b.original_name, 'da') * dir;
        }
    });
    return files;
}

// Filterchips med antal
function renderFilesChips() {
    const chips = document.getElementById('filesChips');
    if (!chips) return;
    const docCount = allFiles.filter(f => isDocument(f.original_name)).length;
    const imgCount = allFiles.filter(f => isImage(f.original_name)).length;
    const defs = [
        { id: 'all', label: 'Alle', count: allFiles.length },
        { id: 'documents', label: 'Dokumenter', count: docCount },
        { id: 'images', label: 'Billeder', count: imgCount }
    ];
    chips.innerHTML = defs.map(d => {
        const active = currentFilter === d.id;
        const countHtml = d.count === null ? '' : ' <span class="chip-count">' + d.count + '</span>';
        return '<button class="files-chip' + (active ? ' active' : '') + '" onclick="filterFiles(\'' + d.id + '\')">' + d.label + countHtml + '</button>';
    }).join('');
}

// Brødkrumme
function getFolderPath(folderId) {
    const path = [];
    let f = allFolders.find(x => x.id === folderId);
    while (f) {
        path.unshift(f);
        f = f.parent_id ? allFolders.find(x => x.id === f.parent_id) : null;
    }
    return path;
}

function renderBreadcrumb() {
    const crumb = document.getElementById('filesCrumb');
    if (!crumb) return;
    const names = { all: 'Alle filer', root: 'Mine filer', documents: 'Dokumenter', images: 'Billeder', shared: 'Delt med mig' };
    let html = '<span class="crumb-root" ondragover="handleFolderDragOver(event, null)" ondrop="handleFolderDrop(event, null)" ondragleave="handleFolderDragLeave(event)">Alle filer</span>';
    if (currentFilter === 'folder' && currentFolderId) {
        const path = getFolderPath(currentFolderId);
        const totalLen = path.reduce(function (s, f) { return s + folderDisplayName(f).length; }, 0);
        const showAll = path.length <= 4 && totalLen <= 48;
        // Standard: alle led. Ellers: foerste led + "..." + de to sidste led.
        let visible = path.map(function (f, i) { return { f: f, i: i }; });
        let hidden = [];
        if (!showAll) {
            const first = path[0], lastTwo = path.slice(Math.max(1, path.length - 2));
            visible = [{ f: first, i: 0 }].concat(lastTwo.map(function (f) { return { f: f, i: path.indexOf(f) }; }));
            hidden = path.slice(1, path.length - 1).filter(function (f) { return visible.every(function (v) { return v.f !== f; }); });
            if (hidden.length === 0) visible = path.map(function (f, i) { return { f: f, i: i }; });
        }
        visible.forEach(function (v, k) {
            if (k > 0) html += '<span class="crumb-sep">/</span>';
            const last = v.i === path.length - 1;
            const fullName = folderDisplayName(v.f);
            const safeName = fullName.replace(/'/g, "\\'");
            html += '<span class="crumb-item' + (last ? ' current' : '') + '" title="' + escapeFileName(fullName) + '" onclick="openFolder(' + v.f.id + ', \'' + safeName + '\')" ondragover="handleFolderDragOver(event, ' + v.f.id + ')" ondrop="handleFolderDrop(event, ' + v.f.id + ')" ondragleave="handleFolderDragLeave(event)">' + escapeFileName(fullName) + '</span>';
            if (!showAll && v.i === 0 && hidden.length > 0) {
                html += '<span class="crumb-sep">/</span>';
                html += '<span class="crumb-ellipsis" title="Vis skjulte mapper" onclick="showCrumbOverflow(event)">...</span>';
            }
        });
        if (hidden.length > 0) window._crumbHiddenFolders = hidden;
        else window._crumbHiddenFolders = [];
    } else {
        html += '<span class="crumb-sep">/</span><span class="crumb-item current">' + (names[currentFilter] || 'Alle filer') + '</span>';
        window._crumbHiddenFolders = [];
    }
    crumb.innerHTML = html;
    if (typeof refreshIcons === 'function') refreshIcons();
}

// Lille menu (samme stil som hojreklik-menuen) med de broedkrumme-led der er skjult bag "..."
// Menuens punkter er ogsaa slip-maal (samme handlere som andre crumb-led).
function showCrumbOverflow(event) {
    event.preventDefault();
    event.stopPropagation();
    const hidden = window._crumbHiddenFolders || [];
    if (hidden.length === 0) return;
    let menu = document.getElementById('crumbOverflowMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'crumbOverflowMenu';
        menu.className = 'context-menu';
        document.body.appendChild(menu);
    }
    menu.innerHTML = hidden.map(function (f) {
        const fullName = folderDisplayName(f);
        const safeName = fullName.replace(/'/g, "\\'");
        return '<div class="context-menu-item" title="' + escapeFileName(fullName) + '" onclick="hideCrumbOverflow(); openFolder(' + f.id + ', \'' + safeName + '\')" ondragover="handleFolderDragOver(event, ' + f.id + ')" ondrop="handleFolderDrop(event, ' + f.id + '); hideCrumbOverflow()" ondragleave="handleFolderDragLeave(event)">' + escapeFileName(fullName) + '</div>';
    }).join('');
    menu.style.display = 'block';
    const x = Math.min(event.clientX, window.innerWidth - 240);
    const y = Math.min(event.clientY + 8, window.innerHeight - 40 - hidden.length * 36);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function hideCrumbOverflow() {
    const menu = document.getElementById('crumbOverflowMenu');
    if (menu) menu.style.display = 'none';
}

// Luk "..."-menuen ved klik udenfor (bortset fra selve knappen, der stopper propagation)
document.addEventListener('click', function (e) {
    const menu = document.getElementById('crumbOverflowMenu');
    if (menu && !menu.contains(e.target)) hideCrumbOverflow();
});

// Genberegn broedkrummen ved vinduessize-aendring (debounce ~150 ms)
let crumbResizeTimer = null;
window.addEventListener('resize', function () {
    clearTimeout(crumbResizeTimer);
    crumbResizeTimer = setTimeout(function () { renderBreadcrumb(); }, 150);
});

function setFilesView(view) {
    currentFilesView = view;
    const lb = document.getElementById('viewListBtn');
    const gb = document.getElementById('viewGridBtn');
    if (lb) lb.classList.toggle('active', view === 'list');
    if (gb) gb.classList.toggle('active', view === 'images');
    renderRealFiles();
}

function onFilesSearchInput(event) {
    filesSearchQuery = (event.target.value || '').trim();
    renderRealFiles();
}

// Midlertidig stub — rigtigt flervalg kommer i trin (b)
function toggleSelectAllFiles(event) {
    const checked = event.target.checked;
    document.querySelectorAll('#fileListBody input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
}

function toggleFileCheckbox(event, fileId) {
    event.stopPropagation();
    const cb = event.target;
    if (cb && cb.checked) checkedFileIds.add(Number(fileId));
    else checkedFileIds.delete(Number(fileId));
    selectRealFile(fileId, null);
}

function renderRealFiles() {
    const tbody = document.getElementById('fileListBody');
    const fileCount = document.getElementById('fileCount');
    const gridView = document.getElementById('filesGridView');
    const table = document.getElementById('fileTable');

    if (!tbody || !fileCount) {
        console.log('Files page elements not found - not on files page');
        return;
    }

    const filteredFiles = getFilteredFiles();

    let subfolders = [];
    if (currentFilter === 'folder' && currentFolderId) {
        subfolders = allFolders.filter(f => f.parent_id === currentFolderId);
    }

    renderFilesChips();
    renderBreadcrumb();

    const totalItems = filteredFiles.length + subfolders.length;
    fileCount.textContent = totalItems + (totalItems === 1 ? ' element' : ' elementer');
    const selEl = document.getElementById('selectedInfo');
    if (selEl) selEl.textContent = '';

    // Billedvisning (gitter)
    if (currentFilesView === 'images') {
        if (table) table.style.display = 'none';
        if (gridView) { gridView.hidden = false; }
        renderFilesGrid(filteredFiles, subfolders);
        return;
    }
    if (table) table.style.display = '';
    if (gridView) gridView.hidden = true;

    if (totalItems === 0) {
        const emptyMessage = currentFilter === 'folder'
            ? 'Mappen er tom. Upload filer til denne mappe.'
            : currentFilter === 'root'
            ? 'Ingen filer i "Mine filer" endnu. Klik "Upload" for at tilføje filer.'
            : currentFilter === 'shared'
            ? 'Ingen delte filer endnu.'
            : currentFilter === 'documents'
            ? 'Ingen dokumenter endnu.'
            : currentFilter === 'images'
            ? 'Ingen billeder endnu.'
            : 'Ingen filer uploadet endnu. Klik "Upload" for at tilføje filer.';
        tbody.innerHTML = '<tr><td colspan="5"><div class="files-empty"><i data-lucide="inbox"></i><span>' + emptyMessage + '</span></div></td></tr>';
        refreshIcons();
        renderFileDetails();
        return;
    }

    let html = '';

    // Undermapper først (som Windows Stifinder)
    subfolders.forEach(folder => {
        const fCount = allFiles.filter(f => f.folder_id === folder.id).length;
        const safeName = folder.name.replace(/'/g, "\\'");
        const date = new Date(folder.created_at).toLocaleDateString('da-DK');
        html += `
            <tr class="folder-row" data-folder-id="${folder.id}" draggable="true" onclick="selectFolder(${folder.id}, event)" ondblclick="openFolder(${folder.id}, '${safeName}')" oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${safeName}'); return false;" ondragstart="handleFolderDragStart(event, ${folder.id})" ondragover="handleFolderDragOver(event, ${folder.id})" ondrop="handleFolderDrop(event, ${folder.id})" ondragleave="handleFolderDragLeave(event)">
                <td class="col-check"></td>
                <td><div class="col-name-cell">${folderIconHtml()}<span class="file-name-text">${escapeFileName(folder.name)}</span></div></td>
                <td class="col-size">${fCount} ${fCount === 1 ? 'fil' : 'filer'}</td>
                <td class="col-type">Mappe</td>
                <td class="col-date">${date}</td>
            </tr>`;
    });

    html += filteredFiles.map(file => {
        const icon = fileTypeIconHtml(file.original_name);
        const size = formatFileSize(file.file_size);
        const type = getFileType(file.original_name);
        const date = new Date(file.created_at).toLocaleDateString('da-DK');
        const selCls = selectedFileId === file.id ? ' row-selected' : '';
        return `
            <tr class="file-row${selCls}" draggable="true" data-file-id="${file.id}" onclick="selectRealFile(${file.id}, event)" ondblclick="openRealFile(${file.id})" oncontextmenu="showContextMenu(event, ${file.id})" ondragstart="handleFileDragStart(event, ${file.id})">
                <td class="col-check"><input type="checkbox"${checkedFileIds.has(file.id) ? ' checked' : ''} onclick="toggleFileCheckbox(event, ${file.id})"></td>
                <td><div class="col-name-cell">${icon}<span class="file-name-text">${escapeFileName(file.original_name)}</span></div></td>
                <td class="col-size">${size}</td>
                <td class="col-type">${type}</td>
                <td class="col-date">${date}</td>
            </tr>`;
    }).join('');

    tbody.innerHTML = html;
    refreshIcons();
    renderFileDetails();
}


// Billedvisning (gitterkort med thumbnail til billeder)
function renderFilesGrid(files, subfolders) {
    const grid = document.getElementById('filesGridView');
    if (!grid) return;
    let html = '';
    subfolders.forEach(folder => {
        const safeName = folder.name.replace(/'/g, "\\'");
        html += `
            <div class="grid-card" data-folder-id="${folder.id}" draggable="true" ondragstart="handleFolderDragStart(event, ${folder.id})" ondragover="handleFolderDragOver(event, ${folder.id})" ondrop="handleFolderDrop(event, ${folder.id})" ondragleave="handleFolderDragLeave(event)" onclick="openFolder(${folder.id}, '${safeName}')" oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${safeName}'); return false;">
                <div class="grid-thumb" style="display:flex;align-items:center;justify-content:center;">${folderIconHtml()}</div>
                <div class="grid-name">${escapeFileName(folder.name)}</div>
            </div>`;
    });
    files.forEach(file => {
        const isImg = isImage(file.original_name);
        const thumb = isImg
            ? '<img class="grid-thumb" src="/api/files/download/' + file.id + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
            : '<div class="grid-thumb" style="display:flex;align-items:center;justify-content:center;">' + fileTypeIconHtml(file.original_name) + '</div>';
        html += `
            <div class="grid-card" data-file-id="${file.id}" draggable="true" ondragstart="handleFileDragStart(event, ${file.id})" ondragover="event.preventDefault()" onclick="selectRealFile(${file.id}, event)" ondblclick="openRealFile(${file.id})" oncontextmenu="showContextMenu(event, ${file.id})">
                ${thumb}
                <div class="grid-name">${escapeFileName(file.original_name)}</div>
            </div>`;
    });
    grid.innerHTML = html;
    refreshIcons();
}


// Detaljepanel til højre
function renderFileDetails() {
    const panel = document.getElementById('filesDetails');
    if (!panel) return;
    const file = findFileAnywhere(selectedFileId);
    if (!file) {
        panel.innerHTML = '<div class="files-details-empty"><i data-lucide="mouse-pointer-click"></i><p>Vælg en fil for at se detaljer</p></div>';
        refreshIcons();
        return;
    }
    const meId = getCurrentUserId();
    const inOwnList = allFiles.some(f => f.id === selectedFileId);
    const inSharedList = sharedFilesCache.some(f => f.id === selectedFileId);
    // Fil andre har delt med MIG: ingen Slet - kun fjern min adgang
    const sharedByOther = inSharedList && !inOwnList && file.owner_id !== meId;
    const isImg = isImage(file.original_name);
    const t = fileTypeInfo(file.original_name);
    const date = new Date(file.created_at).toLocaleString('da-DK');
    const preview = isImg
        ? '<div class="files-preview"><img id="detailsPreviewImg" alt=""></div>'
        : '<div class="files-preview"><span class="file-type-icon ' + t.cls + '">' + t.label + '</span></div>';
    let actions = '';
    if (sharedByOther) {
        actions =
            '<button class="btn btn-primary" onclick="selectedFileId = ' + file.id + '; openRealFile(' + file.id + ')"><i data-lucide="eye"></i>Åbn</button>' +
            '<button class="btn btn-secondary" onclick="selectedFileId = ' + file.id + '; downloadFile()"><i data-lucide="download"></i>Download</button>' +
            '<button class="btn btn-secondary" style="color:#D93025" onclick="selectedFileId = ' + file.id + '; deleteSelected()"><i data-lucide="log-out"></i>Fjern fra mine delte</button>';
    } else {
        actions =
            '<button class="btn btn-secondary" onclick="selectedFileId = ' + file.id + '; openRealFile(' + file.id + ')"><i data-lucide="eye"></i>Åbn</button>' +
            '<button class="btn btn-primary" onclick="selectedFileId = ' + file.id + '; transferToOrder()"><i data-lucide="send"></i>Overfør til ordre</button>' +
            '<button class="btn btn-secondary" onclick="selectedFileId = ' + file.id + '; downloadFile()"><i data-lucide="download"></i>Download</button>' +
            '<button class="btn btn-secondary" onclick="selectedFileId = ' + file.id + '; shareFile()"><i data-lucide="share-2"></i>Del</button>' +
            '<button class="btn btn-secondary" onclick="selectedFileId = ' + file.id + '; moveSelectedToFolder()"><i data-lucide="folder-input"></i>Flyt til...</button>' +
            '<button class="btn btn-secondary" id="stopShareBtn" style="display:none" onclick="selectedFileId = ' + file.id + '; stopSharingSelected()"><i data-lucide="link-break"></i>Stop deling</button>' +
            '<button class="btn btn-secondary" style="color:#D93025" onclick="selectedFileId = ' + file.id + '; deleteSelected()"><i data-lucide="trash-2"></i>Slet</button>';
    }
    panel.innerHTML =
        preview +
        '<h3>' + escapeFileName(file.original_name) + '</h3>' +
        '<div class="files-meta">' +
            '<div class="meta-row"><span class="meta-key">Størrelse</span><span class="meta-val">' + formatFileSize(file.file_size) + '</span></div>' +
            '<div class="meta-row"><span class="meta-key">Type</span><span class="meta-val">' + getFileType(file.original_name) + '</span></div>' +
            '<div class="meta-row"><span class="meta-key">Ændret</span><span class="meta-val">' + date + '</span></div>' +
            '<div class="meta-row"><span class="meta-key">Uploadet af</span><span class="meta-val">' + escapeFileName(file.uploader_name || file.owner_name || '') + '</span></div>' +
            '<div id="sharedWithRow"></div>' +
        '</div>' +
        '<div class="details-actions">' + actions + '</div>';
    refreshIcons();
    if (isImg) loadDetailsPreview(file);
    // Stop deling vises kun, når filen faktisk er delt med nogen
    (async function () {
        try {
            const token2 = sessionStorage.getItem('token');
            const res2 = await fetch('/api/files/' + file.id + '/shares', { headers: { 'Authorization': 'Bearer ' + token2 } });
            const shares = res2.ok ? await res2.json() : [];
            const btn = document.getElementById('stopShareBtn');
            if (btn) btn.style.display = (Array.isArray(shares) && shares.length) ? '' : 'none';
            // "Delt med: navne" - kun for egne filer, ikke filer andre har delt med mig
            const row = document.getElementById('sharedWithRow');
            if (row && !sharedByOther && Array.isArray(shares) && shares.length) {
                row.innerHTML =
                    '<div class="meta-row"><span class="meta-key">Delt med</span><span class="meta-val">' +
                    escapeFileName(shares.map(function (s) { return s.shared_with_name; }).join(', ')) +
                    '</span></div>';
            }
        } catch (e3) { /* knappen forbliver skjult */ }
    })();
}

async function loadDetailsPreview(file) {
    const img = document.getElementById('detailsPreviewImg');
    if (!img) return;
    try {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`/api/files/download/${file.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Kunne ikke hente preview');
        const blob = await res.blob();
        img.src = URL.createObjectURL(new Blob([blob], { type: getImageMime(file.original_name) || blob.type }));
    } catch (e) {
        console.error('Preview error:', e);
    }
}

// Select folder (fremhæv + detaljer)
function selectFolder(folderId, event) {
    selectedFileId = null;
    document.querySelectorAll('#fileListBody tr').forEach(row => row.classList.remove('row-selected'));
    if (event && event.currentTarget) event.currentTarget.classList.add('row-selected');
    const folder = allFolders.find(f => f.id === folderId);
    if (folder) {
        const fCount = allFiles.filter(f => f.folder_id === folder.id).length;
        const selEl = document.getElementById('selectedInfo');
        if (selEl) selEl.textContent = 'Valgt: ' + folder.name + ' (' + fCount + ' filer)';
    }
    renderFileDetails();
    if (event) event.stopPropagation();
}

function selectRealFile(fileId, event) {
    selectedFileId = fileId;
    document.querySelectorAll('#fileListBody tr').forEach(row => row.classList.remove('row-selected'));
    const row = document.querySelector('#fileListBody tr[data-file-id="' + fileId + '"]');
    if (row) row.classList.add('row-selected');
    const file = allFiles.find(f => f.id === fileId) || sharedFilesCache.find(f => f.id === fileId);
    if (file) {
        const selEl = document.getElementById('selectedInfo');
        if (selEl) selEl.textContent = 'Valgt: ' + file.original_name + ' (' + formatFileSize(file.file_size) + ')';
    }
    renderFileDetails();
    if (event) event.stopPropagation();
}

async function uploadFileToExplorer(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    // Størrelsestjek på alle filer først
    const tooBig = files.filter(f => f.size > MAX_UPLOAD_SIZE);
    const uploadList = files.filter(f => f.size <= MAX_UPLOAD_SIZE);
    if (tooBig.length > 0) {
        await winAlert(`${tooBig.length} fil(er) sprunget over - for store (max 100MB):\n${tooBig.map(f => f.name).join('\n')}`, 'For store filer');
    }
    if (uploadList.length === 0) return;

    enqueueUploads(uploadList.map(f => ({ file: f, folderId: currentFolderId })));
}

// ============================================================
// Upload-kø med fremdriftspanel, konflikt-håndtering og
// upload af hele mapper (trukket ind eller via "Upload mappe").
// Regler: max 2 samtidige uploads; filer > 20 MB kører alene
// (Render-serveren har kun 512 MB RAM).
// ============================================================
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // matcher multer-grænsen
const BIG_FILE_SIZE = 20 * 1024 * 1024;
const MAX_UPLOAD_DEPTH = 12;
const MAX_UPLOAD_FILES = 1000;
let uploadQueue = [];
let activeUploads = 0;
let conflictChoiceAll = null; // husker "gælder alle" i en navnekonflikt
let uploadBatchCounter = 0;

window.addEventListener('beforeunload', function (e) {
    if (activeUploads > 0 || uploadQueue.length > 0) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Globalt sikkerhedsnet: drop af filer fra computeren uden for et gyldigt slip-mål
// må aldrig få browseren til at navigere væk eller åbne filen.
window.addEventListener('dragover', function (e) {
    const dt = e.dataTransfer;
    if (dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') !== -1) e.preventDefault();
});
window.addEventListener('drop', function (e) {
    const dt = e.dataTransfer;
    if (dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') !== -1) e.preventDefault();
});

function ensureProgressPanel() {
    let panel = document.getElementById('uploadProgressPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'uploadProgressPanel';
        document.body.appendChild(panel);
    }
    panel.style.display = 'block';
    return panel;
}

function addProgressRow(job) {
    const panel = ensureProgressPanel();
    const row = document.createElement('div');
    row.className = 'upload-row';
    row.id = 'uprow-' + job.rowId;
    row.innerHTML =
        '<div class="upload-row-name" title="' + escapeFileName(job.file.name) + '">' + escapeFileName(job.file.name) + '</div>' +
        '<div class="upload-bar"><div class="upload-bar-fill" style="width:0%"></div></div>' +
        '<button class="upload-row-close" title="Skjul">&times;</button>';
    row.querySelector('.upload-row-close').onclick = function () { row.remove(); };
    panel.appendChild(row);
    return row;
}

function setProgress(job, pct) {
    const row = document.getElementById('uprow-' + job.rowId);
    if (row) {
        const fill = row.querySelector('.upload-bar-fill');
        if (fill) fill.style.width = Math.round(pct * 100) + '%';
    }
}

function finishProgressRow(job, ok) {
    const row = document.getElementById('uprow-' + job.rowId);
    if (row) {
        const fill = row.querySelector('.upload-bar-fill');
        if (fill) {
            fill.style.width = '100%';
            fill.style.background = ok ? 'var(--color-success, #16a34a)' : 'var(--color-danger, #dc2626)';
        }
        row.classList.add(ok ? 'upload-done' : 'upload-failed');
        setTimeout(function () { row.remove(); }, ok ? 4000 : 12000);
    }
}

// --- Upload af hele mapper (knap og træk-ind) ---

function onUploadFolderClick() {
    try {
        const input = document.getElementById('fileExplorerFolderUpload');
        if (!input) return;
        if (!input.webkitdirectory) {
            // Fallback på mobil/netsider uden webkitdirectory: brug almindelig upload
            winAlert('Din browser understøtter ikke upload af hele mapper. Vælg filerne enkeltvis i stedet.', 'Ikke understøttet');
            document.getElementById('fileExplorerUpload').click();
            return;
        }
        input.click();
    } catch (err) {
        console.error('Upload mappe-klik fejlede:', err);
        winAlert('Kunne ikke åbne mappevælgeren: ' + err.message, 'Fejl');
    }
}

async function uploadFolderFromExplorer(event) {
    try {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;
        const baseFolder = currentFolderId || null;
        await ingestIncomingFiles(files, baseFolder, true);
    } catch (err) {
        console.error('Upload af mappe fejlede:', err);
        await winAlert('Upload fejlede: ' + err.message, 'Fejl');
    }
}

// Trukket ind fra computeren: kaldes fra handleFolderDrop når dataTransfer har filer
async function handleExternalDrop(event, folderId) {
    const items = event.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
        const entries = [];
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
            if (entry) entries.push(entry);
        }
        console.debug('[upload-drop] entries fundet:', entries.map(function (e) { return e.name + '(' + e.kind + ')'; }).join(', ') || 'INGEN');
        if (entries.length > 0) {
            const tree = { dirs: [], files: [] };
            const skipped = { count: 0 };
            for (const entry of entries) {
                await collectEntry(entry, '', tree, 0, skipped);
            }
            if (tree.files.length === 0) {
                await winAlert('Der var ingen gyldige filer at uploade.', 'Intet at uploade');
                return;
            }
            await confirmAndUploadTree(tree, folderId, skipped.count);
            return;
        }
    }
    // Fallback: kun flade filer (ingen mappestruktur)
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;
    await ingestIncomingFiles(files, folderId, false);
}

function isJunkFileName(name) {
    const lower = (name || '').toLowerCase();
    if (lower === '.ds_store' || lower === 'thumbs.db' || lower === 'desktop.ini') return true;
    if (lower.startsWith('.')) return true;
    if (/~$/.test(lower)) return true;
    return false;
}

// Rekursiv indlæsning af FileSystemEntry-træ (readEntries i batches af 100)
function readAllEntries(reader) {
    return new Promise(function (resolve, reject) {
        const all = [];
        (function readBatch() {
            reader.readEntries(function (entries) {
                if (entries.length === 0) return resolve(all);
                all.push.apply(all, entries);
                readBatch();
            }, reject);
        })();
    });
}

async function collectEntry(entry, relPath, tree, depth, skipped) {
    if (depth > MAX_UPLOAD_DEPTH) { skipped.count++; return; }
    if (tree.files.length >= MAX_UPLOAD_FILES) { skipped.count++; return; }
    if (isJunkFileName(entry.name)) { skipped.count++; return; }
    if (entry.isFile) {
        const file = await new Promise(function (resolve, reject) {


            entry.file(resolve, reject);
        });
        if (file.size === 0 || file.size > MAX_UPLOAD_SIZE) { skipped.count++; return; }
        tree.files.push({ file: file, relPath: relPath });
    } else if (entry.isDirectory) {
        const dirPath = relPath ? relPath + '/' + entry.name : entry.name;
        tree.dirs.push(dirPath);
        const children = await readAllEntries(entry.createReader());
        for (const child of children) {
            await collectEntry(child, dirPath, tree, depth + 1, skipped);
        }
    }
}

// Fra webkitdirectory-input: brug webkitRelativePath til at bygge samme træ
async function ingestIncomingFiles(files, folderId, hasRelPaths) {
    const tree = { dirs: [], files: [] };
    const skipped = { count: 0 };
    for (const f of files) {
        if (isJunkFileName(f.name)) { skipped.count++; continue; }
        if (f.size === 0 || f.size > MAX_UPLOAD_SIZE) { skipped.count++; continue; }
        let rel = '';
        if (hasRelPaths && f.webkitRelativePath) {
            const parts = f.webkitRelativePath.split('/');
            parts.pop(); // selve filnavnet
            rel = parts.join('/');
        }
        if (rel) {
            const segs = rel.split('/');
            for (let i = 1; i <= segs.length; i++) {
                const p2 = segs.slice(0, i).join('/');
                if (p2 && tree.dirs.indexOf(p2) === -1) tree.dirs.push(p2);
            }
        }
        tree.files.push({ file: f, relPath: rel });
    }
    if (tree.files.length === 0) {
        await winAlert('Der var ingen gyldige filer at uploade.', 'Intet at uploade');
        return;
    }
    await confirmAndUploadTree(tree, folderId, skipped.count);
}

async function ensureFolderPath(relPath, baseFolderId) {
    if (!relPath) return baseFolderId;
    const segs = relPath.split('/');
    let parentId = baseFolderId;
    for (const seg of segs) {
        if (!seg) continue;
        const resp = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('token')
            },
            body: JSON.stringify({ name: seg, parent_id: parentId, reuse_existing: true })
        });
        if (!resp.ok) {
            const e = await resp.json().catch(function () { return {}; });
            throw new Error(e.error || 'Kunne ikke oprette mappe "' + seg + '"');
        }
        const folder = await resp.json();
        parentId = folder.id;
    }
    return parentId;
}

async function confirmAndUploadTree(tree, folderId, skippedCount) {
    const targetFolder = folderId ? allFolders.find(function (f) { return f.id === folderId; }) : null;
    const targetName = targetFolder ? ('"' + folderDisplayName(targetFolder) + '"') : '"Mine filer"';
    let msg = 'Upload ' + tree.files.length + ' filer';
    if (tree.dirs.length > 0) msg += ' og ' + tree.dirs.length + ' mapper';
    msg += ' til ' + targetName + '?';
    if (skippedCount > 0) msg += '\n\n' + skippedCount + ' element(er) springes over (tomme, for store eller systemfiler).';

    const ok = await showWindowsDialog('Upload', msg, '?', [
        { text: 'Upload', value: 'ok' },
        { text: 'Annuller', value: null }
    ]);
    if (ok !== 'ok') return;

    conflictChoiceAll = null; // nulstil "gælder alle" pr. session

    // Opret mappestrukturen først (eksisterende mappenavne genbruges)
    const jobs = [];
    try {
        const dirIds = {};
        for (const dir of tree.dirs) {
            dirIds[dir] = await ensureFolderPath(dir, folderId);
        }
        let seq = 0;
        for (const item of tree.files) {
            const target = item.relPath ? dirIds[item.relPath] : folderId;
            jobs.push({ file: item.file, folderId: target, batchSeq: seq++ });
        }
    } catch (err) {
        await winAlert('Kunne ikke oprette mapper: ' + err.message, 'Fejl');
        return;
    }

    enqueueUploads(jobs);
}



function xhrUploadFile(file, folderId, onProgress) {
    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/files/upload');
        xhr.setRequestHeader('Authorization', 'Bearer ' + sessionStorage.getItem('token'));
        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
        xhr.onload = function () {
            let result = {};
            try { result = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) resolve(result);
            else reject(new Error(result.error || 'Serverfejl (' + xhr.status + ')'));
        };
        xhr.onerror = function () { reject(new Error('Netværksfejl')); };
        const fd = new FormData();
        fd.append('file', file);
        if (folderId) fd.append('folder_id', folderId);
        xhr.send(fd);
    });
}

// Løbende spørgsmål ved navnekonflikt i mål-mappen.
// Svar "gælder alle" huskes resten af denne upload-session.
async function resolveNameConflict(fileName, folderId) {
    if (conflictChoiceAll) return conflictChoiceAll;
    const existing = allFiles.find(function (f) {
        return f.original_name === fileName && f.folder_id === folderId;
    });
    if (!existing) return null; // ingen konflikt

    const choice = await showWindowsDialog('Navnekonflikt',
        'Der findes allerede en fil ved navn "' + fileName + '" her.\nHvad vil du gøre?', '?', [
            { text: 'Behold begge', value: 'both' },
            { text: 'Spring over', value: 'skip' },
            { text: 'Erstat', value: 'replace' },
            { text: 'Behold begge (alle)', value: 'both-all' },
            { text: 'Spring over (alle)', value: 'skip-all' },
            { text: 'Erstat (alle)', value: 'replace-all' }
        ]);
    if (choice === null) return 'skip';
    if (choice.endsWith('-all')) {
        conflictChoiceAll = choice.slice(0, -4);
        return conflictChoiceAll;
    }
    return choice;
}

async function deleteExistingFile(fileId) {
    const resp = await fetch('/api/files/' + fileId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('token') }
    });
    if (!resp.ok) {
        const e = await resp.json().catch(function () { return {}; });
        throw new Error(e.error || 'Kunne ikke slette den eksisterende fil');
    }
}

// Tilføj filer til køen og start arbejdet
function enqueueUploads(jobs, batch) {
    if (!jobs || jobs.length === 0) return;
    if (!batch) {
        batch = { id: ++uploadBatchCounter, total: jobs.length, done: 0, ok: 0, skipped: 0, failed: [] };
    }
    jobs.forEach(function (job, i) {
        if (job.batchSeq === undefined) job.batchSeq = i;
        job.batch = batch;
        job.rowId = batch.id + '-' + job.batchSeq;
        uploadQueue.push(job);
    });
    ensureProgressPanel();
    pumpUploadQueue();
}

function pumpUploadQueue() {
    while (activeUploads < 2 && uploadQueue.length > 0) {
        // Filer > 20 MB kører kun alene (512 MB RAM på serveren)
        const idx = uploadQueue.findIndex(function (j) {
            return activeUploads === 0 || j.file.size <= BIG_FILE_SIZE;
        });
        if (idx === -1) break;
        const job = uploadQueue.splice(idx, 1)[0];
        activeUploads++;
        runUploadJob(job).finally(function () {
            activeUploads--;
            pumpUploadQueue();
        });
    }
}

async function runUploadJob(job) {
    addProgressRow(job);
    setProgress(job, 0);
    try {
        const conflict = await resolveNameConflict(job.file.name, job.folderId);
        if (conflict === 'skip') {
            job.batch.skipped++;
            finishProgressRow(job, true);
        } else {
            if (conflict === 'replace') {
                const existing = allFiles.find(function (f) {
                    return f.original_name === job.file.name && f.folder_id === job.folderId;
                });
                if (existing) await deleteExistingFile(existing.id);
            }
            await xhrUploadFile(job.file, job.folderId, function (pct) { setProgress(job, pct); });
            job.batch.ok++;
            finishProgressRow(job, true);
        }
    } catch (err) {
        console.error('Upload error:', job.file.name, err);
        job.batch.failed.push(job.file.name + ': ' + err.message);
        finishProgressRow(job, false);
    } finally {
        job.batch.done++;
        if (job.batch.done === job.batch.total) finishUploadBatch(job.batch);
    }
}

async function finishUploadBatch(batch) {
    await loadRealFiles();
    let msg = batch.ok + ' af ' + batch.total + ' filer uploadet.';
    if (batch.skipped > 0) msg += '\n' + batch.skipped + ' sprunget over.';
    if (batch.failed.length > 0) msg += '\n\nFejlede:\n' + batch.failed.join('\n');
    if (batch.total === 1 && batch.ok === 1) {
        await winAlert('Filen blev uploadet succesfuldt!', 'Succes');
    } else if (batch.failed.length > 0 || batch.skipped > 0 || batch.total > 1) {
        await winAlert(msg, batch.failed.length === 0 ? 'Succes' : 'Delvist gennemført');
    }
}


async function openRealFile(fileId) {


    const file = findFileAnywhere(fileId);
    if (!file) return;
    
    const ext = file.original_name.split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'bmp', 'webp'];
    
    if (imageExtensions.includes(ext)) {
        await previewImage(fileId, file.original_name);
    } else {
        await winAlert(`<strong>Navn:</strong> ${file.original_name}<br><br><strong>Størrelse:</strong> ${formatFileSize(file.file_size)}<br><strong>Type:</strong> ${getFileType(file.original_name)}<br><strong>Uploadet af:</strong> ${file.uploader_name}<br><strong>Dato:</strong> ${new Date(file.created_at).toLocaleString('da-DK')}`, 'Fil');
    }
}

async function previewImage(fileId, filename) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/files/download/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load image');
        
        const blob = await response.blob();
        const typedBlob = new Blob([blob], { type: getImageMime(filename) || blob.type });
        const url = window.URL.createObjectURL(typedBlob);
        
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        modalImg.src = url;
        modalImg.alt = filename;
        modal.style.display = 'flex';
        
        modal.addEventListener('click', function cleanup() {
            window.URL.revokeObjectURL(url);
            modal.removeEventListener('click', cleanup);
        }, { once: true });
    } catch (error) {
        console.error('Preview error:', error);
        await winAlert('Kunne ikke vise billede: ' + error.message, 'Fejl');
    }
}

async function downloadRealFile(fileId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/files/download/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const file = findFileAnywhere(fileId);
        const typedBlob = new Blob([blob], { type: getImageMime(file.original_name) || blob.type });
        const url = window.URL.createObjectURL(typedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.original_name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Download error:', error);
        await winAlert('Download fejlede: ' + error.message, 'Fejl');
    }
}

async function deleteSelected() {
    if (!selectedFileId) {
        await winAlert('Vælg en fil først');
        return;
    }

    const meId = getCurrentUserId();
    const token = sessionStorage.getItem('token');
    const ownFile = allFiles.find(f => f.id === selectedFileId);
    const sharedFile = sharedFilesCache.find(f => f.id === selectedFileId);

    // Fil andre har delt med MIG: fjern kun min adgang - filen røres ikke
    if (!ownFile && sharedFile) {
        if (!await winConfirm('Fjern "' + sharedFile.original_name + '" fra dine delte filer?\nFilen slettes ikke og forbliver hos ejeren.', 'Fjern deling')) return;
        try {
            const response = await fetch('/api/files/' + selectedFileId + '/share/' + meId, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Kunne ikke fjerne deling');
            }
            selectedFileId = null;
            sharedFilesCache = await loadSharedFiles();
            renderRealFiles();
        } catch (error) {
            console.error('Unshare error:', error);
            await winAlert('Fejl: ' + error.message, 'Fejl');
        }
        return;
    }

    if (!ownFile) return;

    if (!await winConfirm('ADVARSEL: Filen "' + ownFile.original_name + '" slettes permanent.\nDen forsvinder også fra "Alle filer" og hos dem, du har delt den med. Fortsæt?', 'Slet fil')) return;

    try {
        const response = await fetch('/api/files/' + selectedFileId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }

        await winAlert('Filen er slettet', 'Succes');
        selectedFileId = null;
        if (currentFilter === 'shared') {
            sharedFilesCache = await loadSharedFiles();
        }
        await loadRealFiles();
    } catch (error) {
        console.error('Delete error:', error);
        await winAlert('Slet fejlede: ' + error.message, 'Fejl');
    }
}

function downloadFile() {
    if (selectedFileId) {
        downloadRealFile(selectedFileId);
    } else {
        winAlert('Vælg en fil først');
    }
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '', 'doc': '', 'docx': '',
        'xls': '', 'xlsx': '', 'ppt': '', 'pptx': '',
        'jpg': '', 'jpeg': '', 'png': '', 'gif': '',
        'zip': '', 'rar': '', 'txt': '',
        'html': '', 'css': '', 'js': ''
    };
    return icons[ext] || '';
}

function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'pdf': 'PDF-dokument', 'doc': 'Word-dokument', 'docx': 'Word-dokument',
        'xls': 'Excel-regneark', 'xlsx': 'Excel-regneark',
        'ppt': 'PowerPoint', 'pptx': 'PowerPoint',
        'jpg': 'JPEG-billede', 'jpeg': 'JPEG-billede', 
        'png': 'PNG-billede', 'gif': 'GIF-billede',
        'zip': 'ZIP-arkiv', 'txt': 'Tekstdokument'
    };
    return types[ext] || 'Fil';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

async function loadFolders() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/folders', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load folders');
        allFolders = await response.json();
    } catch (error) {
        console.error('Error loading folders:', error);
        allFolders = [];
    }
}

function openFolder(folderId, folderName) {
    currentFolderId = folderId;
    currentFolderName = folderName;
    currentFilter = 'folder';
    selectedFileId = null; // ryd markering ved mappeskift
    renderFolderTree();
    renderRealFiles();
}

async function showNewFolderDialog() {
    const folderName = await winPrompt('Indtast mappenavn:', '', 'Ny mappe');
    if (!folderName || !folderName.trim()) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: folderName.trim(),
                parent_id: currentFolderId
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create folder');
        }
        
        await winAlert(`Mappe "${folderName}" oprettet`, "Succes");
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create folder error:', error);
        await winAlert('Kunne ikke oprette mappe: ' + error.message, 'Fejl');
    }
}

function searchFiles() {
    const input = document.getElementById('filesSearch');
    if (input) {
        input.focus();
        return;
    }
    winPrompt('Søg filer:').then(function (query) {
        if (query === null) return;
        filesSearchQuery = query.trim();
        renderRealFiles();
    });
}

let selectedFolderId = null;
let selectedFolderName = '';

// File context menu
function showContextMenu(event, fileId) {
    event.preventDefault();
    selectRealFile(fileId);
    selectedFolderId = null; // Sæt ind fra fil-menu går til den aktuelle visning
    const ctxCut = document.getElementById("ctxCut");
    if (ctxCut) ctxCut.style.display = "";
    const ctxCopy = document.getElementById("ctxCopy");
    if (ctxCopy) ctxCopy.style.display = "";
    const ctxPaste = document.getElementById("ctxPasteFile");
    if (ctxPaste) ctxPaste.style.display = fileClipboard ? "" : "none";
    
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    return false;
}

// Folder context menu
function showFolderContextMenu(event, folderId, folderName) {
    event.preventDefault();
    event.stopPropagation();
    const fp = document.getElementById("ctxFolderPaste");
    if (fp) fp.style.display = fileClipboard ? "" : "none";
    
    selectedFolderId = folderId;
    selectedFolderName = folderName;
    
    // Rettigheder: top-"Fælles filer" må kun omdøbes/flyttes/slettes af admins.
    // Undermapper i Fælles filer: kun creator eller admin.
    const folder = allFolders.find(f => f.id === folderId);
    const me = JSON.parse(sessionStorage.getItem('currentUser') || 'null') || window.currentUser || {};
    const isAdmin = !!me.is_admin;
    const isOwner = !!(folder && folder.created_by === getCurrentUserId());
    const isPrimaryTop = folder && folder.id === (getPrimaryCompanyFolder() || {}).id;
    const canManage = folder ? (!me.id ? true : (isAdmin || (isPrimaryTop ? false : isOwner))) : true;
    
    const setItem = (id, show) => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? '' : 'none';
    };
    setItem('ctxFolderRename', canManage);
    setItem('ctxFolderDelete', canManage);
    setItem('ctxFolderMove', canManage);
    
    const folderContextMenu = document.getElementById('folderContextMenu');
    folderContextMenu.style.display = 'block';
    folderContextMenu.style.left = event.pageX + 'px';
    folderContextMenu.style.top = event.pageY + 'px';
    
    return false;
}

// Create subfolder
async function createSubfolder() {
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) folderContextMenu.style.display = 'none';
    
    const folderName = await winPrompt('Indtast mappenavn:', '', 'Ny undermappe');
    if (!folderName || !folderName.trim()) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: folderName.trim(),
                parent_id: selectedFolderId
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create folder');
        }
        
        await winAlert(`Mappe "${folderName}" oprettet`, 'Succes');
        expandedFolders.add(selectedFolderId); // Auto-expand parent
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create folder error:', error);
        await winAlert('Kunne ikke oprette mappe: ' + error.message, 'Fejl');
    }
}

// Rename folder
async function renameFolderSelected() {
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) folderContextMenu.style.display = 'none';
    
    const newName = await winPrompt('Indtast nyt mappenavn:', selectedFolderName, 'Omdøb mappe');
    if (!newName || !newName.trim() || newName === selectedFolderName) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/folders/${selectedFolderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: newName.trim() })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to rename folder');
        }
        
        await winAlert(`Mappe omdøbt til "${newName}"`, 'Succes');
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Rename folder error:', error);
        await winAlert('Kunne ikke omdøbe mappe: ' + error.message, 'Fejl');
    }
}

// Taeller mapper og filer i et helt mappe-trae (bruges foer rekursiv sletning)
function countFolderTreeContents(rootId) {
    let folders = 0, files = 0;
    const stack = [rootId];
    while (stack.length) {
        const id = stack.pop();
        folders++;
        allFolders.forEach(function (f) { if (f.parent_id === id) stack.push(f.id); });
        files += allFiles.filter(function (x) { return x.folder_id === id; }).length;
    }
    return { folders: folders, files: files };
}

// Delete folder
async function deleteFolderSelected() {
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) folderContextMenu.style.display = 'none';
    
        const folder = allFolders.find(f => f.id === selectedFolderId);
    const counts = folder ? countFolderTreeContents(folder.id) : { folders: 0, files: 0 };
    const isEmpty = folder && counts.folders <= 1 && counts.files === 0;
    const confirmMsg = isEmpty
        ? `Er du sikker på, at du vil slette mappen "${selectedFolderName}"?`
        : `Vil du virkelig slette mappen "${selectedFolderName}" og ALT indhold?\n\n${counts.folders - 1} undermapper og ${counts.files} filer slettes permanent.\nDette kan ikke fortrydes.`;
    if (!await winConfirm(confirmMsg, 'Slet mappe')) return;

    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/folders/${selectedFolderId}?recursive=true`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        await winAlert('Mappe slettet', 'Succes');
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Delete folder error:', error);
        await winAlert('Slet fejlede: ' + error.message, 'Fejl');
    }
}

// Show folder properties
function showFolderProperties() {
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) folderContextMenu.style.display = 'none';
    
    const folder = allFolders.find(f => f.id === selectedFolderId);
    if (!folder) return;
    
    const fileCount = allFiles.filter(f => f.folder_id === folder.id).length;
    const subfolderCount = allFolders.filter(f => f.parent_id === folder.id).length;
    
    winAlert(
        `<strong>Navn:</strong> ${folder.name}<br><br>` +
        `<strong>Filer:</strong> ${fileCount}<br>` +
        `<strong>Undermapper:</strong> ${subfolderCount}<br><br>` +
        `<strong>Oprettet af:</strong> ${folder.creator_name}<br>` +
        `<strong>Oprettet:</strong> ${new Date(folder.created_at).toLocaleString('da-DK')}`,
        'Mappeegenskaber'
    );
}

// Transfer file to order
async function transferToOrder() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    
    if (!selectedFileId) {
        await winAlert('Vælg en fil først');
        return;
    }
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    const orderNumber = await winPrompt(`Overfør "${file.original_name}" til ordre — indtast ordrenummer:`, '', 'Overfør til ordre');
    if (!orderNumber || !orderNumber.trim()) {
        await winAlert('Ordrenummer er påkrævet.\nDu skal indtaste et ordrenummer for at overføre filen.', 'Mangler ordrenummer');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/files/${selectedFileId}/transfer-to-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ order_number: orderNumber.trim() })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Transfer failed');
        }
        
        await winAlert(`${result.message}\nOrdre: ${result.order.title}`, 'Succes');
        
    } catch (error) {
        console.error('Transfer error:', error);
        await winAlert('Overførsel fejlede: ' + error.message, 'Fejl');
    }
}

document.addEventListener('click', function() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) {
        folderContextMenu.style.display = 'none';
    }
});

function refreshExplorer() { 
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    loadRealFiles(); 
}

function navigateBack() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';

    if (currentFilter === 'folder' && currentFolderId) {
        const folder = allFolders.find(f => f.id === currentFolderId);
        const parentId = folder && folder.parent_id ? folder.parent_id : null;
        if (parentId) {
            const parent = allFolders.find(f => f.id === parentId);
            openFolder(parentId, parent ? parent.name : '');
            return;
        }
    }
    currentFolderId = null;
    currentFolderName = '';
    currentFilter = 'all';
    renderFolderTree();
    renderRealFiles();
}

function navigateUp() {
    navigateBack();
}

// --- Klip / Kopiér / Sæt ind (trin a3) ---
let fileClipboard = null; // { mode: "copy" | "cut", fileId }

function hideFileContextMenus() {
    const cm = document.getElementById("contextMenu");
    if (cm) cm.style.display = "none";
    const fcm = document.getElementById("folderContextMenu");
    if (fcm) fcm.style.display = "none";
}

function clearCutStyling() {
    document.querySelectorAll(".cut-pending").forEach(function (el) { el.classList.remove("cut-pending"); });
}

function cutSelected() {
    hideFileContextMenus();
    if (!selectedFileId) { winAlert("Vælg en fil først"); return; }
    fileClipboard = { mode: "cut", fileId: selectedFileId };
    clearCutStyling();
    document.querySelectorAll("[data-file-id=" + JSON.stringify(String(selectedFileId)) + "]").forEach(function (el) { el.classList.add("cut-pending"); });
}

function copySelected() {
    hideFileContextMenus();
    if (!selectedFileId) { winAlert("Vælg en fil først"); return; }
    fileClipboard = { mode: "copy", fileId: selectedFileId };
}

function cancelCut() {
    if (fileClipboard && fileClipboard.mode === "cut") {
        fileClipboard = null;
        clearCutStyling();
    }
}

function currentPasteTarget() {
    if (selectedFolderId !== null && selectedFolderId !== undefined) {
        const f = allFolders.find(function (x) { return x.id === selectedFolderId; });
        return { id: selectedFolderId, name: f ? folderDisplayName(f) : selectedFolderName, company: !!(f && isInCompanyTreeClient(f)) };
    }
    if (currentFilter === "folder" && currentFolderId) {
        const f2 = allFolders.find(function (x) { return x.id === currentFolderId; });
        return { id: currentFolderId, name: f2 ? folderDisplayName(f2) : "mappen", company: !!(f2 && isInCompanyTreeClient(f2)) };
    }
    return { id: null, name: "Mine filer", company: false };
}

function friendlyFileError(msg) {
    if (/Permission denied/i.test(msg || "")) return "Du har ikke tilladelse til det. Kun den, der uploadede filen (eller en administrator), kan gøre dette.";
    return msg;
}

async function pasteClipboard() {
    hideFileContextMenus();
    if (!fileClipboard) { await winAlert("Der er intet at indsætte"); return; }
    const file = findFileAnywhere(fileClipboard.fileId);
    if (!file) { fileClipboard = null; clearCutStyling(); await winAlert("Filen findes ikke længere", 'Fejl'); return; }
    const target = currentPasteTarget();
    const meId = getCurrentUserId();
    if (fileClipboard.mode === "cut" && file.uploaded_by !== meId) {
        await winAlert("Du kan kun flytte filer, du selv har uploadet (eller er administrator).", 'Ikke tilladt');
        return;
    }
    if (target.company && fileClipboard.mode === "copy" && !await winConfirm("Filen bliver synlig for alle med adgang til Fælles filer. Fortsæt?", 'Del med alle')) return;
    const token = sessionStorage.getItem("token");
    try {
        let resp;
        const isCopy = fileClipboard.mode === "copy";
        if (isCopy) {
            resp = await fetch("/api/files/" + file.id + "/copy", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                body: JSON.stringify({ folder_id: target.id })
            });
        } else {
            resp = await fetch("/api/files/" + file.id + "/move", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                body: JSON.stringify({ folder_id: target.id })
            });
        }
        if (!resp.ok) {
            const err = await resp.json().catch(function () { return {}; });
            throw new Error(friendlyFileError(err.error || "Handlingen fejlede"));
        }
        let data = {};
        try { data = await resp.json(); } catch (e2) { data = {}; }
        fileClipboard = null;
        clearCutStyling();
        selectedFolderId = null;
        await loadRealFiles();
        if (isCopy) {
            if (data.final_name && data.final_name !== file.original_name) {
                await winAlert("Kopieret som \"" + data.final_name + "\"", 'Succes');
            } else {
                await winAlert("Kopieret til \"" + target.name + "\"", 'Succes');
            }
        } else {
            await winAlert("Flyttet til \"" + target.name + "\"", 'Succes');
        }
    } catch (error) {
        console.error("Paste error:", error);
        await winAlert(error.message, 'Fejl');
    }
}

function openSelectedFile() { 
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    if (selectedFileId) openRealFile(selectedFileId); 
}

async function renameSelected() { 
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    
    if (!selectedFileId) {
        winAlert('Vælg en fil først');
        return;
    }
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    // Get current extension
    const currentExt = file.original_name.includes('.') 
        ? '.' + file.original_name.split('.').pop() 
        : '';
    
    const newName = await winPrompt('Omdøb fil:', file.original_name, 'Omdøb');
    if (!newName || newName.trim() === '' || newName === file.original_name) return;
    
    // Ensure extension is preserved
    let finalName = newName.trim();
    
    // If new name doesn't have the same extension, add it
    if (currentExt && !finalName.toLowerCase().endsWith(currentExt.toLowerCase())) {
        finalName = finalName + currentExt;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/files/${selectedFileId}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ new_name: finalName })
        });
        
        if (!response.ok) {
            let errorMsg = 'Rename failed';
            try {
                const error = await response.json();
                errorMsg = error.error || errorMsg;
            } catch (e) {
                errorMsg = `Server error: ${response.status}`;
            }
            throw new Error(errorMsg);
        }
        
        await winAlert(`Fil omdøbt til "${finalName}"`, 'Succes');
        await loadRealFiles();
        
    } catch (error) {
        console.error('Rename error:', error);
        winAlert('Omdøb fejlede: ' + error.message, 'Fejl');
    }
}

async function shareFile() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    
    if (!selectedFileId) {
        await winAlert('Vælg en fil først');
        return;
    }
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    // Moderne prompt-dialog for email
    const email = await winPrompt(`Del "${file.original_name}" med — indtast brugerens email:`, '', 'Del med kollega');
    if (!email || !email.trim()) return;
    
    try {
        const token = sessionStorage.getItem('token');
        
        // Find bruger ved email
        const usersResponse = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!usersResponse.ok) throw new Error('Kunne ikke hente brugere');
        
        const users = await usersResponse.json();
        const targetUser = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
        
        if (!targetUser) {
            await winAlert('Bruger ikke fundet. Tjek emailen og prøv igen.', 'Fejl');
            return;
        }
        
        // Share file via backend API
        const shareResponse = await fetch(`/api/files/${selectedFileId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: targetUser.id,
                permission: 'view'
            })
        });
        
        if (!shareResponse.ok) {
            const error = await shareResponse.json();
            throw new Error(error.error || 'Kunne ikke dele fil');
        }
        
        await winAlert(`Fil "${file.original_name}" delt med ${targetUser.name}!`, 'Succes');
        // Opdater detaljepanelet saa "Delt med:"-linjen og "Stop deling" vises med det samme
        renderFileDetails();
        
    } catch (error) {
        console.error('Share error:', error);
        await winAlert('Kunne ikke dele fil: ' + error.message, 'Fejl');
    }
}

function showProperties() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    
    if (!selectedFileId) { 
        winAlert('Vælg en fil først'); 
        return; 
    }
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    const size = formatFileSize(file.file_size);
    const type = getFileType(file.original_name);
    const icon = getFileIcon(file.original_name);
    const uploadDate = new Date(file.created_at);
    
    winAlert(
        `<strong>Navn:</strong> ${file.original_name}<br><br>` +
        `<strong>Type:</strong> ${type}<br>` +
        `<strong>Størrelse:</strong> ${size} (${file.file_size.toLocaleString()} bytes)<br><br>` +
        `<strong>Uploadet af:</strong> ${file.uploader_name}<br>` +
        `<strong>Uploadet:</strong> ${uploadDate.toLocaleString('da-DK')}<br><br>` +
        `<strong>Fil ID:</strong> ${file.id}`,
        `${icon} Fil Egenskaber`
    );
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';
}

// ============================================================
// Drag & drop i Filer (internt flyt/kopiér)
// - Flervalg: markerede filer (checkbox) følger med i trækket
// - Almindeligt træk = flyt, Ctrl/Cmd = kopiér
// - Mapper i træ, fillisten, gitter og brødkrumme er slip-mål
// - Ugyldigt mål = forbudt-markør og ingen gul ramme
// - Mapper foldes ud efter ca. 600 ms hover; Esc annullerer
// ============================================================
let draggedIds = [];       // id'er under træk (flere filer eller én mappe)
let draggedKind = null;    // 'files' | 'folder'
let dragIsCopy = false;    // Ctrl/Cmd = kopiér
let dragCancelled = false;
let hoverExpandTimer = null;
const checkedFileIds = new Set(); // husker afkrydsede filer på tværs af renders

function resetDragState() {
    draggedIds = [];
    draggedKind = null;
    dragIsCopy = false;
    dragCancelled = false;
    cancelExpandTimer();
    clearDropMarks();
}

function cancelExpandTimer() {
    if (hoverExpandTimer) { clearTimeout(hoverExpandTimer); hoverExpandTimer = null; }
}

function clearDropMarks() {
    document.querySelectorAll('.drop-target, .drop-above, .drop-below').forEach(function (el) {
        el.classList.remove('drop-target', 'drop-above', 'drop-below');
    });
}

function getCheckedFileIds() {
    const ids = [];
    document.querySelectorAll('#fileListBody input[type="checkbox"]:checked').forEach(function (cb) {
        const row = cb.closest('tr[data-file-id]');
        if (row) ids.push(Number(row.getAttribute('data-file-id')));
    });
    return ids;
}

// Lille "spøgelsesbillede" med antal ved flervalg
function makeDragGhost(text) {
    const c = document.createElement('canvas');
    c.width = 170; c.height = 34;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FEF3C7';
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2;
    if (ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(2, 2, 166, 30, 6); ctx.fill(); ctx.stroke();
    } else {
        ctx.fillRect(2, 2, 166, 30);
    }
    ctx.fillStyle = '#1A1A1A';
    ctx.font = '600 13px Inter, Arial, sans-serif';
    ctx.fillText(text, 12, 21);
    return c;
}

function meIsAdmin() {
    let u = null;
    try { u = window.currentUser || JSON.parse(sessionStorage.getItem('currentUser') || 'null'); } catch (e) { /* ignore */ }
    return !!(u && u.is_admin);
}

// Klientside-kopi af servertjekket (serveren gennemtvinger stadig 403)
function canWriteFolderClient(folder) {
    if (!folder) return true; // roden = egne filer
    return folder.created_by === getCurrentUserId() || isInCompanyTreeClient(folder) || meIsAdmin();
}

function isDescendantFolder(folderId, ancestorId) {
    let cur = allFolders.find(function (f) { return f.id === folderId; });
    let guard = 0;
    while (cur && cur.parent_id && guard++ < 50) {
        if (cur.parent_id === ancestorId) return true;
        cur = allFolders.find(function (f) { return f.id === cur.parent_id; });
    }
    return false;
}

function validateDrop(targetFolderId) {
    if (dragCancelled || !draggedKind || draggedIds.length === 0) return false;
    if (draggedKind === 'files') {
        if (targetFolderId === null || targetFolderId === undefined) return true; // Mine filer
        const target = allFolders.find(function (f) { return f.id === targetFolderId; });
        return !!target && canWriteFolderClient(target);
    }
    // Mappe-træk
    const draggedId = draggedIds[0];
    if (draggedId === targetFolderId) return false;
    if (targetFolderId === null || targetFolderId === undefined) return true; // rodniveau
    const target = allFolders.find(function (f) { return f.id === targetFolderId; });
    if (!target) return false;
    if (isDescendantFolder(targetFolderId, draggedId)) return false;
    return canWriteFolderClient(target);
}

function markDropZone(el, zone) {
    if (!el || !el.classList) return;
    el.classList.remove('drop-target', 'drop-above', 'drop-below');
    if (zone === 'inside') el.classList.add('drop-target');
    else if (zone === 'before') el.classList.add('drop-above');
    else if (zone === 'after') el.classList.add('drop-below');
}

// Fold lukket mappe ud efter ca. 600 ms hover
function scheduleExpand(folderId) {
    if (expandedFolders.has(folderId)) return;
    const hasChildren = allFolders.some(function (f) { return f.parent_id === folderId; });
    if (!hasChildren) return;
    cancelExpandTimer();
    hoverExpandTimer = setTimeout(function () {
        hoverExpandTimer = null;
        expandedFolders.add(folderId);
        persistExpandedFolders();
        renderFolderTree();
    }, 600);
}

// Esc afbryder et igangværende træk
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && draggedKind) {
        dragCancelled = true;
        cancelExpandTimer();
        clearDropMarks();
    }
});

function handleFileDragStart(event, fileId) {
    const checked = getCheckedFileIds();
    draggedIds = checked.indexOf(Number(fileId)) !== -1 ? checked : [Number(fileId)];
    draggedKind = 'files';
    dragIsCopy = !!(event.ctrlKey || event.metaKey);
    dragCancelled = false;
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', 'files:' + draggedIds.join(','));
    const n = draggedIds.length;
    try { event.dataTransfer.setDragImage(makeDragGhost(n > 1 ? n + ' filer' : '1 fil'), 10, 10); } catch (e) { /* ignore */ }
    event.target.style.opacity = '0.6';
    event.target.addEventListener('dragend', resetDragState, { once: true });
}

// Mapper kan trækkes (træ, filliste, gitter) for rækkefølge og placering
function handleFolderDragStart(event, folderId) {
    draggedIds = [folderId];
    draggedKind = 'folder';
    dragIsCopy = false; // mapper kopieres ikke, kun flyt
    dragCancelled = false;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'folder:' + folderId);
    const f = allFolders.find(function (x) { return x.id === folderId; });
    try { event.dataTransfer.setDragImage(makeDragGhost((f && f.name) || 'Mappe'), 10, 10); } catch (e) { /* ignore */ }
    event.target.style.opacity = '0.6';
    event.target.addEventListener('dragend', resetDragState, { once: true });
}

// Fælles dragover for alle slip-mål (træ, rækker, kort, brødkrumme, rod).
// Ugyldigt mål: ingen preventDefault → browserens forbudt-markør og ingen gul ramme.
function handleFolderDragOver(event, folderId, opts) {
    folderId = (folderId === undefined) ? null : folderId;

    // Trukket ind fra computeren: intern drag-state er tom, men droppet er tilladt.
    // Uden preventDefault her viser browseren den forbudte markør og drop-event fyres aldrig.
    const dt = event.dataTransfer;
    const isExternal = !draggedKind && !!dt && ((dt.files && dt.files.length > 0) ||
        (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function'));
    if (isExternal) {
        console.debug('[drag] dragover: eksternt traek genkendt over mappe', folderId);
        event.preventDefault();
        event.stopPropagation();
        if (dt) dt.dropEffect = 'copy';
        markDropZone(event.currentTarget, 'inside');
        return;
    }

    if (!draggedKind || draggedIds.length === 0) return;
    if (!validateDrop(folderId)) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        return;
    }
    event.preventDefault();
    event.stopPropagation();

    let zone = 'inside';
    if (draggedKind === 'folder' && folderId !== null) {
        const rect = event.currentTarget.getBoundingClientRect();
        const rel = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
        const isCompanyTop = !!(opts && opts.companyTop);
        if (!isCompanyTop) zone = rel < 0.25 ? 'before' : (rel > 0.75 ? 'after' : 'inside');
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = dragIsCopy ? 'copy' : 'move';
    markDropZone(event.currentTarget, zone);
    if (zone === 'inside' && folderId !== null) scheduleExpand(folderId);
    else cancelExpandTimer();
}

function handleFolderDragLeave(event) {
    event.stopPropagation();
    if (event.currentTarget && event.currentTarget.classList) {
        event.currentTarget.classList.remove('drop-target', 'drop-above', 'drop-below');
    }
    cancelExpandTimer();
}

async function handleFolderDrop(event, folderId, opts) {
    folderId = (folderId === undefined) ? null : folderId;
    cancelExpandTimer();
    clearDropMarks();
    event.preventDefault();
    event.stopPropagation();

    // Filer/mapper trukket ind fra computeren → upload (trin B).
    // Tjekkes FØRST, da eksterne træk har ingen intern drag-state.
    const dt = event.dataTransfer;
    console.debug('[drag] drop modtaget paa mappe', folderId,
        '| files:', dt && dt.files ? dt.files.length : 0,
        '| items:', dt && dt.items ? dt.items.length : 0,
        '| intern drag:', draggedKind);
    const hasExternalFiles = !!(dt && ((dt.files && dt.files.length > 0) ||
        (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function')));
    if (hasExternalFiles) {
        await handleExternalDrop(event, folderId);
        return;
    }

    if (dragCancelled || !draggedKind || draggedIds.length === 0) { resetDragState(); return; }

    const kind = draggedKind;
    const ids = draggedIds.slice();
    const isCopy = dragIsCopy;
    resetDragState();

    if (kind === 'folder') {
        await applyFolderDrop(event, ids[0], folderId, opts);
        return;
    }

    await moveOrCopyFilesToFolder(ids, folderId, isCopy);
}

// Drop paa "Mine filer" (roden)
function handleRootDragOver(event) {
    handleFolderDragOver(event, null);
}
async function handleRootDrop(event) {
    await handleFolderDrop(event, null);
}

// Hovedvinduet (filliste/gitter) er ogsaa et slipmaal: eksterne filer/mapper
// lander i den mappe der er aaben/highlightet (currentFolderId, null = Mine filer).
function handleMainDragOver(event) {
    const dt = event.dataTransfer;
    const isExternal = !draggedKind && !!dt && ((dt.files && dt.files.length > 0) ||
        (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function'));
    if (isExternal) {
        console.debug('[drag] dragover: eksternt traek genkendt i hovedvinduet (mappe', currentFolderId, ')');
        event.preventDefault();
        event.stopPropagation();
        if (dt) dt.dropEffect = 'copy';
        markDropZone(event.currentTarget, 'inside');
        return;
    }
    if (!draggedKind || draggedIds.length === 0) return;
    if (!validateDrop(currentFolderId)) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = dragIsCopy ? 'copy' : 'move';
    markDropZone(event.currentTarget, 'inside');
}

async function handleMainDrop(event) {
    cancelExpandTimer();
    clearDropMarks();
    event.preventDefault();
    event.stopPropagation();

    const dt = event.dataTransfer;
    console.debug('[drag] drop modtaget i hovedvinduet | mappe:', currentFolderId,
        '| files:', dt && dt.files ? dt.files.length : 0,
        '| items:', dt && dt.items ? dt.items.length : 0,
        '| intern drag:', draggedKind);

    // Eksterne filer/mapper fra computeren -> upload til den aabne mappe
    const hasExternalFiles = !!(dt && ((dt.files && dt.files.length > 0) ||
        (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === 'function')));
    if (hasExternalFiles) {
        await handleExternalDrop(event, currentFolderId);
        return;
    }

    // Internt traek -> flyt/kopier til den aabne mappe
    if (dragCancelled || !draggedKind || draggedIds.length === 0) { resetDragState(); return; }
    const kind = draggedKind;
    const ids = draggedIds.slice();
    const isCopy = dragIsCopy;
    resetDragState();

    if (kind === 'folder') {
        await applyFolderDrop(event, ids[0], currentFolderId, {});
        return;
    }
    await moveOrCopyFilesToFolder(ids, currentFolderId, isCopy);
}

function handleMainDragLeave(event) {
    if (event.currentTarget && event.currentTarget.classList) {
        event.currentTarget.classList.remove('drop-target');
    }
    cancelExpandTimer();
}

// Fælles filer-advarsel med "Spørg ikke igen"
async function confirmCompanyNoticeIfNeeded(targetFolder) {
    if (!targetFolder || !isInCompanyTreeClient(targetFolder)) return true;
    if (localStorage.getItem('skipCompanyNotice') === '1') return true;
    const choice = await showWindowsDialog('Fælles filer',
        'Filen bliver synlig for alle med adgang til Fælles filer.', '?', [
            { text: 'Fortsæt', value: 'ok' },
            { text: 'Fortsæt - spørg ikke igen', value: 'dontask' },
            { text: 'Annuller', value: null }
        ]);
    if (choice === 'dontask') localStorage.setItem('skipCompanyNotice', '1');
    return choice !== null;
}

// Flyt/kopiér én eller flere filer med fælles fejlrapport.
// Rettigheder tjekkes stadig på serveren pr. kald (move/copy).
async function moveOrCopyFilesToFolder(ids, folderId, isCopy) {
    if (!ids || ids.length === 0) return;
    const target = folderId ? allFolders.find(function (f) { return f.id === folderId; }) : null;
    if (target && !(await confirmCompanyNoticeIfNeeded(target))) return;

    const token = sessionStorage.getItem('token');
    let ok = 0;
    const failed = [];
    for (const id of ids) {
        const file = allFiles.find(function (f) { return f.id === id; }) || (typeof findFileAnywhere === 'function' ? findFileAnywhere(id) : null);
        if (!file) { failed.push('Ukendt fil #' + id + ': findes ikke længere'); continue; }
        if (!isCopy && file.folder_id === folderId) { ok++; continue; }
        try {
            const resp = await fetch(isCopy ? '/api/files/' + id + '/copy' : '/api/files/' + id + '/move', {
                method: isCopy ? 'POST' : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ folder_id: folderId })
            });
            if (!resp.ok) {
                const e = await resp.json().catch(function () { return {}; });
                throw new Error(e.error || ('Serverafvisning (' + resp.status + ')'));
            }
            ok++;
        } catch (err) {
            failed.push((file.original_name || 'Fil #' + id) + ': ' + err.message);
        }
    }

    await loadRealFiles();

    const verb = isCopy ? 'kopieret' : 'flyttet';
    let msg = ok + ' af ' + ids.length + ' filer ' + verb + '.';
    if (failed.length > 0) msg += '\n\nFejlede:\n' + failed.join('\n');
    if (ids.length > 1 || failed.length > 0) {
        await winAlert(msg, ok === ids.length ? (isCopy ? 'Kopieret' : 'Flyttet') : 'Delvist gennemført');
    }
}

// Mappe trukket på anden mappe: kant (25%) = rækkefølge, midt = ind i mappen, rod = rodniveau
async function applyFolderDrop(event, draggedId, folderId, opts) {
    const token = sessionStorage.getItem('token');
    const callPosition = async function (body) {
        const resp = await fetch('/api/folders/' + draggedId + '/position', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const e = await resp.json().catch(function () { return {}; });
            throw new Error(e.error || 'Kunne ikke flytte mappen');
        }
        await loadFolders();
        renderFolderTree();
        if (currentFilter === 'folder' && currentFolderId) renderRealFiles();
    };

    try {
        // Rod ("Mine filer" eller brødkrummens "Alle filer") = flyt til rodniveau
        if (folderId === null) {
            const node = allFolders.find(function (f) { return f.id === draggedId; });
            if (!node || isTopCompanyFolder(node) || !node.parent_id) return;
            await callPosition({ parent_id: null });
            return;
        }

        const target = allFolders.find(function (f) { return f.id === folderId; });
        if (!target || draggedId === folderId) return;

        const isCompanyTop = !!(opts && opts.companyTop);
        let zone = 'inside';
        if (!isCompanyTop) {
            const rect = event.currentTarget.getBoundingClientRect();
            const rel = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
            zone = rel < 0.25 ? 'before' : (rel > 0.75 ? 'after' : 'inside');
        }

        if (zone === 'inside') {
            // Midt: læg mappen IND i mål-mappen (serveren tjekker rettigheder + løkker)
            if (isDescendantFolder(folderId, draggedId)) return;
            await callPosition({ parent_id: folderId });
            return;
        }

        // Rækkefølge blandt søskende (eksisterende logik)
        if (isTopCompanyFolder(target)) return; // top-"Fælles filer" holder sin plads
        const siblings = allFolders
            .filter(function (f) { return f.parent_id === target.parent_id && f.id !== draggedId; })
            .sort(function (a, b) {
                const sa = (a.sort_order === null || a.sort_order === undefined) ? 2147483647 : a.sort_order;
                const sb = (b.sort_order === null || b.sort_order === undefined) ? 2147483647 : b.sort_order;
                if (sa !== sb) return sa - sb;
                return (a.name || '').localeCompare(b.name || '');
            });
        const tIdx = siblings.findIndex(function (f) { return f.id === folderId; });
        const beforeId = zone === 'before' ? folderId : (siblings[tIdx + 1] ? siblings[tIdx + 1].id : null);
        await callPosition({ before_id: beforeId });
    } catch (error) {
        console.error('Folder drop error:', error);
        await winAlert(error.message, 'Fejl');
    }
}


window.loadRealFiles = loadRealFiles;

// Sort files functionality
let currentSortColumn = 'name';
let currentSortDirection = 'asc';

function sortFiles(column) {
    if (currentSortColumn === column) {
        // Toggle direction
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    renderRealFiles();
}

window.sortFiles = sortFiles;

// Resizable columns functionality with localStorage persistence
function initResizableColumns() {
    const table = document.getElementById('fileTable');
    if (!table) return;
    
    const headers = table.querySelectorAll('th');
    let currentResizer = null;
    let currentHeader = null;
    let currentColumnIndex = null;
    let startX = 0;
    let startWidth = 0;
    
    // Load saved column widths from localStorage
    const savedWidths = JSON.parse(localStorage.getItem('fileTableColumnWidths') || '{}');
    
    headers.forEach((header, index) => {
        const defaultWidth = header.getAttribute('data-default-width');
        
        // Apply saved width if exists, otherwise use default
        if (savedWidths[index]) {
            header.style.width = savedWidths[index] + 'px';
        } else if (defaultWidth && defaultWidth !== 'auto') {
            header.style.width = defaultWidth + 'px';
        }
        
        const resizer = header.querySelector('.resize-handle');
        if (!resizer) return;
        
        resizer.addEventListener('mousedown', function(e) {
            e.stopPropagation(); // Prevent sorting
            currentResizer = resizer;
            currentHeader = header;
            currentColumnIndex = index;
            startX = e.pageX;
            startWidth = header.offsetWidth;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        });
    });
    
    function handleMouseMove(e) {
        if (!currentResizer) return;
        
        const diff = e.pageX - startX;
        const newWidth = Math.max(50, startWidth + diff); // Min width 50px
        
        currentHeader.style.width = newWidth + 'px';
    }
    
    function handleMouseUp() {
        if (currentHeader && currentColumnIndex !== null) {
            // Save new width to localStorage
            const savedWidths = JSON.parse(localStorage.getItem('fileTableColumnWidths') || '{}');
            savedWidths[currentColumnIndex] = currentHeader.offsetWidth;
            localStorage.setItem('fileTableColumnWidths', JSON.stringify(savedWidths));
            console.log('Saved column widths:', savedWidths); // DEBUG
        }
        
        currentResizer = null;
        currentHeader = null;
        currentColumnIndex = null;
        
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    }
}

// ===== Trin a2: helpers, flyt-dialog og deling =====

// "Flyt mappe til..."-dialog (mapper kan flyttes til en anden mappe).
// Top-"Fælles filer" kan ikke flyttes (håndteres i backend).
async function moveFolderSelected() {
    if (selectedFolderId === null || selectedFolderId === undefined) return;
    const folder = allFolders.find(f => f.id === selectedFolderId);
    if (!folder) return;
    if (isTopCompanyFolder(folder)) {
        await winAlert('"Fælles filer" kan ikke flyttes.', 'Ikke tilladt');
        return;
    }

    const opts = [{ id: null, name: 'Mine filer (roden)', indent: 0 }];
    const primary = getPrimaryCompanyFolder();
    allFolders
        .filter(f => f.id !== folder.id && !(primary && f.id === primary.id))
        .forEach(f => {
            // Undgå at flytte ind i egen efterkommer (ville skabe løkke)
            let cur = f;
            const guard = new Set();
            let isDescendant = false;
            while (cur && !guard.has(cur.id)) {
                guard.add(cur.id);
                if (cur.id === folder.id) { isDescendant = true; break; }
                cur = cur.parent_id ? allFolders.find(x => x.id === cur.parent_id) : null;
            }
            if (isDescendant) return;
            opts.push({ id: f.id, name: folderDisplayName(f), indent: getFolderPath(f.id).length - 1 });
        });

    const listText = opts.map((o, i) => `${i + 1}) ${'　'.repeat(o.indent)}${o.name}`).join('\n');
    const answer = await winPrompt(`Vælg destination for "${folderDisplayName(folder)}" (indtast nummer):\n\n${listText}`, '', 'Flyt mappe');
    if (answer === null || !answer.trim()) return;
    const pick = parseInt(answer, 10);
    if (isNaN(pick) || pick < 1 || pick > opts.length) {
        await winAlert('Ugyldigt valg.', 'Fejl');
        return;
    }
    const chosen = opts[pick - 1];

    const token = sessionStorage.getItem('token');
    try {
        const resp = await fetch(`${API_BASE}/folders/${folder.id}/position`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_id: chosen.id === null ? null : chosen.id, before_id: null })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'Kunne ikke flytte mappen');
        }
        await loadFolders();
        await winAlert(`Mappen er flyttet.`, 'Flyttet');
    } catch (e) {
        await winAlert(e.message, 'Fejl');
    }
}

// Indlogget bruger-id (null hvis ukendt)
// NB: appen gemmer brugeren under sessionStorage-noglen 'currentUser' (jf. login.js)
function getCurrentUserId() {
    try {
        const u = JSON.parse(sessionStorage.getItem('currentUser') || 'null') || window.currentUser || null;
        return u ? u.id : null;
    } catch (e) {
        return window.currentUser ? window.currentUser.id : null;
    }
}

// Find fil i både egne og delte filer
function findFileAnywhere(fileId) {
    return allFiles.find(f => f.id === fileId) || sharedFilesCache.find(f => f.id === fileId);
}

// "Flyt til..."-dialog: Mine filer (roden), mapper og Fælles filer
function moveSelectedToFolder() {
    if (!selectedFileId) {
        winAlert('Vælg en fil først');
        return;
    }
    const file = findFileAnywhere(selectedFileId);
    if (!file) return;

    const primary = getPrimaryCompanyFolder();
    const opts = [{ id: null, name: 'Mine filer', company: false, indent: 0 }];
    allFolders
        .filter(f => !(primary && f.id === primary.id)) // top-"Fælles filer" selv er ikke mål
        .forEach(f => {
            const depth = getFolderPath(f.id).length - 1;
            opts.push({ id: f.id, name: folderDisplayName(f), company: isInCompanyTreeClient(f), indent: depth });
        });

    const old = document.getElementById('moveFileDialog');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'moveFileDialog';
    overlay.className = 'move-overlay';
    overlay.innerHTML =
        '<div class="move-dialog">' +
        '<h3>Flyt "' + escapeFileName(file.original_name) + '" til...</h3>' +
        '<div class="move-list">' +
        opts.map(o =>
            '<button class="move-opt" style="padding-left:' + (12 + o.indent * 16) + 'px" onclick="doMoveFile(' + file.id + ', ' + (o.id === null ? 'null' : o.id) + ', ' + (o.company ? 'true' : 'false') + ')">' +
            '<i data-lucide="' + (o.company ? 'building-2' : 'folder') + '"></i>' + escapeFileName(o.name) + '</button>'
        ).join('') +
        '</div>' +
        '<button class="move-cancel" onclick="document.getElementById(\'moveFileDialog\').remove()">Annuller</button>' +
        '</div>';
    document.body.appendChild(overlay);
    refreshIcons();
}

async function doMoveFile(fileId, folderId, isCompany) {
    if (isCompany && !await winConfirm('Filen bliver synlig for alle med adgang til Fælles filer. Fortsæt?', 'Del med alle')) return;
    const token = sessionStorage.getItem('token');
    try {
        const response = await fetch('/api/files/' + fileId + '/move', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ folder_id: folderId })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(friendlyFileError(error.error || 'Flyt fejlede'));
        }
        selectedFileId = null; // ryd markering efter flyt
        const dlg = document.getElementById('moveFileDialog');
        if (dlg) dlg.remove();
        await loadRealFiles();
    } catch (error) {
        console.error('Move error:', error);
        await winAlert('Flyt fejlede: ' + error.message, 'Fejl');
    }
}

// "Stop deling": ejer vælger hvilken kollega delingen skal stoppes for (eller alle)
async function stopSharingSelected() {
    const id = selectedFileId;
    if (!id) {
        await winAlert('Vælg en fil først');
        return;
    }
    const token = sessionStorage.getItem('token');
    try {
        const res = await fetch('/api/files/' + id + '/shares', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Kunne ikke hente delinger');
        const shares = await res.json();
        if (!shares.length) {
            await winAlert('Filen er ikke delt med nogen.');
            return;
        }
        if (shares.length === 1) {
            if (!await winConfirm('Stop deling med ' + shares[0].shared_with_name + '?', 'Stop deling')) return;
            await doUnshare(id, shares[0].shared_with_user_id, token);
            return;
        }
        const names = shares.map((s, i) => (i + 1) + ') ' + s.shared_with_name).join('\n');
        const pick = await winPrompt('Stop deling med hvem? Skriv nummeret:\n' + names + '\n\n0 = stop alle delinger', '', 'Stop deling');
        if (pick === null) return;
        const n = parseInt(pick, 10);
        if (n === 0) {
            for (const s of shares) {
                await doUnshare(id, s.shared_with_user_id, token);
            }
        } else if (n >= 1 && n <= shares.length) {
            await doUnshare(id, shares[n - 1].shared_with_user_id, token);
        } else {
            await winAlert('Ugyldigt nummer', 'Fejl');
        }
    } catch (error) {
        console.error('Stop sharing error:', error);
        await winAlert('Fejl: ' + error.message, 'Fejl');
    }
}

async function doUnshare(fileId, userId, token) {
    const res = await fetch('/api/files/' + fileId + '/share/' + userId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Kunne ikke stoppe deling');
    await winAlert('Delingen er stoppet', 'Succes');
    renderFileDetails();
}

// Tastatur: Ctrl+C / Ctrl+X / Ctrl+V / Esc - kun på Filer-siden, uden for tekstfelter og dialoger
document.addEventListener("keydown", function (e) {
    if (!document.getElementById("fileListBody")) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable)) return;
    if (document.getElementById("moveFileDialog")) return;
    const imgModal = document.getElementById("imageModal");
    if (imgModal && imgModal.style.display === "flex") return;
    const key = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "c" && selectedFileId) { e.preventDefault(); copySelected(); }
    else if ((e.ctrlKey || e.metaKey) && key === "x" && selectedFileId) { e.preventDefault(); cutSelected(); }
    else if ((e.ctrlKey || e.metaKey) && key === "v" && fileClipboard) { e.preventDefault(); pasteClipboard(); }
    else if (key === "escape") { cancelCut(); }
});

// Højreklik på tomt område i en mappe: Sæt ind her
document.addEventListener("contextmenu", function (e) {
    const list = document.getElementById("fileListBody");
    if (!list || !list.contains(e.target)) return;
    if (e.target.closest(".file-row") || e.target.closest(".folder-row")) return;
    if (currentFilter !== "folder" || !currentFolderId) return;
    const f3 = allFolders.find(function (x) { return x.id === currentFolderId; });
    showFolderContextMenu(e, currentFolderId, f3 ? f3.name : "Mappe");
});

