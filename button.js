console.log("button.js Strted");

let ID;
const departments = {
    "EE": { id: 2, name: "電気電子工学科" },
    "EH": { id: 3, name: "電子機械工学科" },
    "EJ": { id: 4, name: "機械工学科" },
    "EN": { id: 5, name: "基礎理工学科 数理科学専攻／基礎理工学科" },
    "EU": { id: 6, name: "基礎理工学科 環境化学専攻／環境科学科" },
    "EC": { id: 7, name: "建築学科" },
    "GP": { id: 8, name: "情報工学科" },
    "GF": { id: 9, name: "通信工学科" },
    "KC": { id: 10, name: "建築・デザイン学科 建築専攻" },
    "KD": { id: 11, name: "建築・デザイン学科 空間デザイン専攻" },
    "HL": { id: 12, name: "健康情報学科 医療工学専攻／医療科学科／医療福祉工学科" },
    "FY": { id: 13, name: "健康情報学科 理学療法学専攻／理学療法学科" },
    "FS": { id: 14, name: "健康情報学科 スポーツ科学専攻／健康スポーツ科学科" },
    "HW": { id: 15, name: "デジタルゲーム学科" },
    "HB": { id: 16, name: "ゲーム＆メディア学科" },
    "HT": { id: 17, name: "情報学科" }

};

function getMoodleRoot() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    var root = parts.length > 0 ? '/' + parts[0] : '';
    return window.location.origin + root;
}

function insertDepartmentShortcut() {
    if (document.querySelector('[data-oecu-home="1"]')) {
        return true;
    }

    // Moodleのバージョン差分で class が mr-1 / me-1 のどちらかになる
    var usertext = document.querySelector('.usertext.mr-1, .usertext.me-1');
    var usernavigation = document.querySelector('#usernavigation');
    if (!usertext || !usernavigation) {
        return false;
    }

    ID = (usertext.textContent || '').trim().split(/\s+/)[0] || '';
    if (!ID) {
        return false;
    }

    var departmentKey = ID.substring(0, 2);
    var result = departments[departmentKey];
    if (!result) {
        return false;
    }

    var div = document.createElement('div');
    div.className = 'singlebutton';
    div.style.marginTop = '5px';
    div.setAttribute('data-oecu-home', '1');

    var i = document.createElement('i');
    i.className = 'icon fa fa-home fa-fw';
    i.title = '所属コースを表示';
    i.role = 'img';
    i.ariaLabel = '所属コースを表示';
    i.onclick = function () {
        window.location.href = getMoodleRoot() + '/course/index.php?categoryid=' + result.id;
    };

    div.appendChild(i);
    usernavigation.insertBefore(div, usernavigation.firstChild);
    return true;
}

// ヘッダー描画が遅いページがあるため、短い間隔で数回リトライ
var tries = 0;
var timer = setInterval(function () {
    tries += 1;
    var done = insertDepartmentShortcut();
    if (done || tries >= 20) {
        clearInterval(timer);
    }
}, 150);

console.log("button.js Ended");