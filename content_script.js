console.log("content_script.js Strted");


function radio_changed(ele) {
    syncTabActiveState();

    var ids = [
        'g1-f', 'g1-f-intensive',
        'g2-f', 'g2-f-intensive',
        'g3-f', 'g3-f-intensive',
        'g4-f', 'g4-f-intensive',
        'g5-f', 'g5-f-intensive',
        'g6-f', 'g6-f-intensive',
        'g7-f', 'g7-f-intensive',
        'g8-f', 'g8-f-intensive'
    ];
    var myTable = document.getElementById('mytimeTable_table');

    var isMyTimetableSelected = !!(ele && ele.id === 'mytimetable' && ele.checked);

    if (isMyTimetableSelected) {
        ele.focus();
        ele.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        ids.forEach(function (id) {
            var target = document.getElementById(id);
            if (target) {
                target.style.display = 'none';
            }
        });
        if (myTable) {
            myTable.style.display = '';
        }
        return;
    }

    if (myTable) {
        myTable.style.display = 'none';
    }

    var activeSemesterInput = document.querySelector('input[id^="btn-g"][id$="-f"][name="oecu-tab"]:checked');
    if (!activeSemesterInput) {
        activeSemesterInput = document.getElementById('btn-g1-f');
    }
    var activeValue = activeSemesterInput ? activeSemesterInput.value : '1';
    var activeTableId = 'g' + activeValue + '-f';
    var activeIntensiveId = activeTableId + '-intensive';

    ids.forEach(function (id) {
        var target = document.getElementById(id);
        if (!target) {
            return;
        }
        if (id === activeTableId || id === activeIntensiveId) {
            target.style.display = '';
        } else {
            target.style.display = 'none';
        }
    });
}

function syncTabActiveState() {
    var radios = document.querySelectorAll('input[name="oecu-tab"]');
    radios.forEach(function (radio) {
        var label = document.querySelector('label[for="' + radio.id + '"]');
        if (!label) {
            return;
        }
        label.className = radio.checked ? 'active' : '';
    });
}

// content_script.js内で
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log(message);
    if (message.data) {
        if (message.data === "editor" && message.bool === true) {
            choiceBox();
        }
        else if (message.data === "editor" && message.bool === false) {
            removeEditor();
            storage_timetable_background();
        }
        else {
            console.log("メッセージが設定されてません[" + message.data + "]")
        }
    }
});
// 指定されたクラスに一致するすべての要素を削除する関数
function removeEditor() {
    console.log("remove実行")
    var elements = document.querySelectorAll(".editor");
    elements.forEach(function (element) {
        var parentElem = element;
        // 親要素から最初の子要素を取得して親要素の上に子要素を移動
        while (parentElem.firstChild) {
            parentElem.parentNode.insertBefore(parentElem.firstChild, parentElem);
        }
        // 空の親要素を削除
        parentElem.parentNode.removeChild(parentElem);
    });

    elements = document.querySelectorAll(".editor_button");
    elements.forEach(function (element) {
        element.parentNode.removeChild(element);
    });
    var elements = document.querySelectorAll(".editor_table");
    elements.forEach(function (element) {
        var parentElem = element;
        // 空の親要素を削除
        parentElem.parentNode.removeChild(parentElem);
    });

    elements = document.querySelectorAll('.course-item.editor-selected');
    elements.forEach(function (element) {
        element.classList.remove('editor-selected');
        element.style.backgroundColor = '';
    });
}
function GenerateSaveButton() {
    // 新しいボタン要素を作成
    var button = document.createElement("button");
    button.innerHTML = "保存";
    button.setAttribute("class", "editor");
    button.style = "position: fixed;bottom: 40px;left: 40px;border: none;border-radius: 50%;width: 200px;height: 200px;background-color: #4CAF50;color: white;font-size:60px;box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.25);transition: transform 0.2s;"
    // ボタンにhoverとactiveのスタイルを設定
    button.addEventListener('mouseover', function () {
        button.style.transform = 'translateY(2px)';
    });

    button.addEventListener('mouseout', function () {
        button.style.transform = 'translateY(0)';
    });

    button.addEventListener('mousedown', function () {
        button.style.transform = 'translateY(4px)';
    });

    button.addEventListener('mouseup', function () {
        button.style.transform = 'translateY(2px)';
    });
    button.addEventListener("click", function () {
        setTimeout(function () {
            button.textContent = ""
            button.remove();
            location.reload();
        }, 100)
    })

    // ボタンをbodyの最後に追加
    document.body.appendChild(button);
}

