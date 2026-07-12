const JS_SELF_MOCK_RE = /\b(?:jest|vi)\.mock\(\s*['"`]([^'"`\n]+)['"`]/;
const PY_MOCK_PATCH_RE = /(?:@|\b(?:unittest\.)?mock\.)?\bpatch(?:\.object)?\(\s*['"`]([\w.]+)['"`]/;
const PY_COMMON_MODULES = new Set(['time','os','sys','json','re','math','random','datetime','io','pathlib','subprocess','socket','logging','uuid','urllib','http','threading','asyncio','shutil','tempfile','hashlib','collections','functools','itertools','requests','numpy','np','pandas','pd','scipy','sklearn','torch','tensorflow','django','flask','sqlalchemy','pydantic','boto3','aiohttp','httpx']);
function baseName(p){const file=p.split('/').pop()??p;return file.replace(/\.(test|spec)\.[jt]sx?$/,'').replace(/\.[jt]sx?$/,'').replace(/\.py$/,'').replace(/^test_/,'').replace(/_test$/,'');}
function isPySelfMock(target,testedModule){if(PY_COMMON_MODULES.has(testedModule))return false;const s=target.split('.');if(PY_COMMON_MODULES.has(s[0]??''))return false;return s.includes(testedModule);}
function isJsSelfMock(spec,tm){const isLocal=spec.startsWith('.')||spec.includes('/');return isLocal&&baseName(spec)===tm;}

// Simulate RH005's exact per-add logic on a JS/TS test file
function rh005flag(filePath, line){
  const jsMatch = line.match(JS_SELF_MOCK_RE);
  const pyMatch = line.match(PY_MOCK_PATCH_RE);
  const mockedTarget = jsMatch?.[1] ?? pyMatch?.[1];
  if(!mockedTarget) return false;
  const testedModule = baseName(filePath);
  const isSelfMock = jsMatch ? isJsSelfMock(mockedTarget, testedModule) : isPySelfMock(mockedTarget, testedModule);
  return isSelfMock ? `FLAG self-mock target=${mockedTarget} tested=${testedModule}` : false;
}
const cases = [
  ['user.test.ts',   `+  await axios.patch('user', body)`],
  ['users.test.ts',  `+  await client.patch('users.profile', d)`],
  ['user.test.ts',   `+  await axios.patch('/users/1', body)`],   // leading slash -> safe
  ['account.test.ts',`+  const r = await api.patch('account', {})`],
  ['order.test.tsx', `+  wrapper.patch('order.total')`],
  ['user.test.ts',   `+  vi.mock('./user')`],                     // real JS self-mock (control)
  ['payment.test.js',`+  http.patch('payment')`],
];
for(const [f,l] of cases){ const r=rh005flag(f,l); console.log((r||'ok').padEnd(46), f, '|', l.trim()); }
