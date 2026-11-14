(function() {
    let allItems = {};
    let recipes = {};
    let partsDB = {};
    let currentPartCode = null;
    let craftAmount = 1;
    
    // 记录中间树的局部状态
    let nodeInventory = {}; 
    let nodeUnlimited = {};
    let expandedItems = new Set();

    const matrixBody = document.getElementById('matrixBody');
    const craftBody = document.getElementById('craftBody');
    const inventoryBody = document.getElementById('inventoryBody');

    const rows = [
        { level: 1, name: '鲨鱼级' }, { level: 2, name: '甲鳖级' },
        { level: 3, name: '须鲸级' }, { level: 4, name: '腔棘鱼级' }, { level: 5, name: '希尔德拉' }
    ];

    // ==========================================
    // 💾 自动保存与读取系统
    // ==========================================
    function saveState() {
        const state = {
            currentPartCode,
            craftAmount,
            nodeInventory,
            nodeUnlimited,
            expandedItems: Array.from(expandedItems) // Set 转换为数组保存
        };
        localStorage.setItem('submarine_calc_state', JSON.stringify(state));
    }

    function loadState() {
        const saved = localStorage.getItem('submarine_calc_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                if (state.currentPartCode) currentPartCode = state.currentPartCode;
                if (state.craftAmount) craftAmount = state.craftAmount;
                if (state.nodeInventory) nodeInventory = state.nodeInventory;
                if (state.nodeUnlimited) nodeUnlimited = state.nodeUnlimited;
                if (state.expandedItems) expandedItems = new Set(state.expandedItems);
            } catch (e) {
                console.error('读取存档失败', e);
            }
        }
    }

    async function loadData() {
        const res = await fetch('./items.json');
        const data = await res.json();
        allItems = data.items;
        recipes = data.recipes;
        partsDB = data.parts;
        
        // 数据加载完后再读取保存的状态
        loadState();
    }

    function renderIcon(item, container) {
        const iconStr = item.icon || '📦';
        if (iconStr.includes('/') || iconStr.includes('.') || iconStr.startsWith('http')) {
            const img = document.createElement('img');
            img.src = iconStr;
            img.alt = item.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.onerror = () => { container.textContent = '📦'; };
            container.innerHTML = ''; 
            container.appendChild(img);
        } else {
            container.textContent = iconStr;
        }
    }

    function renderMatrix() {
        matrixBody.innerHTML = '';
        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="row-label">${row.name}</td>`;
            for (let i = 0; i < 4; i++) {
                const td = document.createElement('td');
                let codeArr = ['0', '0', '0', '0'];
                codeArr[i] = row.level.toString();
                const code = codeArr.join('');

                const btn = document.createElement('button');
                btn.className = 'part-btn';
                btn.textContent = row.level;
                
                if (partsDB[code]) {
                    // 恢复高亮状态
                    if (currentPartCode === code) btn.classList.add('active');
                    
                    btn.onclick = () => {
                        document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        currentPartCode = code;
                        craftAmount = 1;
                        expandedItems.clear(); 
                        nodeInventory = {}; 
                        nodeUnlimited = {};
                        updateUI();
                    };
                } else {
                    btn.className += ' disabled';
                    btn.title = '暂无此部件数据';
                }
                td.appendChild(btn);
                tr.appendChild(td);
            }
            matrixBody.appendChild(tr);
        });
    }

    function getNodeState(path) {
        return {
            isUnlimited: nodeUnlimited[path] || false,
            have: nodeInventory[path] || 0
        };
    }

    function updateUI() {
        renderCraftPanel();
        renderSummaryPanel();
        saveState(); // 🔥 每次 UI 更新后，立刻存档
    }

    function renderCraftPanel() {
        if (!currentPartCode || !partsDB[currentPartCode]) {
            craftBody.innerHTML = '<div class="empty-state">请在左侧选择一个部件</div>';
            return;
        }
        const part = partsDB[currentPartCode];
        
        let html = `
            <div class="craft-header">
                <div>
                    <h3>${part.name} <span class="badge">${currentPartCode}</span></h3>
                    <div style="font-size:0.85rem; color:var(--text-sub); margin-top:4px;">制作 ${craftAmount} 份所需</div>
                </div>
                <div class="craft-amount-ctrl">
                    <button onclick="updateAmount(-1)">-</button>
                    <input type="number" min="1" value="${craftAmount}" onchange="setAmount(this.value)">
                    <button onclick="updateAmount(1)">+</button>
                </div>
            </div>
            <ul class="tree-list">
        `;

        function renderNode(itemId, neededAmount, path) {
            const item = allItems[itemId];
            if (!item) return '';
            
            const { isUnlimited, have } = getNodeState(path);
            
            let missing = isUnlimited ? 0 : Math.max(0, neededAmount - have);
            
            let missingHtml = '';
            if (missing > 0) {
                missingHtml = `<span class="stat-missing neg">缺 ${missing}</span>`;
            } else {
                missingHtml = `<span class="stat-missing pos">已够</span>`;
            }
            
            const hasRecipe = recipes[itemId];
            const isT0 = !hasRecipe;

            if (isUnlimited) expandedItems.delete(path);
            const isExpanded = expandedItems.has(path);
            const showClass = isExpanded ? 'show' : '';
            const iconClass = isExpanded ? 'toggle-icon open' : 'toggle-icon';

            const inlineInput = isUnlimited 
                ? `<span style="color:var(--primary); font-weight:bold; font-size:0.85rem; width:55px; text-align:center;">MAX</span>`
                : `<input type="text" class="inline-inv-input" value="${have}" data-path="${path}" onfocus="if(this.value==='0')this.value='';" onblur="if(this.value==='')this.value='0';" oninput="updateNodeInventory('${path}', this.value)" onclick="event.stopPropagation()">`;
            
            const inlineCheckbox = `<input type="checkbox" class="inline-checkbox" ${isUnlimited?'checked':''} onchange="toggleNodeUnlimited('${path}', this.checked)" onclick="event.stopPropagation()" title="勾选代表当前层级管够">`;

            let nodeHtml = `
                <li class="tree-item">
                    <div class="tree-node ${isT0 ? 'is-t0' : ''}" onclick="toggleTree(this, '${path}')">
                        <div class="node-name">
                            ${hasRecipe ? `<span class="${iconClass}">▶</span>` : '<span class="toggle-icon" style="opacity:0">▶</span>'}
                            <span class="node-icon" data-icon="${itemId}"></span> 
                            ${item.name}
                        </div>
                        <div class="node-stats">
                            <span class="stat-needed">需: ${neededAmount}</span>
                            <div class="inline-ctrl">
                                ${inlineCheckbox}
                                ${inlineInput}
                            </div>
                            ${missingHtml}
                        </div>
                    </div>
            `;

            if (hasRecipe && !isUnlimited) { 
                nodeHtml += `<ul class="tree-children ${showClass}">`;
                const actualCraftAmount = Math.max(0, neededAmount - have);
                for (let comp of recipes[itemId]) {
                    const childPath = path + '-' + comp.item;
                    nodeHtml += renderNode(comp.item, actualCraftAmount * comp.amount, childPath);
                }
                nodeHtml += `</ul>`;
            }
            nodeHtml += `</li>`;
            return nodeHtml;
        }

        for (let i = 0; i < part.recipe.length; i++) {
            const comp = part.recipe[i];
            const rootPath = `root-${comp.item}-${i}`;
            html += renderNode(comp.item, comp.amount * craftAmount, rootPath);
        }
        html += `</ul>`;
        
        craftBody.innerHTML = html;

        craftBody.querySelectorAll('[data-icon]').forEach(span => {
            const id = span.getAttribute('data-icon');
            if (allItems[id]) renderIcon(allItems[id], span);
        });
    }

    function renderSummaryPanel() {
        if (!currentPartCode || !partsDB[currentPartCode]) {
            inventoryBody.innerHTML = '<div class="empty-state">请在左侧选择一个部件</div>';
            return;
        }

        const part = partsDB[currentPartCode];
        
        const totalNeeds = {};
        function calcTotal(itemId, amount) {
            totalNeeds[itemId] = (totalNeeds[itemId] || 0) + amount;
            if (recipes[itemId]) {
                for (let comp of recipes[itemId]) {
                    calcTotal(comp.item, amount * comp.amount);
                }
            }
        }
        for (let comp of part.recipe) {
            calcTotal(comp.item, comp.amount * craftAmount);
        }

        const actualRemaining = {};
        function calcRemaining(itemId, amount, path) {
            const { isUnlimited, have } = getNodeState(path);
            if (isUnlimited) return; 
            
            const remain = Math.max(0, amount - have);
            if (remain <= 0) return;
            
            if (recipes[itemId]) {
                for (let comp of recipes[itemId]) {
                    calcRemaining(comp.item, remain * comp.amount, path + '-' + comp.item);
                }
            } else {
                actualRemaining[itemId] = (actualRemaining[itemId] || 0) + remain;
            }
        }
        for (let i = 0; i < part.recipe.length; i++) {
            const comp = part.recipe[i];
            calcRemaining(comp.item, comp.amount * craftAmount, `root-${comp.item}-${i}`);
        }

        const t0List = new Set();
        function extractT0(itemId) {
            if (recipes[itemId]) {
                for (let comp of recipes[itemId]) extractT0(comp.item);
            } else {
                t0List.add(itemId);
            }
        }
        for (let comp of part.recipe) extractT0(comp.item);

        let html = `<div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:10px; font-weight:600;">📊 基础材料清单 (T0)</div>`;
        
        let isAllDone = true;
        for (let id of t0List) {
            const miss = actualRemaining[id] || 0;
            if (miss > 0) { isAllDone = false; break; }
        }

        if (isAllDone && t0List.size > 0) {
            html = `<div style="text-align: center; padding: 40px 10px;">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🎉</div>
                <div style="font-size: 1.1rem; font-weight: bold; color: var(--success);">全部材料已收集完成！</div>
                <div style="font-size: 0.85rem; color: var(--text-sub); margin-top: 8px;">去大干一场吧！</div>
            </div>`;
        } else {
            html += `<div style="display: grid; grid-template-columns: 1fr; gap: 8px;">`;
            
            for (let id of t0List) {
                const item = allItems[id];
                if(!item) continue;

                const total = totalNeeds[id] || 0;
                const miss = actualRemaining[id] || 0;
                
                if (total === 0) continue;

                const missColor = miss > 0 ? 'var(--danger)' : 'var(--success)';
                const missText = miss > 0 ? `还需 ${miss}` : `已够`;

                html += `<div class="inv-row" style="background:#fffbf7; padding:10px 12px; border-radius:8px; border:1px solid #fbebe6;">
                    <div class="inv-label">
                        <div class="inv-icon" data-icon="${id}"></div>
                        <span>${item.name}</span>
                    </div>
                    <div style="display: flex; gap: 8px; font-size: 0.9rem; font-weight: 600; align-items: center;">
                        <span style="color: var(--primary);">总需 ${total}</span>
                        <span style="color: #ccc;">/</span>
                        <span style="color: ${missColor};">${missText}</span>
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        inventoryBody.innerHTML = html;
        
        inventoryBody.querySelectorAll('[data-icon]').forEach(span => {
            const id = span.getAttribute('data-icon');
            if (allItems[id]) renderIcon(allItems[id], span);
        });
    }

    window.updateNodeInventory = function(path, val) {
        let v = parseInt(val) || 0;
        if (v < 0) v = 0;
        nodeInventory[path] = v;
        clearTimeout(window._inlineTimer);
        window._inlineTimer = setTimeout(updateUI, 300);
    };

    window.toggleNodeUnlimited = function(path, isChecked) {
        nodeUnlimited[path] = isChecked;
        if (isChecked) expandedItems.delete(path); 
        updateUI();
    };

    window.updateAmount = function(delta) { craftAmount = Math.max(1, craftAmount + delta); updateUI(); };
    window.setAmount = function(val) { craftAmount = Math.max(1, parseInt(val) || 1); updateUI(); };
    
    window.toggleTree = function(el, path) {
        const icon = el.querySelector('.toggle-icon');
        const children = el.nextElementSibling;
        if (nodeUnlimited[path]) return; 
        
        if (children && children.classList.contains('tree-children')) {
            const isNowShowing = children.classList.toggle('show');
            if (icon) icon.classList.toggle('open');
            if (isNowShowing) expandedItems.add(path);
            else expandedItems.delete(path);
            saveState(); // 折叠/展开也保存一下
        }
    };

    window.clearAllData = function() {
        if (confirm('确定要清空所有勾选、库存以及展开状态吗？')) {
            localStorage.removeItem('submarine_calc_state');
            nodeInventory = {};
            nodeUnlimited = {};
            expandedItems.clear();
            // 重置为默认状态
            currentPartCode = Object.keys(partsDB)[0] || null;
            craftAmount = 1;
            
            renderMatrix(); // 重新渲染左侧以重置高亮
            updateUI();
        }
    };

    async function init() {
        await loadData();
        renderMatrix();
        
        // 如果存档里有部件就加载存档的，没有就选第一个
        if (!currentPartCode || !partsDB[currentPartCode]) {
            currentPartCode = Object.keys(partsDB)[0];
        }
        
        // 确保左侧的高亮匹配当前选中的部件
        renderMatrix(); 
        updateUI();
    }
    init();
})();