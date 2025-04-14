console.log("button.js Strted");

let ID;
const departments = {
    "EE": { id: 130, name: "電気電子工学科" },
    "EH": { id: 129, name: "電子機械工学科" },
    "EJ": { id: 128, name: "機械工学科" },
    "EN": { id: 127, name: "基礎理工学科 数理科学専攻／基礎理工学科" },
    "EU": { id: 126, name: "基礎理工学科 環境化学専攻／環境科学科" },
    "EC": { id: 125, name: "建築学科" },
    "GP": { id: 124, name: "情報工学科" },
    "GF": { id: 123, name: "通信工学科" },
    "KC": { id: 122, name: "建築・デザイン学科 建築専攻" },
    "KD": { id: 121, name: "建築・デザイン学科 空間デザイン専攻" },
    "FL": { id: 120, name: "医療科学科／医療福祉工学科" },
    "FY": { id: 119, name: "理学療法学科" },
    "FS": { id: 118, name: "健康スポーツ科学科" },
    "HW": { id: 117, name: "デジタルゲーム学科" },
    "HB": { id: 116, name: "ゲーム＆メディア学科" },
    "HT": { id: 115, name: "情報学科" }
};
setTimeout(function () {
    //ユーザーID取得
    var usertext = document.querySelector(".usertext.mr-1");
    if (usertext) {
        //ID取得
        ID = usertext.textContent;
        ID = ID.split(" ")[0];
        
        const departmentKey = ID.substring(0, 2);
        const result = departments[departmentKey];
        console.log(result); // { id: 124, name: "情報工学科" }
        
        //usernavigationの一番上に追加
        var usernavigation = document.querySelector("#usernavigation");
        var div = document.createElement("div");
        div.className = "popover-region-toggle nav-link icon-no-margin";



        var i = document.createElement("i");
        i.className = "icon fa fa-home fa-fw";
        i.title = "所属コースを表示";
        i.role = "img";
        i.ariaLabel = "所属コースを表示";
        //押したらURLに遷移
        i.onclick = function () {
            window.location.href = "https://moodle2025.mc2.osakac.ac.jp/2025/course/index.php?categoryid=" + result.id;
        };
        div.appendChild(i);
        usernavigation.insertBefore(div, usernavigation.firstChild);
    }
}, 100);

console.log("button.js Ended");