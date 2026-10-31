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
        renderFolderTree();
        renderRealFiles();
        
        // Show admin-only buttons
        showAdminButtons();
        
        // Initialize resizable columns
        initResizableColumns();
    } catch (error) {
        console.error('Error loading files:', error);
        alert('Kunne ikke indlæse filer: ' + error.message);
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
        alert('Kun admins kan oprette firma mapper\n\nDEBUG: is_admin = ' + user?.is_admin);
        return;
    }
    
    // Check if company folder already exists
    const existingCompanyFolder = allFolders.find(f => f.is_company_folder && f.name === 'SG Seest Gulvteknik');
    if (existingCompanyFolder) {
        alert(' firma mappen findes allerede!');
        return;
    }
    
    if (!confirm('Opret firma mappe?\n\nDenne mappe vil være synlig for alle brugere i firmaet.')) {
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
        
        alert(' firma mappe oprettet!\n\nAlle brugere kan nu se og bruge denne mappe.');
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create company folder error:', error);
        alert('Kunne ikke oprette firma mappe: ' + error.message);
    }
}

// Track expanded folders
let expandedFolders = new Set();

// Render folder tree: kun rigtige steder - Fælles filer, Mine filer (roden), Mine mapper
function renderFolderTree() {
    const tree = document.getElementById('folderTree');
    if (!tree) {
        console.log('Folder tree element not found - not on files page');
        return;
    }

    let html = '';

    // Fælles filer (firmamappe) - fast øverst
    const companyFolders = allFolders.filter(f => f.is_company_folder && !f.parent_id);
    html += '<div class="tree-section-label">Fælles filer</div>';
    if (companyFolders.length > 0) {
        html += renderFolderBranch(companyFolders, 0, true);
    } else {
        html += '<div class="tree-empty-note">Oprettes automatisk</div>';
    }

    // Mine filer = roden (filer uden mappe)
    const meId = getCurrentUserId();
    const rootCount = allFiles.filter(f => !f.folder_id && (!meId || f.owner_id === meId)).length;
    html += '<div class="tree-section-label">Mine filer</div>';
    html += '<div class="tree-node ' + (currentFilter === 'root' ? 'active' : '') + '" onclick="filterFiles(\'root\')">' +
        '<span class="tree-chevron"></span><i data-lucide="hard-drive"></i>' +
        '<span class="tree-label">Mine filer</span>' +
        '<span class="tree-count">' + rootCount + '</span></div>';

    // Mine mapper
    const personalFolders = allFolders.filter(f => !f.is_company_folder && !f.parent_id);
    if (personalFolders.length > 0) {
        html += '<div class="tree-section-label">Mine mapper</div>';
        html += renderFolderBranch(personalFolders, 0, false);
    }

    tree.innerHTML = html;
    refreshIcons();
}

