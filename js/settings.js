// Settings Page Functions

function changePassword() {
    const oldPassword = prompt('Indtast nuværende adgangskode:');
    if (!oldPassword) return;
    
    const newPassword = prompt('Indtast ny adgangskode:');
    if (!newPassword) return;
    
    const confirmPassword = prompt('Bekræft ny adgangskode:');
    if (newPassword !== confirmPassword) {
        alert('❌ Adgangskoderne matcher ikke!');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('❌ Adgangskoden skal være mindst 6 tegn lang!');
        return;
    }
    
    // Her ville vi normalt sende til backend
    alert('✅ Adgangskode ændret succesfuldt!\n\n(I en rigtig app ville dette opdatere din adgangskode i databasen)');
}

function clearCache() {
    if (confirm('Er du sikker på at du vil rydde cache?\n\nDette vil slette alle midlertidige filer og du bliver logget ud.')) {
        sessionStorage.clear();
        localStorage.clear();
        alert('✅ Cache ryddet! Du bliver nu logget ud.');
        window.location.href = 'index.html';
    }
}

function exportData() {
    const userData = {
        user: window.currentUser,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
    };
    
    const dataStr = JSON.stringify(userData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowfactory-data-${window.currentUser.name.replace(/\s+/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('✅ Dine data er blevet eksporteret!');
}

function changeTheme(theme) {
    // Store theme preference
    localStorage.setItem('theme', theme);
    
    // Apply theme (can be expanded with actual theme switching logic)
    console.log('Theme changed to:', theme);
    
    // Future: Add actual dark/light theme implementation
    alert(`✅ Tema ændret til: ${theme}\n\n(Fuld tema-funktionalitet kan implementeres senere)`);
}

// Initialize settings page
window.pageLoader.registerPageInit('settings', function() {
    // Load saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
});
