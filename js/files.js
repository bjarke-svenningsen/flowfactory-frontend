// File explorer variabler
let fileSystem = {};
let currentPath = 'root';
let currentSubPath = [];
let navigationHistory = [];
let selectedFile = null;
let clipboard = null;
let sortColumn = 'name';
let sortDirection = 'asc';

// Initialiser filsystem med dybere struktur
function initFileSystem() {
    fileSystem = {
        root: {
            type: 'folder',
            name: 'Mine filer',
            path: 'C:\\Mine filer',
            expanded: false,
            contents: {
                'Dokumenter': { 
                    type: 'folder', 
                    name: 'Dokumenter',
                    expanded: false,
                    date: '08/10/2025',
                    contents: {
                        'Rapport_Q3.pdf': { type: 'file', name: 'Rapport_Q3.pdf', size: 2457600, date: '08/10/2025' },
                        'Mødereferat.docx': { type: 'file', name: 'Mødereferat.docx', size: 45120, date: '07/10/2025' },
                        'Præsentation.pptx': { type: 'file', name: 'Præsentation.pptx', size: 1842000, date: '05/10/2025' },
                        'Budget_2025.xlsx': { type: 'file', name: 'Budget_2025.xlsx', size: 159744, date: '03/10/2025' }
                    }
                },
                'Billeder': { 
                    type: 'folder', 
                    name: 'Billeder',
                    expanded: false,
                    date: '01/10/2025',
                    contents: {
                        'team-foto.jpg': { type: 'file', name: 'team-foto.jpg', size: 3245000, date: '02/10/2025', isImage: true },
                        'logo-draft.png': { type: 'file', name: 'logo-draft.png', size: 125400, date: '03/10/2025', isImage: true },
                        'kontor-billede.jpg': { type: 'file', name: 'kontor-billede.jpg', size: 2845000, date: '05/10/2025', isImage: true }
                    }
                },
                'Delte Filer': { 
                    type: 'folder', 
                    name: 'Delte Filer',
                    expanded: false,
                    date: '05/10/2025',
                    isSharedFolder: true,
                    sharedWith: ['Alle medarbejdere'],
                    contents: {
                        'Firmafest_2025.jpg': { 
                            type: 'file', 
                            name: 'Firmafest_2025.jpg', 
                            size: 4404019, 
                            date: '05/10/2025', 
                            isImage: true,
                            sharedWith: ['Alle medarbejdere']
                        },
                        'Medarbejderhåndbog.pdf': { 
                            type: 'file', 
                            name: 'Medarbejderhåndbog.pdf', 
                            size: 1245184, 
                            date: '01/10/2025',
                            sharedWith: ['Alle medarbejdere']
                        },
                        'Q3 Resultater.xlsx': {
                            type: 'file',
                            name: 'Q3 Resultater.xlsx',
                            size: 384500,
                            date: '07/10/2025',
                            sharedWith: ['Ledelse', 'Økonomi']
                        }
                    }
                }
            }
        }
    };
    
    setupDragAndDrop();
}

// Setup drag and drop
function setupDragAndDrop() {
    const content = document.querySelector('.explorer-content');
    if (!content) return;
    
    content.addEventListener('dragover', (e) => {
        e.preventDefault();
        content.style.background = '#e8f4ff';
    });
    
    content.addEventListener('dragleave', () => {
        content.style.background = 'white';
    });
    
    content.addEventListener('drop', (e) => {
        e.preventDefault();
        content.style.background = 'white';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadMultipleFiles(files);
        }
    });
}

// Upload flere filer via drag & drop
function uploadMultipleFiles(files) {
    const folder = getCurrentFolder();
    if (!folder || !folder.contents) return;
    
    let uploaded = 0;
    for (let file of files) {
        if (!folder.contents[file.name]) {
            folder.contents[file.name] = {
                type: 'file',
                name: file.name,
                size: file.size,
                date: new Date().toLocaleDateString('da-DK'),
                shared: false
            };
            uploaded++;
        }
    }
    
    if (uploaded > 0) {
        alert(`Uploadet ${uploaded} fil${uploaded !== 1 ? 'er' : ''}`);
        renderFileExplorer();
    }
}

// Få nuværende mappe
function getCurrentFolder() {
    let folder = fileSystem[currentPath];
    for (let subPath of currentSubPath) {
        if (folder && folder.contents && folder.contents[subPath]) {
            folder = folder.contents[subPath];
        }
    }
    return folder;
}

