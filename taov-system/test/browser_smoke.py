import os,subprocess,tempfile,time,json,urllib.request,shutil
from playwright.sync_api import sync_playwright, expect
folder=tempfile.mkdtemp(prefix='taov-browser-')
env={**os.environ,'DATA_DIR':folder,'PORT':'3101','ADMIN_PASSWORD':'Synthetic-Browser-Only-123'}
process=subprocess.Popen(['node','server.js'],cwd=str(__import__('pathlib').Path(__file__).resolve().parents[1]),env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for attempt in range(40):
  try:urllib.request.urlopen('http://127.0.0.1:3101');break
  except Exception:time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:3101')
  page.locator('#loginForm [name=password]').fill('Synthetic-Browser-Only-123')
  page.locator('#loginForm button').click();page.locator('#workspace').wait_for(state='visible')
  page.locator('#editor [name=name]').fill('ליד סינתטי לבדיקה')
  page.locator('#editor button').first.click();page.wait_for_timeout(500);print('notice',page.locator('#notice').inner_text(),flush=True)
  page.get_by_role('button',name='עריכה',exact=True).wait_for()
  assert 'ליד סינתטי לבדיקה' in page.locator('#rows').inner_text()
  page.reload();page.get_by_role('button',name='עריכה',exact=True).wait_for()
  page.get_by_role('button',name='מסמכים',exact=True).click()
  page.locator('#title').filter(has_text='מסמכים').wait_for()
  page.locator('#editor [name=name]').fill('מסמך סינתטי')
  page.locator('#attachment').set_input_files({'name':'example.txt','mimeType':'text/plain','buffer':b'Synthetic only'})
  page.locator('#editor button').first.click()
  page.get_by_role('button',name='הורדת מסמך',exact=True).wait_for()
  with page.expect_download() as d:page.get_by_role('button',name='הורדת מסמך',exact=True).click()
  assert open(d.value.path(),'rb').read()==b'Synthetic only'
  page.get_by_role('button',name='דוח מצב',exact=True).click()
  expect(page.locator('#output')).to_contain_text('counts')
  page.locator('[aria-label="חיפוש בשפה חופשית"]').fill('לידים')
  page.get_by_role('button',name='שאל את תאוב',exact=True).click()
  expect(page.locator('#output')).to_contain_text('ליד סינתטי לבדיקה')
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  page.get_by_role('button',name='יציאה',exact=True).click()
  page.locator('#login').wait_for(state='visible')
  assert not errors,errors
  browser.close()
 print('PASS: Chromium login, create, reload persistence, document upload/download, report, assistant, mobile width, logout; no JS errors')
finally:
 process.terminate();process.wait();shutil.rmtree(folder)
