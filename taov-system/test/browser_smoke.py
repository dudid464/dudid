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
  expect(page.locator('#dashboard')).to_contain_text('לידים פתוחים')
  with page.expect_download() as pdf_download:
   page.get_by_role('button',name='דוח PDF בעברית',exact=True).click()
  pdf_path=str(__import__('pathlib').Path(tempfile.gettempdir())/'taov-report-verified.pdf')
  pdf_download.value.save_as(pdf_path)
  assert open(pdf_path,'rb').read(5)==b'%PDF-'
  if shutil.which('pdftotext'):
   extracted=subprocess.check_output(['pdftotext','-layout',pdf_path,'-'],text=True)
   assert 'תאוב — דוח ניהולי' in extracted
   assert 'לידים פתוחים' in extracted
  page.get_by_role('button',name='טיוטות חתימה לחוזים',exact=True).click()
  page.get_by_label('שם חותם סינתטי').fill('חותם סינתטי לדוגמה')
  page.get_by_role('button',name='שמור טיוטת חתימה',exact=True).click()
  expect(page.locator('#signaturePanel')).to_contain_text('SHA-256:')
  response=page.request.post('http://127.0.0.1:3101/api/users',data={'name':'browseruser','password':'Synthetic-Browser-User-123','role':'viewer'})
  assert response.status==201
  page.get_by_role('button',name='ניהול משתמשים',exact=True).click()
  page.get_by_label('תפקיד browseruser').select_option('editor')
  row=page.locator('.userRow').filter(has_text='browseruser')
  row.get_by_role('button',name='עדכן תפקיד',exact=True).click()
  expect(page.get_by_label('תפקיד browseruser')).to_have_value('editor')
  page.get_by_role('button',name='ייבוא — דיל 2023 – תאוב',exact=True).click()
  page.locator('#importSynthetic').check()
  page.locator('#importFile').set_input_files({'name':'synthetic.csv','mimeType':'text/csv','buffer':'שם,אחראי\nליד סינתטי מיובא,מנהל סינתטי'.encode('utf-8')})
  page.get_by_role('button',name='טעינת קובץ לתצוגה',exact=True).click()
  expect(page.locator('#map-name')).to_have_value('שם')
  page.locator('#importKind').select_option('leads')
  page.get_by_role('button',name='תצוגה מקדימה לפני שמירה',exact=True).click()
  expect(page.locator('#importPreview')).to_contain_text('ליד סינתטי מיובא')
  page.once('dialog',lambda d:d.accept())
  page.get_by_role('button',name='אישור ושמירת הייבוא',exact=True).click()
  expect(page.locator('#notice')).to_contain_text('נוצרו 1 רשומות')
  page.get_by_role('button',name='גיבוי יומי אוטומטי',exact=True).click()
  expect(page.locator('#backupPanel')).to_contain_text('local-file')
  page.once('dialog',lambda d:d.accept())
  with page.expect_download() as key_download:
   page.get_by_role('button',name='הורדת מפתח שחזור — שמירה בנפרד',exact=True).click()
  assert len(open(key_download.value.path()).read())>=20
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  page.get_by_role('button',name='יציאה',exact=True).click()
  page.locator('#login').wait_for(state='visible')
  assert not errors,errors
  browser.close()
 print('PASS: Chromium core workflows, dashboard/PDF, signature draft, user role UI, CSV preview/mapping/commit, backup recovery-key download, mobile width and logout; no JS errors')
finally:
 process.terminate();process.wait();shutil.rmtree(folder)