function extractCourseIdFromElement(element) {
    if (!element) {
        return null;
    }

    var link = element.querySelector('a[href*="course/view.php?id="]');
    if (!link) {
        return null;
    }

    var href = link.getAttribute('href') || '';
    var match = href.match(/course\/view\.php\?id=(\d+)/);
    if (!match) {
        return null;
    }

    return parseInt("9999" + match[1]);
}

function getAllCourseElements() {
    var elements = document.querySelectorAll('.main_font, .course-item');
    return Array.from(elements).filter(function (element) {
        return !element.closest('#mytimeTable_table');
    });
}

function setCourseItemSelected(item, selected) {
    item.classList.toggle('editor-selected', selected);
    item.style.backgroundColor = selected ? 'lightsteelblue' : '';
}

function attachCourseItemEditor(item) {
    if (!item || item.querySelector('.editor_button')) {
        return;
    }

    var courseId = generateId(item);
    if (!courseId) {
        return;
    }

    item.style.position = 'relative';
    var button = document.createElement('button');
    button.textContent = '◯';
    button.setAttribute('class', 'editor_button');
    button.style.cssText = 'position:absolute;top:6px;right:6px;z-index:2;';
    item.appendChild(button);

    button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();

        var isSelected = button.textContent === '◯';
        if (isSelected) {
            setCourseItemSelected(item, true);
            button.textContent = '✕';
            storage_set(courseId, '0-0');
            storage_timetable_background();
        } else {
            setCourseItemSelected(item, false);
            button.textContent = '◯';
            storage_remove(courseId);
            storage_timetable_background();
        }
    });
}


