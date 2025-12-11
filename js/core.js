// --- 游戏配置 (为了适应无尽模式，增加了怪兽血量) ---
const CONFIG = {
    playerMaxHP: 100,
    monsterMaxHP: 300,   // 血量增加到300
    monsterDps: 5,
    playerDamage: 20,
    attackInterval: 1000,
    initialCardsCount: 24 // 初始卡片数量
};

let playerHP, monsterHP, gameActive, monsterTimer;
let currentAttackInterval = CONFIG.attackInterval; // 当前怪兽攻击间隔
let playerDefense = 0;           // 玩家当前减伤值 (默认 0)
let shieldTimer = null;          // 护盾效果计时器
let dotTimer = null;             // 持续伤害计时器
let dotDamagePerTick = 0;        // 每跳持续伤害值
let dotTicksRemaining = 0;       // 持续伤害剩余次数
const board = document.getElementById('board');
// 图案池
const itemsPool =[
    '🗡️', '🗡️', '🔥', '🔥', '🐲', '🦄',
    '⚡', '⚡', '🌪️', '🌪️',
    '❄️', '❄️',
    '🛡️', '🧪',
    '💍', '📜', '🗝️', '💎', '💀', '🌕', '☀️'
];
const CARD_EFFECTS = {
    '🗡️': { type: 'DAMAGE', value: 10, name: '利剑' },       // 基础伤害
    '🔥': { type: 'DAMAGE', value: 15, name: '火焰魔法' },    // 中等伤害
    '🐲': { type: 'DAMAGE', value: 30, name: '龙吼' },        // 高额伤害
    '🦄': { type: 'DAMAGE', value: 25, name: '独角兽之角' },  // 高额伤害

    // --- 持续伤害 (DOT) 牌 ---
    '⚡': { type: 'DOT', value: 5, duration: 3, name: '闪电链' }, // 每秒 5 伤害，持续 3 秒
    '🌪️': { type: 'DOT', value: 8, duration: 2, name: '剧毒旋风' }, // 每秒 8 伤害，持续 2 秒

    // --- 控制/减益牌 ---
    '❄️': { type: 'CONTROL', value: 1500, duration: 5000, name: '冰冻术' }, // 攻击间隔设为 1.5s，持续 5s

    // --- 增益牌 ---
    '🛡️': { type: 'BUFF', value: 3, name: '铁壁护甲', target: 'PLAYER' }, // 减伤 3 点
    '🧪': { type: 'BUFF', value: 20, name: '治疗药水', target: 'PLAYER' }, // 治疗 20 HP

    // --- 实用/特殊牌 ---
    '💍': { type: 'UTILITY', value: 50, name: '财富戒指' }, // 奖励 50 点伤害
    '📜': { type: 'UTILITY', value: 2, name: '时间卷轴' }, // 玩家连续行动 2 次（跳过怪兽攻击 2 次）
    '🗝️': { type: 'UTILITY', value: 1, name: '万能钥匙' }, // 移除场上 1 对随机卡片
    '💎': { type: 'UTILITY', value: 20, name: '宝石爆破' }, // 对怪兽造成 20 点伤害，并额外再翻一张卡（免费行动）

    // --- 负面牌/不确定牌 ---
    '💀': { type: 'UTILITY', value: 5, name: '厄运骷髅', target: 'MONSTER' }, // 对怪兽造成 5 点伤害，但惩罚玩家 -5 HP
    '🌕': { type: 'UTILITY', value: 0, name: '月光' }, // 无效果，普通匹配卡
    '☀️': { type: 'UTILITY', value: 0, name: '日光' }  // 无效果，普通匹配卡
};

let hasFlippedCard = false;
let lockBoard = false;
let firstCard, secondCard;

const playerHpBar = document.getElementById('player-hp-bar');
const monsterHpBar = document.getElementById('monster-hp-bar');
const playerHpText = document.getElementById('player-hp-text');
const monsterHpText = document.getElementById('monster-hp-text');
const monsterAvatar = document.getElementById('monster-avatar');
const playerBox = document.getElementById('player-box');

function startGame() {
    playerHP = CONFIG.playerMaxHP;
    monsterHP = CONFIG.monsterMaxHP;
    gameActive = true;
    lockBoard = false;
    hasFlippedCard = false;

    updateHealthUI();
    createInitialBoard(); // 使用新的初始化函数

    clearInterval(monsterTimer);
    monsterTimer = setInterval(monsterAttack, CONFIG.attackInterval);
    document.querySelector('button').innerText = "🔄 重新挑战";
}

