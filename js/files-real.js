// js/files-real.js - Rigtig fil upload integration
let allFiles = [];
let allFolders = [];
let selectedFileId = null;
let currentFilter = 'all'; // 'all', 'documents', 'images', 'shared', 'folder'
let currentFolderId = null; // null = root level
let currentFolderName = '';
let currentView = 'my'; // 'my' or 'shared'

async function loadRealFiles() {
    try {
        const token = sessionStorage.getItem('token');
        
        // Load folders first
        await loadFolders();
        
        // Then load files based on current view
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/files?view=${currentView}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load files');
        
        allFiles = await response.json();
        renderFolderTree();
        renderRealFiles();
    } catch (error) {
        console.error('Error loading files:', error);
        alert('Kunne ikke indlæse filer: ' + error.message);
    }
}

// Track expanded folders
let expandedFolders = new Set();

// Switch between My Files and Shared Files
async function switchFileView(view) {
    currentView = view;
    currentFilter = 'all';
    currentFolderId = null;
    await loadRealFiles();
}

// Render folder tree with hierarchy
function renderFolderTree() {
    const tree = document.getElementById('folderTree');
    if (!tree) return;
    
    const documentCount = allFiles.filter(f => isDocument(f.original_name)).length;
    const imageCount = allFiles.filter(f => isImage(f.original_name)).length;
    
    // VIEW TABS
    let html = `
        <div style="display: flex; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0;">
            <div style="flex: 1; padding: 10px; text-align: center; cursor: pointer; font-weight: ${currentView === 'my' ? 'bold' : 'normal'}; background: ${currentView === 'my' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f5f5f5'}; color: ${currentView === 'my' ? 'white' : '#333'}; border-radius: 5px 5px 0 0;" onclick="switchFileView('my')">
                📁 Mine Filer
            </div>
            <div style="flex: 1; padding: 10px; text-align: center; cursor: pointer; font-weight: ${currentView === 'shared' ? 'bold' : 'normal'}; background: ${currentView === 'shared' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f5f5f5'}; color: ${currentView === 'shared' ? 'white' : '#333'}; border-radius: 5px 5px 0 0; margin-left: 5px;" onclick="switchFileView('shared')">
                🤝 Delte med mig
            </div>
        </div>
    `;
    
    // FILTERS
    html += `
        <div class="tree-item ${currentFilter === 'all' && !currentFolderId ? 'selected' : ''}" onclick="filterFiles('all')">
            <span class="tree-expand">�</span> Alle Filer (${allFiles.length})
        </div>
        <div class="tree-item ${currentFilter === 'documents' ? 'selected' : ''}" onclick="filterFiles('documents')">
            <span class="tree-expand">�</span> Dokumenter (${documentCount})
        </div>
        <div class="tree-item ${currentFilter === 'images' ? 'selected' : ''}" onclick="filterFiles('images')">
            <span class="tree-expand">�️</span> Billeder (${imageCount})
        </div>
    `;
    
    if (allFolders.length > 0) {
        html += '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;"></div>';
        html += '<div style="padding: 5px 10px; font-size: 12px; color: #999; font-weight: 600;">DINE MAPPER</div>';
        
        // Build hierarchical tree
        const rootFolders = allFolders.filter(f => !f.parent_id);
        html += renderFolderBranch(rootFolders, 0);
    }
    
    tree.innerHTML = html;
}