function choiceBox() {

    // クラス名が "main_font" のすべての要素を取得
    var elements = getAllCourseElements();

    // 取得した要素ごとに処理を行う
    elements.forEach(function (element) {
        if (element.classList.contains('course-item')) {
            attachCourseItemEditor(element);
            return;
        }

        // <p> 要素が見つかったかどうかのフラグ
        var foundParagraph = false;
        var xy = 0

        if (element.parentElement.classList.contains('editor') || element.parentElement.classList.contains('editor_table')) {//親要素がeditor（すでに登録されている時間割だったら）///////////////////////////////////////////////////////
            var div = element.parentElement;
            var button = document.createElement("button");
            //button.textContent = generateId(element);
            button.textContent = "✕"
            button.setAttribute("class", "editor_button");
            div.style.backgroundColor = "lightsteelblue";
            div.appendChild(button);


            button.addEventListener("click", function () {
                if (button.textContent === "◯") {
                    div.style.backgroundColor = "lightsteelblue";
                    button.textContent = "✕"
                    //表のｘｙ座標を取得
                    var cell_ = div
                    // 親要素が<td>または<th>になるまで親要素をたどる
                    while (cell_ && cell_.tagName !== 'TD' && cell_.tagName !== 'TH') {
                        cell_ = cell_.parentElement;
                    }

                    // TDまたはTHが見つかった場合
                    if (cell_ && (cell_.tagName === 'TD' || cell_.tagName === 'TH')) {
                        // テキストからxとyの値を正規表現で抽出する
                        var match = cell_.className.match(/x=(\d+)\sy=(\d+)/);
                        var x = parseInt(match[1]); // xの値を数値に変換
                        var y = parseInt(match[2]); // yの値を数値に変換
                        console.log(String(x) + "-" + String(y))
                        xy = String(x) + "-" + String(y)
                    }

                    storage_set(generateId(element), xy == 0 ? '0-0' : xy);

                }
                else {
                    div.style.backgroundColor = "pink";
                    button.textContent = "◯"
                    storage_remove(generateId(element));

                }
                console.log(generateId(element));

            })
        }
        else { //登録されていない時間割の場合////////////////////////////////////////////////////////////////////////
            // 次の要素へ移動
            var nextElement = element.nextElementSibling;

            // 次の要素が存在し、<p> 要素でない場合、下に移動し続ける
            while (nextElement && nextElement.tagName !== 'P') {
                nextElement = nextElement.nextElementSibling;
            }

            // <p> 要素が見つかった場合、それを含む <div> 要素を作成し、挿入する
            if (nextElement && nextElement.tagName === 'P') {
                var div = document.createElement("div");
                div.style.border = "1px solid #000"; // ディビジョンに境界線を追加
                div.setAttribute("class", "editor");

                // 見つかった <p> 要素を <div> 要素の前に挿入
                while (element.nextElementSibling !== nextElement) {
                    div.appendChild(element.nextElementSibling);
                }
                element.parentNode.insertBefore(div, nextElement);
                div.appendChild(element);
                element.parentNode.insertBefore(element, element.parentNode.firstChild);
                div.appendChild(nextElement);
                var button = document.createElement("button");
                //button.textContent = generateId(element);
                button.textContent = "◯"
                button.setAttribute("class", "editor_button");
                div.appendChild(button);


                button.addEventListener("click", function () {
                    if (button.textContent === "◯") {
                        div.style.backgroundColor = "lightsteelblue";
                        button.textContent = "✕"
                        //表のｘｙ座標を取得
                        var cell_ = div
                        // 親要素が<td>または<th>になるまで親要素をたどる
                        while (cell_ && cell_.tagName !== 'TD' && cell_.tagName !== 'TH') {
                            cell_ = cell_.parentElement;
                        }

                        // TDまたはTHが見つかった場合
                        if (cell_ && (cell_.tagName === 'TD' || cell_.tagName === 'TH')) {
                            // テキストからxとyの値を正規表現で抽出する
                            var match = cell_.className.match(/x=(\d+)\sy=(\d+)/);
                            var x = parseInt(match[1]); // xの値を数値に変換
                            var y = parseInt(match[2]); // yの値を数値に変換
                            console.log(String(x) + "-" + String(y))
                            xy = String(x) + "-" + String(y)
                        }

                        storage_set(generateId(element), xy == 0 ? '0-0' : xy);

                    }
                    else {
                        div.style.backgroundColor = null;
                        button.textContent = "◯"
                        storage_remove(generateId(element));

                    }
                    console.log(generateId(element));

                })
            }

            foundParagraph = true;
        }

        // <p> 要素が見つからなかった場合、適切なメッセージを出力
        if (!foundParagraph) {
            console.log("次の <p> 要素が見つかりませんでした。");
        }
    });
    GenerateSaveButton();
}

function storage_set(key, value) {
    chrome.storage.local.set({ [key]: value }, function () {
    });
}
function storage_remove(key) {
    chrome.storage.local.remove(String(key))
}

