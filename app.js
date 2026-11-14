(function() {
    let allItems = {};
    let recipes = {};
    let partsDB = {};
    let currentPartCode = null;
    let craftAmount = 1;
    let inventory = {};
    let unlimitedItems = {}; 
    let expandedItems = new Set();
    
    // 🔥 新增：针对“当前树状图”的节点级状态，隔离同名物品
    let nodeInventory = {}; 
    let nodeUnlimited = {};

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
                        expandedItems.clear(); 
                        nodeInventory = {}; // 切换部件清空单次配置
                        nodeUnlimited = {};
                        renderCraftPanel();
                        renderInventory();
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

    // 核心：渲染中间材料树
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
            
            const isUnlimited = nodeUnlimited[path] || false;
            const have = isUnlimited ? '∞' : (nodeInventory[path] !== undefined ? nodeInventory[path] : 0);
            
            let missing = isUnlimited ? 0 : Math.max(0, neededAmount - have);
            // 再加上全局库存的抵扣（全局库存代表玩家总共拥有的）
            const globalHave = unlimitedItems[itemId] ? 999999 : (inventory[itemId] || 0);
            missing = Math.max(0, missing - globalHave); 
            
            const missingText = missing > 0 ? missing : '已够';
            const missingClass = missing > 0 ? 'neg' : 'pos';
            
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
                            <span class="stat-missing ${missingClass}">缺: ${missingText}</span>
                        </div>
                    </div>
            `;

            if (hasRecipe && !isUnlimited) { 
                nodeHtml += `<ul class="tree-children ${showClass}">`;
                const actualCraftAmount = Math.max(0, neededAmount - have - globalHave);
                for (let comp of recipes[itemId]) {
                    // 使用路径 path + 子物品 id 作为唯一标识，解决同名冲突！
                    const childPath = path + '-' + comp.item;
                    nodeHtml += renderNode(comp.item, actualCraftAmount * comp.amount, childPath);
                }
                nodeHtml += `</ul>`;
            }
            nodeHtml += `</li>`;
            return nodeHtml;
        }

        // 顶层节点
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

    // 渲染右侧库存（全局合成材料）
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
                    input.disabled = true;
                } else {
                    input.value = inventory[key];
                    input.disabled = false;
                    input.onfocus = () => { if (input.value === '0') input.value = ''; };
                    input.onblur = () => { if (input.value === '') input.value = '0'; };
                    input.oninput = (e) => {
                        let v = parseInt(e.target.value) || 0;
                        if (v < 0) v = 0;
                        e.target.value = v; 
                        inventory[key] = v;
                        saveInventoryToStorage(); 
                        renderCraftPanel(); // 联动中间
                    };
                }
                
                row.appendChild(label); 
                row.appendChild(input);
                groupDiv.appendChild(row);
            });
            return groupDiv;
        };

        inventoryBody.appendChild(createGroup('合成材料', window.t1Keys));
    }

    window.updateNodeInventory = function(path, val) {
        let v = parseInt(val) || 0;
        if (v < 0) v = 0;
        nodeInventory[path] = v;
        
        clearTimeout(window._inlineTimer);
        window._inlineTimer = setTimeout(() => {
            renderCraftPanel();
        }, 500);
    };

    window.toggleNodeUnlimited = function(path, isChecked) {
        nodeUnlimited[path] = isChecked;
        if (isChecked) expandedItems.delete(path); 
        renderCraftPanel();
    };

    window.clearAllData = function() {
        if (confirm('确定要清空所有已保存的库存数据吗？')) {
            localStorage.removeItem('submarine_inventory');
            Object.keys(inventory).forEach(id => inventory[id] = 0);
            Object.keys(unlimitedItems).forEach(id => unlimitedItems[id] = false);
            nodeInventory = {};
            nodeUnlimited = {};
            renderInventory();
            renderCraftPanel();
        }
    };

    window.updateAmount = function(delta) { craftAmount = Math.max(1, craftAmount + delta); renderCraftPanel(); };
    window.setAmount = function(val) { craftAmount = Math.max(1, parseInt(val) || 1); renderCraftPanel(); };
    
    window.toggleTree = function(el, path) {
        const icon = el.querySelector('.toggle-icon');
        const children = el.nextElementSibling;
        if (nodeUnlimited[path]) return; 
        
        if (children && children.classList.contains('tree-children')) {
            const isNowShowing = children.classList.toggle('show');
            if (icon) icon.classList.toggle('open');
            
            if (isNowShowing) expandedItems.add(path);
            else expandedItems.delete(path);
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