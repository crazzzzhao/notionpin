import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { waitForLayoutToSettle } from './layout-stability.mjs'

// Layout stress tests only: all configuration and labels belong to the disposable fixture.
export async function checkSettingsLayout({ renderer, main, waitFor, directory }) {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms))
  const report = []
  const scenarios = [
    { name: 'compact', width: 400, height: 420 },
    { name: 'regular', width: 440, height: 640 },
    { name: 'wide-short', width: 640, height: 480 },
    { name: 'large', width: 1024, height: 768 },
    { name: 'zoom-200-compact', width: 400, height: 420, zoom: 2 },
    { name: 'zoom-200-regular', width: 440, height: 640, zoom: 2 },
    { name: 'zoom-200-large', width: 1024, height: 768, zoom: 2 },
    { name: 'rtl', width: 440, height: 640, dir: 'rtl' },
    { name: 'german', width: 440, height: 640, locale: 'de' },
    { name: 'pseudo-compact', width: 400, height: 420, locale: 'pseudo' }
  ]
  try {
    for (const scenario of scenarios) {
      const zoom = scenario.zoom ?? 1
      await main.evaluate(
        `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)`
      )
      await renderer.evaluate(`window.windowAPI.resize(${scenario.width}, ${scenario.height})`)
      await waitFor(`innerWidth === ${scenario.width} && innerHeight === ${scenario.height}`)
      await main.evaluate(
        `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(${zoom})`
      )
      await waitFor(`Math.abs(innerWidth - ${scenario.width / zoom}) < 2`)
      await renderer.evaluate(`document.documentElement.dir = '${scenario.dir ?? 'ltr'}'`)
      await renderer.evaluate(
        `document.querySelector('button[aria-label="Open settings"]').click()`
      )
      await waitFor(`!!document.querySelector('.settings-panel')`)
      for (const tab of ['Connection', 'Field Mapping']) {
        await renderer.evaluate(
          `document.querySelector('.settings-panel button[aria-label="${tab}"]').click()`
        )
        await waitFor(
          `!!document.querySelector('.settings-body ${tab === 'Connection' ? 'input' : 'select'}')`
        )
        await renderer.evaluate(`(() => {
          const panel=document.querySelector('.settings-panel');
          const scroll=panel.querySelector('.settings-scroll, .settings-body');
          scroll.scrollTop=0;
          const locale=${JSON.stringify(scenario.locale ?? 'en')};
          const de={Settings:'Einstellungen',Connection:'Verbindung','Field Mapping':'Eigenschaftszuordnung',
            'Notion Token':'Notion-Integrationstoken','Database URL':'Datenbankadresse',
            Cancel:'Änderungen verwerfen',Save:'Verbindung speichern','Save Mapping':'Feldzuordnung speichern',
            'Disconnect your Notion':'Verbindung zu Notion trennen',Text:'Aufgabenbezeichnung',Status:'Bearbeitungsstatus',Date:'Fälligkeitsdatum'};
          if(locale!=='en') {
            const walker=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT);
            const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
            for(const node of nodes) {
              const label=node.textContent.trim(); if(!label || !de[label]) continue;
              node.textContent=locale==='de' ? de[label] : '[!! '+label+' additional translated text !!]';
            }
          }
        })()`)
        await pause(500)
        const { elapsedMs: layoutSettleMs } = await waitForLayoutToSettle({
          renderer,
          label: `${scenario.name}/${tab}`,
          selectors: [
            '.settings-panel',
            '.settings-tabs .animated-tabs',
            '.settings-tabs .animated-tabs > [aria-selected="true"]',
            '.settings-tabs .animated-tabs > [aria-hidden="true"]'
          ]
        })
        const result = await renderer.evaluate(`(() => {
          const panel=document.querySelector('.settings-panel'), bounds=panel.getBoundingClientRect();
          const scroll=panel.querySelector('.settings-scroll, .settings-body');
          const rail=panel.querySelector('.settings-tabs > div');
          const active=rail.querySelector('button[aria-selected="true"]').getBoundingClientRect();
          const highlight=rail.firstElementChild.getBoundingClientRect();
          const actions=[...panel.querySelectorAll('.settings-actions button')];
          const inside=(box, outer)=>box.left>=outer.left-1 && box.right<=outer.right+1 && box.top>=outer.top-1 && box.bottom<=outer.bottom+1;
          const clippedControls=[...rail.querySelectorAll('button'),...actions].filter(el=>{
            el.scrollIntoView({block:'nearest'});
            return el.scrollWidth>el.clientWidth+1 || !inside(el.getBoundingClientRect(), bounds);
          }).map(el=>el.textContent.trim());
          const actionsVisible=actions.every(el=>inside(el.getBoundingClientRect(),{left:0,right:innerWidth,top:0,bottom:innerHeight}));
          const fields=[...panel.querySelectorAll('.settings-body input, .settings-body select')];
          const reachable=fields.every(el=>{
            el.scrollIntoView({block:'nearest'});
            const box=el.getBoundingClientRect(), view=scroll.getBoundingClientRect();
            return inside(box,view);
          });
          scroll.scrollTop=0;
          return {viewport:[innerWidth,innerHeight], panel:[bounds.width,bounds.height],
            scrollHeight:scroll.clientHeight, clippedControls, actionsVisible, fieldsReachable:reachable,
            horizontalOverflow:scroll.scrollWidth>scroll.clientWidth+1,
            highlightDelta:[active.left-highlight.left,active.right-highlight.right],
            highlightAligned:Math.abs(active.left-highlight.left)<1 && Math.abs(active.right-highlight.right)<1};
        })()`)
        report.push({ scenario: scenario.name, tab, layoutSettleMs, ...result })
        const { data } = await renderer.send('Page.captureScreenshot')
        await writeFile(
          join(directory, `layout-${scenario.name}-${tab.toLowerCase().replace(' ', '-')}.png`),
          Buffer.from(data, 'base64')
        )
        if (tab === 'Connection') {
          await renderer.evaluate(`document.querySelector('.settings-disconnect').click()`)
          await waitFor(`!!document.querySelector('.settings-confirm-panel')`)
          const confirmation = await renderer.evaluate(`(() => {
            const panel=document.querySelector('.settings-confirm-panel'), box=panel.getBoundingClientRect();
            const actions=[...panel.querySelectorAll('button')];
            return {inside:box.left>=0 && box.right<=innerWidth && box.top>=0 && box.bottom<=innerHeight,
              actionsVisible:actions.every(el=>{const action=el.getBoundingClientRect();return action.left>=box.left && action.right<=box.right && action.top>=box.top && action.bottom<=box.bottom}),
              contentScrollable:panel.firstElementChild.clientHeight>=24};
          })()`)
          assert(
            confirmation.inside && confirmation.actionsVisible && confirmation.contentScrollable,
            `Confirmation clipped: ${scenario.name}: ${JSON.stringify(confirmation)}`
          )
          const { data: confirmImage } = await renderer.send('Page.captureScreenshot')
          await writeFile(
            join(directory, `layout-${scenario.name}-confirmation.png`),
            Buffer.from(confirmImage, 'base64')
          )
          await renderer.evaluate(
            `document.querySelector('.settings-confirm-actions button').click()`
          )
          await waitFor(`!document.querySelector('.settings-confirm-panel')`)
        }
      }
      await renderer.evaluate(
        `document.querySelector('.settings-panel button[aria-label="Close"]').click()`
      )
      await waitFor(`!document.querySelector('.settings-panel')`)
    }
  } finally {
    await main.evaluate(
      `process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)`
    )
    await renderer.evaluate(`document.documentElement.dir = 'ltr'`)
  }
  await writeFile(
    join(directory, 'settings-layout-report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )
  const failures = report.filter(
    (entry) =>
      entry.clippedControls.length ||
      !entry.actionsVisible ||
      !entry.fieldsReachable ||
      entry.horizontalOverflow ||
      !entry.highlightAligned
  )
  assert.equal(failures.length, 0, `Settings layout regressions: ${JSON.stringify(failures)}`)
  console.log(`Settings layout stress checks passed (${report.length} cases).`)
}
