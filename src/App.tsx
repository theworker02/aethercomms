import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp, Copy, Hash, Headphones, LockKeyhole, LogOut, MessageCircle, Mic, MicOff, Phone, PhoneOff, Plus, RadioTower, Search, Send, Settings2, ShieldCheck, Sparkles, Users, Wifi, WifiOff, X } from 'lucide-react'
import { localIdentity, seal, unseal, type LocalIdentity } from './crypto'
import { parseCommsUri, type Destination } from './router'
import { request, sessionToken, storeSession, wsUrl, type ChatMessage, type Member, type Profile } from './api'

type Channel = { id: string; name: string; description: string }
type CallState = 'idle' | 'calling' | 'ringing' | 'connected'
type WsEvent = { type: string; online?: string[]; message?: ChatMessage; error?: string; from?: string; signal?: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }
const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const initialAddress = 'comms://channel/general'

function initials(handle: string) { return handle.slice(0, 2).toUpperCase() }
function stamp(at: number) { return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
function roomFor(route: Destination, current: string) { return route.type === 'channel' ? 'channel:' + route.id : 'dm:' + [current, route.id].sort().join(':') }
function sameKey(a: JsonWebKey, b: JsonWebKey) { return a.x === b.x && a.y === b.y && a.crv === b.crv }
function welcomeError(err: unknown) { return err instanceof Error ? err.message : 'Something went wrong. Please try again.' }

export default function App() {
  const [view, setView] = useState<Destination>(() => parseCommsUri(initialAddress))
  const [address, setAddress] = useState(initialAddress)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [account, setAccount] = useState<Profile | null>(null)
  const [identity, setIdentity] = useState<LocalIdentity | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [people, setPeople] = useState<Member[]>([])
  const [online, setOnline] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [showKeys, setShowKeys] = useState(false)
  const [callState, setCallState] = useState<CallState>('idle')
  const [callPeer, setCallPeer] = useState('')
  const [muted, setMuted] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [plainMessages, setPlainMessages] = useState<Record<string, string>>({})
  const ws = useRef<WebSocket | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const microphone = useRef<MediaStream | null>(null)
  const remoteAudio = useRef<HTMLAudioElement | null>(null)
  const incoming = useRef<{ from: string; sdp: RTCSessionDescriptionInit } | null>(null)
  const messageEnd = useRef<HTMLDivElement | null>(null)
  const currentRoom = account ? roomFor(view, account.handle) : ''
  const selectedPeer = people.find(p => p.handle === view.id)
  const isDM = view.type !== 'channel'
  const keyMismatch = !!(account && identity && !sameKey(account.publicKey, identity.publicKey))

  function go(uri: string) {
    try {
      const next = parseCommsUri(uri)
      setView(next); setAddress(next.uri); setError(''); setDraft(''); setMobileMenu(false)
      if (next.type === 'call') setNotice('Start a voice call using the phone button above.')
    } catch (err) { setError(welcomeError(err)) }
  }

  useEffect(() => {
    let active = true
    localIdentity().then(key => { if (active) setIdentity(key) }).catch(err => { if(active) setError('Identity storage unavailable: ' + welcomeError(err)) })
    if (!sessionToken()) { setSessionLoading(false); return () => { active = false } }
    request<{ user: Profile }>('/api/me').then(({user}) => { if(active) setAccount(user) }).catch(() => {
      if(active) { storeSession(''); setAccount(null) }
    }).finally(() => { if(active) setSessionLoading(false) })
    return () => { active = false }
  }, [])

  const signal = useCallback((to: string, signalBody: Record<string, unknown>) => {
    const s = ws.current
    if(s?.readyState === WebSocket.OPEN) s.send(JSON.stringify({ type:'signal', to, signal:signalBody }))
  }, [])

  const endCall = useCallback((tellPeer = true) => {
    if(tellPeer && callPeer) signal(callPeer, { type:'hangup' })
    pc.current?.close(); pc.current = null
    microphone.current?.getTracks().forEach(track => track.stop()); microphone.current = null
    if(remoteAudio.current) remoteAudio.current.srcObject = null
    incoming.current = null
    setCallState('idle'); setCallPeer(''); setMuted(false)
  }, [signal, callPeer])

  const ensureConnection = useCallback(async (peer: string) => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video:false })
    microphone.current = media
    const connection = new RTCPeerConnection({ iceServers })
    pc.current = connection
    media.getAudioTracks().forEach(track => connection.addTrack(track, media))
    connection.ontrack = event => { if(remoteAudio.current) remoteAudio.current.srcObject = event.streams[0] }
    connection.onicecandidate = event => { if(event.candidate) signal(peer, {type:'ice', candidate:event.candidate.toJSON()}) }
    connection.onconnectionstatechange = () => {
      if(connection.connectionState === 'connected') setCallState('connected')
      if(['failed','closed','disconnected'].includes(connection.connectionState)) setNotice('Call connection ended. Some networks require a TURN relay.')
    }
    return connection
  }, [signal])

  const startCall = useCallback(async (peer: string) => {
    if(!peer || !online.includes(peer)) { setError('That person is not online.'); return }
    if(!connected) { setError('Realtime connection is unavailable.'); return }
    try {
      setError(''); setCallPeer(peer); setCallState('calling')
      const connection = await ensureConnection(peer)
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      signal(peer, { type:'offer', sdp:connection.localDescription })
    } catch(err) { setError('Could not start audio: ' + welcomeError(err)); endCall(false) }
  }, [connected, endCall, ensureConnection, online, signal])

  const acceptCall = useCallback(async () => {
    const pending = incoming.current
    if(!pending) return
    try {
      setError(''); setCallState('calling')
      const connection = await ensureConnection(pending.from)
      await connection.setRemoteDescription(pending.sdp)
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      signal(pending.from, { type:'answer', sdp:connection.localDescription })
      incoming.current = null
    } catch(err) { setError('Unable to answer call: ' + welcomeError(err)); endCall(false) }
  }, [ensureConnection, signal, endCall])

  useEffect(() => {
    if(!account) return
    let active = true
    Promise.all([
      request<{ channels: Channel[] }>('/api/channels'),
      request<{ users: Member[] }>('/api/users')
    ]).then(([a,b])=> { if(active) { setChannels(a.channels); setPeople(b.users) } }).catch(err => { if(active) setError('Could not load workspace: '+welcomeError(err)) })
    const socket = new WebSocket(wsUrl())
    ws.current = socket
    socket.onopen = () => socket.send(JSON.stringify({ type:'auth', token:sessionToken() }))
    socket.onmessage = async event => {
      let data: WsEvent
      try { data = JSON.parse(String(event.data)) } catch { return }
      if(data.type === 'ready') setConnected(true)
      if(data.type === 'presence') setOnline(data.online || [])
      if(data.type === 'error' && data.error) setError(data.error)
      if(data.type === 'message' && data.message) setMessages(previous => previous.some(x=>x.id===data.message!.id) ? previous : [...previous, data.message!])
      if(data.type === 'signal' && data.from && data.signal) {
        const peer = data.from
        const incomingSignal = data.signal
        try {
          if(incomingSignal.type === 'offer' && incomingSignal.sdp) {
            incoming.current = { from:peer, sdp:incomingSignal.sdp }
            setCallPeer(peer); setCallState('ringing')
            go('comms://peer/' + peer)
          } else if(incomingSignal.type === 'answer' && incomingSignal.sdp && pc.current) {
            await pc.current.setRemoteDescription(incomingSignal.sdp)
          } else if(incomingSignal.type === 'ice' && incomingSignal.candidate && pc.current) {
            await pc.current.addIceCandidate(incomingSignal.candidate)
          } else if(incomingSignal.type === 'hangup') {
            pc.current?.close(); pc.current=null
            microphone.current?.getTracks().forEach(t=>t.stop()); microphone.current=null
            setCallState('idle'); setCallPeer(''); setNotice('The other person ended the call.')
          }
        } catch(err) { setNotice('Call signaling issue: '+welcomeError(err)) }
      }
    }
    socket.onclose = () => { if(active) setConnected(false) }
    socket.onerror = () => { if(active) setError('Cannot connect to the live messaging server.') }
    return () => {
      active = false; socket.close(); if(ws.current === socket) ws.current = null
      pc.current?.close(); microphone.current?.getTracks().forEach(t=>t.stop())
    }
  // Account changes intentionally restart the socket.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.handle])

  useEffect(() => {
    if(!account) return
    let active = true
    setMessages([])
    setPlainMessages({})
    request<{messages:ChatMessage[]}>('/api/messages?room='+encodeURIComponent(currentRoom))
      .then(({messages:history})=> { if(active) setMessages(history) })
      .catch(err => { if(active) setError(welcomeError(err)) })
    return ()=>{active=false}
  }, [account, currentRoom])

  useEffect(() => {
    if(!account || !identity || keyMismatch || !isDM) return
    const peer = selectedPeer
    if(!peer && view.id !== account.handle) return
    let disposed = false
    for(const message of messages) {
      if(!message.encrypted || plainMessages[message.id]) continue
      const theirKey = message.from === account.handle ? peer?.publicKey : (people.find(p=>p.handle===message.from)?.publicKey)
      if(!theirKey) continue
      unseal(message.encrypted, identity, theirKey)
        .then(text=> { if(!disposed) setPlainMessages(prev=>({...prev,[message.id]:text})) })
        .catch(()=> { if(!disposed) setPlainMessages(prev=>({...prev,[message.id]:'[Unable to decrypt on this device]' })) })
    }
    return ()=>{disposed=true}
  }, [account, identity, isDM, keyMismatch, messages, people, plainMessages, selectedPeer, view.id])

  useEffect(() => { messageEnd.current?.scrollIntoView({block:'end',behavior:'smooth'}) }, [messages, plainMessages, currentRoom])

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!identity) { setError('Identity is initializing.'); return }
    setBusy(true); setError('')
    try {
      const result = await request<{token:string;user:Profile}>(authMode === 'signup' ? '/api/signup' : '/api/login', {
        method:'POST', body:JSON.stringify({ handle:handle.trim().toLowerCase(), password, ...(authMode==='signup'?{publicKey:identity.publicKey}:{}) })
      })
      storeSession(result.token); setAccount(result.user); setPassword('')
      setNotice('Welcome to AetherComms.')
    } catch(err) { setError(welcomeError(err)) }
    finally { setBusy(false) }
  }

  async function dispatch(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if(!text || !account || !connected) return
    if(isDM && (!identity || !selectedPeer || keyMismatch)) { setError('This browser cannot encrypt for the selected peer.'); return }
    try {
      const payload = isDM
        ? {type:'send',to:view.id,encrypted:await seal(text,identity!,selectedPeer!.publicKey)}
        : {type:'send',channel:view.id,text}
      ws.current?.send(JSON.stringify(payload))
      setDraft('')
    } catch(err) { setError('Message not sent: '+welcomeError(err)) }
  }

  function logout() {
    endCall(false); ws.current?.close(); storeSession('')
    setAccount(null); setMessages([]); setPeople([]); setOnline([]); setConnected(false); setError(''); setNotice('')
  }
  async function copyAddress() {
    await navigator.clipboard.writeText(view.uri)
    setNotice('Address copied to clipboard.')
  }
  const visibleChannels = channels.filter(c=>[c.id,c.name].some(x=>x.toLowerCase().includes(search.toLowerCase())))
  const visiblePeople = people.filter(p=>p.handle.toLowerCase().includes(search.toLowerCase()))
  const heading = view.type === 'channel' ? channels.find(c=>c.id===view.id)?.name || view.id : view.id
  const description = view.type === 'channel' ? channels.find(c=>c.id===view.id)?.description || 'Community conversation' : 'Private direct conversation'
  const messageDisabled = !connected || !account || (isDM && (keyMismatch || !selectedPeer))
  const visibleMessages = messages.filter(m=>m.room===currentRoom)

  return (
    <div className="app-shell">
      <audio ref={remoteAudio} autoPlay playsInline />
      <header className="topbar">
        <div className="brandmark" aria-label="AetherComms"><img src="/logo.svg" alt="" /><strong>AETHER<span>COMMS</span></strong><span className="version">1.3</span></div>
        <form className="address-shell" onSubmit={event=>{event.preventDefault();go(address)}}>
          <span className="address-protocol"><ShieldCheck size={15} /></span>
          <input aria-label="Communications address" value={address} onChange={event=>setAddress(event.target.value)} spellCheck={false} placeholder="comms://channel/general" />
          <button type="submit" className="small-icon" aria-label="Navigate"><ArrowRight size={17}/></button>
        </form>
        <div className="top-actions">
          <span className={'connection-pill '+(connected?'ready':'offline')}>{connected?<Wifi size={14}/>:<WifiOff size={14}/>}<span>{connected?'Live connection':'Disconnected'}</span></span>
          <button className="icon-button key-action" type="button" onClick={()=>setShowKeys(true)} title="Identity inspector"><ShieldCheck size={18}/></button>
          {account && <button className="avatar profile" type="button" onClick={()=>setShowKeys(true)} title={'Signed in as '+account.handle}>{initials(account.handle)}</button>}
        </div>
      </header>

      {(!account || sessionLoading) ? (
        <main className="auth-layout">
          <div className="auth-story">
            <span className="eyebrow"><Sparkles size={15}/> A NEW KIND OF DESTINATION</span>
            <h1>Connection has<br/><em>a new address.</em></h1>
            <p>Conversations, communities, and voice, all in one place. Navigate people—not pages.</p>
            <div className="product-features"><span><MessageCircle size={18}/> Instant messaging</span><span><Headphones size={18}/> Voice calling</span><span><LockKeyhole size={18}/> Encrypted direct messages</span></div>
            <div className="sample-address"><span className="indicator"/><code>comms://channel/your-people</code><ArrowRight size={16}/></div>
          </div>
          <section className="auth-card">
            <div className="auth-symbol"><img src="/logo.svg" alt="" /></div>
            <div className="eyebrow">AETHERCOMMS NETWORK</div>
            <h2>{sessionLoading?'Connecting…': authMode==='signup'?'Create your identity':'Welcome back'}</h2>
            <p className="muted">Your gateway to a better way to communicate.</p>
            <form onSubmit={authenticate}>
              <label>YOUR HANDLE<input required minLength={3} maxLength={32} autoComplete="username" value={handle} placeholder="e.g. alex" onChange={e=>setHandle(e.target.value)} /></label>
              <label>PASSWORD<input required minLength={12} autoComplete={authMode==='signup'?'new-password':'current-password'} type="password" value={password} placeholder="At least 12 characters" onChange={e=>setPassword(e.target.value)} /></label>
              {error && <div className="error-banner" role="alert">{error}</div>}
              <button disabled={busy || !identity || sessionLoading} type="submit" className="primary full">{busy?'Connecting…':authMode==='signup'?'Create account':'Sign in'} <ArrowRight size={17}/></button>
            </form>
            <p className="auth-switch">{authMode==='signup'?'Already have an account?':'New to AetherComms?'} <button onClick={()=>{setAuthMode(authMode==='signup'?'login':'signup');setError('')}}>{authMode==='signup'?'Sign in':'Create an account'}</button></p>
            <p className="auth-footnote"><LockKeyhole size={13}/> Your encryption identity stays on this device.</p>
          </section>
        </main>
      ) : (
        <main className="workspace">
          <aside className={'sidebar '+(mobileMenu?'expanded':'')}>
            <div className="space-header"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>Communications</h2></div><button className="icon-button" title="Open general channel" onClick={()=>go(initialAddress)}><Plus size={18}/></button></div>
            <div className="searchbox"><Search size={17}/><input aria-label="Search conversations" placeholder="Find channels or people" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌘ K</kbd></div>
            <div className="sidebar-scroll">
              <div className="group-title"><span>CHANNELS</span><Hash size={15}/></div>
              <nav aria-label="Channels">{visibleChannels.map(channel=> <button key={channel.id} className={'nav-item '+(view.type==='channel'&&view.id===channel.id?'active':'')} onClick={()=>go('comms://channel/'+channel.id)}><span className="nav-icon"><Hash size={17}/></span><span className="nav-label">{channel.name}</span>{view.type==='channel'&&view.id===channel.id&&<span className="active-dot"/>}</button>)}</nav>
              <div className="group-title member-heading"><span>DIRECT MESSAGES</span><Users size={15}/></div>
              <nav aria-label="Direct messages">{visiblePeople.length===0&&<p className="empty-note">No other members yet. Invite a friend!</p>}{visiblePeople.map(person=><button key={person.handle} className={'nav-item '+(isDM&&view.id===person.handle?'active':'')} onClick={()=>go('comms://peer/'+person.handle)}><span className="avatar mini">{initials(person.handle)}<span className={'presence-dot '+(online.includes(person.handle)?'online':'')}/></span><span className="nav-label">{person.handle}</span>{online.includes(person.handle) && <span className="online-label">online</span>}</button>)}</nav>
            </div>
            <div className="sidebar-bottom"><div className="self-avatar avatar">{initials(account.handle)}</div><div className="self-summary"><strong>{account.handle}</strong><span><span className={'tiny-dot '+(connected?'green':'')}/>{connected?'Connected':'Offline'}</span></div><button className="icon-button" title="Log out" onClick={logout}><LogOut size={18}/></button></div>
          </aside>

          <section className="conversation">
            <div className="conversation-header"><button className="icon-button mobile-toggle" aria-label="Toggle channel menu" onClick={()=>setMobileMenu(!mobileMenu)}><ChevronDown size={19}/></button><div className="conversation-icon">{isDM?<MessageCircle size={22}/>:<Hash size={22}/>}</div><div className="conversation-heading"><div className="heading-row"><h2>{heading}</h2>{isDM&&<span className={'tiny-dot '+(online.includes(view.id)?'green':'')}/>}</div><span>{description}</span></div><div className="conversation-actions"><button className="icon-button" title="Copy communications address" onClick={copyAddress}><Copy size={18}/></button>{isDM&&<button className="icon-button call-button" title="Start voice call" onClick={()=>startCall(view.id)} disabled={callState!=='idle'}><Phone size={18}/></button>}</div></div>
            {(error || notice || keyMismatch) && <div className={'system-notice '+(error||keyMismatch?'bad':'')} role="status"><span>{error|| (keyMismatch?'This account belongs to a different encryption key. Existing direct messages may be unreadable on this browser.':notice)}</span><button title="Dismiss" onClick={()=>{setError('');setNotice('')}}><X size={14}/></button></div>}
            {callState !== 'idle' && <div className="call-strip"><div className="call-pulse"><AudioLines size={20}/></div><div><strong>{callState==='ringing'?'Incoming call from '+callPeer:callState==='connected'?'In voice call with '+callPeer:'Connecting to '+callPeer}</strong><span>Browser-to-browser encrypted audio</span></div><div className="call-controls">{callState==='ringing' ? <button className="primary" onClick={acceptCall}><Phone size={16}/> Answer</button> : <button className="icon-button" onClick={()=>{microphone.current?.getAudioTracks().forEach(t=>{t.enabled=muted});setMuted(!muted)}} title={muted?'Unmute microphone':'Mute microphone'}>{muted?<MicOff size={18}/>:<Mic size={18}/>}</button>}<button className="danger-round" onClick={()=>endCall()} title="End call"><PhoneOff size={17}/></button></div></div>}
            <div className="chat-scroll">
              <div className="channel-intro"><div className="intro-badge">{isDM?<MessageCircle size={28}/>:<Hash size={28}/>}</div><span className="eyebrow">{isDM?'PRIVATE CONVERSATION':'COMMUNITY CHANNEL'}</span><h1>{isDM?'You and '+heading:'# '+heading}</h1><p>{isDM?'Messages here are encrypted in your browser for the recipient. Verify identity keys independently for sensitive communication.':'This is the beginning of '+heading+'. Channel messages are visible to members and stored on the server.'}</p><code>{view.uri}</code></div>
              <div className="chat-messages">{visibleMessages.map(message=><div className="chat-message" key={message.id}><div className={'avatar message-avatar '+(message.from===account.handle?'mine':'')}>{initials(message.from)}</div><div className="message-body"><div className="message-meta"><strong>{message.from}</strong><time dateTime={new Date(message.at).toISOString()}>{stamp(message.at)}</time>{message.encrypted&&<LockKeyhole size={13} title="Encrypted payload"/>}</div><p>{message.encrypted?(plainMessages[message.id] || 'Decrypting…'):message.text}</p></div></div>)}</div>
              <div ref={messageEnd}/>
            </div>
            <div className="compose-shell"><form onSubmit={dispatch} className="compose-form"><div className="compose-content"><label className="sr-only" htmlFor="message-draft">Message</label><input id="message-draft" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={messageDisabled?'Connect to the server to send messages':'Message '+(isDM?'@':'#')+heading} disabled={messageDisabled} maxLength={isDM?4000:5000}/></div><button className="send-button" disabled={!draft.trim()||messageDisabled} type="submit" aria-label="Send message"><Send size={18}/></button></form><div className="compose-meta"><span>{isDM?<><LockKeyhole size={13}/> Browser-encrypted direct message</>:<><Hash size={13}/> Community messages are not E2EE</>}</span><span>ENTER TO SEND</span></div></div>
          </section>

          <aside className="details-panel"><div className="details-top"><span className="eyebrow">CHANNEL INTELLIGENCE</span><div className="details-card visual"><div className="orbital-logo"><img src="/logo.svg" alt="" /></div><strong>AetherComms Network</strong><span>YOUR CONNECTION SPACE</span><div className="signal-line"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div></div><div className="details-section"><h3>Connection details</h3><div className="detail-row"><span>TRANSPORT</span><strong>WebSocket</strong></div><div className="detail-row"><span>STATUS</span><strong className={connected?'success':'muted'}>{connected?'Connected':'Offline'}</strong></div><div className="detail-row"><span>ONLINE MEMBERS</span><strong>{online.length}</strong></div><div className="detail-row"><span>MESSAGE MODE</span><strong>{isDM?'AES-GCM':'Community'}</strong></div></div><div className="details-section details-tip"><ShieldCheck size={20}/><h3>Communicate with clarity.</h3><p>Direct messages use device-local encryption keys. Community channels are not end-to-end encrypted.</p></div><div className="details-footer"><span className="tiny-dot green"/> AETHERCOMMS <span>v1.3.0</span></div></aside>
        </main>
      )}

      {showKeys && <div className="modal-backdrop" onClick={()=>setShowKeys(false)}><section className="modal" role="dialog" aria-modal="true" aria-label="Encryption identity" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>Identity inspector</h2><button className="icon-button" onClick={()=>setShowKeys(false)} title="Close"><X size={19}/></button></div><div className="modal-badge"><ShieldCheck size={24}/></div><h3>Your cryptographic identity</h3><p>Your P-256 keypair lives in this browser. The private key is non-extractable.</p><label>PUBLIC KEY (JWK)<textarea readOnly rows={8} value={JSON.stringify(identity?.publicKey || {},null,2)}/></label>{keyMismatch&&<div className="error-banner">Your local key does not match the key registered to this account. Encrypted DMs will be disabled.</div>}<button className="primary full" onClick={()=>{setShowKeys(false);setNotice('Identity inspector closed.')}}>Done <Check size={17}/></button></section></div>}
      <footer className="statusbar"><span><span className={'tiny-dot '+(connected?'green':'')}/> {connected?'ENCRYPTED TRANSPORT READY':'SERVER DISCONNECTED'}</span><span>AETHERCOMMS / COMMUNICATION BROWSER</span><span>BUILD 1.3.0 <span className="footer-divider">/</span> NETWORK</span></footer>
    </div>
  )
}
