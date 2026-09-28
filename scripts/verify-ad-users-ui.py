"""Isolated UI acceptance; all API traffic intercepted. No AD or database writes."""
import json
import os
from playwright.sync_api import sync_playwright, expect
base=os.environ.get('CWCM_TEST_URL','http://127.0.0.1:4180')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1280,'height':900})
    session={'token':'test','expiresAt':'2099-01-01T00:00:00Z','user':{'id':'admin','username':'admin','role':'ADMINISTRATOR','authSource':'LOCAL','isActive':True,'lastLoginAt':None}}
    context.add_init_script('localStorage.setItem("cwcm.auth",'+json.dumps(json.dumps(session))+')')
    rows=[]
    writes=[]
    def handler(route):
        req=route.request
        path=req.url.split('/api/',1)[1].split('?')[0]
        if path=='auth/session': body=session
        elif path=='users' and req.method=='GET': body={'items':rows}
        elif path=='users' and req.method=='POST':
            body=req.post_data_json; writes.append(body)
            assert body['authSource']=='AD'
            assert 'password' not in body
            body={**body,'id':'u1','lastLoginAt':None}; rows.append(body)
        elif path=='users/u1' and req.method=='PATCH':
            body=req.post_data_json; writes.append(body)
            assert 'password' not in body
            body={**body,'id':'u1','lastLoginAt':None};rows[0]=body
        else: route.fulfill(status=404,json={'message':'Unexpected request'});return
        route.fulfill(json=body)
    context.route('**/api/**',handler)
    page=context.new_page();page.goto(base+'/users')
    page.get_by_role('button',name='Add user').click()
    expect(page.get_by_role('combobox',name='Sign-in method')).to_contain_text('Active Directory')
    expect(page.locator('input[type=password]')).to_have_count(0)
    page.get_by_label('Username',exact=True).fill('person')
    page.get_by_role('button',name='Create user',exact=True).click()
    expect(page.get_by_role('alertdialog')).to_contain_text('No AD group membership or password is changed')
    page.get_by_role('button',name='Save access').click()
    expect(page.get_by_role('table').get_by_text('person',exact=True)).to_be_visible()
    page.get_by_role('button',name='Edit',exact=True).click()
    page.get_by_role('button',name='Update user').click()
    page.get_by_role('button',name='Save access').click()
    expect(page.get_by_role('alertdialog')).to_have_count(0)
    assert len(writes)==2
    page.get_by_role('button',name='Edit',exact=True).click()
    page.get_by_role('combobox',name='Sign-in method').click()
    page.get_by_role('option',name='Local account',exact=True).click()
    expect(page.locator('input[type=password]')).to_be_visible()
    expect(page.get_by_role('button',name='Update user')).to_be_disabled()
    page.screenshot(path='/tmp/ad-users-form.png',full_page=True)
    context.close()
    context=browser.new_context()
    context.route('**/api/auth/login',lambda route: route.fulfill(status=503,json={'message':'Sign-in is temporarily unavailable. Please try again later.'}))
    page=context.new_page();page.goto(base+'/login')
    expect(page.get_by_label('Username',exact=True)).to_have_value('')
    page.get_by_label('Username',exact=True).fill('person')
    page.get_by_label('Password',exact=True).fill('fake-test-password')
    page.get_by_role('button',name='Sign In',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('temporarily unavailable')
    expect(page.get_by_label('Username',exact=True)).to_have_value('person')
    print('AD assignment, password omission, confirmation, source switch, and login outage UI passed')
    browser.close()
