"""Local browser contract checks with intercepted API fixtures. Never writes to a live API."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
base = os.environ.get('CWCM_TEST_URL', 'http://127.0.0.1:4180')
image = (root / 'apps/web/src/assets/wallpaper-anniversary.jpg').read_bytes()
base_wallpaper = dict(id='w1', title='Corporate blue', filename='corporate.jpg', description='Company wallpaper', tags=[], resolution='1920x1080', width=1920, height=1080, sizeBytes=len(image), checksumSha256='test', mimeType='image/jpeg', imageUrl='/api/wallpapers/w1/image', uploadedAt='2026-09-27T09:00:00Z', uploadedBy='test.operator', usageStatus='DRAFT', isDefault=False, campaigns=[])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for role in ['ADMINISTRATOR', 'OPERATOR']:
        state = {'wallpapers': [dict(base_wallpaper)], 'writes': [], 'image_fail': False}
        context = browser.new_context(viewport={'width': 1365, 'height': 1000})
        session = dict(token='isolated-test-token', expiresAt='2099-01-01T00:00:00Z', user=dict(id='test', username='local.test', role=role, isActive=True, lastLoginAt=None))
        context.add_init_script('localStorage.setItem("cwcm.auth", '+json.dumps(json.dumps(session))+')')
        def handler(route):
            req=route.request
            path=req.url.split('/api/',1)[-1].split('?')[0]
            if req.method not in ['GET','OPTIONS']: state['writes'].append((req.method,path))
            body={}
            if path=='auth/session': body=session
            elif path=='wallpapers' and req.method=='GET': body={'items':state['wallpapers']}
            elif path=='campaigns': body={'items':[]}
            elif path.endswith('/image') or path=='wallpapers/preview':
                if path=='wallpapers/preview' and state.get('preview_fail'):
                    route.fulfill(status=413,content_type='text/html',body='Request Entity Too Large'); return
                if state['image_fail']:
                    route.fulfill(status=503,json={'message':'Preview unavailable'}); return
                route.fulfill(status=200,content_type='image/jpeg',body=image); return
            elif path.endswith('/default'):
                state['wallpapers'][0]['isDefault']=True; body={'defaultWallpaperId':'w1'}
            elif path=='wallpapers/w1' and req.method=='PATCH':
                state['wallpapers'][0].update(req.post_data_json); body=state['wallpapers'][0]
            elif path=='wallpapers' and req.method=='POST':
                item=dict(base_wallpaper,id='w2',title='Uploaded wallpaper',imageUrl='/api/wallpapers/w2/image')
                state['wallpapers'].append(item); body=item
            else:
                route.fulfill(status=404,json={'message':'Unexpected test request: '+path}); return
            route.fulfill(status=200,json=body)
        context.route('**/api/**',handler)
        page=context.new_page()
        page.goto(base+'/wallpapers')
        expect(page.get_by_role('heading',name='Corporate blue')).to_be_visible()
        page.get_by_role('button',name='Create campaign',exact=True).click()
        expect(page.get_by_role('button',name='Save campaign',exact=True)).to_be_visible()
        expect(page.locator('input[value="Corporate blue"]')).to_be_visible()
        assert not state['writes'], state['writes']
        page.goto(base+'/wallpapers')
        page.get_by_role('button',name='Actions for Corporate blue').click()
        if role=='ADMINISTRATOR':
            page.get_by_role('menuitem',name='Set as default wallpaper').click()
            expect(page.get_by_role('alertdialog')).to_contain_text('Active campaigns stay unchanged')
            page.get_by_role('button',name='Set as default',exact=True).click()
            expect(page.get_by_text('Default wallpaper:').locator('..')).to_contain_text('Corporate blue')
        else:
            expect(page.get_by_role('menuitem',name='Set as default wallpaper')).to_have_count(0)
            page.keyboard.press('Escape')
        page.get_by_role('button',name='Preview',exact=True).click()
        dialog=page.get_by_role('dialog')
        expect(dialog).to_contain_text('test.operator')
        dialog.get_by_role('button',name='Actions for Corporate blue').click()
        page.get_by_role('menuitem',name='Edit details').click()
        page.get_by_label('Title',exact=True).fill('Corporate revised')
        page.get_by_role('button',name='Save details').click()
        expect(dialog.get_by_role('heading',name='Corporate revised')).to_be_visible()
        page.keyboard.press('Escape')
        if role=='ADMINISTRATOR':
            page.get_by_role('button',name='Actions for Corporate revised').click()
            page.get_by_role('menuitem',name='Delete wallpaper').click()
            expect(page.get_by_role('alertdialog')).to_contain_text('Choose a different default')
            expect(page.get_by_role('button',name='Delete wallpaper',exact=True)).to_have_count(0)
            page.get_by_role('button',name='Cancel',exact=True).click()
        page.get_by_role('button',name='Upload wallpaper',exact=True).click()
        state['preview_fail']=True
        page.locator('input[type=file]').set_input_files(root/'apps/web/src/assets/wallpaper-anniversary.jpg')
        expect(page.get_by_text('Upload rejected:',exact=False)).to_be_visible()
        expect(page.get_by_role('button',name='Save to Library')).to_be_disabled()
        state['preview_fail']=False
        page.get_by_role('button',name='Try preview again').click()
        expect(page.get_by_alt_text('Final wallpaper preview')).to_be_visible()
        assert ('POST','wallpapers') not in state['writes']
        page.get_by_label('Title',exact=True).fill('Uploaded wallpaper')
        page.get_by_role('button',name='Save to Library').click()
        expect(page.get_by_role('dialog').get_by_role('heading',name='Uploaded wallpaper')).to_be_visible()
        page.keyboard.press('Escape')
        page.get_by_role('textbox',name='Search wallpapers').fill('no-match')
        expect(page.get_by_text('No wallpapers match your search or filter.')).to_be_visible()
        page.get_by_role('button',name='Clear search').click()
        expect(page.get_by_role('heading',name='Corporate revised')).to_be_visible()
        page.get_by_role('combobox',name='Filter wallpapers').focus()
        page.keyboard.press('Enter')
        expect(page.get_by_role('option',name='All wallpapers',exact=True)).to_be_focused()
        page.keyboard.press('ArrowDown')
        expect(page.get_by_role('option',name='Default',exact=True)).to_be_focused()
        page.keyboard.press('Enter')
        expect(page).to_have_url(__import__('re').compile('filter=DEFAULT'))
        page.get_by_role('combobox',name='Filter wallpapers').click()
        page.get_by_role('option',name='All wallpapers',exact=True).click()
        if role=='ADMINISTRATOR':
            expect(page.locator('[data-sonner-toast]')).to_have_count(0,timeout=15000)
            page.screenshot(path='/tmp/wallpaper-library-desktop.png',full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path='/tmp/wallpaper-library-mobile.png',full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
        state['image_fail']=True
        page.goto(base+'/wallpapers')
        expect(page.get_by_text('Preview unavailable.').first).to_be_visible()
        state['image_fail']=False
        page.get_by_role('button',name='Try again',exact=True).first.click()
        expect(page.get_by_alt_text('Corporate revised',exact=True)).to_be_visible()
        context.close()
        print(role+': campaign preselection, default permissions, edit, upload preview/save, search, protected deletion passed')
    browser.close()
