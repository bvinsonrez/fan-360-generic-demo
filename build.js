// Bundles src/ and the shell into one index.html. One source of truth: the same
// CommonJS modules the tests load are inlined behind a tiny require shim.
const fs = require('node:fs');
const path = require('node:path');
const { COPY } = require('./src/config');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

function listJs(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listJs(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bundle() {
  const entries = listJs(SRC).map((file) => {
    const key = path.relative(SRC, file).split(path.sep).join('/');
    const code = fs.readFileSync(file, 'utf8').replace(/<\/(script)/gi, '<\\/$1');
    return `${JSON.stringify(key)}: function (module, exports, require) {\n${code}\n}`;
  });
  return `(function () {
var __defs = {
${entries.join(',\n')}
};
var __cache = {};
function __resolve(from, req) {
  var parts = req.charAt(0) === '.' ? from.split('/').slice(0, -1).concat(req.split('/')) : req.split('/');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '.' || parts[i] === '') continue;
    if (parts[i] === '..') out.pop(); else out.push(parts[i]);
  }
  var key = out.join('/');
  if (!/\\.js$/.test(key)) key += '.js';
  return key;
}
function __load(key) {
  if (__cache[key]) return __cache[key].exports;
  if (!__defs[key]) throw new Error('Module not found: ' + key);
  var module = { exports: {} };
  __cache[key] = module;
  __defs[key].call(module.exports, module, module.exports, function (req) { return __load(__resolve(key, req)); });
  return module.exports;
}
globalThis.__require = __load;
__load('ui/main.js');
})();`;
}

function build() {
  const shell = fs.readFileSync(path.join(SRC, 'ui', 'shell.html'), 'utf8');
  const style = fs.readFileSync(path.join(SRC, 'ui', 'styles.css'), 'utf8');
  const slots = {
    '{{STYLE}}': style,
    '{{FOOTER}}': escapeHtml(COPY.footer),
    '{{FOOTNOTE}}': escapeHtml(COPY.footnote),
    '{{CHIP}}': escapeHtml(COPY.chip),
    '{{SCRIPT}}': bundle(), // last, so nothing inside the bundle is re-scanned for slots
  };
  let html = shell;
  for (const [slot, value] of Object.entries(slots)) html = html.split(slot).join(value);
  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  return html.length;
}

if (require.main === module) console.log(`index.html written (${build()} bytes)`);
module.exports = { build };
