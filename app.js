(function() {
    let allItems = {};
    let recipes = {};
    let partsDB = {};
    let currentPartCode = null;
    let craftAmount = 1;
    let inventory = {};
    
    // 记录哪些材料被勾选了“无限/管够”
    let unlimitedItems = {}; 
    
    //记录当前哪些节点是展开状态
    let expandedItems = new Set();

    const matrixBody = document.getElementById('matrixBody');
    const craftBody = document.getElementById('craftBody');
    const inventoryBody = document.getElementById('inventoryBody');

    const rows = [
        { level: 1, name: '鲨鱼级' }, { level: 2, name: '甲鳖级' },
        { level: 3, name: '须鲸级' }, { level: 4, name: '腔棘鱼级' }, { level: 5, name: '希尔德拉' }
    ];

    function loadInventoryFromStorage() {
        const saved = localStorage.getItem('submarine_inventory');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.keys(parsed).forEach(key => {
                    if (inventory[key] !== undefined) {
                        if (parsed[key] === 'unlimited') {
                            unlimitedItems[key] = true;
                            inventory[key] = 0;
                        } else {
                            inventory[key] = parsed[key];
                        }
                    }
                });
            } catch (e) { console.error('读取失败', e); }
        }
    }

    function saveInventoryToStorage() {
        const saveData = {};
        Object.keys(inventory).forEach(key => {
            if (unlimitedItems[key]) {
                saveData[key] = 'unlimited';
            } else {
                saveData[key] = inventory[key];
            }
        });
        localStorage.setItem('submarine_inventory', JSON.stringify(saveData));
    }

    async function loadData() {
        const res = await fetch('./items.json');
        const data = await res.json();
        allItems = data.items;
        recipes = data.recipes;
        partsDB = data.parts;

        Object.keys(allItems).forEach(id => {
            inventory[id] = 0;
            unlimitedItems[id] = false;
        });
        loadInventoryFromStorage();

        window.t0Keys = []; window.t1Keys = [];
        Object.keys(allItems).forEach(id => {
            if (recipes[id]) t1Keys.push(id); else t0Keys.push(id);
        });
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
                    btn.onclick = () => {
                        document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        currentPartCode = code;
                        craftAmount = 1;
                        expandedItems.clear(); // 切换部件时，清空之前的展开状态
                        renderCraftPanel();
                    };
                    if (currentPartCode === code) btn.classList.add('active');
                } else {
                    btn.classList.add('disabled');
                    btn.title = '暂无此部件数据';
                }
                td.appendChild(btn);
                tr.appendChild(td);
            }
            matrixBody.appendChild(tr);
        });
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

        function renderNode(itemId, neededAmount) {
            const item = allItems[itemId];
            if (!item) return '';
            
            const isUnlimited = unlimitedItems[itemId];
            const have = isUnlimited ? '∞' : (inventory[itemId] || 0);
            const missing = isUnlimited ? 0 : Math.max(0, neededAmount - have);
            const missingClass = missing > 0 ? 'neg' : 'pos';
            const hasRecipe = recipes[itemId];

            const isExpanded = expandedItems.has(itemId);
            const showClass = isExpanded ? 'show' : '';
            const iconClass = isExpanded ? 'toggle-icon open' : 'toggle-icon';

            let nodeHtml = `
                <li class="tree-item">
                    <div class="tree-node" onclick="toggleTree(this, '${itemId}')">
                        <div class="node-name">
                            ${hasRecipe ? `<span class="${iconClass}">▶</span>` : '<span class="toggle-icon" style="opacity:0">▶</span>'}
                            <span class="node-icon" data-icon="${itemId}"></span> ${item.name}
                        </div>
                        <div class="node-stats">
                            <span class="stat-needed">需: ${neededAmount}</span>
                            <span class="stat-have">库: ${have}</span>
                            <span class="stat-missing ${missingClass}">缺: ${missing}</span>
                        </div>
                    </div>
            `;
            if (hasRecipe && !isUnlimited) { 
                nodeHtml += `<ul class="tree-children ${showClass}">`;
                // 树状图往下展开，还是基于“缺口”来算
                const actualCraftAmount = Math.max(0, neededAmount - have);
                for (let comp of recipes[itemId]) {
                    nodeHtml += renderNode(comp.item, actualCraftAmount * comp.amount);
                }
                nodeHtml += `</ul>`;
            }
            nodeHtml += `</li>`;
            return nodeHtml;
        }

        for (let comp of part.recipe) html += renderNode(comp.item, comp.amount * craftAmount);
        html += `</ul>`;
        
        //底层基础材料 (T0) 的智能汇总
       
        const baseTotals = {};
        
        function addBaseReqs(itemId, neededAmount) {
            if (unlimitedItems[itemId]) return; // 勾选了 MAX 直接跳过
            
            const have = inventory[itemId] || 0;
            // 计算真正缺多少个这个物品
            const actualMissing = Math.max(0, neededAmount - have);
            
            // 如果库存已经够了，不需要再往下索取材料了！
            if (actualMissing === 0) return;

            // 如果还有配方，就拿“缺的那部分”去算下级材料
            if (recipes[itemId]) {
                for (let c of recipes[itemId]) {
                    addBaseReqs(c.item, actualMissing * c.amount);
                }
            } else {
                // 如果是基础材料，直接记录缺了多少
                baseTotals[itemId] = (baseTotals[itemId] || 0) + actualMissing;
            }
        }
        
        for (let comp of part.recipe) {
            addBaseReqs(comp.item, comp.amount * craftAmount);
        }
    

        html += `<div style="margin-top: 30px; border-top: 1px solid var(--border-color); padding-top: 20px;"><h4>🧱 基础材料总计 (T0)</h4><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">`;
        
        // 如果没有任何缺的基础材料
        if (Object.keys(baseTotals).length === 0) {
            html += `<div style="grid-column: span 2; text-align: center; color: var(--success); font-weight: bold; padding: 10px;">🎉 所有基础材料均已充足！</div>`;
        }

        for (let [id, totalMiss] of Object.entries(baseTotals)) {
            const item = allItems[id];
            // 这里的 totalMiss 就是算出来的、你需要去挖的纯缺口数量
            // 因为前面的逻辑已经减去了各级库存，所以这里不再重复减库存
            html += `<div style="display:flex; justify-content:space-between; padding:6px 12px; background:#f8fafc; border-radius:6px; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px;"><span class="node-icon" data-icon="${id}"></span> ${item.name}</span>
                <span>缺少 <b style="color:var(--danger)">${totalMiss}</b></span>
            </div>`;
        }
        html += `</div></div>`;
        craftBody.innerHTML = html;

        craftBody.querySelectorAll('[data-icon]').forEach(span => {
            const id = span.getAttribute('data-icon');
            if (allItems[id]) renderIcon(allItems[id], span);
        });
    }

    function renderInventory() {
        inventoryBody.innerHTML = '';
        const createGroup = (title, keys) => {
            const groupDiv = document.createElement('div');
            groupDiv.innerHTML = `<div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:10px; font-weight:600;">${title}</div>`;
            
            keys.forEach(key => {
                const item = allItems[key];
                if(!item) return;
                const row = document.createElement('div');
                row.className = 'inv-row';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.style.marginRight = '8px';
                checkbox.style.cursor = 'pointer';
                checkbox.checked = unlimitedItems[key];
                checkbox.title = "勾选代表材料充足";
                checkbox.onchange = (e) => {
                    unlimitedItems[key] = e.target.checked;
                    saveInventoryToStorage();
                    renderInventory(); 
                    renderCraftPanel();
                };

                const label = document.createElement('div');
                label.className = 'inv-label';
                const iconDiv = document.createElement('div');
                iconDiv.className = 'inv-icon';
                renderIcon(item, iconDiv);
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                label.appendChild(checkbox);
                label.appendChild(iconDiv);
                label.appendChild(nameSpan);

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'inv-input'; 
                
                if (unlimitedItems[key]) {
                    input.value = 'MAX';
                    input.style.backgroundColor = '#e2e8f0';
                    input.style.color = '#64748b';
                    input.style.fontWeight = 'bold';
                    input.disabled = true;
                } else {
                    input.value = inventory[key];
                    input.disabled = false;
                    input.style.backgroundColor = '';
                    input.style.color = '';
                    
                    input.onfocus = () => { if (input.value === '0') input.value = ''; };
                    input.onblur = () => { if (input.value === '') input.value = '0'; };
                    input.oninput = (e) => {
                        let v = parseInt(e.target.value) || 0;
                        if (v < 0) v = 0;
                        e.target.value = v; 
                        inventory[key] = v;
                        saveInventoryToStorage(); 
                        renderCraftPanel(); 
                    };
                }
                
                row.appendChild(label); 
                row.appendChild(input);
                groupDiv.appendChild(row);
            });
            return groupDiv;
        };

        inventoryBody.appendChild(createGroup('基础材料', window.t0Keys));
        const spacer = document.createElement('div'); spacer.style.height = '20px';
        inventoryBody.appendChild(spacer);
        inventoryBody.appendChild(createGroup('合成材料', window.t1Keys));
    }

    window.clearAllData = function() {
        if (confirm('确定要清空所有已保存的库存数据吗？')) {
            localStorage.removeItem('submarine_inventory');
            Object.keys(inventory).forEach(id => inventory[id] = 0);
            Object.keys(unlimitedItems).forEach(id => unlimitedItems[id] = false);
            renderInventory();
            renderCraftPanel();
        }
    };

    window.updateAmount = function(delta) { craftAmount = Math.max(1, craftAmount + delta); renderCraftPanel(); };
    window.setAmount = function(val) { craftAmount = Math.max(1, parseInt(val) || 1); renderCraftPanel(); };
    
    //把状态记录到 expandedItems
    window.toggleTree = function(el, itemId) {
        const icon = el.querySelector('.toggle-icon');
        const children = el.nextElementSibling;
        if (children && children.classList.contains('tree-children')) {
            const isNowShowing = children.classList.toggle('show');
            if (icon) icon.classList.toggle('open');
            
            if (isNowShowing) {
                expandedItems.add(itemId);
            } else {
                expandedItems.delete(itemId);
            }
        }
    };

    async function init() {
        await loadData();
        renderMatrix();
        renderInventory();
        const firstCode = Object.keys(partsDB)[0];
        if (firstCode) {
            currentPartCode = firstCode;
            renderMatrix();
            renderCraftPanel();
        }
    }
    init();
})();