// Render folder branch recursively (tree-node markup m. Lucide-ikoner)
function renderFolderBranch(folders, level, isCompany = false) {
    let html = '';

    folders.forEach(folder => {
        const fileCount = allFiles.filter(f => f.folder_id === folder.id).length;
        const childFolders = allFolders.filter(f => f.parent_id === folder.id);
        const hasChildren = childFolders.length > 0;
        const isExpanded = expandedFolders.has(folder.id);
        const isSelected = currentFolderId === folder.id;
        const displayName = isCompany ? 'Fælles filer' : folder.name;
        const safeName = displayName.replace(/'/g, "\\'");
        const indent = level * 16;

        html += `
            <div class="tree-node ${isSelected ? 'active' : ''} ${isCompany ? 'company-node' : ''}" style="padding-left: ${indent}px;"
                 onclick="openFolder(${folder.id}, '${safeName}')"
                 oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${safeName}'); return false;"
                 data-folder-id="${folder.id}"
                 ondrop="handleFolderDrop(event, ${folder.id})"
                 ondragover="handleFolderDragOver(event)"
                 ondragleave="handleFolderDragLeave(event)">
                <span class="tree-chevron" onclick="toggleFolder(event, ${folder.id})">${hasChildren ? '<i data-lucide="' + (isExpanded ? 'chevron-down' : 'chevron-right') + '"></i>' : ''}</span>
                <i data-lucide="${isCompany ? 'building-2' : 'folder'}"></i>
                <span class="tree-label">${displayName}</span>
                ${fileCount > 0 ? '<span class="tree-count">' + fileCount + '</span>' : ''}
            </div>
        `;

        // Render children if expanded
        if (hasChildren && isExpanded) {
            html += renderFolderBranch(childFolders, level + 1, isCompany);
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
        { id: 'images', label: 'Billeder', count: imgCount },
        { id: 'shared', label: 'Delte', count: null }
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
    const names = { all: 'Alle filer', root: 'Mine filer', documents: 'Dokumenter', images: 'Billeder', shared: 'Delte filer' };
    let html = '<span class="crumb-root">Alle filer</span>';
    if (currentFilter === 'folder' && currentFolderId) {
        const path = getFolderPath(currentFolderId);
        path.forEach((f, i) => {
            const last = i === path.length - 1;
            html += '<span class="crumb-sep">/</span>';
            html += '<span class="crumb-item' + (last ? ' current' : '') + '" onclick="openFolder(' + f.id + ', \'' + (f.is_company_folder ? 'Fælles filer' : f.name).replace(/'/g, "\\'") + '\')">' + escapeFileName(f.is_company_folder ? 'Fælles filer' : f.name) + '</span>';
        });
    } else {
        html += '<span class="crumb-sep">/</span><span class="crumb-item current">' + (names[currentFilter] || 'Alle filer') + '</span>';
    }
    crumb.innerHTML = html;
}

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
            <tr class="folder-row" onclick="selectFolder(${folder.id}, event)" ondblclick="openFolder(${folder.id}, '${safeName}')" oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${safeName}'); return false;">
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
                <td class="col-check"><input type="checkbox" onclick="toggleFileCheckbox(event, ${file.id})"></td>
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
            <div class="grid-card" onclick="openFolder(${folder.id}, '${safeName}')" oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${safeName}'); return false;">
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
            <div class="grid-card" data-file-id="${file.id}" onclick="selectRealFile(${file.id}, event)" ondblclick="openRealFile(${file.id})" oncontextmenu="showContextMenu(event, ${file.id})">
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
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 100 * 1024 * 1024) {
        alert('Filen er for stor! Max 100MB');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId) {
        formData.append('folder_id', currentFolderId);
    }
    
    try {
        const token = sessionStorage.getItem('token');
        
        console.log('Uploading file...', file.name);
        
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        console.log('Upload response status:', response.status);
        
        const contentType = response.headers.get('content-type');
        console.log('Response content-type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returnerede ikke JSON. Tjek at backend kører korrekt.');
        }
        
        const result = await response.json();
        console.log('Upload result:', result);
        
        if (!response.ok) {
            throw new Error(result.error || 'Upload failed');
        }
        
        if (result.warning) {
            alert('Advarsel: ' + result.warning);
        } else {
            alert(` ${file.name} uploadet succesfuldt!`);
        }
        
        console.log('Reloading files...');
        await loadRealFiles();
        console.log('Files reloaded successfully');
        
    } catch (error) {
        console.error('Upload error details:', error);
        alert('Upload fejlede: ' + error.message);
    }
    
    event.target.value = '';
}

async function openRealFile(fileId) {
    const file = findFileAnywhere(fileId);
    if (!file) return;
    
    const ext = file.original_name.split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'bmp', 'webp'];
    
    if (imageExtensions.includes(ext)) {
        await previewImage(fileId, file.original_name);
    } else {
        alert(`${file.original_name}\n\nStørrelse: ${formatFileSize(file.file_size)}\nType: ${getFileType(file.original_name)}\nUploadet af: ${file.uploader_name}\nDato: ${new Date(file.created_at).toLocaleString('da-DK')}\n\nTryk " Download" knappen for at downloade filen.`);
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
        alert('Kunne ikke vise billede: ' + error.message);
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
        alert('Download fejlede: ' + error.message);
    }
}

async function deleteSelected() {
    if (!selectedFileId) {
        alert('Vælg en fil først');
        return;
    }

    const meId = getCurrentUserId();
    const token = sessionStorage.getItem('token');
    const ownFile = allFiles.find(f => f.id === selectedFileId);
    const sharedFile = sharedFilesCache.find(f => f.id === selectedFileId);

    // Fil andre har delt med MIG: fjern kun min adgang - filen røres ikke
    if (!ownFile && sharedFile) {
        if (!confirm('Fjern "' + sharedFile.original_name + '" fra dine delte filer?\n\nFilen slettes ikke og forbliver hos ejeren.')) return;
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
            alert('Fejl: ' + error.message);
        }
        return;
    }

    if (!ownFile) return;

    if (!confirm('ADVARSEL: Filen "' + ownFile.original_name + '" slettes permanent.\n\nDen forsvinder også fra "Alle filer" og hos dem, du har delt den med. Fortsæt?')) return;

    try {
        const response = await fetch('/api/files/' + selectedFileId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }

        alert('Filen er slettet');
        selectedFileId = null;
        if (currentFilter === 'shared') {
            sharedFilesCache = await loadSharedFiles();
        }
        await loadRealFiles();
    } catch (error) {
        console.error('Delete error:', error);
        alert('Slet fejlede: ' + error.message);
    }
}

