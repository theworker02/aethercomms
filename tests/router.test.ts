import { describe, it, expect } from 'vitest'
import { parseCommsUri } from '../src/router'
describe('comms address router', () => {
  it('navigates channels and legacy mesh routes', () => {
    expect(parseCommsUri('comms://mesh/general').uri).toBe('comms://channel/general')
    expect(parseCommsUri('comms://channel/design').id).toBe('design')
  })
  it('navigates direct message and voice peers', () => {
    expect(parseCommsUri('comms://peer/alex').type).toBe('peer')
    expect(parseCommsUri('comms://call/alex').type).toBe('call')
  })
  it('rejects URL credentials and unsupported destinations', () => {
    expect(() => parseCommsUri('comms://peer/a')).toThrow()
    expect(() => parseCommsUri('comms://rf/915.0mhz')).toThrow()
    expect(() => parseCommsUri('comms://peer/alex?private=1')).toThrow()
  })
})
