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

    // 记录全局总仓库（只用于你想统一减库存时用，但根据你的需求，这里我们默认全为0，只看总需）
    // 如果后续需要全局减，我们可以再加，但先保持极简。

    const matrixBody = document.getElementById('matrixBody');
    const craftBody = document.getElementById('craftBody');
    const inventoryBody = document.getElementById('inventoryBody');

    const rows = [
        { level: 1, name: '鲨鱼级' }, { level: 2, name: '甲鳖级' },
        { level: 3, name: '须鲸级' }, { level: 4, name: '腔棘鱼级' }, { level: 5, name: '希尔德拉' }
    ];

    async function loadData() {
        const res = await fetch('./items.json');
        const data = await res.json();
        allItems = data.items;
        recipes = data.recipes;
        partsDB = data.parts;
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
                        nodeInventory = {}; 
                        nodeUnlimited = {};
                        updateUI();
                    };
                    if (currentPartCode === code) btn.classList.add('active');
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

    // 获取当前节点的“局部库存/勾选”状态
    function getNodeState(path) {
        return {
            isUnlimited: nodeUnlimited[path] || false,
            have: nodeInventory[path] || 0
        };
    }

    // 递归计算树，并返回一个纯净的“总需求对象” (去重汇总)
    function calculateTreeNeeds() {
        if (!currentPartCode || !partsDB[currentPartCode]) return {};
        
        const part = partsDB[currentPartCode];
        const totalNeeds = {}; // 纯统计：这个部件到底需要多少该物品（含各级加起来的总数）

        // 第一遍：递归算出理论上各级物品各需要多少
        function calc(itemId, amount) {
            totalNeeds[itemId] = (totalNeeds[itemId] || 0) + amount;
            if (recipes[itemId]) {
                for (let comp of recipes[itemId]) {
                    calc(comp.item, amount * comp.amount);
                }
            }
        }
        for (let comp of part.recipe) {
            calc(comp.item, comp.amount * craftAmount);
        }
        return totalNeeds;
    }

    function updateUI() {
        renderCraftPanel();
        renderSummaryPanel();
    }

    // 渲染中间树
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
            
            // 局部的算法：当前所需 - 局部拥有
            let missing = isUnlimited ? 0 : Math.max(0, neededAmount - have);
            
            // 渲染“缺”的样式
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
                // 中间往下递归，只看局部缺了多少
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

    // 渲染右侧“总仓库”面板（纯统计展示）
    function renderSummaryPanel() {
        if (!currentPartCode || !partsDB[currentPartCode]) {
            inventoryBody.innerHTML = '<div class="empty-state">请在左侧选择一个部件</div>';
            return;
        }

        const totalNeeds = calculateTreeNeeds();
        
        // 检查是否所有材料都被局部勾选满了
        // 如果某个物品的“理论上总需”数量，完全被局部勾选/输入抵消了，就判定为“已收集完成”
        let allCollected = true;
        
        // 为了判断，我们再走一遍树，看看有没有“未被 MAX 且局部库存不够”的 T0/T1
        // 但其实更简单的方法是直接看中间面板里的数据。这里为了演示，我们以“基础材料(T0)的缺失”为准
        // 如果只要有一个最基础的 T0 材料缺了，那就不算收集完成。
        
        // 由于总需里包含了所有的层级，我们要去掉那些已经被上游 MAX 覆盖的需求。
        // 我们换个思路：直接计算右侧的真实需求。
        
        // 我们用一个新的算法：从根节点向下遍历。
        // 如果当前节点被 MAX，那么它和它的子节点都算“已满足”。
        // 如果没被 MAX，就扣除它的局部库存，剩下的缺口传给子节点。
        
        const actualNeeds = new Map(); // 记录最终未满足的缺口
        let hasAnyDemand = false;

        function calcRemaining(itemId, amount, path) {
            const item = allItems[itemId];
            if (!item) return;
            
            const { isUnlimited, have } = getNodeState(path);
            
            if (isUnlimited) return; // 勾选了 MAX，直接跳过，不产生缺口
            
            const remain = Math.max(0, amount - have);
            if (remain <= 0) return; // 局部的库存就填满了，不产生缺口
            
            // 如果有配方，拿剩余的缺口去算子材料
            if (recipes[itemId]) {
                for (let comp of recipes[itemId]) {
                    const childPath = path + '-' + comp.item;
                    calcRemaining(comp.item, remain * comp.amount, childPath);
                }
            } else {
                // 是基础材料，记录缺口
                actualNeeds.set(itemId, (actualNeeds.get(itemId) || 0) + remain);
                hasAnyDemand = true;
            }
        }

        const part = partsDB[currentPartCode];
        for (let i = 0; i < part.recipe.length; i++) {
            const comp = part.recipe[i];
            const rootPath = `root-${comp.item}-${i}`;
            calcRemaining(comp.item, comp.amount * craftAmount, rootPath);
        }

        let html = '';

        if (!hasAnyDemand) {
            html = `<div style="text-align: center; padding: 40px 10px;">
                <div style="font-size: 2rem; margin-bottom: 10px;">🎉</div>
                <div style="font-size: 1.1rem; font-weight: bold; color: var(--success);">全部材料已收集完成！</div>
                <div style="font-size: 0.85rem; color: var(--text-sub); margin-top: 8px;">请在中间树状图中勾选 MAX 或填写库存以更新状态</div>
            </div>`;
        } else {
            // 展示全量总需（分 T0 和 T1/T2）
            html += `<div style="font-size:0.8rem; color:var(--text-sub); margin-bottom:10px; font-weight:600;">📊 当前部件材料总需（未完成）</div>`;
            
            // 我们提取实际还需要收集的
            html += `<div style="display: grid; grid-template-columns: 1fr; gap: 8px;">`;
            
            for (let [id, totalMiss] of actualNeeds.entries()) {
                const item = allItems[id];
                if(!item) continue;
                
                html += `<div class="inv-row" style="background:#fff8f5; padding:8px 12px; border-radius:8px; border:1px solid #fbebe6;">
                    <div class="inv-label">
                        <div class="inv-icon" data-icon="${id}"></div>
                        <span>${item.name}</span>
                    </div>
                    <span style="color: var(--danger); font-weight: bold;">还需 ${totalMiss}</span>
                </div>`;
            }
            html += `</div>`;
            
            // 你之前想看总的 T0 素材一共要多少，我们也可以列出（虽然中间已经看到了）
            // 这里就纯粹只显示“根据你的勾选，现在还缺多少”，这符合“总仓库”的补料单作用。
        }

        inventoryBody.innerHTML = html;
        
        inventoryBody.querySelectorAll('[data-icon]').forEach(span => {
            const id = span.getAttribute('data-icon');
            if (allItems[id]) renderIcon(allItems[id], span);
        });
    }


    // 中间树的局部操作
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
        }
    };

    window.clearAllData = function() {
        if (confirm('确定要清空当前所有勾选和库存数据吗？')) {
            nodeInventory = {};
            nodeUnlimited = {};
            expandedItems.clear();
            updateUI();
        }
    };

    async function init() {
        await loadData();
        renderMatrix();
        const firstCode = Object.keys(partsDB)[0];
        if (firstCode) {
            currentPartCode = firstCode;
            renderMatrix();
            updateUI();
        }
    }
    init();
})();