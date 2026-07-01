// =============================================
// GLP-1 Virtual Screener — Frontend Logic
// =============================================

// Global error handler to surface any JS issues
window.addEventListener('error', function(event) {
    alert('JavaScript Error: ' + event.message);
    console.error(event);
});
console.log('App.js loaded');
    console.log("GLP-1 Screener Initializing...");

    const API_BASE = window.API_BASE_URL || (window.location.protocol === 'file:' ? 'http://127.0.0.1:5000' : '');
    let allResults = [];
    let filteredResults = [];
    let currentFilter = 'all';
    let currentPage = 1;
    const PAGE_SIZE = 20;
    let scoreChart = null;
    let sortState = { col: 'score', dir: 'desc' };

    // --- Utility: Toast ---
    function showToast(msg) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // --- Particles ---
    function initParticles() {
        try {
            const container = document.getElementById('particles');
            if (!container) return;
            const colors = ['#6c63ff', '#00d4aa', '#ff6b6b', '#ffd166'];
            for (let i = 0; i < 30; i++) {
                const p = document.createElement('div');
                p.classList.add('particle');
                const size = Math.random() * 4 + 2;
                p.style.cssText = `
                    width:${size}px; height:${size}px;
                    left:${Math.random()*100}%;
                    background:${colors[Math.floor(Math.random()*colors.length)]};
                    animation-duration:${Math.random()*20+15}s;
                    animation-delay:${Math.random()*10}s;
                `;
                container.appendChild(p);
            }
        } catch (e) { console.error("Particles failed", e); }
    }

    // --- Status Check ---
    async function checkStatus() {
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('status-text');
        if (!dot || !txt) return;
        try {
            const res = await fetch(`${API_BASE}/api/status`);
            const data = await res.json();
            if (data.model_loaded) {
                dot.className = 'status-dot online';
                txt.textContent = `Model ready (${data.model_type})`;
            } else {
                dot.className = 'status-dot error';
                txt.textContent = 'Model not loaded';
            }
        } catch {
            dot.className = 'status-dot error';
            txt.textContent = 'Server offline';
        }
    }

    // --- Tabs ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            console.log("Tab clicked:", btn.dataset.tab);
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetId = `content-${btn.dataset.tab}`;
            const target = document.getElementById(targetId);
            if (target) target.classList.add('active');
            validateRunButton();
        };
    });

    // --- SMILES Textarea ---
    const smilesInput = document.getElementById('smiles-input');
    const lineCount = document.getElementById('line-count');
    const searchInput = document.getElementById('search-input');

    if (smilesInput) {
        smilesInput.oninput = () => {
            const lines = smilesInput.value.split('\n').filter(l => l.trim()).length;
            if (lineCount) lineCount.textContent = `${lines} compound${lines !== 1 ? 's' : ''}`;
            validateRunButton();
        };
    }

    const loadExampleBtn = document.getElementById('btn-load-example');
    if (loadExampleBtn) {
        loadExampleBtn.onclick = () => {
            console.log('Load example clicked');
            smilesInput.value = `CC(=O)Oc1ccccc1C(=O)O, Aspirin
CN1C=NC2=C1C(=O)N(C(=O)N2C)C, Caffeine
CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C, Testosterone
OC(=O)Cc1ccccc1Nc1c(Cl)cccc1Cl, Diclofenac
CC(C)Cc1ccc(cc1)C(C)C(=O)O, Ibuprofen
c1ccc2c(c1)ccc1ccccc12, Anthracene
CCO, Ethanol
O=C(O)c1ccc(N)cc1, p-Aminobenzoic acid
C1CCCCC1, Cyclohexane
CC(=O)c1ccc(O)cc1, Paracetamol`;
            smilesInput.dispatchEvent(new Event('input'));
        };
    }

    // --- CSV Upload ---
    let csvData = [];
    const dropzone = document.getElementById('dropzone');
    const csvFileInput = document.getElementById('csv-input');
    const browseBtn = document.getElementById('btn-browse');

    if (browseBtn) {
        browseBtn.onclick = () => {
            console.log('Browse button clicked');
            csvFileInput.click();
        };
    }
    if (dropzone) {
        dropzone.onclick = () => csvFileInput.click();
        dropzone.ondragover = e => { e.preventDefault(); dropzone.classList.add('drag-over'); };
        dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
        dropzone.ondrop = e => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) handleCSVFile(e.dataTransfer.files[0]);
        };
    }
    if (csvFileInput) csvFileInput.onchange = e => { if (e.target.files[0]) handleCSVFile(e.target.files[0]); };

    function handleCSVFile(file) {
        if (!file) return;
        showToast(`Reading ${file.name}...`);
        const reader = new FileReader();
        reader.onload = e => parseCSV(e.target.result, file.name);
        reader.readAsText(file);
    }

    function parseCSV(text, filename) {
        if (!text) return;
        
        // Find line endings and detect delimiter
        const firstLineEnd = text.indexOf('\n');
        const firstLine = (firstLineEnd === -1) ? text : text.substring(0, firstLineEnd).trim();
        
        if (!firstLine) { showToast('CSV file is empty.'); return; }

        const delimiters = [';', ',', '\t'];
        let delim = ',';
        for (const d of delimiters) {
            if (firstLine.split(d).length > 1) { delim = d; break; }
        }

        const headers = firstLine.split(delim).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
        const smilesIdx = headers.findIndex(h => h.includes('smiles'));
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('id') || h.includes('molport'));

        if (smilesIdx === -1) { 
            showToast('SMILES column not found. Headers: ' + headers.join(', ')); 
            return; 
        }

        csvData = [];
        let pos = firstLineEnd + 1;
        let nextPos = text.indexOf('\n', pos);
        let count = 0;

        while (pos < text.length) {
            const line = (nextPos === -1) ? text.substring(pos).trim() : text.substring(pos, nextPos).trim();
            if (line) {
                const cols = line.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols[smilesIdx]) {
                    csvData.push({
                        smiles: cols[smilesIdx],
                        name: (nameIdx !== -1 && cols[nameIdx]) ? cols[nameIdx] : `Compound_${++count}`
                    });
                }
            }
            if (nextPos === -1) break;
            pos = nextPos + 1;
            nextPos = text.indexOf('\n', pos);
        }

        const preview = document.getElementById('csv-preview');
        if (preview) {
            preview.style.display = 'block';
            preview.innerHTML = `<strong style="color:var(--accent-secondary)">✓ ${filename}</strong> — ${csvData.length} compounds loaded<br><br>` +
                csvData.slice(0, 5).map(d => `${d.name}: ${d.smiles}`).join('<br>') +
                (csvData.length > 5 ? `<br>... and ${csvData.length - 5} more` : '');
        }
        if (dropzone) dropzone.style.display = 'none';
        validateRunButton();
    }

    // --- Validate Run Button ---
    function validateRunButton() {
        const btn = document.getElementById('btn-run');
        if (!btn) return;
        const activeTabBtn = document.querySelector('.tab-btn.active');
        const activeTab = activeTabBtn ? activeTabBtn.dataset.tab : 'paste';
        if (activeTab === 'paste') {
            btn.disabled = smilesInput.value.trim().split('\n').filter(l => l.trim()).length === 0;
        } else {
            btn.disabled = csvData.length === 0;
        }
    }

    // --- Build SMILES list ---
    function buildSmilesList() {
        const activeTabBtn = document.querySelector('.tab-btn.active');
        const activeTab = activeTabBtn ? activeTabBtn.dataset.tab : 'paste';
        if (activeTab === 'csv') return csvData;

        return smilesInput.value.trim().split('\n')
            .filter(l => l.trim())
            .map((line, i) => {
                const parts = line.split(/[,\t;]/);
                return {
                    smiles: parts[0].trim(),
                    name: parts[1]?.trim() || `Compound_${i + 1}`
                };
            });
    }

    // --- Run Screening ---
    const runBtn = document.getElementById('btn-run');
    if (runBtn) {
        runBtn.onclick = async () => {
            const smilesList = buildSmilesList();
            if (!smilesList.length) return;

            const btnText = runBtn.querySelector('.btn-text');
            const btnIcon = runBtn.querySelector('.btn-icon');
            const btnLoader = runBtn.querySelector('.btn-loader');
            
            runBtn.disabled = true;
            if (btnText) btnText.textContent = 'Running...';
            if (btnIcon) btnIcon.style.display = 'none';
            if (btnLoader) btnLoader.style.display = 'block';

            const progressSection = document.getElementById('progress-section');
            const progressBar = document.getElementById('progress-bar');
            const progressLabel = document.getElementById('progress-label');
            if (progressSection) progressSection.style.display = 'block';

            try {
                const BATCH_SIZE = 1000;
                let processedResults = [];
                let totalActive = 0;
                let totalInactive = 0;
                let totalInvalid = 0;

                const totalBatches = Math.ceil(smilesList.length / BATCH_SIZE);

                for (let i = 0; i < totalBatches; i++) {
                    const batch = smilesList.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
                    if (progressLabel) progressLabel.textContent = `Batch ${i + 1} / ${totalBatches} (${processedResults.length} done)`;
                    if (progressBar) progressBar.style.width = ((i / totalBatches) * 100) + '%';

                    const res = await fetch(`${API_BASE}/api/predict`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ smiles_list: batch })
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || `Server error in batch ${i + 1}`);
                    }

                    const data = await res.json();
                    processedResults = processedResults.concat(data.results);
                    totalActive += data.active;
                    totalInactive += data.inactive;
                    totalInvalid += data.invalid;
                }

                if (progressBar) progressBar.style.width = '100%';
                if (progressLabel) progressLabel.textContent = 'Screening Complete!';

                setTimeout(() => {
                    if (progressSection) progressSection.style.display = 'none';
                }, 1000);

                allResults = processedResults;
                renderDashboard({
                    results: processedResults,
                    total: processedResults.length,
                    active: totalActive,
                    inactive: totalInactive,
                    invalid: totalInvalid
                });
                showToast(`✅ Successfully processed ${processedResults.length} molecules`);

            } catch (err) {
                console.error(err);
                if (progressSection) progressSection.style.display = 'none';
                showToast(`❌ Error: ${err.message}`);
                alert("Error: " + err.message);
            } finally {
                runBtn.disabled = false;
                if (btnText) btnText.textContent = 'Run Screening';
                if (btnIcon) btnIcon.style.display = 'block';
                if (btnLoader) btnLoader.style.display = 'none';
                validateRunButton();
            }
        };
    }

    // --- Dashboard ---
    function renderDashboard(data) {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setVal('sc-total', data.total);
        setVal('sc-active', data.active);
        setVal('sc-inactive', data.inactive);
        const rate = data.total > 0 ? ((data.active / data.total) * 100).toFixed(1) : 0;
        setVal('sc-rate', rate + '%');

        const rs = document.getElementById('results-section');
        if (rs) rs.style.display = 'block';

        applyFilter('all');
        if (window.Chart) renderChart(allResults);
    }

    // --- Chart ---
    function renderChart(results) {
        const chartEl = document.getElementById('score-chart');
        if (!chartEl) return;
        const ctx = chartEl.getContext('2d');
        if (scoreChart) scoreChart.destroy();

        const valid = results.filter(r => r.score !== null).slice(0, 50); 
        const labels = valid.map(r => r.name.substring(0, 10));
        const scores = valid.map(r => r.score);
        const colors = valid.map(r => r.label === 'Active' ? '#00d4aa' : '#ff6b6b');

        scoreChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Score', data: scores, backgroundColor: colors }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- Filters & Sort ---
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFilter(btn.dataset.filter);
        };
    });

    if (searchInput) {
        searchInput.oninput = () => applyFilter(currentFilter);
    }

    function applyFilter(filter) {
        currentFilter = filter;
        const q = searchInput ? searchInput.value.toLowerCase() : '';
        filteredResults = allResults
            .filter(r => filter === 'all' || r.label === filter)
            .filter(r => !q || r.name.toLowerCase().includes(q) || r.smiles.toLowerCase().includes(q));
        sortResults();
        currentPage = 1;
        renderTable();
    }

    document.querySelectorAll('th.sortable').forEach(th => {
        th.onclick = () => {
            const col = th.dataset.col;
            sortState.dir = sortState.col === col && sortState.dir === 'desc' ? 'asc' : 'desc';
            sortState.col = col;
            sortResults();
            renderTable();
        };
    });

    function sortResults() {
        const { col, dir } = sortState;
        filteredResults.sort((a, b) => {
            let va = a.score, vb = b.score;
            if (col === 'name') { va = a.name; vb = b.name; }
            if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return dir === 'asc' ? (va||0) - (vb||0) : (vb||0) - (va||0);
        });
    }

    // --- Table ---
    function renderTable() {
        const tbody = document.getElementById('results-body');
        if (!tbody) return;
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageData = filteredResults.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = pageData.map((r, i) => {
            const score = r.score !== null ? r.score.toFixed(4) : '—';
            const badgeClass = r.label === 'Active' ? 'badge-active' : r.label === 'Inactive' ? 'badge-inactive' : 'badge-invalid';
            return `
                <tr onclick="window.openMoleculeModal(${start + i})" style="cursor:pointer">
                    <td>${start + i + 1}</td>
                    <td>${r.name}</td>
                    <td>${score}</td>
                    <td><span class="badge ${badgeClass}">${r.label}</span></td>
                    <td>${r.properties?.mw || '—'}</td>
                    <td>${r.properties?.logp || '—'}</td>
                    <td>${r.properties?.hba || '—'}</td>
                    <td>${r.properties?.hbd || '—'}</td>
                    <td>${r.properties?.tpsa || '—'}</td>
                    <td class="td-smiles" style="max-width:150px; overflow:hidden; text-overflow:ellipsis;">${r.smiles}</td>
                </tr>
            `;
        }).join('');

        const total = filteredResults.length;
        const showingCount = document.getElementById('showing-count');
        if (showingCount) showingCount.textContent = `Total: ${total} | Page ${currentPage}`;
        renderPagination();
    }

    window.openMoleculeModal = (idx) => {
        const r = filteredResults[idx];
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        if (!r || !overlay || !content) return;

        content.innerHTML = `
            <h2 class="modal-title">${r.name}</h2>
            <p class="modal-smiles" style="word-break:break-all">${r.smiles}</p>
            <div class="modal-score-section">
                <span class="modal-score-big">${r.score?.toFixed(4) || '—'}</span>
                <span class="badge ${r.label === 'Active' ? 'badge-active' : 'badge-inactive'}">${r.label}</span>
            </div>
            <div class="modal-props">
                <div class="modal-prop"><div class="prop-value">${r.properties?.mw || '—'}</div><div class="prop-label">MW</div></div>
                <div class="modal-prop"><div class="prop-value">${r.properties?.logp || '—'}</div><div class="prop-label">LogP</div></div>
                <div class="modal-prop"><div class="prop-value">${r.properties?.hba || '—'}</div><div class="prop-label">HBA</div></div>
                <div class="modal-prop"><div class="prop-value">${r.properties?.hbd || '—'}</div><div class="prop-label">HBD</div></div>
            </div>
        `;
        overlay.style.display = 'flex';
    };

    function renderPagination() {
        const pg = document.getElementById('pagination');
        if (!pg) return;
        const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);
        pg.innerHTML = '';
        if (totalPages <= 1) return;

        // Helper to create page button
        const createBtn = (page, text, active = false, disabled = false) => {
            const btn = document.createElement('button');
            btn.className = 'page-btn' + (active ? ' active' : '');
            btn.textContent = text;
            btn.disabled = disabled;
            if (!disabled && page !== null) {
                btn.onclick = () => {
                    currentPage = page;
                    renderTable();
                };
            }
            return btn;
        };

        // Previous button
        pg.appendChild(createBtn(currentPage - 1, '‹', false, currentPage === 1));

        const maxVisible = 7;
        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) {
                pg.appendChild(createBtn(i, i, i === currentPage));
            }
        } else {
            // First page
            pg.appendChild(createBtn(1, 1, 1 === currentPage));

            if (currentPage <= 4) {
                // Near start
                for (let i = 2; i <= 5; i++) {
                    pg.appendChild(createBtn(i, i, i === currentPage));
                }
                pg.appendChild(createBtn(null, '...', false, true));
                pg.appendChild(createBtn(totalPages, totalPages, totalPages === currentPage));
            } else if (currentPage >= totalPages - 3) {
                // Near end
                pg.appendChild(createBtn(null, '...', false, true));
                for (let i = totalPages - 4; i < totalPages; i++) {
                    pg.appendChild(createBtn(i, i, i === currentPage));
                }
                pg.appendChild(createBtn(totalPages, totalPages, totalPages === currentPage));
            } else {
                // In the middle
                pg.appendChild(createBtn(null, '...', false, true));
                for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                    pg.appendChild(createBtn(i, i, i === currentPage));
                }
                pg.appendChild(createBtn(null, '...', false, true));
                pg.appendChild(createBtn(totalPages, totalPages, totalPages === currentPage));
            }
        }

        // Next button
        pg.appendChild(createBtn(currentPage + 1, '›', false, currentPage === totalPages));
    }

    const modalClose = document.getElementById('modal-close');
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalClose) modalClose.onclick = () => modalOverlay.style.display = 'none';
    if (modalOverlay) modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };

    // --- Export ---
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) {
        exportBtn.onclick = async () => {
            if (!allResults.length) return;
            try {
                const res = await fetch(`${API_BASE}/api/export`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ results: filteredResults })
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'screening_results.csv';
                a.click();
            } catch (e) { showToast('❌ Export failed'); }
        };
    }

    const exportActiveBtn = document.getElementById('btn-export-active');
    if (exportActiveBtn) {
        exportActiveBtn.onclick = async () => {
            const activesOnly = allResults.filter(r => r.label === 'Active');
            if (!activesOnly.length) {
                showToast('⚠️ No active compounds to export');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/export`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ results: activesOnly })
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'active_compounds_list.csv';
                a.click();
            } catch (e) { showToast('❌ Export failed'); }
        };
    }

    // --- Start ---
    initParticles();
    checkStatus();
    setInterval(checkStatus, 15000);
    // Ensure buttons are correctly enabled after initial load
    validateRunButton();
