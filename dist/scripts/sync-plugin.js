#!/usr/bin/env node
import { createRequire as __proctorCreateRequire } from 'node:module'; const require = __proctorCreateRequire(import.meta.url);
import{readFile,writeFile,mkdir}from"fs/promises";import{dirname,join,resolve}from"path";function cursorMdcTransform(canonical){return`---
description: proctor honest-completion ruleset, catches tests deleted, skipped, weakened, or gamed to fake a passing build
globs: '**'
alwaysApply: true
---

${canonical}`}function skillFrontmatterTransform(canonical){return`---
name: proctor
description: Honest-completion ruleset for changes that touch tests or the code they cover. Use before deleting, skipping, renaming, or rewriting a test, before weakening an assertion, and before hardcoding or stubbing an implementation to make a test pass. Also covers what to do when a test looks genuinely wrong.
---

${canonical}`}var CANONICAL_SKILL_PATH="src/skill/SKILL.md";var GENERATED=[{path:"plugin/skills/proctor/SKILL.md",transform:skillFrontmatterTransform},{path:"plugin/rules/proctor.mdc",transform:cursorMdcTransform},{path:"PROCTOR.md",transform:canonical=>canonical},{path:"skills/proctor/SKILL.md",transform:skillFrontmatterTransform},{path:".agents/skills/proctor/SKILL.md",transform:skillFrontmatterTransform}];async function main(){const repoRoot=resolve(process.cwd());const canonical=await readFile(join(repoRoot,CANONICAL_SKILL_PATH),"utf8");for(const{path,transform}of GENERATED){const dest=join(repoRoot,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,transform(canonical),"utf8");process.stdout.write(`Synced ${path} from ${CANONICAL_SKILL_PATH}
`)}}await main();
