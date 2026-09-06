import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, watch } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { checkUiLayout } from './check-ui-layout.mjs'
import { checkSettingsLayout } from './check-settings-layout.mjs'
import { checkAppLayout } from './check-app-layout.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profile = await mkdtemp(join(tmpdir(), 'nopin-window-check-'))
const reportDirectory = join(appRoot, 'dist/window-check')
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const packagedBinary = process.env.NOPIN_TEST_BINARY
const child = spawn(
  packagedBinary || electron,
  [
    ...(packagedBinary ? [] : [appRoot]),
    `--user-data-dir=${profile}`,
    // Disposable UI fixtures must not read or prompt for the user's real Keychain.
    ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--inspect=127.0.0.1:0'
  ],
  { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'] }
)
let logs = ''
let exited = false
let watcher
let renderer
let main
let persistedHeights = []
let persistenceEvents = []
const report = []
child.stdout.on('data', (data) => (logs += data.toString()))
child.stderr.on('data', (data) => (logs += data.toString()))
child.on('exit', () => (exited = true))
child.on('error', () => (exited = true))

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const pending = new Map()
  let next = 1
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolveResult, reject) => {
      const id = next++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out: ${method}`))
      }, 15000)
      pending.set(id, { resolve: resolveResult, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  return {
    send,
    close: () => socket.close(),
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      })
      assert(!result.exceptionDetails, 'An exception occurred in the isolated test app')
      return result.result?.value
    }
  }
}

async function waitFor(expression) {
  const start = Date.now()
  while (Date.now() - start < 45000) {
    assert(!exited, 'The test app exited unexpectedly')
    if (await renderer.evaluate(expression)) return
    await pause(200)
  }
  throw new Error(`Test page did not become ready: ${expression}`)
}

async function measure(label, collapse) {
  persistedHeights = []
  persistenceEvents = []
  await main.evaluate('globalThis.nopinMotionEvents = []')
  const result = await renderer.evaluate(`(async () => {
    const main = document.querySelector('#window-content');
    const events = [], frames = [];
    const start = performance.now();
    const startedAt = Date.now();
    let previous = 0, raf;
    const elapsed = () => Math.round((performance.now() - start) * 10) / 10;
    const transition = e => { if (e.target === main) events.push({type:e.type, property:e.propertyName, ms:elapsed()}); };
    const resize = () => events.push({type:'resize', height:innerHeight, ms:elapsed()});
    for (const type of ['transitionrun','transitionend','transitioncancel']) document.addEventListener(type, transition, true);
    window.addEventListener('resize',resize);
    const round = n => Math.round(n * 10) / 10;
    const tick = t => { if(previous) frames.push({startMs:round(previous-start), endMs:round(t-start), durationMs:round(t-previous)}); previous=t; raf=requestAnimationFrame(tick); }; raf=requestAnimationFrame(tick);
    const button = document.querySelector('button[aria-controls="window-content"]');
    const before = innerHeight;
    button.click();
    await new Promise(r => setTimeout(r,850));
    cancelAnimationFrame(raf);
    window.removeEventListener('resize',resize);
    for (const type of ['transitionrun','transitionend','transitioncancel']) document.removeEventListener(type,transition,true);
    const state=await window.windowAPI.getWindowState();
    const durations = frames.map(frame => frame.durationMs);
    return {label:${JSON.stringify(label)}, startedAt, before, after:innerHeight, events,
      nativeCollapsed:state.isCollapsed, contentRetained:main === document.querySelector('#window-content'),
      opacity:getComputedStyle(main).opacity, inert:main.inert,
      buttonDisabled:button.disabled, ariaExpanded:button.getAttribute('aria-expanded'),
      medianFrameMs:[...durations].sort((a,b)=>a-b)[Math.floor(durations.length/2)],
      maxFrameMs:Math.max(...durations), longFrames:frames.filter(frame=>frame.durationMs>50)};
  })()`)
  const nativeEvents = await main.evaluate('globalThis.nopinMotionEvents')
  const nativeResizeCount = nativeEvents.filter((event) => event.type === 'resize').length
  const nativeCompletionCount = nativeEvents.filter((event) => event.type === 'resized').length
  assert(result.nativeCollapsed === collapse, `${label}: wrong native state`)
  assert(result.contentRetained && !result.buttonDisabled, `${label}: content or controls lost`)
  assert(result.inert === collapse, `${label}: hidden content is still interactive`)
  assert(result.opacity === (collapse ? '0' : '1'), `${label}: incorrect final opacity`)
  assert(result.ariaExpanded === String(!collapse), `${label}: incorrect accessibility state`)
  const starts = result.events.filter((event) => event.type === 'transitionrun')
  assert(starts.length <= 1, `${label}: an unintended reverse CSS transition occurred`)
  const resizeEvents = result.events.filter((event) => event.type === 'resize')
  assert(resizeEvents.length > 0, `${label}: window did not resize`)
  assert(
    resizeEvents[0].ms < 300,
    `${label}: native resize started after ${resizeEvents[0].ms}ms (expected under 300ms; native resize events: ${nativeResizeCount}, completion events: ${nativeCompletionCount})`
  )
  const distinctHeights = [...new Set(persistedHeights)]
  assert(
    distinctHeights.every((height) => height === result.after),
    `${label}: intermediate frames were persisted`
  )
  const entry = {
    ...result,
    startedAt: undefined,
    resizeStartMs: resizeEvents[0].ms,
    resizeFinishMs: resizeEvents.at(-1).ms,
    nativeResizeCount,
    nativeCompletionCount,
    distinctPersistedHeights: distinctHeights,
    persistenceEvents: persistenceEvents.map(({ time, height }) => ({
      ms: time - result.startedAt,
      height
    }))
  }
  report.push(entry)
  console.log(JSON.stringify({ ...entry, events: undefined }))
}

try {
  let page
  const start = Date.now()
  while (Date.now() - start < 55000) {
    assert(!exited, 'The test app failed to start')
    const match = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)
    if (match) {
      try {
        const pages = await fetch(`http://127.0.0.1:${match[1]}/json/list`, {
          signal: AbortSignal.timeout(3000)
        }).then((r) => r.json())
        page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('file:'))
        if (page) break
      } catch {
        // A blocked main process must not leave the readiness check waiting forever.
      }
    }
    await pause(200)
  }
  assert(page, 'Renderer debugging endpoint unavailable')
  renderer = await connect(page.webSocketDebuggerUrl)
  await waitFor('!!(document.querySelector("#window-content") && window.settingsAPI)')
  assert(
    await renderer.evaluate('(async()=>!(await window.settingsAPI.load()).isTokenConfigured)()'),
    'Test profile unexpectedly contains credentials'
  )
  const endpoint = logs.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)?.[1]
  assert(endpoint, 'Main-process test endpoint unavailable')
  main = await connect(endpoint)
  // Diagnostics are installed only in this disposable process, not in the app bundle.
  await main.evaluate(`(() => {
    const {BrowserWindow} = process.mainModule.require('electron');
    const window = BrowserWindow.getAllWindows()[0];
    globalThis.nopinMotionEvents = [];
    for (const type of ['resize', 'resized']) {
      window.on(type, () => globalThis.nopinMotionEvents.push({type, height: window.getBounds().height}));
    }
    return true;
  })()`)
  watcher = watch(profile, (_event, filename) => {
    if (filename !== 'config.json') return
    try {
      const data = JSON.parse(readFileSync(join(profile, filename), 'utf8'))
      if (data.windowBounds) {
        persistedHeights.push(data.windowBounds.height)
        persistenceEvents.push({ time: Date.now(), height: data.windowBounds.height })
      }
    } catch {
      // Atomic replacement can briefly leave no file to read.
    }
  })
  await pause(500)
  await renderer.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  })
  await measure('empty-collapse', true)
  await measure('empty-expand', false)

  // Replace IPC handlers only in this disposable process, never in shipping code.
  // Synthetic tasks exercise the real renderer without tokens or network traffic.
  await main.evaluate(`(() => {
    const {ipcMain} = process.mainModule.require('electron');
    const id='0123456789abcdef0123456789abcdef';
    const statuses=new Map();
    const fixture=globalThis.nopinLayoutFixture={mode:'tasks',longText:false};
    const mapping={textPropertyId:'title',statusPropertyId:'status',timePropertyId:'due',boundDataSourceId:id};
    const handlers={
      'settings:load':()=>fixture.mode==='unconfigured'
        ? {isTokenConfigured:false,databaseId:null,databaseUrl:null,dataSourceId:null,fieldMapping:null}
        : {isTokenConfigured:true,databaseId:id,databaseUrl:'https://www.notion.so/'+id,dataSourceId:id,fieldMapping:mapping},
      'notion:getSchema':()=>({success:true,dataSourceId:id,properties:[{id:'title',name:'Task',type:'title'},{id:'status',name:'Status',type:'status',options:[{id:'todo',name:fixture.longText?'Waiting for the final review and approval from the project team':'Not started',color:'red'},{id:'doing',name:'In progress',color:'blue'},{id:'done',name:'Done',color:'green'}]},{id:'due',name:'Due',type:'date'}]}),
      'notion:updateTask':(_event,{pageId,updates})=>{
        const status=updates.find(update=>update.field==='status');
        if(status) statuses.set(pageId,status.value);
        return {success:true};
      },
      'notion:queryTasks':()=>{
        if(fixture.mode==='loading') return new Promise(()=>{});
        if(['error','mapping','permission','rate'].includes(fixture.mode)) return {success:false,error:{
          code:({mapping:'mapping_not_configured',permission:'restricted',rate:'rate_limited'})[fixture.mode] ?? 'unknown',
          userMessage:fixture.longText?'Unable to reach this database: '+ 'A-very-long-database-reference'.repeat(8):'Please check your Notion connection and try again.',retryAfter:30}};
        const tasks=fixture.mode==='empty'?[]:Array.from({length:500},(_,i)=>({id:'fixture-'+i,
          title:fixture.longText?'Synthetic task '+String(i+1).padStart(3,'0')+' — Review the complete project documentation and all proposed changes before approving the release':'Synthetic task '+String(i+1).padStart(3,'0'),
          status:fixture.longText?'Waiting for the final review and approval from the project team':statuses.get('fixture-'+i) ?? 'Not started',
          due:fixture.longText?'2026-09-07':null,url:'https://www.notion.so/'+id,lastEditedTime:'2026-09-05T00:00:00.000Z'}));
        return {success:true,hasMore:false,totalFetched:tasks.length,tasks};
      }
    };
    for (const [channel,handler] of Object.entries(handlers)){ipcMain.removeHandler(channel);ipcMain.handle(channel,handler);}
    return true;
  })()`)
  await renderer.send('Page.reload')
  await waitFor('document.body?.textContent?.includes("Synthetic task 500")')
  await renderer.evaluate('document.querySelector(\'button[aria-label="Not started"]\').click()')
  await waitFor(
    'document.querySelector(\'button[aria-label="Not started"]\')?.getAttribute("aria-selected") === "true" && document.body?.textContent?.includes("Synthetic task 500")'
  )
  await renderer.evaluate('window.windowAPI.resize(440, 640)')
  await pause(500)
  const retainedScroll = await renderer.evaluate(`(() => {
    document.querySelector('button[aria-controls="window-content"]').focus();
    const list=[...document.querySelectorAll('#window-content div')].find(el=>
      el.scrollHeight>el.clientHeight+500 && ['auto','scroll'].includes(getComputedStyle(el).overflowY));
    if(!list) return null;
    list.scrollTop=500;
    window.fixtureScrollContainer=list;
    return list.scrollTop;
  })()`)
  assert(retainedScroll > 0, 'Synthetic list is not scrollable')
  // Measure the toggle itself, not the preceding fixture scroll/rasterization.
  await pause(250)
  await measure('500-tasks-collapse', true)
  await measure('500-tasks-expand', false)
  await measure('500-tasks-collapse-repeat', true)
  await measure('500-tasks-expand-repeat', false)
  assert(await renderer.evaluate('innerHeight===640'), 'Expanded height was not restored')
  assert(
    await renderer.evaluate(
      'document.querySelector(\'button[aria-label="Not started"]\').getAttribute("aria-selected") === "true"'
    ),
    'Collapse/expand reset the task filter'
  )
  assert(
    await renderer.evaluate(
      `window.fixtureScrollContainer.isConnected && window.fixtureScrollContainer.scrollTop === ${retainedScroll}`
    ),
    'Collapse/expand reset the task list scroll position'
  )

  const rapid = await renderer.evaluate(`(async()=>{
    const main=document.querySelector('#window-content');
    const button=document.querySelector('button[aria-controls="window-content"]');
    button.click(); await new Promise(r=>setTimeout(r,40)); button.click();
    await new Promise(r=>setTimeout(r,1100));
    return {state:(await window.windowAPI.getWindowState()).isCollapsed,retained:main===document.querySelector('#window-content'),expanded:button.getAttribute('aria-expanded'),height:innerHeight};
  })()`)
  assert(
    !rapid.state && rapid.retained && rapid.expanded === 'true' && rapid.height === 640,
    'Rapid reversal lost the latest intent'
  )
  console.log(JSON.stringify({ rapidReversal: 'passed' }))

  await renderer.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  })
  await pause(100)
  await measure('reduced-motion-collapse', true)
  await measure('reduced-motion-expand', false)
  await renderer.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  })
  const config = JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8'))
  assert(
    config.encryptedToken === null && config.databaseId === null,
    'Fixtures leaked into persistent configuration'
  )
  // Keep layout animations painting even when the disposable test window is occluded.
  // Motion/performance checks above retain the application's default throttling.
  await main.evaluate(`(() => {
    const window = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0];
    window.webContents.setBackgroundThrottling(false);
    return true;
  })()`)
  await mkdir(reportDirectory, { recursive: true })
  await checkUiLayout({ renderer, waitFor, directory: reportDirectory })
  await checkSettingsLayout({ renderer, main, waitFor, directory: reportDirectory })
  await checkAppLayout({ renderer, main, waitFor, directory: reportDirectory })
  await writeFile(
    join(reportDirectory, 'motion-report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )
  console.log(`Window checks passed. Report: ${join(reportDirectory, 'motion-report.json')}`)
  if (process.env.NOPIN_TEST_KEEP_OPEN === '1') {
    console.log(`Visual inspection ready (PID ${child.pid}). Press Enter to close the test app.`)
    await new Promise((done) => process.stdin.once('data', done))
    process.stdin.pause()
  }
} finally {
  watcher?.close()
  renderer?.close()
  main?.close()
  if (!exited) child.kill('SIGTERM')
  for (let attempt = 0; attempt < 40 && !exited; attempt++) await pause(100)
  if (!exited) {
    child.kill('SIGKILL')
    await pause(500)
  }
  assert(exited, 'Test process did not exit; temporary profile retained')
  assert(profile.startsWith(join(tmpdir(), 'nopin-window-check-')), 'Unsafe cleanup target')
  await rm(profile, { recursive: true, force: false })
}
