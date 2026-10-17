export type Profile = { handle: string; publicKey: JsonWebKey }
export type ChatMessage = { id: string; room: string; from: string; to?: string; text?: string; encrypted?: { iv:string; ciphertext:string }; at: number }
export type Member = {handle:string;publicKey:JsonWebKey}
const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export function baseUrl() { return apiBase }
export function wsUrl() {
  const url = new URL(apiBase || location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/socket'
  return url.href
}
export function sessionToken() { return localStorage.getItem('aethercomms-session') || '' }
export function storeSession(token:string) { localStorage.setItem('aethercomms-session',token) }
export async function request<T>(path:string,options:RequestInit={}):Promise<T> {
  const response=await fetch(apiBase + path,{...options,headers:{'Content-Type':'application/json',...(sessionToken()?{Authorization:'Bearer '+sessionToken()}:{}),...options.headers}})
  const data=await response.json().catch(()=>({error:'Unexpected server response'}))
  if(!response.ok) throw new Error(data.error || 'Request failed')
  return data as T
}
