// js/quotes/quotes-utils.js - Shared utilities and constants

// Available units for quote lines
const UNITS = [
    'Stk.', 'ton', 'uger', 'sæt', 'sessioner', 
    'pakker', 'meter', 'mdr.', 'liter', 'kvm', 
    'kubikmeter', 'km', 'kg', 'kasser', 'kartoner', 
    'forsendelser', 'dage', 'æsker'
];

// Format currency to Danish Kroner
function formatCurrency(amount) {
    return new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK'
    }).format(amount);
}

// Calculate line total with discount
function calculateLineTotal(line) {
    const subtotal = (line.unit_price || 0) * (line.quantity || 0);
    const discount = subtotal * ((line.discount_percent || 0) / 100);
    return subtotal - discount;
}

// Create empty line template
function createEmptyLine() {
    return {
        description: '',
        quantity: 1,
        unit: 'Stk.',
        unit_price: 0,
        discount_percent: 0
    };
}

// Get default valid until date (30 days from now)
function getDefaultValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
}

// Convert UTC timestamp to local Danish time
function convertUTCtoLocal(utcDateString) {
    // If timestamp doesn't have 'Z' suffix, add it to indicate UTC
    let dateStr = utcDateString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr = dateStr + 'Z';
    }
    
    const date = new Date(dateStr);
    
    // Format: DD.MM.YYYY HH:MM:SS
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

// Export to window
window.UNITS = UNITS;
window.formatCurrency = formatCurrency;
window.calculateLineTotal = calculateLineTotal;
window.createEmptyLine = createEmptyLine;
window.getDefaultValidUntil = getDefaultValidUntil;
window.convertUTCtoLocal = convertUTCtoLocal;
