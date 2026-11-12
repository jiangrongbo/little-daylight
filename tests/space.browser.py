"""Optional Chrome WebGL integration tests; run python tests/space.browser.py."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=(ROOT/'index.html').as_uri()
with sync_playwright() as p:
    chrome=os.environ.get('CHROME_PATH','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    browser=p.chromium.launch(executable_path=chrome if Path(chrome).exists() else None,headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1100},reduced_motion='reduce')
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
    page.goto(URL)
    assert page.locator('#view-space').count()==1, '3D space view must be available'
    page.locator('#view-space').click()
    assert page.locator('#space-stage').is_visible()
    assert not page.locator('#space-status').is_visible(), page.locator('#space-status').inner_text()
    assert page.locator('#space-canvas').evaluate("c=>c.getContext('webgl').getError()") == 0
    first=page.locator('#space-canvas').evaluate('c=>c.toDataURL()')
    page.locator('[data-camera="right"]').click()
    assert page.locator('#space-canvas').evaluate('c=>c.toDataURL()')!=first, 'Camera must change the actual rendered image'
    page.locator('[data-camera="reset"]').click()
    assert page.locator('#space-canvas').evaluate('c=>c.toDataURL()')==first

    def world_beijing():
        return page.locator('#space-canvas').evaluate("""c=>{const gl=c.getContext('webgl'),p=gl.getParameter(gl.CURRENT_PROGRAM);const v=n=>gl.getUniform(p,gl.getUniformLocation(p,n));const a=v('beijing'),b=v('earth');return [...a].map((x,i)=>x-b[i])}""")
    fixed=world_beijing()
    page.locator('#winter').click()
    moved=world_beijing()
    assert max(abs(a-b) for a,b in zip(fixed,moved))<1e-5, 'Changing orbit with spin paused must preserve surface orientation in space'
    page.locator('#summer').click()

    lighting=page.evaluate('''() => {
      const canvas=document.querySelector('#space-canvas'), gl=canvas.getContext('webgl');
      const cam={yaw:.45,pitch:.6,distance:13}, s=Daylight.sample(0,-.65), earth=s.sun.map(v=>-v*SpaceView.ORBIT_RADIUS);
      const read=normal=>{
        const world=earth.map((v,i)=>v+normal[i]*SpaceView.EARTH_RADIUS);
        const p=SpaceView.project(world,cam,canvas.clientWidth,canvas.clientHeight);
        const px=new Uint8Array(4); const scale=canvas.width/canvas.clientWidth;
        gl.readPixels(Math.round(p.x*scale),canvas.height-Math.round(p.y*scale),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
        return px[0]+px[1]+px[2];
      };
      return {day:read([.8,0,.6]),night:read([-.6,0,.8])};
    }''')
    assert lighting['day']>lighting['night']*1.5, 'Sun-facing hemisphere must be visibly brighter: %r' % lighting

    def anchor():
        return page.locator('#space-earth-anchor').evaluate('el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y}}')
    def screen_world(world):
        return page.locator('#space-canvas').evaluate('''(c,w)=>{const p=SpaceView.project(w,{yaw:.45,pitch:.6,distance:13},c.clientWidth,c.clientHeight);const r=c.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}}''',world)
    start=anchor()
    finish=screen_world([4.4,0,0])
    page.mouse.move(start['x'],start['y'])
    page.mouse.down()
    page.mouse.move(finish['x'],finish['y'],steps=25)
    page.mouse.up()
    assert '9小时' in page.locator('#day-hours').inner_text(), 'Dragging the 3D earth must reach winter'
    page.locator('#view-diagram').click()
    assert page.locator('#winter').get_attribute('aria-pressed')=='true', 'View switch must retain season'
    page.locator('#view-space').click()
    page.locator('#summer').click()
    before=page.locator('#space-canvas').evaluate('c=>c.toDataURL()')
    page.locator('#spin-play').click()
    page.wait_for_timeout(350)
    assert before!=page.locator('#space-canvas').evaluate('c=>c.toDataURL()'), 'Earth texture and Beijing must self-rotate'
    page.locator('#spin-play').click()
    before=page.locator('#space-canvas').evaluate('c=>c.toDataURL()')
    page.wait_for_timeout(150)
    assert before==page.locator('#space-canvas').evaluate('c=>c.toDataURL()'), 'Paused scene must be stationary'
    page.locator('#orbit-play').click()
    page.wait_for_timeout(250)
    assert float(page.locator('#year-position').input_value())>0.5
    start=anchor()
    page.mouse.move(start['x'],start['y'])
    page.mouse.down()
    page.mouse.up()
    assert page.locator('#orbit-play').get_attribute('aria-pressed')=='false'
    page.locator('#space-canvas').focus()
    before=page.locator('#space-canvas').evaluate('c=>c.toDataURL()')
    page.keyboard.press('ArrowLeft')
    assert before!=page.locator('#space-canvas').evaluate('c=>c.toDataURL()')
    page.keyboard.press('Home')
    page.locator('#summer').click()
    page.screenshot(path=str(ROOT/'artifacts'/'space-desktop.png'),full_page=True)
    for width in [320,390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':1100})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), '3D horizontal overflow at %s' % width
        assert page.locator('.camera-controls').evaluate('(el)=>[...el.querySelectorAll("button")].every(b=>b.getBoundingClientRect().width>=44 && b.getBoundingClientRect().height>=44)'), 'Camera buttons must have 44px touch targets'
    assert not errors,errors
    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
    mobile.on('pageerror',lambda error:errors.append(str(error)))
    mobile.goto(URL)
    mobile.locator('#view-space').click()
    session=mobile.context.new_cdp_session(mobile)
    def rect():
        return mobile.locator('#space-canvas').bounding_box()
    box=rect()
    a={'x':box['x']+box['width']*.35,'y':box['y']+box['height']*.3,'id':1}
    b={'x':box['x']+box['width']*.65,'y':a['y'],'id':2}
    image_before=mobile.locator('#space-canvas').evaluate('c=>c.toDataURL()')
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a,b]})
    for i in range(1,8):
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dict(a,x=a['x']-i*6),dict(b,x=b['x']+i*6)]})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert image_before!=mobile.locator('#space-canvas').evaluate('c=>c.toDataURL()'), 'Two-finger pinch must zoom'
    assert '14小时' in mobile.locator('#day-hours').inner_text(), 'Camera gesture must retain season'
    mobile.locator('[data-camera="reset"]').click()
    mobile.locator('#summer').click()
    a=mobile.locator('#space-earth-anchor').evaluate('el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,id:1}}')
    b=mobile.locator('#space-canvas').evaluate('(c)=>{const p=SpaceView.project([4.4,0,0],SpaceView.defaultCamera(c.clientWidth,c.clientHeight),c.clientWidth,c.clientHeight);const b=c.getBoundingClientRect();return {x:p.x+b.x,y:p.y+b.y,id:1}}')
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
    for i in range(1,16):
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':a['x']+(b['x']-a['x'])*i/15,'y':a['y']+(b['y']-a['y'])*i/15,'id':1}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert '9小时' in mobile.locator('#day-hours').inner_text(), 'Touch drag of 3D Earth must reach winter'
    assert 'interacting' not in (mobile.locator('#space-canvas').get_attribute('class') or '')
    mobile.screenshot(path=str(ROOT/'artifacts'/'space-mobile.png'),full_page=True)
    # A WebGL failure must leave the explanatory diagram usable.
    fallback=browser.new_page(reduced_motion='reduce')
    fallback.add_init_script("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl'?null:original.call(this,t,...a)}")
    fallback.goto(URL)
    fallback.locator('#view-space').click()
    assert fallback.locator('#space-status').is_visible()
    fallback.locator('#view-diagram').click()
    fallback.locator('#winter').click()
    assert '9小时' in fallback.locator('#day-hours').inner_text()
    assert not errors,errors
    browser.close()
    print('PASS: WebGL rendering, camera/reset, solar lighting, 3D dragging, shared seasons, spin/pause, keyboard, 5 viewport widths, touch drag/pinch and no-WebGL fallback')
