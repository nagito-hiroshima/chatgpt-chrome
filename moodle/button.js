console.log("button.js Strted");

let ID;
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

    var result = moodleDepartment(ID);
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