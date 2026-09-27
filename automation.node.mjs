import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AUTOMATION_TOOLS, AutomationValidationError, executeAction, sanitizeNoteTitle, validateAction } from './automation.mjs';

test('tool schemas expose only three allowlisted actions with exact arguments', () => {
  assert.deepEqual(AUTOMATION_TOOLS.map(tool => tool.function.name), ['create_note', 'open_app', 'open_website']);
  assert.ok(AUTOMATION_TOOLS.every(tool => tool.function.parameters.additionalProperties === false));
});

test('rejects unknown tools, extra fields and non-object arguments', () => {
  const invalid = [
    { name: 'run_command', arguments: { command: 'anything' } },
    { name: 'open_app', arguments: { app: 'notepad', command: 'other' } },
    { name: 'open_app', arguments: { app: 'notepad' }, extra: true },
    { name: 'open_app', arguments: [] },
    { name: 'open_app', arguments: { app: '../notepad.exe' } },
    { name: 'open_app', arguments: { app: '__proto__' } },
    { name: 'open_app', arguments: { app: 'cmd' } },
  ];
  for (const input of invalid) assert.throws(() => validateAction(input), AutomationValidationError);
});

test('accepts only exact HTTPS hosts and blocks credentials, ports and Google redirect links', () => {
  for (const url of ['http://en.wikipedia.org/wiki/Moon', 'https://en.wikipedia.org.attacker.test/wiki/Moon', 'https://name:pass@en.wikipedia.org/wiki/Moon', 'https://en.wikipedia.org:8443/wiki/Moon', 'file:///C:/Windows', 'javascript:alert(1)', 'https://www.google.com/url?q=https://attacker.test', 'https://www.google.com/search?q=moon&next=https://attacker.test', 'https://www.google.com/search?q=a&q=b', 'https://www.google.com/search?q=', 'https://weather.com\\@attacker.test']) {
    assert.throws(() => validateAction({ name: 'open_website', arguments: { url } }), AutomationValidationError, url);
  }
  for (const url of ['https://en.wikipedia.org/wiki/Moon', 'https://www.google.com/search?q=accessible+communication', 'https://weather.com/']) {
    assert.equal(validateAction({ name: 'open_website', arguments: { url } }).arguments.url, url);
  }
});

test('validates note length and null/control characters', () => {
  for (const args of [{ title: 'a'.repeat(81), content: 'text' }, { title: 'Title', content: 'a'.repeat(12001) }, { title: 'Title\nOther', content: 'text' }, { title: 'Title', content: '\0' }, { title: ' ', content: 'text' }]) {
    assert.throws(() => validateAction({ name: 'create_note', arguments: args }), AutomationValidationError);
  }
  assert.equal(sanitizeNoteTitle('../../CON'), '-..-CON');
  assert.equal(sanitizeNoteTitle('CON'), 'Note-CON');
  assert.ok(!/[<>:"/\\|?*]/u.test(sanitizeNoteTitle('a/b\\c:d*e?')));
});

test('creates separate UTF-8 files, preserves Unicode and cannot traverse outside notes', async () => {
  const prefix = path.join(tmpdir(), 'continuum-automation-');
  const root = await mkdtemp(prefix);
  try {
    const action = { name: 'create_note', arguments: { title: '../../A personal note', content: 'ನನ್ನ ಮಾತುಗಳು · My own words.\nSecond line.' } };
    const first = await executeAction(action, { notesDirectory: root });
    const second = await executeAction(action, { notesDirectory: root });
    assert.equal(first.status, 'completed');
    assert.equal(first.tool, 'create_note');
    assert.equal(path.dirname(first.details.path), await realpath(root));
    assert.notEqual(first.details.path, second.details.path);
    assert.match(await readFile(first.details.path, 'utf8'), /ನನ್ನ ಮಾತುಗಳು/u);
    assert.equal((await readdir(root)).length, 2);
    assert.equal(await readFile(first.details.path, 'utf8'), await readFile(second.details.path, 'utf8'));
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(prefix)) && resolved !== path.resolve(tmpdir()));
    await rm(resolved, { recursive: true, force: true });
  }
});

test('execution revalidates proposals before any side effect', async () => {
  await assert.rejects(executeAction({ name: 'create_note', arguments: { title: 'x', content: 'x', path: 'elsewhere' } }), AutomationValidationError);
  await assert.rejects(executeAction({ name: 'open_app', arguments: { app: 'powershell' } }), AutomationValidationError);
});
