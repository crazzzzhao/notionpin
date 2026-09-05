import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function checkAppLayout({ renderer, main, waitFor, directory }) {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms))
  const report = []
  const modes = [
    'tasks',
    'unconfigured',
    'empty',
    'loading',
    'error',
    'permission',
    'mapping',
    'rate'
  ]
  const screens = [
    { name: 'compact', width: 400, height: 420, modes },
    { name: 'regular', width: 440, height: 640, modes },
    { name: 'wide-short', width: 640, height: 480, modes },
    { name: 'large', width: 1024, height: 768, modes },
    { name: 'zoom-200', width: 400, height: 420, zoom: 2, modes },
    { name: 'rtl', width: 440, height: 640, dir: 'rtl', modes: ['tasks', 'error', 'unconfigured'] },
    {
      name: 'long-text',
      width: 400,
      height: 420,
      longText: true,
      modes: ['tasks', 'error', 'unconfigured']
    }
  ]
  try {
    for (const screen of screens) {
      await main.evaluate(
        `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)`
      )
      await renderer.evaluate(`window.windowAPI.resize(${screen.width}, ${screen.height})`)
      await waitFor(`innerWidth===${screen.width} && innerHeight===${screen.height}`)
      await main.evaluate(
        `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(${screen.zoom ?? 1})`
      )
      for (const mode of screen.modes) {
        await main.evaluate(
          `Object.assign(globalThis.nopinLayoutFixture, {mode:${JSON.stringify(mode)},longText:${!!screen.longText}}); true`
        )
        await renderer.send('Page.reload')
        await waitFor(
          mode === 'tasks'
            ? `!!document.querySelector('.task-row')`
            : mode === 'loading'
              ? `document.querySelector('.state-screen')?.textContent.includes('Loading')`
              : `!!document.querySelector('.state-screen') && !document.querySelector('.state-screen')?.textContent.includes('Loading')`
        )
        await renderer.evaluate(`document.documentElement.dir='${screen.dir ?? 'ltr'}'`)
        if (screen.longText && mode === 'unconfigured') {
          await renderer.evaluate(
            `document.querySelector('.state-screen button').textContent='Open the connection settings to configure this workspace'`
          )
        }
        await pause(500)
        const result = await renderer.evaluate(`(() => {
          const viewport={left:0,top:0,right:innerWidth,bottom:innerHeight};
          const inside=(box,outer)=>box.left>=outer.left-1 && box.right<=outer.right+1 && box.top>=outer.top-1 && box.bottom<=outer.bottom+1;
          const header=document.querySelector('.window-header');
          const scroll=document.querySelector('.task-scroll, .state-scroll');
          const footer=document.querySelector('footer');
          const rail=document.querySelector('.task-tabs > div');
          const controls=[...header.querySelectorAll('button'),...(footer?.querySelectorAll('button')??[])];
          const stableControlsVisible=controls.every(el=>inside(el.getBoundingClientRect(),viewport));
          const tabsFit=!rail || [...rail.querySelectorAll('button')].every(el=>el.scrollWidth<=el.clientWidth+1 && inside(el.getBoundingClientRect(),viewport));
          let highlightAligned=true;
          if(rail) {const active=rail.querySelector('[aria-selected="true"]').getBoundingClientRect(); const highlight=rail.firstElementChild.getBoundingClientRect();
            highlightAligned=Math.abs(active.left-highlight.left)<1.1 && Math.abs(active.top-highlight.top)<1.1 && Math.abs(active.width-highlight.width)<1.1;}
          const stateAction=document.querySelector('.state-screen button');
          let actionReachable=true;
          if(stateAction) {stateAction.scrollIntoView({block:'nearest'}); actionReachable=inside(stateAction.getBoundingClientRect(),scroll.getBoundingClientRect()) && stateAction.scrollWidth<=stateAction.clientWidth+1;}
          return {viewport:[innerWidth,innerHeight],scrollHeight:scroll.clientHeight,
            stableControlsVisible,tabsFit,highlightAligned,actionReachable,
            horizontalOverflow:scroll.scrollWidth>scroll.clientWidth+1,
            grouped:!document.querySelector('.state-screen') || getComputedStyle(document.querySelector('.state-screen')).gap==='16px'};
        })()`)
        report.push({ screen: screen.name, mode, ...result })
        const { data } = await renderer.send('Page.captureScreenshot')
        await writeFile(
          join(directory, `app-${screen.name}-${mode}.png`),
          Buffer.from(data, 'base64')
        )

        if (mode === 'tasks') {
          await renderer.evaluate(
            `document.querySelector('.task-row button[aria-haspopup="menu"]').scrollIntoView({block:'nearest'})`
          )
          await pause(100)
          await renderer.evaluate(
            `document.querySelector('.task-row button[aria-haspopup="menu"]').click()`
          )
          await waitFor(`!!document.querySelector('[role="menu"]')`)
          const menu = await renderer.evaluate(`(() => {
            const menu=document.querySelector('[role="menu"]'), bounds=menu.getBoundingClientRect();
            const options=[...menu.querySelectorAll('button')];
            const anchor=document.querySelector('.task-row button[aria-haspopup="menu"]').getBoundingClientRect();
            return {inside:bounds.left>=7 && bounds.right<=innerWidth-7 && bounds.top>=7 && bounds.bottom<=innerHeight-7,
              labelsFit:options.every(el=>el.scrollWidth<=el.clientWidth+1),
              leadingAligned:document.documentElement.dir==='rtl' ? Math.abs(bounds.right-anchor.right)<1 : Math.abs(bounds.left-anchor.left)<1};
          })()`)
          assert(
            menu.inside && menu.labelsFit && menu.leadingAligned,
            `Task menu failed: ${screen.name}: ${JSON.stringify(menu)}`
          )
          await renderer.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Escape',
            windowsVirtualKeyCode: 27
          })
          await waitFor(`!document.querySelector('[role="menu"]')`)
          await renderer.evaluate(`document.querySelector('.task-title').click()`)
          await waitFor(`!!document.querySelector('.task-row input[type="text"]')`)
          assert(
            await renderer.evaluate(
              `document.querySelector('.task-row input[type="text"]').getBoundingClientRect().width >= 24`
            ),
            'Title edit input is unusable'
          )
          await renderer.evaluate(
            `document.querySelector('button[aria-label="Cancel title edit"]').click()`
          )
          await renderer.evaluate(
            `document.querySelector('.task-row button[title="Click to set due date"]').click()`
          )
          await waitFor(`!!document.querySelector('.task-row input[type="date"]')`)
          assert(
            await renderer.evaluate(
              `document.querySelector('.task-scroll').scrollWidth <= document.querySelector('.task-scroll').clientWidth + 1`
            ),
            'Date editing causes horizontal overflow'
          )
          await renderer.evaluate(`document.querySelector('.task-row input[type="date"]').blur()`)
          if (screen.zoom === 2) {
            await renderer.evaluate(
              `document.querySelector('button[aria-controls="window-content"]').click()`
            )
            await waitFor(`innerHeight===26 && document.querySelector('#window-content').inert`)
            assert(
              await renderer.evaluate(
                `[...document.querySelectorAll('.window-header button')].every(el=>{const b=el.getBoundingClientRect();return b.top>=0 && b.bottom<=innerHeight})`
              ),
              'Zoomed collapsed toolbar clips its controls'
            )
            await renderer.evaluate(
              `document.querySelector('button[aria-controls="window-content"]').click()`
            )
            await waitFor(`innerHeight===210 && !document.querySelector('#window-content').inert`)
          }
        }

        if (mode === 'unconfigured') {
          await renderer.evaluate(`document.querySelector('.state-screen button').click()`)
          await waitFor(`!!document.querySelector('.settings-panel')`)
          assert(
            await renderer.evaluate(
              `document.querySelector('.settings-actions').getBoundingClientRect().bottom <= innerHeight`
            ),
            'Connection setup actions are clipped'
          )
          await renderer.evaluate(
            `document.querySelector('.settings-panel button[aria-label="Close"]').click()`
          )
        }

        if (mode === 'error') {
          await renderer.evaluate(`document.querySelector('button[aria-label="Refresh"]').click()`)
          await waitFor(`!!document.querySelector('.app-toast')`)
          const toast = await renderer.evaluate(`(() => {
            const box=document.querySelector('.app-toast').getBoundingClientRect();
            return {inside:box.left>=15 && box.right<=innerWidth-15 && box.top>=document.querySelector('.window-header').getBoundingClientRect().bottom,
              aboveFooter:box.bottom<=document.querySelector('footer').getBoundingClientRect().top};
          })()`)
          assert(toast.inside && toast.aboveFooter, `Toast covers controls: ${screen.name}`)
        }
      }
    }
  } finally {
    await main.evaluate(
      `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1); Object.assign(globalThis.nopinLayoutFixture,{mode:'tasks',longText:false}); true`
    )
    await renderer.evaluate(`document.documentElement.dir='ltr'`)
  }
  await writeFile(join(directory, 'app-layout-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  const failures = report.filter(
    (entry) =>
      !entry.stableControlsVisible ||
      !entry.tabsFit ||
      !entry.highlightAligned ||
      !entry.actionReachable ||
      entry.horizontalOverflow ||
      !entry.grouped ||
      entry.scrollHeight < 24
  )
  assert.equal(failures.length, 0, `App layout regressions: ${JSON.stringify(failures)}`)
  console.log(`App layout stress checks passed (${report.length} cases).`)
}
