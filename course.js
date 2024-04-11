console.log("course.js Strted");
chrome.storage.sync.get({"selectkey":"" }, function (items) {
  //0.5秒後にselectkeyの値を取得して、その値のidをクリックする
  setTimeout(function(){
    document.getElementById(items.selectkey).click();
  },500);
});
console.log("course.js Ended");