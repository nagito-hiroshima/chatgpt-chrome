console.log("assign.js Strted");


/*div.rowの末尾に追加 div role=mainの中にあるdiv.rowの末尾に追加*/
var row = document.querySelector("div[role=main] div.row");
var col = document.createElement("div");
col.className = "col-xs-6 mr-3";
var div = document.createElement("div");
div.className = "singlebutton";
var button = document.createElement("button");
button.className = "btn btn-info";
button.textContent = "カレンダーに登録する";
//変数を渡す
button.onclick = function () {


    /*activity-datesの 開始日と終了日と時間を取得変数に格納*/
    //activity-datesの中のdivを取得
    var activity_dates = document.querySelector("div.activity-dates");
    //開始日がない場合は終了日を取得
    if (activity_dates.children.length == 1) {
        var start = activity_dates.children[0].textContent;
        var end = activity_dates.children[0].textContent;
    } else {
    var start = activity_dates.children[0].textContent;
    var end = activity_dates.children[1].textContent;
    }
    //開始日と終了日のみ取得
    start = start.replace("開始済み:", "").trim();
    start = start.replace("開始予定:", "").trim();
    start = start.replace("開始:", "").trim();
    end = end.replace("終了済み:", "").trim();
    end = end.replace("終了予定:", "").trim();
    end = end.replace("期限:", "").trim();
    //半角/全角スペース削除
    start = start.replace(/\s+/g, '');
    end = end.replace(/\s+/g, '');

    /*page-header-headingsの中のコース名を取得変数に格納*/
    var page_header_headings = document.querySelector("div.page-header-headings");
    var course_name = page_header_headings.children[0].textContent;

    /*h2の課題名を取得変数に格納*/
    var h2 = document.querySelector("h2");
    var task_name = h2.textContent;

    /*no-overflowの中の説明を取得変数に格納（ない場合はスキップ）*/
    var no_overflow = document.querySelector("div.no-overflow");
    var description = "";
    if (no_overflow) {
        description = no_overflow.textContent;
    }

    /*urlの取得*/
    var url = window.location.href;


    /*debag用*/
    console.log(course_name);
    console.log(task_name);
    console.log(start);
    console.log(datestring(start));
    console.log(end);
    console.log(datestring(end));
    console.log(description);
    console.log(url);




    // Googleカレンダーに登録する 8時00分から30分間の予定を登録
    var title = "[課題提出日] " + task_name + "_" + course_name;
    var location = url;
    var endtime = end.match(/(\d+):(\d+)/)[0];
    //00:00だったら23:59にする
    if (endtime == "00:00") {
        endtime = "23:59";
    }
    
    // descriptionをエンコード
    var description = "【締切時間】" + endtime + "\n" +
        "【課題名】" + task_name + "\n\n" +
        "【課題の説明】\n " + description + "\n\n\n" +
        "【授業名】 " + course_name + "\n" +
        "【開始日】 " + start + "\n" +
        "【終了日】 " + end + "\n" +
        "【URL】 " + url;

    // 開始日と終了日を生成
    var enddate = datestring(end);

    //0:00だったら一日前にする
    if (enddate.getHours() == 0) {
        enddate.setDate(enddate.getDate() - 1);
    }

    console.log("enddate", enddate);
    var startDate = enddate.getFullYear() + "" + (enddate.getMonth() + 1) + "" + enddate.getDate() + "T080000";
    var endDate = enddate.getFullYear() + "" + (enddate.getMonth() + 1) + "" + enddate.getDate() + "T083000";

    console.log("startDate", startDate);
    console.log("endDate", endDate);
    // URLを構築する際に、title、description、locationをエンコード
    var calendarUrl = "https://www.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) +
        "&dates=" + startDate + "/" + endDate +
        "&details=" + encodeURIComponent(description) +
        "&location=" + encodeURIComponent(location) +
        "&sf=true&output=xml";
        

    window.open(calendarUrl);
    console.log(calendarUrl);


}

div.appendChild(button);
col.appendChild(div);
row.appendChild(col);


console.log("assign.js Ended");



function datestring(time) {
    //time = "2024年10月3日(木曜日)11:30"
    console.log("受け取り変数", time)
    // 正規表現を使って日付と時刻を抽出し、Dateオブジェクトを作成
    const dateParts = time.match(/(\d+)年(\d+)月(\d+)日\(.+\)(\d+):(\d+)/);

    if (dateParts) {
        const year = parseInt(dateParts[1], 10);
        const month = parseInt(dateParts[2], 10) - 1; // 月は0から始まるため
        const day = parseInt(dateParts[3], 10);
        const hours = parseInt(dateParts[4], 10);
        const minutes = parseInt(dateParts[5], 10);

        const date = new Date(year, month, day, hours, minutes);
        return date;
    } else {
        console.log("日付の形式が不正です");
        return new Date();
    }
}