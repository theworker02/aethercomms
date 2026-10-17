const DB_NAME = 'aethercomms-identity'
type Identity = { privateKey: CryptoKey; publicKey: JsonWebKey }
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1)
    request.onupgradeneeded = () => request.result.createObjectStore('keys')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}
export async function localIdentity(): Promise<Identity> {
  const db = await openStore()
  const existing = await new Promise<CryptoKeyPair | undefined>((resolve,reject) => {
    const tx = db.transaction('keys','readonly')
    const request = tx.objectStore('keys').get('primary')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  let pair = existing
  if (!pair) {
    pair = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey'])
    await new Promise<void>((resolve,reject) => {
      const tx = db.transaction('keys','readwrite')
      tx.objectStore('keys').put(pair,'primary')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  const publicKey = await crypto.subtle.exportKey('jwk',pair.publicKey)
  db.close()
  return {privateKey:pair.privateKey,publicKey}
}
function b64(bytes: Uint8Array): string { return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')) }
function from64(s: string): Uint8Array { return Uint8Array.from(atob(s), x => x.charCodeAt(0)) }
async function sharedKey(privateKey: CryptoKey, publicKey: JsonWebKey): Promise<CryptoKey> {
  const remote = await crypto.subtle.importKey('jwk',publicKey,{name:'ECDH',namedCurve:'P-256'},false,[])
  return crypto.subtle.deriveKey({name:'ECDH',public:remote},privateKey,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
export async function seal(plain:string,identity:Identity,recipient:JsonWebKey):Promise<{iv:string;ciphertext:string}> {
  const iv=crypto.getRandomValues(new Uint8Array(12))
  const key=await sharedKey(identity.privateKey,recipient)
  const payload=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(plain))
  return {iv:b64(iv),ciphertext:b64(new Uint8Array(payload))}
}
export async function unseal(payload:{iv:string;ciphertext:string},identity:Identity,peer:JsonWebKey):Promise<string> {
  const key=await sharedKey(identity.privateKey,peer)
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(payload.iv) as BufferSource},key,from64(payload.ciphertext) as BufferSource)
  return new TextDecoder().decode(data)
}
export type LocalIdentity=Identity
