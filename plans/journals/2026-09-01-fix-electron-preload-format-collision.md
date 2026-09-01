---
title: Fix Electron preload format collision
date: 2026-09-01
summary: "Built one CommonJS preload artifact, added regression coverage, verified runtime bridge, and initialized Git."
---

# Fix Electron preload format collision

## What happened
Electron rejected dist-electron/preload.cjs because Vite merged ES and CJS library formats and both outputs targeted the same filename. The regression check reproduced Unexpected token export before the fix.

## Decision
Keep the main process in ESM mode and configure preload as one explicit Rollup CommonJS output. Add a focused artifact test and ignore generated build, dependency, environment, and local agent runtime files.

## Verification
npm test, Vite build, Node CommonJS syntax checking, and an Electron runtime CDP check passed. window.electronAPI was present with all 18 expected bridge keys.

## Follow-up
The full npm build still stops on 44 renderer TypeScript errors under src; those are outside this preload fix.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