function downloadFile() {
    if (selectedFileId) {
        downloadRealFile(selectedFileId);
    } else {
        alert('Vælg en fil først');
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
    const folderName = prompt('Indtast mappenavn:');
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
        
        alert(` Mappe "${folderName}" oprettet!`);
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create folder error:', error);
        alert('Kunne ikke oprette mappe: ' + error.message);
    }
}

function searchFiles() {
    const input = document.getElementById('filesSearch');
    if (input) {
        input.focus();
        return;
    }
    const query = prompt('Søg filer:');
    if (query === null) return;
    filesSearchQuery = query.trim();
    renderRealFiles();
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
    
    const folderName = prompt('Indtast mappenavn:');
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
        
        alert(` Mappe "${folderName}" oprettet!`);
        expandedFolders.add(selectedFolderId); // Auto-expand parent
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create folder error:', error);
        alert('Kunne ikke oprette mappe: ' + error.message);
    }
}

// Rename folder
async function renameFolderSelected() {
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) folderContextMenu.style.display = 'none';
    
    const newName = prompt('Indtast nyt mappenavn:', selectedFolderName);
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
        
        alert(` Mappe omdøbt til "${newName}"`);
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Rename folder error:', error);
        alert('Kunne ikke omdøbe mappe: ' + error.message);
    }
}

// Delete folder
async function deleteFolderSelected() {
    const folderContextMenu = document.getElementById('folderContextMenu');
    if (folderContextMenu) folderContextMenu.style.display = 'none';
    
    if (!confirm(`Er du sikker på at du vil slette mappen "${selectedFolderName}"?`)) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/folders/${selectedFolderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        alert(' Mappe slettet');
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Delete folder error:', error);
        alert('Slet fejlede: ' + error.message);
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
    
    alert(
        `Mappe: ${folder.name}\n\n` +
        `Filer: ${fileCount}\n` +
        `Undermapper: ${subfolderCount}\n\n` +
        `Oprettet af: ${folder.creator_name}\n` +
        `Oprettet: ${new Date(folder.created_at).toLocaleString('da-DK')}`
    );
}

// Transfer file to order
async function transferToOrder() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';
    
    if (!selectedFileId) {
        alert('Vælg en fil først');
        return;
    }
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    const orderNumber = prompt(`Overfør "${file.original_name}" til ordre:\n\nIndtast ordrenummer:`);
    if (!orderNumber || !orderNumber.trim()) {
        alert(' Ordre nummer er påkrævet!\n\nDu skal indtaste et ordre nummer for at overføre filen.');
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
        
        alert(` ${result.message}\n\nOrdre: ${result.order.title}`);
        
    } catch (error) {
        console.error('Transfer error:', error);
        alert('Overførsel fejlede: ' + error.message);
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
    if (!selectedFileId) { alert("Vælg en fil først"); return; }
    fileClipboard = { mode: "cut", fileId: selectedFileId };
    clearCutStyling();
    document.querySelectorAll("[data-file-id=" + JSON.stringify(String(selectedFileId)) + "]").forEach(function (el) { el.classList.add("cut-pending"); });
}

function copySelected() {
    hideFileContextMenus();
    if (!selectedFileId) { alert("Vælg en fil først"); return; }
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
        return { id: selectedFolderId, name: f ? (f.is_company_folder ? "Fælles filer" : f.name) : selectedFolderName, company: !!(f && f.is_company_folder) };
    }
    if (currentFilter === "folder" && currentFolderId) {
        const f2 = allFolders.find(function (x) { return x.id === currentFolderId; });
        return { id: currentFolderId, name: f2 ? (f2.is_company_folder ? "Fælles filer" : f2.name) : "mappen", company: !!(f2 && f2.is_company_folder) };
    }
    return { id: null, name: "Mine filer", company: false };
}

function friendlyFileError(msg) {
    if (/Permission denied/i.test(msg || "")) return "Du har ikke tilladelse til det. Kun den, der uploadede filen (eller en administrator), kan gøre dette.";
    return msg;
}

