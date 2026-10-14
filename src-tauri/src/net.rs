//! Какой IP показать в QR-коде. У ПК часто несколько адаптеров (Hyper-V, WSL, VPN),
//! нужен тот, через который ПК видит домашнюю сеть.

use std::net::{IpAddr, Ipv4Addr, UdpSocket};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Addr {
    pub ip: String,
    pub name: String,
    /// Адаптер, через который идёт маршрут по умолчанию.
    pub primary: bool,
}

const VIRTUAL: &[&str] = &[
    "vethernet", "virtualbox", "vmware", "hyper-v", "wsl", "loopback", "docker", "vbox", "npcap",
];

/// VPN и туннели: телефон в домашней сети до них не достучится, даже если через них идёт маршрут.
const TUNNEL: &[&str] = &[
    "tun", "tap", "vpn", "wireguard", "wg", "tailscale", "zerotier", "openvpn", "nord", "proton", "hamachi",
];

fn looks_like_tunnel(name: &str) -> bool {
    let lname = name.to_lowercase();
    lname.split(|c: char| !c.is_alphanumeric()).any(|w| TUNNEL.contains(&w))
        || ["wireguard", "tailscale", "zerotier", "openvpn", "vpn"].iter().any(|t| lname.contains(t))
}

fn is_private(ip: Ipv4Addr) -> bool {
    ip.is_private() || (ip.octets()[0] == 100 && (64..128).contains(&ip.octets()[1]))
}

/// IP маршрута по умолчанию. UDP connect не шлёт пакетов, только выбирает интерфейс.
pub fn primary_ip() -> Option<Ipv4Addr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:9").ok()?;
    match sock.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

pub fn addresses() -> Vec<Addr> {
    let primary = primary_ip();
    let mut out: Vec<Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| match iface.ip() {
            IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_link_local() && is_private(ip) => {
                let lname = iface.name.to_lowercase();
                if VIRTUAL.iter().any(|v| lname.contains(v)) {
                    return None;
                }
                Some(Addr { ip: ip.to_string(), name: iface.name.clone(), primary: Some(ip) == primary })
            }
            _ => None,
        })
        .collect();
    // Туннели в конец; затем основной маршрут; затем домашние диапазоны 192.168 → 10 → 172 → прочие
    let rank = |a: &Addr| -> u8 {
        if looks_like_tunnel(&a.name) {
            9
        } else if a.primary {
            0
        } else if a.ip.starts_with("192.168.") {
            1
        } else if a.ip.starts_with("10.") {
            2
        } else if a.ip.starts_with("172.") {
            3
        } else {
            4
        }
    };
    out.sort_by_key(rank);
    out.dedup_by(|a, b| a.ip == b.ip);
    out
}

/// Адаптеры, сеть которых Windows считает «Общедоступной»: брандмауэр закроет для них порт.
#[cfg(windows)]
pub fn public_networks() -> Vec<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' } | ForEach-Object { $_.InterfaceAlias }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
        .unwrap_or_default()
}

#[cfg(not(windows))]
pub fn public_networks() -> Vec<String> {
    vec![]
}

#[cfg(test)]
mod tests {
    use super::looks_like_tunnel;

    #[test]
    fn tunnels() {
        assert!(looks_like_tunnel("MantaRay Tun"));
        assert!(looks_like_tunnel("WireGuard Tunnel"));
        assert!(looks_like_tunnel("Tailscale"));
        assert!(!looks_like_tunnel("Ethernet"));
        assert!(!looks_like_tunnel("Wi-Fi"));
        assert!(!looks_like_tunnel("Беспроводная сеть"));
    }
}
