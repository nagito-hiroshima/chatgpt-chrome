console.log("course.js Strted");
//setting3がtrueの場合はスキップ
chrome.storage.local.get({"setting3":true}, function (items) {
  if(items.setting3){
    console.info("setting3 is true");
    return;
  }else{
    console.info("setting3 is false");
    chrome.storage.sync.get({"selectkey":"" }, function (items) {
      //0.5秒後にselectkeyの値を取得して、その値のidをクリックする
      setTimeout(function(){
        document.getElementById(items.selectkey).click();
      },500);
    });
  }
});

console.log("course.js Ended");