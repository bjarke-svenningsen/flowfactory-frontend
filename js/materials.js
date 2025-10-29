// materials.js - Materialer håndtering (Admin only)
import { Auth, Materials } from './api.js';

const materialsPage = {
    materials: [],
    filteredMaterials: [],

    async init() {
        // Check if user is admin
        try {
            const userData = await Auth.me();
            if (!userData.user.is_admin) {
                alert('Kun administratorer har adgang til materialer-siden');
                window.location.href = 'dashboard.html';
                return;
            }
        } catch (error) {
            window.location.href = 'index.html';
            return;
        }

        await this.loadMaterials();
    },

    async loadMaterials() {
        try {
            const materials = await Materials.getAll();
            this.materials = materials;
            this.filteredMaterials = materials;
            this.renderMaterials();
        } catch (error) {
            console.error('Error loading materials:', error);
            this.showError('Kunne ikke indlæse materialer');
        }
    },

    renderMaterials() {
        const tbody = document.getElementById('materialsTableBody');
        
        if (this.filteredMaterials.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <i>📦</i>
                            <p>Ingen materialer fundet</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.filteredMaterials.map(material => `
            <tr>
                <td><span class="material-number">${material.material_number}</span></td>
                <td>${material.name}</td>
                <td>${this.renderCategoryBadge(material.category)}</td>
                <td>${material.unit || 'stk'}</td>
                <td class="price-cell">${parseFloat(material.cost_price).toFixed(2)} kr</td>
                <td class="price-cell">${parseFloat(material.sales_price).toFixed(2)} kr</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon btn-edit" onclick="materialsPage.editMaterial(${material.id})" title="Rediger">
                            ✏️
                        </button>
                        <button class="btn-icon btn-delete" onclick="materialsPage.deleteMaterial(${material.id})" title="Slet">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    renderCategoryBadge(category) {
        if (!category) return '<span class="category-badge">Ingen kategori</span>';
        
        const categoryClass = category.toLowerCase().replace(/\s+/g, '-');
        return `<span class="category-badge category-${categoryClass}">${category}</span>`;
    },

    filterMaterials() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;

        this.filteredMaterials = this.materials.filter(material => {
            const matchesSearch = 
                material.material_number.toLowerCase().includes(searchTerm) ||
                material.name.toLowerCase().includes(searchTerm) ||
                (material.description && material.description.toLowerCase().includes(searchTerm));

            const matchesCategory = !categoryFilter || material.category === categoryFilter;

            return matchesSearch && matchesCategory;
        });

        this.renderMaterials();
    },

    openCreateModal() {
        document.getElementById('modalTitle').textContent = 'Nyt Materiale';
        document.getElementById('materialForm').reset();
        document.getElementById('editingMaterialId').value = '';
        document.getElementById('materialModal').classList.add('active');
    },

    async editMaterial(materialId) {
        const material = this.materials.find(m => m.id === materialId);
        if (!material) return;

        document.getElementById('modalTitle').textContent = 'Rediger Materiale';
        document.getElementById('materialNumber').value = material.material_number;
        document.getElementById('name').value = material.name;
        document.getElementById('description').value = material.description || '';
        document.getElementById('category').value = material.category || '';
        document.getElementById('unit').value = material.unit || 'stk';
        document.getElementById('costPrice').value = material.cost_price;
        document.getElementById('salesPrice').value = material.sales_price;
        document.getElementById('editingMaterialId').value = material.id;
        
        document.getElementById('materialModal').classList.add('active');
    },

    async saveMaterial(event) {
        event.preventDefault();

        const materialData = {
            material_number: document.getElementById('materialNumber').value,
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            category: document.getElementById('category').value,
            unit: document.getElementById('unit').value,
            cost_price: parseFloat(document.getElementById('costPrice').value),
            sales_price: parseFloat(document.getElementById('salesPrice').value)
        };

        const editingId = document.getElementById('editingMaterialId').value;

        try {
            if (editingId) {
                // Update existing material
                await Materials.update(editingId, materialData);
                this.showSuccess('Materiale opdateret!');
            } else {
                // Create new material
                await Materials.create(materialData);
                this.showSuccess('Materiale oprettet!');
            }

            this.closeModal();
            await this.loadMaterials();
        } catch (error) {
            console.error('Error saving material:', error);
            this.showError(error.message || 'Kunne ikke gemme materiale');
        }
    },

    async deleteMaterial(materialId) {
        const material = this.materials.find(m => m.id === materialId);
        if (!material) return;

        if (!confirm(`Er du sikker på at du vil slette "${material.name}"?\n\nDette kan kun gøres hvis materialet ikke er brugt i timeregistreringer eller ordre.`)) {
            return;
        }

        try {
            await Materials.delete(materialId);
            this.showSuccess('Materiale slettet!');
            await this.loadMaterials();
        } catch (error) {
            console.error('Error deleting material:', error);
            this.showError(error.message || 'Kunne ikke slette materiale. Det kan være i brug.');
        }
    },

    closeModal() {
        document.getElementById('materialModal').classList.remove('active');
    },

    showSuccess(message) {
        // Simple alert for now - you can replace with a nicer notification system
        alert('✅ ' + message);
    },

    showError(message) {
        alert('❌ ' + message);
    }
};

// Export globally for dashboard to access
window.materialsPage = materialsPage;

// Wait for elements to exist before initializing
function waitForElements() {
    const checkElements = () => {
        if (document.getElementById('materialsTableBody') && document.getElementById('materialModal')) {
            materialsPage.init();
            
            // Setup modal close listener
            document.getElementById('materialModal').addEventListener('click', (e) => {
                if (e.target.id === 'materialModal') {
                    materialsPage.closeModal();
                }
            });
        } else {
            setTimeout(checkElements, 50);
        }
    };
    checkElements();
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForElements);
} else {
    waitForElements();
}
