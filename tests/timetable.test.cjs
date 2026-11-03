const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const popup = fs.readFileSync('popup/popup-js.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(popup.slice(0, popup.indexOf('// 入力欄')) + fs.readFileSync('shared/moodle-departments.js', 'utf8') +
  popup.slice(popup.indexOf('function normalizeMoodleUrl'), popup.indexOf('document.getElementById("curriculum")')), context);
const root = 'https://moodle2026.mc2.osakac.ac.jp/2026/';
test('saved student ID selects the matching department category', () => {
  assert.equal(context.departmentMoodleUrl('GP12345'), root + 'course/index.php?categoryid=8');
  assert.equal(context.departmentMoodleUrl(' ht12345 '), root + 'course/index.php?categoryid=17');
  assert.equal(context.departmentMoodleUrl('EE12345'), root + 'course/index.php?categoryid=2');
});
test('missing and unrecognized student IDs open Moodle home', () => {
  for (const id of [undefined, null, '', 'UNKNOWN', 'G', 'toString']) {
    assert.equal(context.departmentMoodleUrl(id), root);
  }
});

const content = fs.readFileSync('moodle/timetable-content.js', 'utf8');
vm.runInContext(content.slice(content.indexOf('function courseSlot('), content.indexOf('function attachCourseItemEditor')), context);
test('new timetable layout stores weekday and period and excludes intensive courses', () => {
  const item = (day, period, id = 'g1-f') => ({ closest: () => ({ cellIndex: day, parentElement: { rowIndex: period }, closest: () => ({ id }) }) });
  assert.equal(context.courseSlot(item(2, 3)), '2-3');
  assert.equal(context.courseSlot(item(2, 3, 'g1-f-intensive')), '0-0');
  assert.equal(context.courseSlot(item(0, 0)), '0-0');
});

const at = (hour, minute, day = 1) => ({getHours: () => hour, getMinutes: () => minute, getDay: () => day});
test('registered current class takes priority over department', () => {
  const data = {9999123: '1-1', 9999456: '1-2', 9999789: '2-1'};
  assert.equal(context.moodleShortcutUrl('GP123', data, at(9, 0)), root + 'course/view.php?id=123');
  assert.equal(context.moodleShortcutUrl('GP123', data, at(10, 55)), root + 'course/view.php?id=456');
  assert.equal(context.moodleShortcutUrl('GP123', data, at(9, 30, 2)), root + 'course/view.php?id=789');
});
test('no current class falls back to department including breaks and weekends', () => {
  for (const time of [at(8, 59), at(10, 45), at(10, 50), at(19, 0), at(9, 0, 0), at(13, 30)]) {
    assert.equal(context.moodleShortcutUrl('GP123', {9999123: '1-1', 9999456: '0-0'}, time), root + 'course/index.php?categoryid=8');
  }
});
test('missing login ID opens home even with a registered current class', () => {
  for (const id of [undefined, '', '   ']) {
    assert.equal(context.moodleShortcutUrl(id, {9999123: '1-1'}, at(9, 0)), root);
  }
});
test('legacy course URL entries still open the current class', () => {
  const data = {'https://moodle2024.mc2.osakac.ac.jp/2024/course/view.php?id=42': '1-1'};
  assert.equal(context.moodleShortcutUrl('GP123', data, at(9, 0)), root + 'course/view.php?id=42');
});

test('personal timetable removes registration and resets the original course', async () => {
  const buttons = [];
  const originalControl = {textContent: '✕'};
  const original = {classList: {contains: name => name === 'course-item'}, querySelectorAll: () => [originalControl]};
  const removed = [];
  let refreshed = 0, selected;
  const env = vm.createContext({
    document: {createElement() {return {setAttribute() {}, addEventListener(type, fn) {this.click = fn;}};}},
    generateId: () => 9999123,
    timetableStorage: {async remove(key) {removed.push(key);}},
    getAllCourseElements: () => [original],
    setCourseItemSelected: (item, value) => {selected = value;},
    storage_timetable_background: () => refreshed++
  });
  vm.runInContext('let timetableEditing = true;\n' + content.slice(content.indexOf('function prepareMyCourseEditor('), content.indexOf('function myTimeTable_set(')), env);
  const clone = {querySelectorAll: () => [], appendChild: button => buttons.push(button)};
  env.prepareMyCourseEditor(clone);
  assert.equal(buttons.length, 1);
  let prevented = false, stopped = false;
  await buttons[0].click({preventDefault() {prevented = true;}, stopPropagation() {stopped = true;}});
  assert.deepEqual(removed, ['9999123']);
  assert.equal(selected, false);
  assert.equal(originalControl.textContent, '◯');
  assert.equal(refreshed, 1);
  assert.equal(prevented && stopped, true);
  vm.runInContext('timetableEditing = false', env);
  env.prepareMyCourseEditor(clone);
  assert.equal(buttons.length, 1, 'no delete action outside edit mode');
});
