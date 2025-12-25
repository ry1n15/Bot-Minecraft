const express = require('express');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { status, statusBedrock } = require('minecraft-server-util');
const bedrock = require('bedrock-protocol');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: 'secret123',
  resave: false,
  saveUninitialized: false
}));

/* ===== ملفات ===== */
const USERS = './users.json';
const SERVERS = './servers.json';
if (!fs.existsSync(SERVERS)) fs.writeFileSync(SERVERS, '[]');

const bots = new Map();

/* ===== أدوات ===== */
const read = f => JSON.parse(fs.readFileSync(f));
const write = (f,d)=>fs.writeFileSync(f,JSON.stringify(d,null,2));

function auth(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  next();
}

/* ===== تسجيل الدخول ===== */
app.get('/login',(req,res)=>{
  res.send(`
  <h2>Login</h2>
  <form method="post">
    <input name="email" placeholder="Email"><br>
    <input name="password" type="password" placeholder="Password"><br>
    <button>Login</button>
  </form>
  `);
});

app.post('/login',express.urlencoded({extended:true}),(req,res)=>{
  const users = read(USERS);
  const u = users.find(x=>x.email===req.body.email);
  if(!u || !bcrypt.compareSync(req.body.password,u.password))
    return res.send('❌ خطأ');

  req.session.user = u.email;
  res.redirect('/');
});

/* ===== لوحة التحكم ===== */
app.get('/',auth,(req,res)=>{
res.send(`
<h2>MC Panel</h2>
<form onsubmit="add(event)">
<input id=name placeholder="Name">
<input id=ip placeholder="IP">
<input id=port placeholder="Port">
<select id=type>
<option value="java">Java</option>
<option value="bedrock">Bedrock</option>
</select>
<button>إضافة</button>
</form>
<div id=list></div>

<script>
async function load(){
 const s=await fetch('/api/servers').then(r=>r.json());
 list.innerHTML=s.map(x=>\`
 <div>
 <b>\${x.name}</b> | \${x.type} | \${x.status}
 <button onclick="start('\${x.id}')">▶</button>
 <button onclick="stop('\${x.id}')">⏹</button>
 </div>\`).join('');
}
async function add(e){
 e.preventDefault();
 await fetch('/api/add',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({name:name.value,ip:ip.value,port:port.value,type:type.value})});
 load();
}
const start=id=>fetch('/api/start/'+id,{method:'POST'}).then(load);
const stop=id=>fetch('/api/stop/'+id,{method:'POST'}).then(load);
load();
</script>
`);
});

/* ===== API ===== */
app.get('/api/servers',auth,(req,res)=>res.json(read(SERVERS)));

app.post('/api/add',auth,(req,res)=>{
 const s=read(SERVERS);
 s.push({...req.body,id:Date.now().toString(),status:'متوقف'});
 write(SERVERS,s);
 res.json({ok:true});
});

app.post('/api/start/:id',auth,async(req,res)=>{
 const s=read(SERVERS);
 const x=s.find(a=>a.id===req.params.id);
 if(!x) return res.json({});
 try{
  if(x.type==='java'){
    await status(x.ip,parseInt(x.port));
  }else{
    const info=await statusBedrock(x.ip,parseInt(x.port));
    const bot=bedrock.createClient({
      host:x.ip,port:x.port,username:'WEB_BOT',offline:true
    });
    bots.set(x.id,bot);
    bot.on('disconnect',()=>console.log('⚠️ البوت فصل'));
  }
  x.status='نشط';
 }catch{
  x.status='فشل ⚠️';
 }
 write(SERVERS,s);
 res.json({});
});

app.post('/api/stop/:id',auth,(req,res)=>{
 const bot=bots.get(req.params.id);
 if(bot) bot.disconnect();
 bots.delete(req.params.id);
 const s=read(SERVERS);
 const x=s.find(a=>a.id===req.params.id);
 if(x) x.status='متوقف';
 write(SERVERS,s);
 res.json({});
});

/* ===== تشغيل ===== */
app.listen(PORT,()=>console.log('🌍 شغال'));
