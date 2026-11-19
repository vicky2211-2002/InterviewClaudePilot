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

/** Names that look like virtual/VPN/tunnel adapters — deprioritize them. */
const VIRTUAL_IFACE =
  /vEthernet|vethernet|virtual|vmware|virtualbox|docker|hyper[- ]?v|loopback|bluetooth|tap|tun|wireguard|tailscale|zerotier|hamachi|nordlynx|nordvpn|openvpn|anyconnect|globalprotect|fortinet|wsl/i;

/** Names that look like physical Wi-Fi/Ethernet adapters — prefer them. */
const PHYSICAL_IFACE =
  /wi[- ]?fi|wlan|wireless|eth(?:ernet)?|enp|wlp|en\d|local area connection|ethernet/i;

function ifaceScore(name: string): number {
  if (VIRTUAL_IFACE.test(name)) return -1000;
  if (PHYSICAL_IFACE.test(name)) return 100;
  return 0;
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
  // Physical adapters first, then private/home addresses, then virtual ones.
  out.sort((a, b) => {
    const s = ifaceScore(b.iface) - ifaceScore(a.iface);
    if (s !== 0) return s;
    return Number(b.private) - Number(a.private);
  });
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
