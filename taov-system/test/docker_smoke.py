"""Exercise only newly-created Docker resources with synthetic data."""
import json,os,subprocess,time,uuid,urllib.request,http.cookiejar
suffix=uuid.uuid4().hex[:10]
volume='taov-test-data-'+suffix
name='taov-test-app-'+suffix
port=3137
env=dict(os.environ)
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(key,None)
prefix=['docker','--host=unix:///var/run/docker.sock']
def docker(*args):return subprocess.check_output(prefix+list(args),env=env,text=True).strip()
jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(jar))
def request(endpoint,data=None):
 raw=None if data is None else json.dumps(data).encode()
 req=urllib.request.Request('http://127.0.0.1:'+str(port)+'/api/'+endpoint,data=raw,headers={'Content-Type':'application/json'})
 with opener.open(req,timeout=10) as response:
  content=response.read()
  return content if endpoint.endswith('.pdf') else json.loads(content)
def start():
 docker('run','-d','--name',name,'--mount','type=volume,src='+volume+',dst=/app/data','-p','127.0.0.1:'+str(port)+':3000','-e','ADMIN_PASSWORD=Synthetic-Docker-Admin-123!','taov-system:local')
 for _ in range(100):
  try:
   response=request('login',{'username':'admin','password':'Synthetic-Docker-Admin-123!'})
   if response.get('name')=='admin':return
  except Exception:time.sleep(.2)
 raise AssertionError('Docker application did not become ready')
created=False
try:
 docker('volume','create',volume);created=True
 start()
 request('leads',{'name':'ליד סינתטי בתוך Docker','status':'חדש'})
 assert request('dashboard')['openLeads']==1
 assert request('report.pdf').startswith(b'%PDF-')
 assert request('backups')['enabled']
 assert request('backups')['files']
 for _ in range(90):
  status=docker('inspect','--format','{{.State.Health.Status}}',name)
  if status=='healthy':break
  if status=='unhealthy':raise AssertionError('Container healthcheck failed')
  time.sleep(.5)
 assert status=='healthy'
 docker('rm','-f',name)
 jar.clear();start()
 assert len(request('leads'))==1
 assert request('leads')[0]['name']=='ליד סינתטי בתוך Docker'
 print('PASS: Docker login, records, metrics, Hebrew PDF, daily backup, healthcheck, and volume persistence after recreation')
finally:
 subprocess.run(prefix+['rm','-f',name],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if created:subprocess.run(prefix+['volume','rm',volume],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
