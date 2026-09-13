import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from './outbound.js';

/**
 * The address classifier is the whole of the SSRF guard that can be tested without a
 * network, and it is the part worth pinning: every entry below is a range that has been
 * used to turn a "fetch this URL for me" feature into someone else's credentials.
 */
describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'the rest of 127/8'],
    ['10.0.0.1', 'RFC 1918 10/8'],
    ['172.16.0.1', 'RFC 1918 172.16/12, low end'],
    ['172.31.255.255', 'RFC 1918 172.16/12, high end'],
    ['192.168.1.1', 'RFC 1918 192.168/16'],
    ['169.254.1.1', 'link-local'],
    ['169.254.169.254', 'the cloud metadata address'],
    ['0.0.0.0', '"this network"'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'the IPv6 unspecified address'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique local'],
    ['fc00::1', 'IPv6 unique local, fc half'],
    ['ff02::1', 'IPv6 multicast'],
  ])('treats %s as private (%s)', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  /** A v4 address in v6 clothing; checking it as v6 would wave the loopback through. */
  it.each([['::ffff:127.0.0.1'], ['::ffff:169.254.169.254'], ['::ffff:10.0.0.1']])(
    'unwraps the v4-mapped address %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    },
  );

  it.each([
    ['1.1.1.1'],
    ['8.8.8.8'],
    ['172.32.0.1'], // just past the RFC 1918 block
    ['172.15.255.255'], // just before it
    ['100.128.0.1'], // just past the CGNAT block
    ['192.169.0.1'],
    ['2606:4700:4700::1111'],
    ['::ffff:1.1.1.1'],
  ])('allows the public address %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  /** Fails closed: an answer that is not an address at all is not one we can vouch for. */
  it.each([[''], ['not-an-address'], ['999.1.1.1'], ['localhost']])(
    'treats the unparseable value %j as private',
    (value) => {
      expect(isPrivateAddress(value)).toBe(true);
    },
  );
});