// Naviger til mappe
function navigateToFolder(path) {
    navigationHistory.push({ path: currentPath, subPath: [...currentSubPath] });
    currentPath = path;
    currentSubPath = [];
    renderFileExplorer();
}

// Naviger tilbage
function navigateBack() {
    if (navigationHistory.length > 0) {
        const prev = navigationHistory.pop();
        currentPath = prev.path;
        currentSubPath = prev.subPath;
        renderFileExplorer();
    }
}

// Naviger op
function navigateUp() {
    if (currentSubPath.length > 0) {
        currentSubPath.pop();
        renderFileExplorer();
    }
}

// Opdater visning
function refreshExplorer() {
    renderFileExplorer();
}

// Render filsystemet
function renderFileExplorer() {
    renderFolderTree();
    renderFileList();
}

// Render folder tree med expansion
function renderFolderTree() {
    const tree = document.getElementById('folderTree');
    
    function renderTreeFolder(key, folder, level = 0) {
        const isSelected = currentPath === key && currentSubPath.length === 0;
        const hasContents = folder.contents && Object.keys(folder.contents).length > 0;
        const expandIcon = folder.expanded ? '📂' : '📁';
        
        let html = `
            <div class="tree-item ${isSelected ? 'selected' : ''}" 
                 style="padding-left: ${level * 15 + 20}px;"
                 onclick="selectTreeFolder('${key}', [])">
                <span class="tree-expand">${expandIcon}</span> ${folder.name}
            </div>
        `;
        
        if (folder.expanded && folder.contents) {
            for (let [name, item] of Object.entries(folder.contents)) {
                if (item.type === 'folder') {
                    const subSelected = currentPath === key && 
                                      currentSubPath.length > 0 && 
                                      currentSubPath[0] === name;
                    html += `
                        <div class="tree-item ${subSelected ? 'selected' : ''}"
                             style="padding-left: ${(level + 1) * 15 + 20}px;"
                             onclick="selectTreeFolder('${key}', ['${name}'])">
                            <span class="tree-expand">📁</span> ${name}
                        </div>
                    `;
                }
            }
        }
        
        return html;
    }
    
    tree.innerHTML = renderTreeFolder('root', fileSystem.root) +
                    renderTreeFolder('shared', fileSystem.shared) +
                    renderTreeFolder('recent', fileSystem.recent);
}

// Vælg mappe i tree
function selectTreeFolder(path, subPath) {
    event.stopPropagation();
    navigationHistory.push({ path: currentPath, subPath: [...currentSubPath] });
    currentPath = path;
    currentSubPath = subPath;
    
    // Toggle expanded
    let folder = fileSystem[path];
    for (let sub of subPath.slice(0, -1)) {
        if (folder.contents && folder.contents[sub]) {
            folder = folder.contents[sub];
        }
    }
    if (subPath.length === 0) {
        folder.expanded = !folder.expanded;
    }
    
    renderFileExplorer();
}