// Render folder branch recursively
function renderFolderBranch(folders, level) {
    let html = '';
    
    folders.forEach(folder => {
        const fileCount = allFiles.filter(f => f.folder_id === folder.id).length;
        const childFolders = allFolders.filter(f => f.parent_id === folder.id);
        const hasChildren = childFolders.length > 0;
        const isExpanded = expandedFolders.has(folder.id);
        const isSelected = currentFolderId === folder.id;
        
        const indent = level * 15;
        const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : '　';
        
        html += `
            <div class="tree-item ${isSelected ? 'selected' : ''}" style="padding-left: ${indent + 10}px;" data-folder-id="${folder.id}">
                <span class="tree-expand-icon" onclick="toggleFolder(event, ${folder.id})" style="cursor: ${hasChildren ? 'pointer' : 'default'}; display: inline-block; width: 15px;">${expandIcon}</span>
                <span onclick="openFolder(${folder.id}, '${folder.name.replace(/'/g, "\\'")}');" oncontextmenu="showFolderContextMenu(event, ${folder.id}, '${folder.name.replace(/'/g, "\\'")}'); return false;" style="cursor: pointer;">
                    📁 ${folder.name} ${fileCount > 0 ? `(${fileCount})` : ''}
                </span>
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
    
    renderFolderTree();
}

// Filter files by category
function filterFiles(category) {
    currentFilter = category;
    currentFolderId = null;
    currentFolderName = '';
    renderFolderTree();
    renderRealFiles();
}

function isDocument(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext);
}

function isImage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
}

function getFilteredFiles() {
    if (currentFilter === 'folder' && currentFolderId) {
        return allFiles.filter(f => f.folder_id === currentFolderId);
    } else if (currentFilter === 'all') {
        return allFiles;
    } else if (currentFilter === 'documents') {
        return allFiles.filter(f => isDocument(f.original_name));
    } else if (currentFilter === 'images') {
        return allFiles.filter(f => isImage(f.original_name));
    } else if (currentFilter === 'shared') {
        return [];
    }
    return allFiles;
}

function renderRealFiles() {
    const tbody = document.getElementById('fileListBody');
    const filteredFiles = getFilteredFiles();
    
    const filterNames = {
        'all': 'Alle Filer',
        'documents': 'Dokumenter',
        'images': 'Billeder',
        'shared': 'Delte Filer',
        'folder': currentFolderName
    };
    document.getElementById('addressBar').textContent = filterNames[currentFilter];
    
    if (filteredFiles.length === 0) {
        const emptyMessage = currentFilter === 'folder' 
            ? 'Mappen er tom. Upload filer til denne mappe.'
            : currentFilter === 'all' 
            ? 'Ingen filer uploadet endnu. Klik "📤 Upload" for at tilføje filer.'
            : `Ingen ${filterNames[currentFilter].toLowerCase()} endnu.`;
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 40px; color: #999;">${emptyMessage}</td></tr>`;
        document.getElementById('fileCount').textContent = '0 filer';
        return;
    }
    
    tbody.innerHTML = filteredFiles.map(file => {
        const icon = getFileIcon(file.original_name);
        const size = formatFileSize(file.file_size);
        const type = getFileType(file.original_name);
        const date = new Date(file.created_at).toLocaleDateString('da-DK');
        
        return `
            <tr class="file-row" onclick="selectRealFile(${file.id}, event)" ondblclick="openRealFile(${file.id})" oncontextmenu="showContextMenu(event, ${file.id})">
                <td><span class="file-icon-small">${icon}</span>${file.original_name}</td>
                <td>${size}</td>
                <td>${type}</td>
                <td>${date} - ${file.uploader_name}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('fileCount').textContent = `${filteredFiles.length} fil${filteredFiles.length !== 1 ? 'er' : ''}`;
}

function selectRealFile(fileId, event) {
    selectedFileId = fileId;
    document.querySelectorAll('.file-row').forEach(row => row.classList.remove('selected'));
    
    const filteredFiles = getFilteredFiles();
    const fileIndex = filteredFiles.findIndex(f => f.id === fileId);
    
    if (fileIndex >= 0) {
        const rows = document.querySelectorAll('.file-row');
        if (rows[fileIndex]) {
            rows[fileIndex].classList.add('selected');
        }
        const file = filteredFiles[fileIndex];
        document.getElementById('selectedInfo').textContent = `Valgt: ${file.original_name} (${formatFileSize(file.file_size)})`;
    }
    
    if (event) {
        event.stopPropagation();
    }
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
        
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/files/upload', {
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
        
        alert(`✅ ${file.name} uploadet succesfuldt!`);
        
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
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;
    
    const ext = file.original_name.split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    
    if (imageExtensions.includes(ext)) {
        await previewImage(fileId, file.original_name);
    } else {
        alert(`${file.original_name}\n\nStørrelse: ${formatFileSize(file.file_size)}\nType: ${getFileType(file.original_name)}\nUploadet af: ${file.uploader_name}\nDato: ${new Date(file.created_at).toLocaleString('da-DK')}\n\nTryk "💾 Download" knappen for at downloade filen.`);
    }
}

async function previewImage(fileId, filename) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/files/download/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load image');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/files/download/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const file = allFiles.find(f => f.id === fileId);
        const url = window.URL.createObjectURL(blob);
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
    
    const file = allFiles.find(f => f.id === selectedFileId);
    if (!file) return;
    
    if (!confirm(`Er du sikker på at du vil slette "${file.original_name}"?`)) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/files/${selectedFileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        alert('✅ Fil slettet');
        selectedFileId = null;
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
        'pdf': '📄', 'doc': '📝', 'docx': '📝',
        'xls': '📊', 'xlsx': '📊', 'ppt': '📊', 'pptx': '📊',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'zip': '📦', 'rar': '📦', 'txt': '📃',
        'html': '🌐', 'css': '🎨', 'js': '⚙️'
    };
    return icons[ext] || '📄';
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
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/folders', {
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
    renderFolderTree();
    renderRealFiles();
}

async function showNewFolderDialog() {
    const folderName = prompt('Indtast mappenavn:');
    if (!folderName || !folderName.trim()) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/folders', {
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
        
        alert(`✅ Mappe "${folderName}" oprettet!`);
        await loadFolders();
        renderFolderTree();
    } catch (error) {
        console.error('Create folder error:', error);
        alert('Kunne ikke oprette mappe: ' + error.message);
    }
}

function searchFiles() {
    const query = prompt('Søg efter fil:');
    if (!query || !query.trim()) {
        loadRealFiles();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    const filteredFiles = allFiles.filter(file => 
        file.original_name.toLowerCase().includes(searchTerm)
    );
    
    const tbody = document.getElementById('fileListBody');
    
    if (filteredFiles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 40px; color: #999;">Ingen filer matcher "${query}"</td></tr>`;
        document.getElementById('fileCount').textContent = '0 filer';
        document.getElementById('addressBar').textContent = `Søgeresultat: "${query}"`;
        return;
    }
    
    tbody.innerHTML = filteredFiles.map(file => {
        const icon = getFileIcon(file.original_name);
        const size = formatFileSize(file.file_size);
        const type = getFileType(file.original_name);
        const date = new Date(file.created_at).toLocaleDateString('da-DK');
        
        return `
            <tr class="file-row" onclick="selectRealFile(${file.id}, event)" ondblclick="openRealFile(${file.id})" oncontextmenu="showContextMenu(event, ${file.id})">
                <td><span class="file-icon-small">${icon}</span>${file.original_name}</td>
                <td>${size}</td>
                <td>${type}</td>
                <td>${date} - ${file.uploader_name}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('fileCount').textContent = `${filteredFiles.length} fil${filteredFiles.length !== 1 ? 'er' : ''} fundet`;
    document.getElementById('addressBar').textContent = `Søgeresultat: "${query}"`;
}

let selectedFolderId = null;
let selectedFolderName = '';

// File context menu
function showContextMenu(event, fileId) {
    event.preventDefault();
    selectRealFile(fileId);
    
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
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/folders', {
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
        
        alert(`✅ Mappe "${folderName}" oprettet!`);
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/folders/${selectedFolderId}`, {
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
        
        alert(`✅ Mappe omdøbt til "${newName}"`);
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/folders/${selectedFolderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        alert('✅ Mappe slettet');
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
    if (!orderNumber || !orderNumber.trim()) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/files/${selectedFileId}/transfer-to-order`, {
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
        
        alert(`✅ ${result.message}\n\nOrdre: ${result.order.title}`);
        
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
    if (currentFolderId) {
        currentFolderId = null;
        currentFilter = 'all';
        renderFolderTree();
        renderRealFiles();
    }
}

function navigateUp() {
    navigateBack();
}

function cutSelected() {}
function copySelected() {}
function pasteClipboard() {}

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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/files/${selectedFileId}/rename`, {
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
        
        await winAlert(`✅ Fil omdøbt til "${finalName}"`, 'Succes');
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
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Kunne ikke hente brugere');
        
        const users = await response.json();
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
        const otherUsers = users.filter(u => u.id !== currentUser.id);
        
        if (otherUsers.length === 0) {
            alert('Ingen andre brugere at dele med endnu');
            return;
        }
        
        let userList = 'Vælg bruger at dele med:\\n\\n';
        otherUsers.forEach((u, i) => {
            userList += `${i + 1}. ${u.name} (${u.email})\\n`;
        });
        
        const selection = prompt(userList + '\\nIndtast nummer:');
        if (!selection) return;
        
        const index = parseInt(selection) - 1;
        if (index < 0 || index >= otherUsers.length) {
            alert('Ugyldigt valg');
            return;
        }
        
        const selectedUser = otherUsers[index];
        
        // Share file via backend API
        const shareResponse = await fetch(`https://flowfactory-frontend.onrender.com/api/files/${selectedFileId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: selectedUser.id,
                permission: 'view'
            })
        });
        
        if (!shareResponse.ok) {
            const error = await shareResponse.json();
            throw new Error(error.error || 'Kunne ikke dele fil');
        }
        
        alert(`✅ Fil "${file.original_name}" delt med ${selectedUser.name}!`);
        
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

window.loadRealFiles = loadRealFiles;
