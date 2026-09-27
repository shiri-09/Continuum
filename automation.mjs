import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultNotesDirectory = path.join(workspaceDirectory, 'user-notes');
const allowedHosts = new Set(['en.wikipedia.org', 'www.google.com', 'weather.com']);
const apps = Object.freeze({ notepad: 'notepad.exe', calculator: 'calc.exe' });

export class AutomationValidationError extends Error {
  constructor(message) { super(message); this.name = 'AutomationValidationError'; this.status = 400; }
}

export const toolSchemas = [
  { type: 'function', function: { name: 'create_note', description: 'Propose creating a new local UTF-8 text note. Never overwrites another file. The user must confirm before execution.', parameters: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 80 }, content: { type: 'string', minLength: 1, maxLength: 12000 } }, required: ['title', 'content'], additionalProperties: false } } },
  { type: 'function', function: { name: 'open_app', description: 'Propose opening Windows Notepad or Calculator. The user must confirm before execution.', parameters: { type: 'object', properties: { app: { type: 'string', enum: ['notepad', 'calculator'] } }, required: ['app'], additionalProperties: false } } },
  { type: 'function', function: { name: 'open_website', description: 'Propose opening an HTTPS Wikipedia article, Google search, or weather.com page. Google URLs must be https://www.google.com/search?q=QUERY. The user must confirm before execution.', parameters: { type: 'object', properties: { url: { type: 'string', maxLength: 2048 } }, required: ['url'], additionalProperties: false } } },
];
export const AUTOMATION_TOOLS = toolSchemas;

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new AutomationValidationError(`${label} must be a plain object.`);
  }
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) {
    throw new AutomationValidationError(`${label} must contain only: ${keys.join(', ')}.`);
  }
}

function text(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) {
    throw new AutomationValidationError(`${label} must contain 1–${limit} characters, with no null bytes.`);
  }
  return value;
}

/** Pure validation only: calling this never creates a file or opens a program. */
export function validateAction(action) {
  exactObject(action, ['name', 'arguments'], 'Action');
  switch (action.name) {
    case 'create_note': {
      exactObject(action.arguments, ['title', 'content'], 'Note arguments');
      const title = text(action.arguments.title, 80, 'Note title').trim();
      if (/[\u0000-\u001f\u007f]/u.test(title)) throw new AutomationValidationError('Note title cannot contain control characters.');
      return { name: 'create_note', arguments: { title, content: text(action.arguments.content, 12000, 'Note content') } };
    }
    case 'open_app': {
      exactObject(action.arguments, ['app'], 'App arguments');
      if (typeof action.arguments.app !== 'string' || !Object.hasOwn(apps, action.arguments.app)) throw new AutomationValidationError('Only Notepad and Calculator are supported.');
      return { name: 'open_app', arguments: { app: action.arguments.app } };
    }
    case 'open_website': {
      exactObject(action.arguments, ['url'], 'Website arguments');
      const raw = text(action.arguments.url, 2048, 'Website URL');
      if (raw.trim() !== raw || /[\u0000-\u0020\u007f\\]/u.test(raw)) throw new AutomationValidationError('Use an HTTPS URL without whitespace, control characters or backslashes.');
      let url;
      try { url = new URL(raw); } catch { throw new AutomationValidationError('The website URL is not valid.'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) {
        throw new AutomationValidationError('Only HTTPS en.wikipedia.org, www.google.com and weather.com URLs without credentials or custom ports are supported.');
      }
      if (url.hostname === 'www.google.com' && (url.pathname !== '/search' || [...url.searchParams.keys()].some(key => key !== 'q') || url.searchParams.getAll('q').length !== 1 || !url.searchParams.get('q')?.trim())) {
        throw new AutomationValidationError('Google is available only through /search?q=YOUR_QUERY; redirect URLs are not supported.');
      }
      return { name: 'open_website', arguments: { url: url.href } };
    }
    default: throw new AutomationValidationError('Unknown action. Supported tools: create_note, open_app, open_website.');
  }
}

export function sanitizeNoteTitle(title) {
  let stem = title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, '-').replace(/\s+/gu, ' ').replace(/^[. ]+|[. ]+$/gu, '').slice(0, 72);
  if (!stem) stem = 'Note';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(stem)) stem = `Note-${stem}`;
  return stem;
}

async function createNote(args, notesDirectory) {
  const requestedRoot = path.resolve(notesDirectory);
  try {
    const existing = await lstat(requestedRoot);
    if (existing.isSymbolicLink()) throw new Error('The notes directory cannot be a symbolic link.');
    if (!existing.isDirectory()) throw new Error('The notes location is not a directory.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(requestedRoot, { recursive: true });
  const root = await realpath(requestedRoot);
  const stem = sanitizeNoteTitle(args.title);
  const content = `${args.title}\n\n${args.content}\n`;
  const filename = `${stem} — ${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}.txt`;
  const destination = path.resolve(root, filename);
  if (path.dirname(destination) !== root) throw new Error('The note path escaped its configured directory.');
  await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' });
  return { status: 'completed', summary: `Created note “${args.title}”.`, details: { title: args.title, path: destination, bytes: Buffer.byteLength(content, 'utf8') } };
}

function systemDirectory() {
  if (process.platform !== 'win32') throw new Error('Opening desktop apps and websites is supported only on this Windows host.');
  const root = process.env.SystemRoot || 'C:\\Windows';
  if (!/^[A-Za-z]:[\\/]/u.test(root) || /[\r\n\0]/u.test(root)) throw new Error('Windows system directory is unavailable.');
  return path.win32.join(root, 'System32');
}

function launch(executable, args) {
  return new Promise((resolve, reject) => {
    // Executable and argument structure are fixed by this module. No shell is used.
    const child = spawn(executable, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

/** Execute only after the server has verified a fresh user-confirmed proposal token. */
export async function executeAction(action, { notesDirectory = defaultNotesDirectory } = {}) {
  const validated = validateAction(action);
  let result;
  if (validated.name === 'create_note') result = await createNote(validated.arguments, notesDirectory);
  else if (validated.name === 'open_app') {
    const app = validated.arguments.app;
    await launch(path.win32.join(systemDirectory(), apps[app]), []);
    result = { status: 'launch_requested', summary: `Requested Windows to open ${app === 'notepad' ? 'Notepad' : 'Calculator'}.`, details: { app } };
  } else {
    const root = systemDirectory();
    await launch(path.win32.join(root, 'rundll32.exe'), [`${path.win32.join(root, 'url.dll')},FileProtocolHandler`, validated.arguments.url]);
    result = { status: 'launch_requested', summary: 'Requested the default browser to open the approved website.', details: { url: validated.arguments.url } };
  }
  return { id: randomUUID(), tool: validated.name, ...result, completedAt: new Date().toISOString() };
}
