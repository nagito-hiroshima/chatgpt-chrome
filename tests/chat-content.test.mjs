import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validMessages, validImages, IMAGE_LIMITS } from '../chat/chat-content.mjs';

const png = 'data:image/png;base64,iVBORw0KGgo=';
test('image input accepts bounded data URLs and rejects external/private URLs or files', () => {
  assert.equal(validMessages([{role:'user',content:[{type:'input_text',text:'図について'},{type:'input_image',image_url:png,detail:'high'}]}]), true);
  assert.equal(validMessages([{role:'assistant',content:[{type:'input_image',image_url:png}]}]), false);
  for (const image_url of ['http://127.0.0.1/secret','https://moodle.example/pluginfile.php?id=1','file:///secret','data:text/html;base64,PHNjcmlwdD4=']) {
    assert.equal(validMessages([{role:'user',content:[{type:'input_image',image_url}]}]), false);
  }
  assert.equal(validImages(Array(IMAGE_LIMITS.count + 1).fill(png)), false);
  assert.equal(validImages(['data:image/png;base64,' + 'A'.repeat(IMAGE_LIMITS.each)]), false);
});
