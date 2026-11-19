// Small helpers shared by the LAN bridge: PIN generation, LAN address
// discovery and QR payload building. No Electron imports, so this file is
// safe to unit test and to import from the coach web page.

import * as os from 'os';
import { BRIDGE_PORT_DEFAULT } from '@shared/bridge';

export function generatePin(): string {
  // 6 digits, no leading-zero weirdness in the UI.
  const n = 100000 + Math.floor(Math.random() * 900000);
  return String(n);
}

export interface LanAddress {
  address: string;
  iface: string;
  /** 192.168.x.x / 10.x.x.x — the ones phones on home Wi-Fi can reach. */
  private: boolean;
}

/** All non-internal IPv4 addresses of this machine, most useful first. */
export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  const nets = os.networkInterfaces();
  for (const [iface, list] of Object.entries(nets)) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      out.push({
        address: info.address,
        iface,
        private:
          /^192\.168\./.test(info.address) ||
          /^10\./.test(info.address) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(info.address),
      });
    }
  }
  // Private/home addresses first, then virtual adapters (Hyper-V, Docker…).
  out.sort((a, b) => Number(b.private) - Number(a.private));
  return out;
}

export function buildUrls(port: number): { urls: string[]; primaryUrl: string | null } {
  const list = lanAddresses();
  const urls = list.map((a) => `http://${a.address}:${port}/`);
  return { urls, primaryUrl: urls[0] ?? null };
}

export function defaultPort(): number {
  return BRIDGE_PORT_DEFAULT;
}