async function pasteClipboard() {
    hideFileContextMenus();
    if (!fileClipboard) { alert("Der er intet at indsætte"); return; }
    const file = findFileAnywhere(fileClipboard.fileId);
    if (!file) { fileClipboard = null; clearCutStyling(); alert("Filen findes ikke længere"); return; }
    const target = currentPasteTarget();
    const meId = getCurrentUserId();
    if (fileClipboard.mode === "cut" && file.uploaded_by !== meId) {
        alert("Du kan kun flytte filer, du selv har uploadet (eller er administrator).");
        return;
    }
    if (target.company && fileClipboard.mode === "copy" && !confirm("Filen bliver synlig for alle med adgang til Fælles filer. Fortsæt?")) return;
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
                alert("Kopieret som " + JSON.stringify(data.final_name));
            } else {
                alert("Kopieret til " + JSON.stringify(target.name));
            }
        } else {
            alert("Flyttet til " + JSON.stringify(target.name));
        }
    } catch (error) {
        console.error("Paste error:", error);
        alert(error.message);
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
        
        await winAlert(` Fil omdøbt til "${finalName}"`, 'Succes');
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
        alert('Vælg en fil først');
        return;
    }
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    // Simpelt prompt for email
    const email = prompt(`Del "${file.original_name}" med:\n\nIndtast brugerens email:`);
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
            alert(' Bruger ikke fundet. Tjek emailen og prøv igen.');
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
        
        alert(` Fil "${file.original_name}" delt med ${targetUser.name}!`);
        
    } catch (error) {
        console.error('Share error:', error);
        alert('Kunne ikke dele fil: ' + error.message);
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

// Drag and drop functionality
let draggedFileId = null;

function handleFileDragStart(event, fileId) {
    draggedFileId = fileId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', fileId);
    event.target.style.opacity = '0.5';
}

async function handleFolderDrop(event, folderId) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedFileId) return;
    
    const file = allFiles.find(f => f.id === draggedFileId);
    if (!file) return;
    
    const folder = allFolders.find(f => f.id === folderId);
    if (!folder) return;
    
    // Don't move if already in this folder
    if (file.folder_id === folderId) {
        draggedFileId = null;
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/files/${draggedFileId}/move`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ folder_id: folderId })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Move failed');
        }
        
        await loadRealFiles();
        
        // If viewing this folder, refresh view
        if (currentFolderId === folderId) {
            openFolder(folderId, folder.name);
        }
        
    } catch (error) {
        console.error('Move file error:', error);
        alert('Kunne ikke flytte fil: ' + error.message);
    }
    
    draggedFileId = null;
}

function handleFolderDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleFolderDragLeave(event) {
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
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

// Indlogget bruger-id (null hvis ukendt)
function getCurrentUserId() {
    try {
        const u = JSON.parse(sessionStorage.getItem('user') || 'null');
        return u ? u.id : null;
    } catch (e) {
        return null;
    }
}

// Find fil i både egne og delte filer
function findFileAnywhere(fileId) {
    return allFiles.find(f => f.id === fileId) || sharedFilesCache.find(f => f.id === fileId);
}

// "Flyt til..."-dialog: Mine filer (roden), mapper og Fælles filer
function moveSelectedToFolder() {
    if (!selectedFileId) {
        alert('Vælg en fil først');
        return;
    }
    const file = findFileAnywhere(selectedFileId);
    if (!file) return;

    const companyFolder = allFolders.find(f => f.is_company_folder && !f.parent_id);
    const opts = [{ id: null, name: 'Mine filer', company: false, indent: 0 }];
    allFolders.filter(f => !f.is_company_folder).forEach(f => {
        const depth = getFolderPath(f.id).length - 1;
        opts.push({ id: f.id, name: f.name, company: false, indent: depth });
    });
    if (companyFolder) {
        opts.push({ id: companyFolder.id, name: 'Fælles filer', company: true, indent: 0 });
    }

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
    if (isCompany && !confirm('Filen bliver synlig for alle med adgang til Fælles filer. Fortsæt?')) return;
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
        alert('Flyt fejlede: ' + error.message);
    }
}

// "Stop deling": ejer vælger hvilken kollega delingen skal stoppes for (eller alle)
async function stopSharingSelected() {
    const id = selectedFileId;
    if (!id) {
        alert('Vælg en fil først');
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
            alert('Filen er ikke delt med nogen.');
            return;
        }
        if (shares.length === 1) {
            if (!confirm('Stop deling med ' + shares[0].shared_with_name + '?')) return;
            await doUnshare(id, shares[0].shared_with_user_id, token);
            return;
        }
        const names = shares.map((s, i) => (i + 1) + ') ' + s.shared_with_name).join('\n');
        const pick = prompt('Stop deling med hvem? Skriv nummeret:\n' + names + '\n\n0 = stop alle delinger');
        if (pick === null) return;
        const n = parseInt(pick, 10);
        if (n === 0) {
            for (const s of shares) {
                await doUnshare(id, s.shared_with_user_id, token);
            }
        } else if (n >= 1 && n <= shares.length) {
            await doUnshare(id, shares[n - 1].shared_with_user_id, token);
        } else {
            alert('Ugyldigt nummer');
        }
    } catch (error) {
        console.error('Stop sharing error:', error);
        alert('Fejl: ' + error.message);
    }
}

async function doUnshare(fileId, userId, token) {
    const res = await fetch('/api/files/' + fileId + '/share/' + userId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Kunne ikke stoppe deling');
    alert('Delingen er stoppet');
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

