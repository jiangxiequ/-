(function() {
    let allItems = {};
    let recipes = {};
    let partsDB = {};
    let currentPartCode = null;
    let craftAmount = 1;
    let inventory = {};
    
    // 🔥 状态：记录哪些材料被勾选了“无限/管够”
    let unlimitedItems = {}; 

    const matrixBody = document.getElementById('matrixBody');
    const craftBody = document.getElementById('craftBody');
    const inventoryBody = document.getElementById('inventoryBody');

    const rows = [
        { level: 1, name: '鲨鱼级' }, { level: 2, name: '甲鳖级' },
        { level: 3, name: '须鲸级' }, { level: 4, name: '腔棘鱼级' }, { level: 5, name: '希尔德拉' }
    ];

    // 读取本地保存的库存和无限勾选状态
    function loadInventoryFromStorage() {
        const saved = localStorage.getItem('submarine_inventory');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.keys(parsed).forEach(key => {
                    if (inventory[key] !== undefined) {
                        // 如果保存的数据是一个特殊字符串（表示无限），则恢复勾选状态
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

    // 保存库存到本地
    function saveInventoryToStorage() {
        // 我们需要把 unlimitedItems 状态也保存下来
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

    // 渲染图标
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
            // 如果是无限，库存视为无限大，缺口为 0
            const have = isUnlimited ? '∞' : (inventory[itemId] || 0);
            const missing = isUnlimited ? 0 : Math.max(0, neededAmount - have);
            
            // 🔥 颜色逻辑修复：缺0就是绿色(pos)，缺>0是红色(neg)
            const missingClass = missing > 0 ? 'neg' : 'pos';
            
            const hasRecipe = recipes[itemId];

            let nodeHtml = `
                <li class="tree-item">
                    <div class="tree-node" onclick="toggleTree(this)">
                        <div class="node-name">
                            ${hasRecipe ? '<span class="toggle-icon">▶</span>' : '<span class="toggle-icon" style="opacity:0">▶</span>'}
                            <span class="node-icon" data-icon="${itemId}"></span> ${item.name}
                        </div>
                        <div class="node-stats">
                            <span class="stat-needed">需: ${neededAmount}</span>
                            <span class="stat-have">库: ${have}</span>
                            <span class="stat-missing ${missingClass}">缺: ${missing}</span>
                        </div>
                    </div>
            `;
            if (hasRecipe && !isUnlimited) { // 如果是无限勾选，就不往下展开了
                nodeHtml += `<ul class="tree-children">`;
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
        
        // 底部汇总基础材料
        const baseTotals = {};
        function addBaseReqs(itemId, amount) {
            if (unlimitedItems[itemId]) return; // 无限勾选，不需要再算下级了
            if (recipes[itemId]) {
                for (let c of recipes[itemId]) addBaseReqs(c.item, amount * c.amount);
            } else {
                baseTotals[itemId] = (baseTotals[itemId] || 0) + amount;
            }
        }
        for (let comp of part.recipe) addBaseReqs(comp.item, comp.amount * craftAmount);

        html += `<div style="margin-top: 30px; border-top: 1px solid var(--border-color); padding-top: 20px;"><h4>🧱 基础材料总计 (T0)</h4><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">`;
        for (let [id, total] of Object.entries(baseTotals)) {
            const item = allItems[id];
            const isUnlimited = unlimitedItems[id];
            const have = isUnlimited ? '∞' : (inventory[id] || 0);
            const miss = isUnlimited ? 0 : total - have;
            const color = miss > 0 ? 'var(--danger)' : 'var(--success)';
            
            html += `<div style="display:flex; justify-content:space-between; padding:6px 12px; background:#f8fafc; border-radius:6px; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px;"><span class="node-icon" data-icon="${id}"></span> ${item.name}</span>
                <span>总需 <b>${total}</b> / 缺 <b style="color:${color}">${miss}</b></span>
            </div>`;
        }
        html += `</div></div>`;
        craftBody.innerHTML = html;

        craftBody.querySelectorAll('[data-icon]').forEach(span => {
            const id = span.getAttribute('data-icon');
            if (allItems[id]) renderIcon(allItems[id], span);
        });
    }

    // 🔥 重构右侧库存面板
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
                
                // 勾选框
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.style.marginRight = '8px';
                checkbox.style.cursor = 'pointer';
                checkbox.checked = unlimitedItems[key];
                checkbox.title = "勾选代表材料管够，无视数量直接满额";
                checkbox.onchange = (e) => {
                    unlimitedItems[key] = e.target.checked;
                    saveInventoryToStorage();
                    renderInventory(); // 重新渲染以更新输入框状态
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
                input.type = 'text'; // 改成 text 因为要显示 ∞ 或者 数字
                input.className = 'inv-input'; 
                
                if (unlimitedItems[key]) {
                    input.value = 'MAX';
                    input.style.backgroundColor = '#e2e8f0';
                    input.style.color = '#64748b';
                    input.style.fontWeight = 'bold';
                    input.disabled = true; // 勾选后不可输入
                } else {
                    input.value = inventory[key];
                    input.disabled = false;
                    input.style.backgroundColor = '';
                    input.style.color = '';
                    
                    // 去 0 体验优化
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
    window.toggleTree = function(el) {
        const icon = el.querySelector('.toggle-icon');
        const children = el.nextElementSibling;
        if (children && children.classList.contains('tree-children')) {
            children.classList.toggle('show');
            if (icon) icon.classList.toggle('open');
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