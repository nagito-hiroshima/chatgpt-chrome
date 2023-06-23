
// Saves options to chrome.storage
function save_options() {
    var nkey_input = document.getElementById('nkey-input').value;
    var nkey_cheak = document.getElementById('nkey-checkbox').checked;
    chrome.storage.sync.set({
      nkey: nkey_input,
      ncheak:nkey_cheak
    }, function() {
      // Update status to let user know options were saved.
      var status = document.getElementById('status');
      status.textContent = '保存されました';
    });
   }
   
   // Restores select box and checkbox state using the preferences
   // stored in chrome.storage.
   function restore_options() {
    // Use default value nkey-input = 'red' and likesnkey-input = true.
    chrome.storage.sync.get({"nkey":"","ncheak":""}, function(items) {
      document.getElementById('nkey-input').value = items.nkey;
        document.getElementById('nkey-checkbox').checked = items.ncheak;
    });
   }


   document.addEventListener('DOMContentLoaded', restore_options);
   document.getElementById('save').addEventListener('click',
      save_options);
   
   //範囲選択禁止
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
    }
    , false);
    
   