function myTimeTable_create(element) {
    // テーブル要素を作成
    var table = document.createElement("table");
    table.setAttribute("id", "mytimeTable_table")
    table.setAttribute("class", "timetable");
    table.style.marginTop = "16px";
    var day = ["月", "火", "水", "木", "金"];
    // tbody要素を作成
    var tbody = document.createElement("tbody");

    // ヘッダ行
    var row = document.createElement("tr");
    row.setAttribute("class", "header-row");
    var cell = document.createElement("th");
    cell.setAttribute("class", "period-header");
    row.appendChild(cell);
    for (var d = 0; d < 5; d++) {
        cell = document.createElement("th");
        cell.setAttribute("class", "day-header");
        cell.textContent = day[d];
        row.appendChild(cell);
    }
    tbody.appendChild(row);

    // 1-7限
    for (var i = 1; i <= 7; i++) {
        row = document.createElement("tr");
        cell = document.createElement("td");
        cell.setAttribute("class", "period-cell");
        cell.textContent = String(i);
        row.appendChild(cell);

        for (var j = 0; j < 5; j++) {
            var courseCell = document.createElement("td");
            courseCell.setAttribute("class", "course-cell");
            row.appendChild(courseCell);
        }

        tbody.appendChild(row);
    }

    // 集中授業ヘッダ
    row = document.createElement("tr");
    row.setAttribute("class", "header-row");
    cell = document.createElement("th");
    cell.setAttribute("class", "intensive-header");
    cell.colSpan = "6";
    cell.textContent = "集中授業";
    row.appendChild(cell);
    tbody.appendChild(row);

    // 集中授業内容行
    row = document.createElement("tr");
    cell = document.createElement("td");
    cell.setAttribute("class", "course-cell");
    cell.colSpan = "6";
    var intensiveGrid = document.createElement("div");
    intensiveGrid.setAttribute("class", "intensive-grid");
    cell.appendChild(intensiveGrid);
    row.appendChild(cell);
    tbody.appendChild(row);

    // tbodyをテーブルに追加
    table.appendChild(tbody);
    // テーブルをbodyに追加
    element.appendChild(table);

    table.style.display = "none";
}
function myTimeTable_set(element) {
    var myTimeTable = document.getElementById("mytimeTable_table");
    if (!myTimeTable) {
        return;
    }

    var cell_ = element
    // 親要素が<td>または<th>になるまで親要素をたどる
    while (cell_ && cell_.tagName !== 'TD' && cell_.tagName !== 'TH') {
        cell_ = cell_.parentElement;
    }

    // TDまたはTHが見つかった場合
    if (cell_ && (cell_.tagName === 'TD' || cell_.tagName === 'TH')) {
        var sourceTable = cell_.closest('table');
        var isIntensiveCourse = !!(sourceTable && sourceTable.id && sourceTable.id.endsWith('-intensive'));

        var x = 0;
        var y = 9; // 集中授業の内容行

        if (!isIntensiveCourse) {
            // テキストからxとyの値を正規表現で抽出する
            var match = cell_.className.match(/x=(\d+)\sy=(\d+)/);
            if (!match) {
                return;
            }
            x = parseInt(match[1]); // xの値を数値に変換
            y = parseInt(match[2]); // yの値を数値に変換
        }

        var timecell = myTimeTable.querySelector('.x\\=' + x + '.y\\=' + y);
        var clone_element = element.cloneNode(true);
        clone_element.style = ""
        clone_element.setAttribute("class", isIntensiveCourse ? "editor_table editor_table_intensive" : "editor_table")
        if (timecell !== null) {
            if (isIntensiveCourse) {
                var grid = timecell.querySelector('.intensive-grid');
                if (grid) {
                    grid.appendChild(clone_element);
                } else {
                    timecell.appendChild(clone_element);
                }
            } else {
                timecell.appendChild(clone_element);
            }

        }
        else {
            x = 0;
            y = 9;
            timecell = myTimeTable.querySelector('.x\\=' + x + '.y\\=' + y);
            clone_element = element.cloneNode(true);
            clone_element.setAttribute("class", "editor_table editor_table_intensive")
            if (timecell !== null) {
                var fallbackGrid = timecell.querySelector('.intensive-grid');
                if (fallbackGrid) {
                    fallbackGrid.appendChild(clone_element);
                } else {
                    timecell.appendChild(clone_element);
                }

            }
        }

    } else {
        console.log("x=" + x + ", y=" + y + "のセルの親要素が見つかりませんでした。");
    }


}

function BeginSetID() {//最初にすべてのタイトルにIDを割り当てます
    // 旧レイアウトと新レイアウトの授業要素にIDを割り当てます
    var elements = getAllCourseElements();

    // 取得した要素ごとに処理を行う
    elements.forEach(function (element) {

        element.setAttribute("ID", generateId(element));
    })
};

