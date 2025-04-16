console.log("content_script.js Strted");


function radio_changed(ele) {
    if (ele.checked) {
        document.getElementById('g1-f').style.display = 'none';
        document.getElementById('g2-f').style.display = 'none';
        document.getElementById('g3-f').style.display = 'none';
        document.getElementById('g4-f').style.display = 'none';
        document.getElementById('g5-f').style.display = 'none';
        document.getElementById('g6-f').style.display = 'none';
        document.getElementById('g7-f').style.display = 'none';
        document.getElementById('g8-f').style.display = 'none';
        document.getElementById('mytimeTable_table').style = '';
    }
    else {
        document.getElementById('mytimeTable_table').style.display = 'none ';
    }
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
        var parentElem = element;
        // 親要素から最初の子要素を取得して親要素の上に子要素を移動
        parentElem.parentNode.removeChild(parentElem);
    });
    var elements = document.querySelectorAll(".editor_table");
    elements.forEach(function (element) {
        var parentElem = element;
        // 空の親要素を削除
        parentElem.parentNode.removeChild(parentElem);
    });

    elements = document.querySelectorAll(".editor_button");
    elements.forEach(function (element) {
        element.parentNode.removeChild(parentElem);
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


function choiceBox() {

    // クラス名が "main_font" のすべての要素を取得
    var elements = document.querySelectorAll('.main_font');

    // 取得した要素ごとに処理を行う
    elements.forEach(function (element) {
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
    table.setAttribute("class", "jmx");
    var day = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"];
    // tbody要素を作成
    var tbody = document.createElement("tbody");


    // 5行5列のセルを作成してテーブルに追加
    for (var i = 0; i < 7; i++) {
        // 行を作成
        var row = document.createElement("tr");

        for (var j = 0; j < 6; j++) {

            var text = document.createTextNode("");
            if (j === 0) {
                //縦列最初
                var cell = document.createElement("th");
                cell.setAttribute("class", "jmxt");
                if (i !== 0) {
                    var div = document.createElement("div");
                    div.setAttribute("class", "vertical_text");
                    div.textContent = (i + "限目");
                    cell.appendChild(div);
                }
            }
            else if ((i * 6) + (j + 1) <= 6) {
                //横列最初
                var cell = document.createElement("th");
                cell.setAttribute("class", "jmx");
                text = document.createTextNode(day[(i * 6) + (j + 1) - 2]);

            }
            else {
                // 列を作成
                var cell = document.createElement("td");
                cell.setAttribute("class", "jmx");
                //セルにテキストを追加
                //text = document.createTextNode((i * 6) + (j + 1));
            }

            cell.appendChild(text);

            // 列を行に追加
            row.appendChild(cell);
        }

        // 行をテーブルに追加
        tbody.appendChild(row);




    }
    row = document.createElement("tr");
    var cell = document.createElement("th");
    cell.setAttribute("class", "jmx");
    cell.colSpan = "6";
    text = document.createTextNode("集中授業");
    cell.appendChild(text);
    row.appendChild(cell);
    tbody.appendChild(row);

    row = document.createElement("tr");
    cell = document.createElement("td");
    cell.setAttribute("class", "jmx");
    cell.colSpan = "6";
    // 列を行に追加
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

    var cell_ = element
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
        //console.log(String(x) + "-" + String(y))
        var timecell = myTimeTable.querySelector('.x\\=' + x + '.y\\=' + y);
        //console.log(timecell)
        var clone_element = element.cloneNode(true);
        clone_element.style = ""
        clone_element.setAttribute("class", "editor_table")
        if (timecell !== null) {
            timecell.appendChild(clone_element);

        }
        else {
            var x = 0; // xの値を数値に変換
            var y = 8; // yの値を数値に変換
            //console.log(String(x) + "-" + String(y))
            var timecell = myTimeTable.querySelector('.x\\=' + x + '.y\\=' + y);
            //console.log(timecell)
            var clone_element = element.cloneNode(true);
            if (timecell !== null) {
                timecell.appendChild(clone_element);

            }
        }

    } else {
        console.log("x=" + x + ", y=" + y + "のセルの親要素が見つかりませんでした。");
    }


}

function BeginSetID() {//最初にすべてのタイトルにIDを割り当てます
    // クラス名が "main_font" のすべての要素を取得
    var elements = document.querySelectorAll('.main_font');

    // 取得した要素ごとに処理を行う
    elements.forEach(function (element) {

        element.setAttribute("ID", generateId(element));
    })
};

function generateId(element) {
    console.error(element);
    // element内のすべての<a>要素を取得します
    const links = element.querySelectorAll('a');
    var link = "";
    // リンクをループして、idを取得します
    for (let i = 0; i < links.length; i++) {
        link = links[i];
        // href属性からidを取得します
        const href = link.getAttribute('href');
        //https://moodle2025.mc2.osakac.ac.jp/2025/course/view.php?id=606
        //からIDを取得します
        if (href.startsWith('/2025/course/view.php?id=')) {
            const id = href.substring('/2025/course/view.php?id='.length);
            if (!isNaN(id)) {
                return parseInt("9999" + id); // 数字のidを返します
            }
    
        }
        else if (href.startsWith('https://moodlestack2025.mc2.osakac.ac.jp/2025/course/view.php?id=')) {
            const id = href.substring('https://moodlestack2025.mc2.osakac.ac.jp/2025/course/view.php?id='.length);
            // idが数字であるかチェックします
            if (!isNaN(id)) {
                return parseInt("9999" + id); // 数字のidを返します
            }
        }
    }

    // 数字のidが見つからなかった場合
    console.log(link);
    return link;
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



function storage_timetable_background() {//ローカルからデータを読み取り保存されたデータを下に時間割の背景色を変更
    chrome.storage.local.get(null, ((data) => {
        for (let value in data) {
            //console.log(value + data[value]);

            // クラス名が "main_font" のすべての要素を取得
            var elements = document.querySelectorAll('.main_font');
            elements.forEach(function (element) {
                if (element.id === value) {


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
    // div要素を取得
    var divElement = document.querySelector('.sample');




    try {
        const setting2Value = await read_data("setting2");
        console.log(JSON.parse(setting2Value))
        if (JSON.parse(setting2Value)) {//時間割ボタンの追加
            console.log(JSON.parse(setting2Value))
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
            input.setAttribute("name", "oecu");
            input.setAttribute("id", "mytimetable");
            input.setAttribute("value", "mytimetable");
            input.addEventListener("change", function () {
                radio_changed(input);
            });

            // ボタンにクリックイベントを追加
            for (var i = 1; i < 9; i++) {
                var ele = document.getElementById('btn-g' + i + '-f');
                console.log(ele);
                ele.addEventListener("change", function () {
                    radio_changed(input);
                })
            }

            // label要素を作成
            var label = document.createElement("label");
            label.setAttribute("for", "mytimetable");
            label.textContent = "自分専用";

            //divElementの中にあるbrを削除
            var divElementElement = divElement.querySelector("br");
            if (divElementElement !== null) {
                divElementElement.remove();
            }

            divElement.appendChild(input);
            divElement.appendChild(label);
            divElement.appendChild(button);




        }
    } catch (error) {
        console.error('Error reading setting2:', error);
    }

    myTimeTable_create(divElement);
    BeginSetID();
    storage_timetable_background();
    addCoordinatesToTable();

    try {
        const setting3Value = await read_data("setting3");
        console.log(JSON.parse(setting3Value))
        if (JSON.parse(setting3Value)) {//時間割ボタンの追加
            var input = document.getElementById("mytimetable")
            input.checked = true;
            radio_changed(input);
        }

    } catch (error) {
        console.error('Error reading setting2:', error);
    }
}

console.log("content-script.js Ended");