// Render fil liste med sortering
function renderFileList() {
    const folder = getCurrentFolder();
    if (!folder) return;

    let pathStr = fileSystem[currentPath].path || fileSystem[currentPath].name;
    if (currentSubPath.length > 0) {
        pathStr += '\\' + currentSubPath.join('\\');
    }
    document.getElementById('addressBar').textContent = pathStr;
    
    const tbody = document.getElementById('fileListBody');
    const contents = folder.contents || {};
    let items = Object.values(contents);

    // DEBUG: Log alle items
    console.log('=== ALL ITEMS IN FOLDER ===');
    items.forEach((item, index) => {
        console.log(`Index ${index}: name="${item.name}", type="${item.type}"`);
    });
    console.log('===========================');

    selectedFile = null;
    document.getElementById('selectedInfo').textContent = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #999;">Denne mappe er tom</td></tr>';
        document.getElementById('fileCount').textContent = '0 objekter';
        return;
    }

    // Sorter items
    items.sort((a, b) => {
        let aVal, bVal;
        
        if (sortColumn === 'name') {
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
        } else if (sortColumn === 'size') {
            aVal = a.size || 0;
            bVal = b.size || 0;
        } else if (sortColumn === 'type') {
            aVal = a.type === 'folder' ? 'Filmappe' : getFileType(a.name);
            bVal = b.type === 'folder' ? 'Filmappe' : getFileType(b.name);
        } else if (sortColumn === 'date') {
            aVal = a.date || '';
            bVal = b.date || '';
        }
        
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    tbody.innerHTML = items.map((item, index) => {
        const icon = item.type === 'folder' ? '📁' : getFileIcon(item.name);
        const size = item.type === 'folder' ? '' : formatFileSize(item.size);
        const type = item.type === 'folder' ? 'Filmappe' : getFileType(item.name);
        const sharedIcon = item.shared ? ' 🔗' : '';
        
        return `
            <tr class="file-row" onclick="selectFile(${index})" ondblclick="openItem(${index})" oncontextmenu="showContextMenu(event, ${index}); return false;">
                <td><span class="file-icon-small">${icon}</span>${item.name}${sharedIcon}</td>
                <td>${size}</td>
                <td>${type}</td>
                <td>${item.date || ''}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('fileCount').textContent = `${items.length} objekt${items.length !== 1 ? 'er' : ''}`;
}

// Vælg fil
function selectFile(index) {
    document.querySelectorAll('.file-row').forEach(row => row.classList.remove('selected'));
    
    const rows = document.querySelectorAll('.file-row');
    if (rows[index]) {
        rows[index].classList.add('selected');
        
        const folder = getCurrentFolder();
        let items = Object.values(folder.contents);
        
        // VIGTIGT: Sorter items på samme måde som i renderFileList
        items.sort((a, b) => {
            let aVal, bVal;
            
            if (sortColumn === 'name') {
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
            } else if (sortColumn === 'size') {
                aVal = a.size || 0;
                bVal = b.size || 0;
            } else if (sortColumn === 'type') {
                aVal = a.type === 'folder' ? 'Filmappe' : getFileType(a.name);
                bVal = b.type === 'folder' ? 'Filmappe' : getFileType(b.name);
            } else if (sortColumn === 'date') {
                aVal = a.date || '';
                bVal = b.date || '';
            }
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        selectedFile = items[index];
        
        console.log('Selected file:', selectedFile); // Debug
        
        const sizeInfo = selectedFile.type === 'folder' ? '' : ` (${formatFileSize(selectedFile.size)})`;
        document.getElementById('selectedInfo').textContent = `Valgt: ${selectedFile.name}${sizeInfo}`;
    }
}

// Åbn fil/mappe (double-click)
function openItem(index) {
    const folder = getCurrentFolder();
    let items = Object.values(folder.contents);
    
    // VIGTIGT: Sorter items på samme måde som i renderFileList
    items.sort((a, b) => {
        let aVal, bVal;
        
        if (sortColumn === 'name') {
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
        } else if (sortColumn === 'size') {
            aVal = a.size || 0;
            bVal = b.size || 0;
        } else if (sortColumn === 'type') {
            aVal = a.type === 'folder' ? 'Filmappe' : getFileType(a.name);
            bVal = b.type === 'folder' ? 'Filmappe' : getFileType(b.name);
        } else if (sortColumn === 'date') {
            aVal = a.date || '';
            bVal = b.date || '';
        }
        
        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    const item = items[index];

    console.log('Opening item:', item); // Debug

    // Tjek om det faktisk er en mappe (ikke bare hvis type siger folder)
    const hasContents = item.contents !== undefined;
    const hasFileExtension = item.name.includes('.');
    const isActuallyFolder = item.type === 'folder' && hasContents && !hasFileExtension;

    if (isActuallyFolder) {
        // Gå ind i mappen
        navigationHistory.push({ path: currentPath, subPath: [...currentSubPath] });
        currentSubPath.push(item.name);
        renderFileExplorer();
    } else {
        // Det er en fil - tjek om det er et billede
        const ext = item.name.split('.').pop().toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
        
        if (imageExts.includes(ext) || item.isImage) {
            showImagePreview(item);
        } else {
            alert(`Åbner filen: ${item.name}\n\n(Fil-preview kan implementeres senere)`);
        }
    }
}

// Vis billede preview
function showImagePreview(item) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    
    if (item.imageData) {
        // Hvis vi har gemt billeddataen, vis den
        modalImg.src = item.imageData;
    } else {
        // Placeholder hvis billedet ikke er uploadet (er fra demo-data)
        modalImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5CaWxsZWQgcHJldmlldzogJyArIGl0ZW0ubmFtZSArICc8L3RleHQ+PC9zdmc+';
    }
    
    modalImg.alt = item.name;
    modal.style.display = 'flex';
}

// Få fil ikon baseret på filnavn
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'xls': '📊',
        'xlsx': '📊',
        'ppt': '📊',
        'pptx': '📊',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'zip': '📦',
        'rar': '📦',
        'txt': '📃',
        'html': '🌐',
        'css': '🎨',
        'js': '⚙️'
    };
    return icons[ext] || '📄';
}

// Få fil type
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'pdf': 'PDF-dokument',
        'doc': 'Word-dokument',
        'docx': 'Word-dokument',
        'xls': 'Excel-regneark',
        'xlsx': 'Excel-regneark',
        'ppt': 'PowerPoint-præsentation',
        'pptx': 'PowerPoint-præsentation',
        'jpg': 'JPEG-billede',
        'jpeg': 'JPEG-billede',
        'png': 'PNG-billede',
        'gif': 'GIF-billede',
        'zip': 'ZIP-arkiv',
        'rar': 'RAR-arkiv',
        'txt': 'Tekstdokument',
        'html': 'HTML-dokument',
        'css': 'Stylesheet',
        'js': 'JavaScript-fil'
    };
    return types[ext] || 'Fil';
}

// Formater filstørrelse
function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// Vis context menu
function showContextMenu(event, index) {
    event.preventDefault();
    selectFile(index);
    
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
}

// Skjul context menu
document.addEventListener('click', function() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.style.display = 'none';
    }
});

// Åbn valgt fil
function openSelectedFile() {
    if (selectedFile) {
        if (selectedFile.type === 'folder') {
            navigationHistory.push({ path: currentPath, subPath: [...currentSubPath] });
            currentSubPath.push(selectedFile.name);
            renderFileExplorer();
        } else {
            alert(`Åbner: ${selectedFile.name}`);
        }
    }
}

// Klip
function cutSelected() {
    if (selectedFile) {
        clipboard = { action: 'cut', file: selectedFile, from: currentPath, fromSub: [...currentSubPath] };
        alert(`Klippet: ${selectedFile.name}`);
    }
}

// Kopier
function copySelected() {
    if (selectedFile) {
        clipboard = { action: 'copy', file: selectedFile, from: currentPath, fromSub: [...currentSubPath] };
        alert(`Kopieret: ${selectedFile.name}`);
    }
}

// Sæt ind
function pasteClipboard() {
    if (!clipboard) {
        alert('Der er intet at indsætte');
        return;
    }

    const folder = getCurrentFolder();
    if (!folder || !folder.contents) return;

    const newName = clipboard.file.name;
    
    if (folder.contents[newName]) {
        alert('En fil med dette navn eksisterer allerede!');
        return;
    }

    folder.contents[newName] = {...clipboard.file};

    if (clipboard.action === 'cut') {
        let fromFolder = fileSystem[clipboard.from];
        for (let sub of clipboard.fromSub) {
            if (fromFolder.contents && fromFolder.contents[sub]) {
                fromFolder = fromFolder.contents[sub];
            }
        }
        if (fromFolder && fromFolder.contents) {
            delete fromFolder.contents[clipboard.file.name];
        }
        clipboard = null;
    }

    renderFileExplorer();
    alert(`Indsat: ${newName}`);
}

// Slet valgt fil
function deleteSelected() {
    if (!selectedFile) {
        alert('Vælg en fil eller mappe først');
        return;
    }

    if (confirm(`Er du sikker på at du vil slette "${selectedFile.name}"?`)) {
        const folder = getCurrentFolder();
        if (folder && folder.contents) {
            delete folder.contents[selectedFile.name];
            renderFileExplorer();
        }
    }
}

// Omdøb valgt fil
function renameSelected() {
    if (!selectedFile) {
        alert('Vælg en fil eller mappe først');
        return;
    }

    const newName = prompt('Nyt navn:', selectedFile.name);
    if (newName && newName.trim() && newName !== selectedFile.name) {
        const folder = getCurrentFolder();
        if (folder && folder.contents) {
            if (folder.contents[newName]) {
                alert('En fil med dette navn eksisterer allerede!');
                return;
            }

            folder.contents[newName] = {...selectedFile, name: newName};
            delete folder.contents[selectedFile.name];
            renderFileExplorer();
        }
    }
}

// Download fil
function downloadFile() {
    if (!selectedFile) {
        alert('Vælg en fil først');
        return;
    }
    
    if (selectedFile.type === 'folder') {
        alert('Du kan ikke downloade en mappe');
        return;
    }
    
    // I en rigtig app ville vi hente filen fra serveren
    // Her simulerer vi bare en download
    const blob = new Blob(['Indhold af: ' + selectedFile.name], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert(`Downloader: ${selectedFile.name}\n\n(Dette er en demo-download. I en rigtig app ville filen blive hentet fra serveren)`);
}

// Del fil med kolleger
function shareFile() {
    if (!selectedFile) {
        alert('Vælg en fil eller mappe først');
        return;
    }
    
    // Tjek om vi er i "Delte Filer" mappen
    const isInSharedFolder = currentSubPath.includes('Delte Filer');
    
    // Opret dialog til deling
    const shareOptions = `
Vælg hvordan du vil dele "${selectedFile.name}":

1. Del med alle medarbejdere
2. Del med specifik afdeling
3. Del med specifik person
4. Fjern deling

Indtast dit valg (1-4):`;
    
    const choice = prompt(shareOptions);
    
    if (!choice) return;
    
    switch(choice) {
        case '1':
            selectedFile.sharedWith = ['Alle medarbejdere'];
            alert(`✅ "${selectedFile.name}" er nu delt med alle medarbejdere!`);
            break;
        case '2':
            const department = prompt('Indtast afdeling (f.eks. IT, HR, Salg, Marketing):');
            if (department) {
                selectedFile.sharedWith = [department];
                alert(`✅ "${selectedFile.name}" er nu delt med ${department} afdelingen!`);
            }
            break;
        case '3':
            const person = prompt('Indtast navn på person:');
            if (person) {
                selectedFile.sharedWith = [person];
                alert(`✅ "${selectedFile.name}" er nu delt med ${person}!`);
            }
            break;
        case '4':
            if (selectedFile.sharedWith) {
                delete selectedFile.sharedWith;
                alert(`🔒 Deling fjernet fra "${selectedFile.name}"`);
            } else {
                alert('Denne fil er ikke delt');
            }
            break;
        default:
            alert('Ugyldigt valg');
            return;
    }
    
    renderFileExplorer();
}

// Vis egenskaber
function showProperties() {
    if (!selectedFile) {
        alert('Vælg en fil eller mappe først');
        return;
    }

    console.log('Selected file properties:', selectedFile); // Debug
    
    const size = selectedFile.type === 'folder' ? 'Mappe' : formatFileSize(selectedFile.size);
    const type = selectedFile.type === 'folder' ? 'Filmappe' : getFileType(selectedFile.name);
    const shared = selectedFile.shared ? 'Ja' : 'Nej';
    const fileType = selectedFile.type === 'folder' ? 'Mappe' : 'Fil';
    
    alert(`Egenskaber for: ${selectedFile.name}\n\nElement type: ${fileType}\nFil type: ${type}\nStørrelse: ${size}\nÆndret: ${selectedFile.date || 'Ukendt'}\nDelt: ${shared}\n\nDebug - type property: ${selectedFile.type}`);
}

// Sorter filer
function sortFiles(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    renderFileList();
}

// Søg i filer
function searchFiles() {
    const query = prompt('Søg efter fil:');
    if (!query || !query.trim()) return;
    
    const results = [];
    
    function searchInFolder(folder, path = [], rootKey = 'root', subPath = []) {
        if (!folder.contents) return;
        
        for (let [name, item] of Object.entries(folder.contents)) {
            if (item.name.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    item: item,
                    path: path.join(' > '),
                    rootKey: rootKey,
                    subPath: [...subPath]
                });
            }
            
            if (item.type === 'folder') {
                searchInFolder(item, [...path, item.name], rootKey, [...subPath, item.name]);
            }
        }
    }
    
    searchInFolder(fileSystem.root, ['Mine dokumenter'], 'root', []);
    searchInFolder(fileSystem.shared, ['Delte filer'], 'shared', []);
    
    if (results.length === 0) {
        alert(`Ingen filer fundet for "${query}"`);
    } else {
        showSearchResults(results, query);
    }
}

// Vis søgeresultater i en dialog
function showSearchResults(results, query) {
    // Gem aktuel mappe
    const tempPath = currentPath;
    const tempSubPath = [...currentSubPath];
    
    // Vis søgeresultater i fil-listen
    currentPath = 'search';
    document.getElementById('addressBar').textContent = `Søgeresultater for "${query}"`;
    
    const tbody = document.getElementById('fileListBody');
    
    tbody.innerHTML = results.map((result, index) => {
        const icon = result.item.type === 'folder' ? '📁' : getFileIcon(result.item.name);
        const size = result.item.type === 'folder' ? '' : formatFileSize(result.item.size);
        const type = result.item.type === 'folder' ? 'Filmappe' : getFileType(result.item.name);
        const sharedIcon = result.item.shared ? ' 🔗' : '';
        
        return `
            <tr class="file-row" onclick="selectSearchResult(${index})" ondblclick="openSearchResult(${index})">
                <td><span class="file-icon-small">${icon}</span>${result.item.name}${sharedIcon}</td>
                <td>${size}</td>
                <td>${type}</td>
                <td>📁 ${result.path}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('fileCount').textContent = `${results.length} resultat${results.length !== 1 ? 'er' : ''}`;
    document.getElementById('selectedInfo').textContent = 'Dobbeltklik for at åbne placering';
    
    // Gem søgeresultater til senere brug
    window.searchResults = results;
    window.previousLocation = { path: tempPath, subPath: tempSubPath };
}

// Vælg søgeresultat
function selectSearchResult(index) {
    document.querySelectorAll('.file-row').forEach(row => row.classList.remove('selected'));
    
    const rows = document.querySelectorAll('.file-row');
    if (rows[index]) {
        rows[index].classList.add('selected');
        const result = window.searchResults[index];
        document.getElementById('selectedInfo').textContent = `Dobbeltklik for at åbne: ${result.path}`;
    }
}

// Åbn søgeresultat
function openSearchResult(index) {
    const result = window.searchResults[index];
    
    // Naviger til filens placering
    navigationHistory.push({ path: currentPath, subPath: [...currentSubPath] });
    currentPath = result.rootKey;
    currentSubPath = [...result.subPath];
    
    renderFileExplorer();
    
    // Find og vælg filen
    setTimeout(() => {
        const folder = getCurrentFolder();
        const items = Object.values(folder.contents);
        const itemIndex = items.findIndex(item => item.name === result.item.name);
        
        if (itemIndex >= 0) {
            selectFile(itemIndex);
        }
    }, 100);
}

// Vis ny mappe dialog
function showNewFolderDialog() {
    const folderName = prompt('Navn på ny mappe:');
    if (folderName && folderName.trim()) {
        createNewFolder(folderName.trim());
    }
}

// Opret ny mappe
function createNewFolder(name) {
    const folder = getCurrentFolder();
    if (folder && folder.contents) {
        if (folder.contents[name]) {
            alert('En mappe med dette navn eksisterer allerede!');
            return;
        }
        folder.contents[name] = {
            type: 'folder',
            name: name,
            expanded: false,
            contents: {},
            date: new Date().toLocaleDateString('da-DK')
        };
        renderFileExplorer();
    }
}

// Upload fil til explorer
function uploadFileToExplorer(event) {
    const file = event.target.files[0];
    if (!file) return;

    const folder = getCurrentFolder();
    if (folder && folder.contents) {
        // Tjek om det er et billede
        const isImage = file.type.startsWith('image/');
        
        if (isImage) {
            // Læs billedet som base64 så vi kan vise det senere
            const reader = new FileReader();
            reader.onload = function(e) {
                folder.contents[file.name] = {
                    type: 'file',
                    name: file.name,
                    size: file.size,
                    date: new Date().toLocaleDateString('da-DK'),
                    shared: false,
                    isImage: true,
                    imageData: e.target.result  // Gem billeddataen!
                };
                
                console.log('Uploading image file:', file.name);
                renderFileExplorer();
            };
            reader.readAsDataURL(file);
        } else {
            // Almindelig fil
            folder.contents[file.name] = {
                type: 'file',
                name: file.name,
                size: file.size,
                date: new Date().toLocaleDateString('da-DK'),
                shared: false,
                isImage: false
            };
            
            console.log('Uploading file:', file.name);
            renderFileExplorer();
        }
    }
    
    // Reset input så samme fil kan uploades igen
    event.target.value = '';
}
