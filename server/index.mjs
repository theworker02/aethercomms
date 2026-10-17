import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT || 8787)
const STORE = process.env.DATA_FILE || path.resolve('.data', 'aethercomms.json')
const origins = new Set((process.env.APP_ORIGINS || 'http://localhost:5173').split(',').map(x => x.trim()))
const channels = [
  { id:'general', name:'General', description:'The community commons', count:0 },
  { id:'design', name:'Design', description:'Interfaces, ideas & feedback', count:0 },
  { id:'engineering', name:'Engineering', description:'Build in the open', count:0 },
  { id:'voice-lounge', name:'Voice lounge', description:'Start a conversation', count:0 },
]
fs.mkdirSync(path.dirname(STORE), {recursive:true})
let db = {users:[], sessions:[], messages:[]}
try {
  const parsed = JSON.parse(fs.readFileSync(STORE,'utf8'))
  if (Array.isArray(parsed.users) && Array.isArray(parsed.sessions) && Array.isArray(parsed.messages)) db = parsed
} catch (err) { if (err.code !== 'ENOENT') throw err }
function persist() {
  const temp = STORE + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(db))
  fs.renameSync(temp, STORE)
}
const sha = x => createHash('sha256').update(x).digest('hex')
const validHandle = x => typeof x === 'string' && /^[a-z][a-z0-9_-]{2,31}$/.test(x)
const validKey = k => k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string' && k.x.length >= 40 && k.y.length >= 40
const safe = x => typeof x === 'string' && x.length <= 5000
const scrub = user => ({handle:user.handle, publicKey:user.publicKey})
function passwordHash(password, salt) { return scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex') }
function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false
  const input = Buffer.from(passwordHash(password,user.salt),'hex')
  return timingSafeEqual(input,Buffer.from(user.passwordHash,'hex'))
}
function issueSession(handle) {
  const token = randomBytes(32).toString('hex')
  db.sessions = db.sessions.filter(s => s.expires > Date.now())
  db.sessions.push({handle, hash:sha(token), expires:Date.now()+7*86400000})
  persist()
  return token
}
function auth(token) {
  if (typeof token !== 'string') return null
  const session = db.sessions.find(s=>s.hash === sha(token) && s.expires > Date.now())
  return session ? db.users.find(u=>u.handle === session.handle) : null
}
function json(res,status,data,origin) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})})
  res.end(JSON.stringify(data))
}
async function body(req) {
  let raw=''
  for await (const chunk of req) {
    raw+=chunk
    if (raw.length > 16000) throw new Error('Request is too large')
  }
  return JSON.parse(raw || '{}')
}
function tokenFrom(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}
const attempts=new Map()
function rateLimit(ip) {
  const now=Date.now()
  const item=attempts.get(ip) || {start:now,count:0}
  if(now-item.start > 60000) {item.start=now;item.count=0}
  item.count++
  attempts.set(ip,item)
  return item.count <= 35
}
function messageFor(room,viewer) {
  if(room.startsWith('channel:')) return channels.some(c => 'channel:'+c.id === room)
  if(room.startsWith('dm:')) {
    const handles=room.slice(3).split(':')
    return handles.length === 2 && handles.includes(viewer) && handles.every(validHandle)
  }
  return false
}
const server=http.createServer(async (req,res)=>{
  const origin=req.headers.origin
  if(origin && !origins.has(origin)) return json(res,403,{error:'Origin is not permitted'})
  if(req.method === 'OPTIONS') {
    res.writeHead(204,{'Access-Control-Allow-Origin':origin || '','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'})
    return res.end()
  }
  const url = new URL(req.url || '/', 'http://localhost')
  if(req.method === 'GET' && url.pathname === '/api/health') return json(res,200,{status:'ok',version:'1.3.0'},origin)
  try {
    if(req.method === 'POST' && ['/api/signup','/api/login'].includes(url.pathname)) {
      if(!rateLimit(req.socket.remoteAddress || 'unknown')) return json(res,429,{error:'Too many attempts. Try again shortly.'},origin)
      const data=await body(req)
      const handle=typeof data.handle === 'string' ? data.handle.toLowerCase().trim() : ''
      if(!validHandle(handle)) return json(res,400,{error:'Handle must be 3–32 lowercase letters, numbers, hyphens or underscores, starting with a letter.'},origin)
      if(url.pathname === '/api/signup') {
        if(typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) return json(res,400,{error:'Use a password between 12 and 128 characters.'},origin)
        if(!validKey(data.publicKey)) return json(res,400,{error:'A supported identity key is required.'},origin)
        if(db.users.some(u=>u.handle === handle)) return json(res,409,{error:'That handle is already in use.'},origin)
        const salt=randomBytes(16).toString('hex')
        const user={handle,salt,passwordHash:passwordHash(data.password,salt),publicKey:data.publicKey,createdAt:Date.now()}
        db.users.push(user)
        const token=issueSession(handle)
        return json(res,201,{token,user:scrub(user)},origin)
      }
      const user=db.users.find(u=>u.handle === handle)
      if(!verifyPassword(user,data.password)) return json(res,401,{error:'Invalid handle or password.'},origin)
      const token=issueSession(handle)
      return json(res,200,{token,user:scrub(user)},origin)
    }
    const user=auth(tokenFrom(req))
    if(!user) return json(res,401,{error:'Sign in to continue'},origin)
    if(req.method==='GET' && url.pathname==='/api/me') return json(res,200,{user:scrub(user)},origin)
    if(req.method==='GET' && url.pathname==='/api/channels') return json(res,200,{channels},origin)
    if(req.method==='GET' && url.pathname==='/api/users') return json(res,200,{users:db.users.filter(u=>u.handle!==user.handle).map(scrub)},origin)
    if(req.method==='GET' && url.pathname==='/api/messages') {
      const room=url.searchParams.get('room') || ''
      if(!messageFor(room,user.handle)) return json(res,400,{error:'Invalid or unauthorized conversation'},origin)
      return json(res,200,{messages:db.messages.filter(m=>m.room===room).slice(-200)},origin)
    }
    return json(res,404,{error:'Not found'},origin)
  } catch(err) {
    return json(res,400,{error:err.message || 'Invalid request'},origin)
  }
})
const wss=new WebSocketServer({noServer:true,maxPayload:16000})
const connections=new Map()
const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))}
function sendTo(handle,data) {for(const ws of connections.get(handle)||[])send(ws,data)}
function presence() {
  const online=[...connections.keys()]
  for(const sockets of connections.values())for(const ws of sockets)send(ws,{type:'presence',online})
}
server.on('upgrade',(req,socket,head)=>{
  if(req.url !== '/socket' || (req.headers.origin && !origins.has(req.headers.origin))) {socket.destroy();return}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req))
})
wss.on('connection',ws=>{
  let user=null
  const timer=setTimeout(()=>{if(!user)ws.close(1008,'Authentication timeout')},7000)
  ws.on('message',raw=>{
    let item
    try {item=JSON.parse(raw.toString())} catch {return send(ws,{type:'error',error:'Malformed message'})}
    if(!user) {
      if(item.type!=='auth' || !(user=auth(item.token))) return ws.close(1008,'Sign in required')
      clearTimeout(timer)
      if(!connections.has(user.handle))connections.set(user.handle,new Set())
      connections.get(user.handle).add(ws)
      send(ws,{type:'ready',handle:user.handle})
      return presence()
    }
    if(item.type==='send') {
      let room,to=null
      if(item.channel && channels.some(c=>c.id===item.channel)) {
        room='channel:'+item.channel
        if(!safe(item.text) || !item.text.trim())return send(ws,{type:'error',error:'Invalid message'})
      } else if(validHandle(item.to) && item.to!==user.handle && db.users.some(u=>u.handle===item.to)) {
        to=item.to
        room='dm:'+ [user.handle,to].sort().join(':')
        if(!item.encrypted || typeof item.encrypted.iv !== 'string' || typeof item.encrypted.ciphertext !== 'string' || item.encrypted.iv.length>100 || item.encrypted.ciphertext.length>10000) {
          return send(ws,{type:'error',error:'Direct messages must be encrypted'})
        }
      } else return send(ws,{type:'error',error:'Unknown destination'})
      const message={id:randomBytes(12).toString('hex'),room,from:user.handle,...(to?{to,encrypted:item.encrypted}:{text:item.text.trim()}),at:Date.now()}
      db.messages.push(message)
      if(db.messages.length>40000)db.messages=db.messages.slice(-40000)
      persist()
      if(to) {sendTo(to,{type:'message',message});sendTo(user.handle,{type:'message',message})}
      else for(const sockets of connections.values())for(const target of sockets)send(target,{type:'message',message})
      return
    }
    if(item.type==='signal') {
      if(!validHandle(item.to) || !db.users.some(u=>u.handle===item.to))return
      const signal=item.signal
      if(!signal || !['offer','answer','ice','hangup'].includes(signal.type) || JSON.stringify(signal).length>12000)return
      return sendTo(item.to,{type:'signal',from:user.handle,signal})
    }
  })
  ws.on('close',()=> {
    clearTimeout(timer)
    if(user) {
      const sockets=connections.get(user.handle)
      sockets?.delete(ws)
      if(sockets?.size===0)connections.delete(user.handle)
      presence()
    }
  })
})
server.listen(PORT,'0.0.0.0',()=>console.log('AetherComms API listening on '+PORT))