function updateHealthUI() {
    const pPercent = Math.max(0, (playerHP / CONFIG.playerMaxHP) * 100);
    const mPercent = Math.max(0, (monsterHP / CONFIG.monsterMaxHP) * 100);
    playerHpBar.style.width = pPercent + '%';
    monsterHpBar.style.width = mPercent + '%';
    playerHpText.innerText = `${Math.max(0, playerHP)}/${CONFIG.playerMaxHP}`;
    monsterHpText.innerText = `${Math.max(0, monsterHP)}/${CONFIG.monsterMaxHP}`;
}

function monsterAttack() {
    if (!gameActive) return;

    // 计算实际受到的伤害
    const baseDamage = CONFIG.monsterDps;
    const actualDamage = Math.max(0, baseDamage - playerDefense); // 减伤后的伤害，最小为0

    // 扣除伤害
    playerHP -= actualDamage;
    updateHealthUI();

    // 视觉反馈 (如果实际伤害 > 0)
    if (actualDamage > 0) {
        playerBox.classList.remove('shake');
        void playerBox.offsetWidth;
        playerBox.classList.add('shake');
    }

    // 如果存在减伤，可以在怪兽头像旁边显示“格挡”反馈
    if (playerDefense > 0 && actualDamage < baseDamage) {
        showDamageNumber(`Blocked ${playerDefense}`, playerBox, '#3498db');
    }

    if (playerHP <= 0) gameOver(false);

    resetMonsterTimer();
}
// 新增：重置怪兽攻击计时器 (用于冰冻效果)
function resetMonsterTimer() {
    clearInterval(monsterTimer);
    if (gameActive) {
        monsterTimer = setInterval(monsterAttack, currentAttackInterval);
    }
}

function gameOver(isWin) {
    gameActive = false;
    clearInterval(monsterTimer);
    lockBoard = true;
    setTimeout(() => {
        if (isWin) alert(`🏆 胜利！你击败了魔王！`);
        else alert(`💀 失败... 你倒下了。`);
    }, 300);
}

function showDamageNumber(num) {
    const damage = document.createElement('div');
    damage.classList.add('damage-text');
    damage.innerText = `-${num}`;
    document.getElementById('monster-box').appendChild(damage);
    setTimeout(() => damage.remove(), 1000);
}

// --- 新的核心逻辑 ---

// 1. 创建单个卡片元素的辅助函数
function createSingleCard(item) {
    const card = document.createElement('div');
    card.classList.add('memory-card');
    card.dataset.framework = item;
    card.innerHTML = `
                <div class="front-face">${item}</div>
                <div class="back-face">⚔️</div>
            `;
    card.addEventListener('click', flipCard);
    return card;
}

// 2. 初始化棋盘 (生成初始的N张牌)
function createInitialBoard() {
    board.innerHTML = '';
    const initialDeck = [];
    // 生成指定数量的对子
    for (let i = 0; i < CONFIG.initialCardsCount / 2; i++) {
        const randomItem = itemsPool[Math.floor(Math.random() * itemsPool.length)];
        initialDeck.push(randomItem, randomItem);
    }
    initialDeck.sort(() => 0.5 - Math.random());
    initialDeck.forEach(item => {
        board.appendChild(createSingleCard(item));
    });
}

// 3. 打乱DOM节点的函数 (用于补充新卡后打乱布局)
function shuffleBoardDOM() {
    for (let i = board.children.length; i >= 0; i--) {
        board.appendChild(board.children[Math.random() * i | 0]);
    }
}

function flipCard() {
    if (lockBoard || !gameActive) return;
    if (this === firstCard) return;
    this.classList.add('flip');
    if (!hasFlippedCard) {
        hasFlippedCard = true;
        firstCard = this;
        return;
    }
    secondCard = this;
    checkForMatch();
}

function checkForMatch() {
    let isMatch = firstCard.dataset.framework === secondCard.dataset.framework;
    isMatch ? disableCards() : unflipCards();
}

function unflipCards() {
    lockBoard = true;
    setTimeout(() => {
        firstCard.classList.remove('flip');
        secondCard.classList.remove('flip');
        resetBoard();
    }, 1000);
}

function resetBoard() {
    [hasFlippedCard, lockBoard] = [false, false];
    [firstCard, secondCard] = [null, null];
}
// --- 核心：效果处理函数 ---

