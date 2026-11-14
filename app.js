(function() {
    let allItems = {};
    let recipes = {};
    let partsDB = {};
    let currentPartCode = null;
    let craftAmount = 1;
    let inventory = {};
    
    // 🔥 新增状态：记录哪些材料被勾选了“无限/充足”
    let fulfilledItems = {}; 

    const matrixBody = document.getElementById('matrixBody');
    const craftBody = document.getElementById('craftBody');
    const inventoryBody = document.getElementById('inventoryBody');

    const rows = [
        { level: 1, name: '鲨鱼级' }, { level: 2, name: '甲鳖级' },
        { level: 3, name: '须鲸级' }, { level: 4, name: '腔棘鱼级' }, { level: 5, name: '希尔德拉' }
    ];

    // 读取本地保存的库存
    function loadInventoryFromStorage() {
        const saved = localStorage.getItem('submarine_inventory');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.keys(parsed).forEach(key => {
                    if (inventory[key] !== undefined) inventory[key] = parsed[key];
                });
            } catch (e) { console.error('读取失败', e); }
        }
    }

    // 保存库存到本地
    function saveInventoryToStorage() {
        localStorage.setItem('submarine_inventory', JSON.stringify(inventory));
    }

    async function loadData() {
        const res = await fetch('./items.json');
        const data = await res.json();
        allItems = data.items;
        recipes = data.recipes;
        partsDB = data.parts;

        Object.keys(allItems).forEach(id => {
            inventory[id] = 0;
            fulfilledItems[id] = false; // 初始化勾选状态
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
                    <!-- 这里加上 onfocus="if(this.value==='1') this.value='';" 防止去0难选 -->
                    <input type="number" min="1" value="${craftAmount}" onchange="setAmount(this.value)">
                    <button onclick="updateAmount(1)">+</button>
                </div>
            </div>
            <ul class="tree-list">
        `;

        function renderNode(itemId, neededAmount) {
            const item = allItems[itemId];
            if (!item) return '';
            
            const have = inventory[itemId] || 0;
            const isFulfilled = fulfilledItems[itemId]; // 是否勾选了“已够”
            
            // 🔥 如果勾选了“已够”，缺口直接按 0 算，且不需要再往下级消耗
            const missing = isFulfilled ? 0 : Math.max(0, neededAmount - have);
            const missingClass = missing > 0 ? 'neg' : (neededAmount - have < 0 ? 'pos' : 'zero');
            const hasRecipe = recipes[itemId];

            // 🔥 复选框 HTML
            const checkboxHtml = `<input type="checkbox" class="fulfill-checkbox" data-id="${itemId}" ${isFulfilled ? 'checked' : ''} onchange="toggleFulfill('${itemId}')" title="勾选代表已有充足材料，无需计算" onclick="event.stopPropagation()">`;

            let nodeHtml = `
                <li class="tree-item">
                    <div class="tree-node" onclick="toggleTree(this)">
                        <div class="node-name">
                            ${hasRecipe ? '<span class="toggle-icon">▶</span>' : '<span class="toggle-icon" style="opacity:0">▶</span>'}
                            ${checkboxHtml}
                            <span class="node-icon" data-icon="${itemId}"></span> ${item.name}
                        </div>
                        <div class="node-stats">
                            <span class="stat-needed">需: ${neededAmount}</span>
                            <span class="stat-have">库: ${have}</span>
                            <span class="stat-missing ${missingClass}">缺: ${missing}</span>
                        </div>
                    </div>
            `;
            if (hasRecipe && !isFulfilled) { // 勾选了就不往下递归计算了
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
            if (fulfilledItems[itemId]) return; // 勾选了就不算它的下级了
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
            const have = inventory[id] || 0;
            const miss = total - have;
            html += `<div style="display:flex; justify-content:space-between; padding:6px 12px; background:#f8fafc; border-radius:6px; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px;"><span class="node-icon" data-icon="${id}"></span> ${item.name}</span>
                <span>总需 <b>${total}</b> / 缺 <b style="color:${miss > 0 ? 'var(--danger)' : 'var(--success)'}">${Math.max(0, miss)}</b></span>
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
            
            // 按照特定的顺序排列（可以通过 sort 或者手动拼接）
            keys.forEach(key => {
                const item = allItems[key];
                if(!item) return;
                const row = document.createElement('div');
                row.className = 'inv-row';
                
                const label = document.createElement('div');
                label.className = 'inv-label';
                const iconDiv = document.createElement('div');
                iconDiv.className = 'inv-icon';
                renderIcon(item, iconDiv);
                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                label.appendChild(iconDiv);
                label.appendChild(nameSpan);

                const input = document.createElement('input');
                input.type = 'number'; input.className = 'inv-input'; input.min = '0';
                input.value = inventory[key]; 
                
                // 🔥 去 0 体验优化
                input.onfocus = () => { if (input.value === '0') input.value = ''; };
                input.onblur = () => { if (input.value === '') input.value = '0'; };
                
                input.oninput = (e) => {
                    // 去掉前导 0
                    let v = parseInt(e.target.value) || 0;
                    if (v < 0) v = 0;
                    e.target.value = v; // 直接把 DOM 里的值改写，去掉前导 0
                    inventory[key] = v;
                    saveInventoryToStorage(); 
                    renderCraftPanel(); 
                };
                row.appendChild(label); row.appendChild(input);
                groupDiv.appendChild(row);
            });
            return groupDiv;
        };

        // 🔥 顺序调整：基础材料放最上，合成材料放下面
        inventoryBody.appendChild(createGroup('基础材料', window.t0Keys));
        const spacer = document.createElement('div'); spacer.style.height = '20px';
        inventoryBody.appendChild(spacer);
        inventoryBody.appendChild(createGroup('合成材料', window.t1Keys));
    }

    // 🔥 勾选/取消勾选的方法
    window.toggleFulfill = function(itemId) {
        fulfilledItems[itemId] = !fulfilledItems[itemId];
        renderCraftPanel();
    };

    window.clearAllData = function() {
        if (confirm('确定要清空所有已保存的库存数据吗？')) {
            localStorage.removeItem('submarine_inventory');
            Object.keys(inventory).forEach(id => inventory[id] = 0);
            Object.keys(fulfilledItems).forEach(id => fulfilledItems[id] = false);
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