function generateId(element) {
    return extractCourseIdFromElement(element);
}
function addCoordinatesToTable() { //すべてのtableを取得してx,y座標を設定
    var tables = document.getElementsByTagName("table");

    for (var i = 0; i < tables.length; i++) {
        var table = tables[i];
        //console.log(table);
        var rows = table.getElementsByTagName("tr");

        for (var y = 0; y < rows.length; y++) {
            var cells = rows[y].querySelectorAll("td, th");

            for (var x = 0; x < cells.length; x++) {
                var cell = cells[x];
                cell.classList.add("x=" + x, "y=" + y); // クラスに"x=?"と"y=?"を追加
            }
        }
    }

}

function read_data(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, function (data) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                console.info(data);
                console.log(data[key]);
                resolve(data[key]);
            }
        });
    });
}

function parseBooleanSetting(value, defaultValue) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
    }
    return defaultValue;
}



function storage_timetable_background() {//ローカルからデータを読み取り保存されたデータを下に時間割の背景色を変更
    var myTable = document.getElementById('mytimeTable_table');
    if (myTable) {
        var clones = myTable.querySelectorAll('.editor_table');
        clones.forEach(function (clone) {
            clone.parentNode.removeChild(clone);
        });
    }

    var selectedItems = document.querySelectorAll('.course-item.editor-selected');
    selectedItems.forEach(function (item) {
        setCourseItemSelected(item, false);
        var btn = item.querySelector('.editor_button');
        if (btn) {
            btn.textContent = '◯';
        }
    });

    chrome.storage.local.get(null, ((data) => {
        for (let value in data) {
            if (!String(value).startsWith('9999')) {
                continue;
            }
            //console.log(value + data[value]);

            var elements = getAllCourseElements();
            elements.forEach(function (element) {
                if (element.id === value) {

                    if (element.classList.contains('course-item')) {
                        setCourseItemSelected(element, true);
                        attachCourseItemEditor(element);
                        var itemButton = element.querySelector('.editor_button');
                        if (itemButton) {
                            itemButton.textContent = '✕';
                        }
                        myTimeTable_set(element);
                        return;
                    }


                    // 次の要素へ移動
                    var nextElement = element.nextElementSibling;

                    // 次の要素が存在し、<p> 要素でない場合、下に移動し続ける
                    while (nextElement && nextElement.tagName !== 'P') {
                        nextElement = nextElement.nextElementSibling;
                    }

                    // <p> 要素が見つかった場合、それを含む <div> 要素を作成し、挿入する
                    if (nextElement && nextElement.tagName === 'P') {
                        var div = document.createElement("div");
                        div.style.border = "1px dashed #000"; // ディビジョンに境界線を追加
                        div.style.backgroundColor = "lightsteelblue"
                        div.setAttribute("class", "editor");

                        // 見つかった <p> 要素を <div> 要素の前に挿入
                        while (element.nextElementSibling !== nextElement) {
                            div.appendChild(element.nextElementSibling);
                        }
                        element.parentNode.insertBefore(div, nextElement);
                        div.appendChild(element);
                        element.parentNode.insertBefore(element, element.parentNode.firstChild);
                        div.appendChild(nextElement);
                        myTimeTable_set(div);
                        chrome.storage.local.get(value).then((data2) => {

                            console.log("一致[" + value + "]  値[" + data2[value] + "]")
                        })
                    }
                }
            });

        }
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const setting2Value = await read_data("setting3");
        document.getElementById("switch3").checked = JSON.parse(setting2Value);
    } catch (error) {
        console.error('Error reading setting3:', error);
    }
})

window.onload = async function () {
    // コントロール挿入先とテーブル挿入先を分離
    var controlsHost = null;
    var g1Input = document.getElementById('btn-g1-f');
    if (g1Input) {
        controlsHost = g1Input.closest('.tab-buttons');
    }
    if (!controlsHost) {
        controlsHost = document.querySelector('.sample');
    }
    if (!controlsHost) {
        controlsHost = document.querySelector('.tab-buttons');
    }

    var tableHost = document.querySelector('.timetable-container');
    if (!tableHost) {
        tableHost = controlsHost;
    }

    var enableMyTimetableFeature = true;
    try {
        const setting3Value = await read_data("setting3");
        enableMyTimetableFeature = parseBooleanSetting(setting3Value, true);
    } catch (error) {
        console.error('Error reading setting3:', error);
    }

    // 「自分の時間割を表示」がOFFなら何もしない
    if (!enableMyTimetableFeature) {
        var oldInput = document.getElementById('mytimetable');
        var oldLabel = document.getElementById('label-mytimetable');
        var oldTable = document.getElementById('mytimeTable_table');
        if (oldInput) {
            oldInput.remove();
        }
        if (oldLabel) {
            oldLabel.remove();
        }
        if (oldTable) {
            oldTable.remove();
        }
        return;
    }

    var enableEditorButton = true;
    try {
        const setting2Value = await read_data("setting2");
        enableEditorButton = parseBooleanSetting(setting2Value, true);
    } catch (error) {
        console.error('Error reading setting2:', error);
    }

    try {
        // 時間割UIを追加
        // ボタン要素を作成

            var button = document.createElement("img");
            button.src = "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_henshuu_6.png"
            button.style = "height:30px ;justify-content: center;align-items: center;"
            // ボタンにhoverとactiveのスタイルを設定
            button.addEventListener('mouseover', function () {
                button.style.transform = 'translateY(2px)';
            });
            button.addEventListener('mouseout', function () {
                button.style.transform = 'translateY(0)';
            }
            );
            button.addEventListener('mousedown', function () {
                button.style.transform = 'translateY(4px)';
            });
            button.addEventListener('mouseup', function () {
                button.style.transform = 'translateY(2px)';
            });


            var flag = false;
            button.addEventListener("click", function () {
                if (flag) {
                    removeEditor();
                    storage_timetable_background();
                    button.src = "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_henshuu_6.png";
                    flag = false;

                    return 0;
                } else {
                    choiceBox();
                    button.src = "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_hozon_2.png"
                    flag = true;
                    //hover文字
                    button.textContent = "保存";
                    return 0;
                }
            });


            // input要素を作成
            var input = document.createElement("input");
            input.setAttribute("type", "radio");
            input.setAttribute("name", "oecu-tab");
            input.setAttribute("id", "mytimetable");
            input.setAttribute("value", "mytimetable");
            input.addEventListener("change", function () {
                radio_changed(input);
            });

            // ボタンにクリックイベントを追加
            for (var i = 1; i < 9; i++) {
                var ele = document.getElementById('btn-g' + i + '-f');
                if (ele) {
                    ele.addEventListener("change", function () {
                        radio_changed(this);
                    })
                }
            }

            // label要素を作成
            var label = document.createElement("label");
            label.setAttribute("for", "mytimetable");
            label.setAttribute("id", "label-mytimetable");
            label.textContent = "自分専用";

            // controlsHostの中にあるbrを削除
            if (controlsHost) {
                var divElementElement = controlsHost.querySelector("br");
                if (divElementElement !== null) {
                    divElementElement.remove();
                }

                controlsHost.appendChild(input);
                controlsHost.appendChild(label);
                if (enableEditorButton) {
                    controlsHost.appendChild(button);
                }
            }

            syncTabActiveState();
    } catch (error) {
        console.error('Error building timetable controls:', error);
    }

    if (tableHost) {
        myTimeTable_create(tableHost);
    }
    BeginSetID();
    addCoordinatesToTable();
    storage_timetable_background();

    try {
        const setting3Value = await read_data("setting3");
        if (parseBooleanSetting(setting3Value, true)) {
            var input = document.getElementById("mytimetable")
            if (input) {
                input.checked = true;
                radio_changed(input);
            }
        }

    } catch (error) {
        console.error('Error reading setting2:', error);
    }
}

console.log("content-script.js Ended");
