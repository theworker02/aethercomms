export type Destination = { type: 'channel' | 'peer' | 'call'; id: string; uri: string }
const validName = /^[a-z0-9][a-z0-9_-]{1,31}$/
export function parseCommsUri(input: string): Destination {
  const text = input.trim().toLowerCase()
  if (text.length > 180 || !text.startsWith('comms://')) throw new Error('Use a comms:// address')
  const url = new URL(text)
  if (url.search || url.hash || url.username || url.password || url.port) throw new Error('Address options are not supported')
  const parts = url.pathname.split('/').filter(Boolean)
  const host = url.hostname === 'mesh' ? 'channel' : url.hostname
  if (!['channel','peer','call'].includes(host) || parts.length !== 1 || !validName.test(parts[0])) {
    throw new Error('Try comms://channel/general, comms://peer/alex, or comms://call/alex')
  }
  return { type: host as Destination['type'], id: parts[0], uri: 'comms://' + host + '/' + parts[0] }
}
