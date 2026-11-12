"""Optional real-Chrome checks: python tests/browser.test.py (Playwright required)."""
from pathlib import Path
import math
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / 'index.html').as_uri()
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    chrome = os.environ.get('CHROME_PATH', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    browser = p.chromium.launch(executable_path=chrome if Path(chrome).exists() else None, headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto(URL)
    assert page.locator('#spin-play').get_attribute('aria-pressed') == 'false'
    ring_area = page.locator('#latitude').evaluate('''g => {
        const points = [...g.children].map(p => p.getAttribute('d').slice(1).split('L')[0].split(',').map(Number));
        return Math.abs(points.reduce((sum, a, i) => {const b=points[(i+1)%points.length]; return sum+a[0]*b[1]-b[0]*a[1]},0)/2);
    }''')
    assert ring_area > 1000, 'Beijing daily path must be visibly elliptical, not an edge-on line'
    page.locator('#winter').click()
    assert '9小时' in page.locator('#day-hours').inner_text()
    assert page.locator('#winter').get_attribute('aria-pressed') == 'true'
    page.locator('#summer').click()
    assert '14小时' in page.locator('#day-hours').inner_text()
    assert 61 < float(page.locator('#day-bar').evaluate('(el) => parseFloat(el.style.width)')) < 63

    def position(x, y):
        return page.locator('#orbit').evaluate('''(svg, xy) => {
            const p = new DOMPoint(...xy).matrixTransform(svg.getScreenCTM());
            return {x: p.x, y: p.y};
        }''', [x, y])

    def earth():
        return page.locator('#earth-handle').evaluate('''el => {
            const p = new DOMPoint(0,0).matrixTransform(el.getScreenCTM());
            return {x:p.x, y:p.y};
        }''')

    def drag_to(x, y):
        start, finish = earth(), position(x, y)
        page.mouse.move(start['x'], start['y'])
        page.mouse.down()
        page.mouse.move(finish['x'], finish['y'], steps=12)
        page.mouse.up()
        actual = earth()
        assert math.hypot(actual['x']-finish['x'], actual['y']-finish['y']) < 2, 'Earth must follow pointer position'

    drag_to(460, 220)
    assert '9小时' in page.locator('#day-hours').inner_text(), 'Mouse drag must reach winter'
    drag_to(300, 60)
    assert '12小时' in page.locator('#day-hours').inner_text()
    for angle in [-0.02, 0.02]:
        drag_to(300-160*math.cos(angle), 220-160*math.sin(angle))
        assert '14小时' in page.locator('#day-hours').inner_text(), 'Phase wrap must be continuous'
    start = earth()
    page.mouse.move(start['x'], start['y'])
    page.mouse.down()
    page.mouse.move(1400, 1000)
    page.mouse.up()
    assert 'dragging' not in page.locator('#earth-handle').get_attribute('class')
    page.locator('#summer').click()
    start = earth()
    page.mouse.move(start['x'], start['y'])
    page.mouse.down()
    page.locator('#earth-handle').dispatch_event('pointercancel', {'pointerId': 1})
    page.mouse.up()
    assert 'dragging' not in page.locator('#earth-handle').get_attribute('class')
    drag_to(460, 220)
    assert '9小时' in page.locator('#day-hours').inner_text()

    page.locator('#year-position').focus()
    page.keyboard.press('Home')
    assert '14小时' in page.locator('#day-hours').inner_text()
    page.keyboard.press('ArrowRight')
    assert float(page.locator('#year-position').input_value()) > 0
    page.locator('#orbit-play').click()
    page.wait_for_timeout(250)
    assert float(page.locator('#year-position').input_value()) > 0.5
    drag_to(460, 220)
    assert page.locator('#orbit-play').get_attribute('aria-pressed') == 'false'
    before = page.locator('#earth-handle').get_attribute('transform')
    page.wait_for_timeout(150)
    assert before == page.locator('#earth-handle').get_attribute('transform')
    marker_before = page.locator('#beijing-marker').get_attribute('transform')
    page.locator('#spin-play').click()
    page.wait_for_timeout(300)
    assert marker_before != page.locator('#beijing-marker').get_attribute('transform')
    assert before == page.locator('#earth-handle').get_attribute('transform')
    page.locator('#spin-play').click()
    marker_before = page.locator('#beijing-marker').get_attribute('transform')
    page.wait_for_timeout(150)
    assert marker_before == page.locator('#beijing-marker').get_attribute('transform')

    for width in [320, 390, 768, 1024, 1440]:
        page.set_viewport_size({'width': width, 'height': 1100})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow at %s' % width
    page.locator('#summer').click()
    page.screenshot(path=str(ARTIFACTS / 'desktop.png'), full_page=True)
    page.locator('#winter').click()
    page.screenshot(path=str(ARTIFACTS / 'winter.png'), full_page=True)
    assert not errors, errors

    mobile = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    mobile.on('pageerror', lambda error: errors.append(str(error)))
    mobile.goto(URL)
    session = mobile.context.new_cdp_session(mobile)
    def mobile_point(x, y):
        return mobile.locator('#orbit').evaluate('''(svg, xy) => {
            const p = new DOMPoint(...xy).matrixTransform(svg.getScreenCTM());
            return {x:p.x, y:p.y};
        }''', [x,y])
    start, end = mobile_point(140, 220), mobile_point(460, 220)
    session.send('Input.dispatchTouchEvent', {'type':'touchStart', 'touchPoints':[dict(start, id=1)]})
    for i in range(1, 11):
        point = {'x': start['x'] + (end['x']-start['x'])*i/10, 'y': start['y'], 'id':1}
        session.send('Input.dispatchTouchEvent', {'type':'touchMove', 'touchPoints':[point]})
    session.send('Input.dispatchTouchEvent', {'type':'touchEnd', 'touchPoints':[]})
    assert '9小时' in mobile.locator('#day-hours').inner_text(), 'Touch drag must reach winter'
    assert 'dragging' not in mobile.locator('#earth-handle').get_attribute('class')
    mobile.locator('#summer').click()
    mobile.screenshot(path=str(ARTIFACTS / 'mobile.png'), full_page=True)
    assert not errors, errors
    browser.close()
    print('PASS: file:// loading, seasons, mouse/touch drag, wrap, cancellation, keyboard, independent playback, reduced motion, 5 viewport widths; no browser errors')