// 1. 基础伤害函数
function applyDamage(damage, effectName) {
    monsterHP -= damage;
    updateHealthUI();

    // 视觉反馈 (与之前相同)
    monsterAvatar.innerText = "💥";
    setTimeout(() => monsterAvatar.innerText = "👾", 500);
    const monsterBox = document.getElementById('monster-box');
    monsterBox.classList.remove('shake');
    void monsterBox.offsetWidth;
    monsterBox.classList.add('shake');

    showDamageNumber(damage); // 显示伤害数值

    if (monsterHP <= 0) gameOver(true);
}

// 2. 冰冻控制函数
function applyFreeze(newInterval, effectName,expire=0) {
    if (newInterval > currentAttackInterval) {
        currentAttackInterval = newInterval;
        alert(`❄️ ${effectName}: 怪兽攻击速度减慢至 ${newInterval/1000} 秒/次！`);
        // 立即重设计时器，让减速效果生效
        resetMonsterTimer();

        // 设置一个计时器，让冰冻效果在一定时间后失效 (例如 5 秒)
        if(expire>0){
            setTimeout(() => {
                if (!gameActive) return;
                // 恢复基础攻击间隔
                currentAttackInterval = CONFIG.attackInterval;
                alert("🧊 冰冻解除，怪兽恢复正常攻击速度。");
                resetMonsterTimer();
            }, expire);
        }
    } else {
        alert("❄️ 冰冻失败，效果未叠加或已生效。");
    }
}
function applyShield(reductionValue, effectName, expire=0) {
    if (!gameActive) return;

    // 1. 清除旧的护盾效果
    clearTimeout(shieldTimer);

    // 2. 应用新的减伤值
    playerDefense += reductionValue;

    alert(`🛡️ ${effectName} 生效！玩家获得 ${reductionValue} 点减伤！`);

    // 3. 设置护盾持续时间
    if (expire > 0) {
        shieldTimer = setTimeout(() => {
            playerDefense -= reductionValue; // 护盾失效
            if (playerDefense<0){
                playerDefense = 0
            }
            alert(`🛡️ ${effectName} 消失，减伤效果解除。`);
            shieldTimer = null;
        }, expire);
    }
}


function playerAttack(cardKey) {
    const effect = CARD_EFFECTS[cardKey];

    // 如果没有配置效果 (如 🌕, ☀️)，执行默认伤害
    if (!effect || effect.value === 0) {
        applyDamage(CONFIG.playerDamage, '普通攻击');
        return;
    }

    // 根据卡片类型执行不同效果
    switch (effect.type) {
        case 'DAMAGE':
            applyDamage(effect.value, effect.name);
            break;

        case 'DOT': // 新增 DOT 效果
            applyDot(effect.value, effect.duration, effect.name);
            break;

        case 'CONTROL':
            if (cardKey === '❄️') {
                applyFreeze(effect.value, effect.name, effect.duration); // 注意：这里需要修改 applyFreeze 来接收 duration
            }
            break;

        case 'BUFF': // 增益
            // ... (PLAYER BUFF 逻辑保持不变) ...
            if (effect.target === 'PLAYER') {
                if (cardKey === '🛡️') {
                    applyShield(effect.value, effect.name);
                } else if (cardKey === '🧪') {
                    const healAmount = effect.value;
                    playerHP = Math.min(CONFIG.playerMaxHP, playerHP + healAmount);
                    updateHealthUI();
                    alert(`🧪 ${effect.name}：治疗 ${healAmount} HP!`);
                    showDamageNumber(`+${healAmount}`, document.getElementById('player-box'), '#2ecc71');
                }
            }
            break;

        case 'UTILITY': // 新增 实用牌/特殊牌 效果
            if (cardKey === '💍') {
                // 财富戒指：直接造成额外伤害
                applyDamage(effect.value, effect.name);
            } else if (cardKey === '📜') {
                // 时间卷轴：跳过怪兽攻击
                handleSkipTurns(effect.value, effect.name);
            } else if (cardKey === '🗝️') {
                // 万能钥匙：移除一对随机牌 (在 disableCards 中已经移除两张，这里需要再移除两张)
                handleRemoveRandom(effect.value, effect.name);
            } else if (cardKey === '💎') {
                // 宝石爆破：伤害并免费再翻一张卡
                applyDamage(effect.value, effect.name);
                lockBoard = false; // 解锁面板，让玩家可以继续翻第三张卡
                alert(`💎 ${effect.name}: 额外获得一次免费翻牌机会！`);
            } else if (cardKey === '💀') {
                // 厄运骷髅：对怪兽造成伤害，但惩罚玩家
                applyDamage(effect.value, effect.name);
                playerHP -= effect.value;
                updateHealthUI();
                showDamageNumber(`-${effect.value} (惩罚)`, document.getElementById('player-box'), '#8e44ad');
            }
            break;
        default:
            applyDamage(CONFIG.playerDamage, '普通攻击');
            break;
    }
}

