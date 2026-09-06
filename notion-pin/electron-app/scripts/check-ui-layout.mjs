import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Uses the disposable Electron process and synthetic data from check-window-motion.mjs.
export async function checkUiLayout({ renderer, waitFor, directory }) {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms))
  const screenshot = async (name) => {
    const { data } = await renderer.send('Page.captureScreenshot')
    await writeFile(join(directory, `${name}.png`), Buffer.from(data, 'base64'))
  }
  const key = async (value, code, modifiers = 0) => {
    await renderer.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: value,
      windowsVirtualKeyCode: code,
      // Chromium's native Enter activation also needs the keypress text.
      text: value === 'Enter' ? '\r' : undefined,
      modifiers
    })
    await renderer.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: value,
      windowsVirtualKeyCode: code,
      modifiers
    })
  }
  const openFirstMenu = async () => {
    await renderer.evaluate(
      `document.querySelector('.task-row button[aria-haspopup="menu"]').click()`
    )
    await waitFor(`!!document.querySelector('[role="menu"]')`)
  }

  await renderer.evaluate(`document.querySelector('.task-scroll').scrollTop = 0`)
  await pause(200)
  const layout = await renderer.evaluate(`(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const header = box('header > span'), rail = box('.task-tabs > div');
    const title = box('.task-title'), status = box('.task-row button[aria-haspopup="menu"]');
    const close = box('header button[aria-label="Close"]'), settings = box('footer button');
    const external = box('.task-row button[title="Open in Notion"]');
    return {leftEdges:[header.left, rail.left, title.left, status.left],
      actionCenters:[(close.left+close.right)/2, (settings.left+settings.right)/2, (external.left+external.right)/2],
      footerHeight:box('footer').height, statusHeight:status.height,
      horizontalOverflow:document.querySelector('.task-scroll').scrollWidth > innerWidth};
  })()`)
  assert(
    layout.leftEdges.every((edge) => Math.abs(edge - 16) < 1),
    'Main content is misaligned'
  )
  assert(
    layout.actionCenters.every((center) => Math.abs(center - layout.actionCenters[0]) < 1),
    'Toolbar, task and footer icons differ'
  )
  assert.equal(layout.footerHeight, 40)
  assert.equal(layout.statusHeight, 24)
  assert(!layout.horizontalOverflow, 'Task list overflows horizontally')

  await openFirstMenu()
  const popup = await renderer.evaluate(`(() => {
    const menu = document.querySelector('[role="menu"]'), style = getComputedStyle(menu);
    const box = menu.getBoundingClientRect();
    const anchor = document.querySelector('.task-row button[aria-haspopup="menu"]').getBoundingClientRect();
    return {background:style.backgroundColor, opacity:style.opacity, blur:style.backdropFilter,
      portaled:menu.parentElement === document.body, left:box.left, anchorLeft:anchor.left,
      gap:box.top-anchor.bottom, focused:menu.contains(document.activeElement),
      options:menu.querySelectorAll('[role="menuitemradio"]').length,
      checked:menu.querySelectorAll('[aria-checked="true"]').length};
  })()`)
  assert.equal(popup.background, 'rgb(255, 255, 255)', 'Status menu is not opaque white')
  assert.equal(popup.opacity, '1')
  assert.equal(popup.blur, 'none')
  assert(popup.portaled && popup.focused, 'Menu is clipped by the list or has no keyboard focus')
  assert.equal(popup.left, popup.anchorLeft)
  assert.equal(popup.gap, 4)
  assert.equal(popup.options, 3)
  assert.equal(popup.checked, 1)
  await screenshot('status-menu')

  await key('End', 35)
  assert(await renderer.evaluate(`document.activeElement.textContent.trim() === 'Done'`))
  await key('ArrowUp', 38)
  assert(await renderer.evaluate(`document.activeElement.textContent.trim() === 'In progress'`))
  await key('Home', 36)
  assert(await renderer.evaluate(`document.activeElement.textContent.trim() === 'Not started'`))
  await key('Escape', 27)
  await waitFor(`!document.querySelector('[role="menu"]')`)
  assert(await renderer.evaluate(`document.activeElement.matches('button[aria-haspopup="menu"]')`))
  await key('ArrowUp', 38)
  await waitFor(`document.activeElement.textContent.trim() === 'Done'`)
  await key('Tab', 9)
  await waitFor(`!document.querySelector('[role="menu"]')`)
  assert(await renderer.evaluate(`document.activeElement !== document.body`), 'Tab lost focus')

  await openFirstMenu()
  await renderer.evaluate(`document.querySelector('.task-scroll').scrollTop += 80`)
  await waitFor(`!document.querySelector('[role="menu"]')`)

  // The last fully visible trigger must open upwards rather than under the footer.
  await renderer.evaluate(`(() => {
    const bottom = document.querySelector('footer').getBoundingClientRect().top;
    const triggers = [...document.querySelectorAll('.task-row button[aria-haspopup="menu"]')];
    const trigger = triggers.filter(el => {
      const box=el.getBoundingClientRect(); return box.top > 110 && box.bottom <= bottom;
    }).at(-1);
    window.fixtureBottomTrigger=trigger;
    trigger.click();
  })()`)
  await waitFor(`!!document.querySelector('[role="menu"]')`)
  const bottomPopup = await renderer.evaluate(`(() => {
    const menu=document.querySelector('[role="menu"]'), box=menu.getBoundingClientRect();
    const trigger=window.fixtureBottomTrigger.getBoundingClientRect();
    return {above:box.bottom <= trigger.top-4, inBounds:box.top>=8 && box.bottom<=innerHeight-8,
      unclipped:document.elementFromPoint(box.left+10,box.top+10)?.closest('[role="menu"]') === menu};
  })()`)
  assert(
    bottomPopup.above && bottomPopup.inBounds && bottomPopup.unclipped,
    'Bottom popup was clipped'
  )
  await screenshot('status-menu-bottom')
  await renderer.evaluate(`window.windowAPI.resize(400, 420)`)
  await waitFor(
    `innerWidth === 400 && innerHeight === 420 && !document.querySelector('[role="menu"]')`
  )

  // Select a fixture status through the real keyboard and IPC path, without credentials.
  await renderer.evaluate(`document.querySelector('button[aria-label="All"]').click()`)
  await waitFor(
    `document.querySelector('button[aria-label="All"]').getAttribute('aria-selected') === 'true' && !!document.querySelector('.task-row')`
  )
  await renderer.evaluate(`document.querySelector('.task-scroll').scrollTop = 0`)
  await pause(200)
  await openFirstMenu()
  await key('End', 35)
  assert(await renderer.evaluate(`document.activeElement.textContent.trim() === 'Done'`))
  await key('Enter', 13)
  await waitFor(
    `document.querySelector('.task-row button[aria-haspopup="menu"]').textContent.trim() === 'Done' && !document.querySelector('[role="menu"]')`
  )

  // Compare rendered fields, not just class names: inline styles can override focus rings.
  const fieldSurfaceProperties = [
    'height',
    'borderRadius',
    'borderTopWidth',
    'borderTopStyle',
    'borderTopColor',
    'backgroundColor',
    'boxShadow',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'paddingInlineStart'
  ]
  const readFieldSurfaces = (focusFields = false) =>
    renderer.evaluate(`(() => {
      const properties=${JSON.stringify(fieldSurfaceProperties)};
      return [...document.querySelectorAll('.settings-body input, .settings-body select')].map(field=>{
        if (${focusFields}) field.focus();
        const style=getComputedStyle(field);
        return {surface:Object.fromEntries(properties.map(property=>[property,style[property]])),
          focusVisible:field.matches(':focus-visible')};
      });
    })()`)
  const settingsSizes = []
  for (const [width, height] of [
    [400, 420],
    [440, 640],
    [640, 480]
  ]) {
    await renderer.evaluate(`window.windowAPI.resize(${width}, ${height})`)
    await waitFor(`innerWidth === ${width} && innerHeight === ${height}`)
    await renderer.evaluate(`document.querySelector('button[aria-label="Open settings"]').click()`)
    await waitFor(`!!document.querySelector('.settings-panel')`)
    await pause(250)
    for (const tab of ['Connection', 'Field Mapping']) {
      await renderer.evaluate(
        `document.querySelector('.settings-panel button[aria-label="${tab}"]').click()`
      )
      await waitFor(
        `!!document.querySelector('.settings-body ${tab === 'Connection' ? 'input' : 'select'}')`
      )
      await pause(100)
      const settings = await renderer.evaluate(`(() => {
        const panel=document.querySelector('.settings-panel'), box=panel.getBoundingClientRect();
        const rail=panel.querySelector('.settings-tabs > div').getBoundingClientRect();
        const body=panel.querySelector('.settings-scroll');
        const heading=panel.querySelector('h2').getBoundingClientRect();
        const fields=[...body.querySelectorAll('input,select')];
        const actions=[...panel.querySelectorAll('.settings-actions button')];
        const disconnect=panel.querySelector('.settings-disconnect')?.getBoundingClientRect();
        return {width:innerWidth,height:innerHeight,tab:${JSON.stringify(tab)},
          geometry:{rail:[rail.left,rail.right], heading:heading.left,
            fields:fields.map(el=>{const field=el.getBoundingClientRect();return [field.left,field.right,field.height]}),
            action:actions.at(-1).getBoundingClientRect().right},
          inside:box.top>=15 && box.bottom<=innerHeight-15,
          scrolls:body.scrollHeight>body.clientHeight,
          aligned:fields.every(el => {const field=el.getBoundingClientRect();
            return Math.abs(field.left-rail.left)<1 && Math.abs(field.right-rail.right)<1;
          }) && Math.abs(heading.left-rail.left)<1 && Math.abs(actions.at(-1).getBoundingClientRect().right-rail.right)<1,
          fields40px:fields.every(el => el.getBoundingClientRect().height===40),
          disconnectAligned:!disconnect || (Math.abs(disconnect.left-rail.left)<1 && Math.abs(disconnect.right-rail.right)<1),
          actionsVisible:actions.every(el => {const action=el.getBoundingClientRect();
            return action.top>=box.top && action.bottom<=box.bottom && action.bottom<=innerHeight-16;
          }),
          labelled:fields.every(el => el.labels?.length>0),
          pills:actions.every(el => parseFloat(getComputedStyle(el).borderRadius)>=18)};
      })()`)
      if (width === 440 || height === 420) {
        await screenshot(`settings-${tab.toLowerCase().replace(' ', '-')}-${width}x${height}`)
      }
      assert(
        settings.inside && settings.actionsVisible,
        `Settings clipped at ${width}×${height}: ${tab}`
      )
      assert(
        settings.aligned && settings.fields40px && settings.disconnectAligned,
        `Settings edges/heights differ: ${JSON.stringify(settings)}`
      )
      assert(settings.labelled && settings.pills, `Settings labels or pills regressed: ${tab}`)
      if (height === 420) assert(settings.scrolls, 'Small-window form is not scrollable')
      settings.fieldSurfaces = await readFieldSurfaces()
      const fieldCenter = await renderer.evaluate(`(() => {
        const field=document.querySelector('.settings-body input, .settings-body select');
        field.scrollIntoView({block:'nearest'});
        const box=field.getBoundingClientRect();
        return {x:(box.left+box.right)/2,y:(box.top+box.bottom)/2};
      })()`)
      await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...fieldCenter })
      settings.hoverSurfaces = await readFieldSurfaces()
      await renderer.evaluate(
        `document.querySelector('.settings-panel button[aria-label="Field Mapping"]').focus()`
      )
      await key('Tab', 9)
      settings.focusSurfaces = await readFieldSurfaces(true)
      assert(
        settings.focusSurfaces.every(
          (field) => field.focusVisible && field.surface.boxShadow !== 'none'
        ),
        `A field lost its visible keyboard focus: ${tab}`
      )
      await renderer.evaluate(`(() => {
        document.activeElement.blur();
        document.querySelector('.settings-scroll').scrollTop=0;
      })()`)
      settingsSizes.push(settings)
    }
    await renderer.evaluate(
      `document.querySelector('.settings-panel button[aria-label="Close"]').click()`
    )
    await waitFor(`!document.querySelector('.settings-panel')`)
  }
  const mappingReference = settingsSizes.find((entry) => entry.tab === 'Field Mapping')
  assert(mappingReference, 'The Field Mapping reference is missing')
  for (const entry of settingsSizes) {
    for (const state of ['fieldSurfaces', 'hoverSurfaces', 'focusSurfaces']) {
      for (const field of entry[state]) {
        assert.deepEqual(
          field.surface,
          mappingReference[state][0].surface,
          `${entry.tab} differs from the Field Mapping surface (${state})`
        )
      }
    }
    assert(
      entry.fieldSurfaces.every((field) => field.surface.backgroundColor === 'rgb(255, 255, 255)')
    )
    assert(entry.fieldSurfaces.every((field) => field.surface.borderTopWidth === '1px'))
    assert(entry.fieldSurfaces.every((field) => field.surface.boxShadow === 'none'))
  }
  const report = {
    layout,
    popup,
    bottomPopup,
    keyboard: 'passed',
    fixtureUpdate: 'passed',
    settingsSizes
  }
  await writeFile(join(directory, 'ui-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`UI layout checks passed. Report: ${join(directory, 'ui-report.json')}`)
}