// --- 新增：持续伤害 (DOT) 函数 ---
function applyDot(damagePerTick, duration, effectName) {
    if (!gameActive) return;

    // 清除旧 DOT
    clearInterval(dotTimer);

    dotDamagePerTick = damagePerTick;
    dotTicksRemaining = duration; // duration 此时是持续的秒数

    alert(`⚡ ${effectName}：怪兽受到每秒 ${damagePerTick} 点持续伤害，持续 ${duration} 秒！`);

    // 立即造成第一跳伤害
    tickDotDamage();

    // 启动 DOT 计时器
    dotTimer = setInterval(tickDotDamage, 1000);
}

function tickDotDamage() {
    if (!gameActive || dotTicksRemaining <= 0) {
        clearInterval(dotTimer);
        dotTimer = null;
        dotDamagePerTick = 0;
        return;
    }

    // 造成 DOT 伤害
    monsterHP -= dotDamagePerTick;
    updateHealthUI();

    // 视觉反馈 (可以改成紫色飘字)
    showDamageNumber(dotDamagePerTick, document.getElementById('monster-box'), '#9b59b6');

    if (monsterHP <= 0) {
        gameOver(true);
        clearInterval(dotTimer);
    }

    dotTicksRemaining--;
}

// --- 新增：实用牌 (UTILITY) 函数 ---

// 处理玩家跳过怪兽攻击
function handleSkipTurns(skips, effectName) {
    alert(`📜 ${effectName}: 玩家获得了 ${skips} 次免费行动！`);

    // 简单实现：让怪兽计时器暂停 (或延长)
    clearInterval(monsterTimer);

    // 在几秒后恢复怪兽计时器
    setTimeout(() => {
        if (!gameActive) return;
        alert("⏱️ 免费行动结束，魔王恢复攻击。");
        resetMonsterTimer();
    }, skips * CONFIG.attackInterval); // 免费行动时间 = 跳过的次数 * 怪兽的攻击间隔
}

// 移除随机卡片
function handleRemoveRandom(count, effectName) {
    alert(`🗝️ ${effectName}: 移除 ${count} 对随机卡片！`);

    const cardElements = Array.from(board.children).filter(card => !card.classList.contains('flip'));

    if (cardElements.length >= 2) {
        const index1 = Math.floor(Math.random() * cardElements.length);
        const card1 = cardElements[index1];
        cardElements.splice(index1, 1); // 移除第一个元素

        const card2Index = cardElements.findIndex(card => card.dataset.framework === card1.dataset.framework);
        if (card2Index !== -1) {
            const card2 = cardElements[card2Index];

            // 移除卡片
            card1.remove();
            card2.remove();

            // 替换新卡片 (确保卡片数量不变)
            const newItem = itemsPool[Math.floor(Math.random() * itemsPool.length)];
            board.appendChild(createSingleCard(newItem));
            board.appendChild(createSingleCard(newItem));
            shuffleBoardDOM();

        } else {
            // 如果找不到配对，就移除第一张，并再移除一张随机牌
            card1.remove();
            cardElements[Math.floor(Math.random() * cardElements.length)].remove();
        }
    }
}

// --- 修改 disableCards, 传递卡片类型 ---
function disableCards() {
    lockBoard = true;

    // 获取匹配到的卡片类型 (关键改动)
    const matchedCardType = firstCard.dataset.framework;
    playerAttack(matchedCardType); // 传递类型给攻击函数

    // ... (后续移除卡片和生成新卡片的逻辑保持不变) ...

    firstCard.removeEventListener('click', flipCard);
    secondCard.removeEventListener('click', flipCard);

    setTimeout(() => {
        if (!gameActive) return;

        // 1. 从DOM中移除旧卡片
        firstCard.remove();
        secondCard.remove();

        // 2. 生成一对新的随机卡片
        const newItem = itemsPool[Math.floor(Math.random() * itemsPool.length)];
        const newCard1 = createSingleCard(newItem);
        const newCard2 = createSingleCard(newItem);

        // 3. 添加到棋盘
        board.appendChild(newCard1);
        board.appendChild(newCard2);

        // 4. 打乱棋盘DOM布局
        shuffleBoardDOM();

        resetBoard();
    }, 600);
}