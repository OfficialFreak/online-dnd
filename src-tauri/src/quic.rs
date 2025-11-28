use ring::rand::{SecureRandom, SystemRandom};
use serde::Serialize;
use std::net::SocketAddr;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::time;

#[derive(Clone, Serialize)]
struct Coordinates {
    x: f32,
    y: f32,
}

#[derive(Clone, Serialize)]
struct MarkerCoordinates {
    x: f32,
    y: f32,
    marker_name: String,
}

#[repr(u8)]
enum MessageType {
    Heartbeat = 0,
    MousePosition = 1,
    MarkerPosition = 2,
    Login = 255,
}

#[derive(Debug)]
pub enum QuicCommand {
    SendMousePos { x: f32, y: f32 },
    SendMarkerPos { x: f32, y: f32, name: String },
}

fn backend_debug(app: &AppHandle, msg: String) {
    // Also print to stdout so you see it in your terminal immediately
    println!("[QUIC_DEBUG] {}", msg);
    let _ = app.emit("backend-debug", msg);
}

fn backend_error(app: &AppHandle, msg: String) {
    eprintln!("[QUIC_ERROR] {}", msg);
    let _ = app.emit("backend-error", msg);
}

pub fn start_quic_client(
    app: AppHandle,
    remote: SocketAddr,
    rx: mpsc::Receiver<QuicCommand>,
    auth_token: String,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_quic_loop(app.clone(), remote, rx, auth_token).await {
            backend_error(&app, format!("Critical QUIC error: {}", e));
        }
    });
}

async fn run_quic_loop(
    app: AppHandle,
    remote: SocketAddr,
    mut rx: mpsc::Receiver<QuicCommand>,
    auth_token: String,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Bind
    let bind_addr = match remote {
        SocketAddr::V4(_) => "0.0.0.0:0",
        SocketAddr::V6(_) => "[::]:0",
    };
    let socket = UdpSocket::bind(bind_addr).await?;
    backend_debug(
        &app,
        format!("Bound to local port: {}", socket.local_addr()?),
    );

    // 2. Configure
    let mut config = quiche::Config::new(quiche::PROTOCOL_VERSION)?;
    config.set_application_protos(&[b"dnd-online"])?;
    config.set_max_idle_timeout(5000);
    config.set_max_recv_udp_payload_size(1350);
    config.set_max_send_udp_payload_size(1350);
    config.set_initial_max_data(10_000_000);
    config.set_initial_max_streams_bidi(0);
    config.set_initial_max_streams_uni(0);
    config.set_disable_active_migration(true);
    config.enable_dgram(true, 50, 200);
    config.verify_peer(false);

    // 3. Connect
    let mut scid = [0; quiche::MAX_CONN_ID_LEN];
    SystemRandom::new().fill(&mut scid).unwrap();
    let scid = quiche::ConnectionId::from_ref(&scid);

    let local_addr = socket.local_addr()?;
    let mut conn = quiche::connect(None, &scid, local_addr, remote, &mut config)?;

    backend_debug(&app, format!("Starting handshake with {}...", remote));

    let mut buf = [0; 65535];
    let mut out = [0; 1350];

    // Initial Handshake Packet
    let (write, send_info) = conn.send(&mut out)?;
    socket.send_to(&out[..write], send_info.to).await?;

    let mut heartbeat_interval = time::interval(Duration::from_secs(3));

    // Track state to log when we actually connect
    let mut is_connected = false;

    loop {
        let timeout = conn.timeout();

        tokio::select! {
            _ = async {
                if let Some(t) = timeout {
                    time::sleep(t).await;
                } else {
                    std::future::pending::<()>().await;
                }
            } => {
                conn.on_timeout();
            }

            _ = heartbeat_interval.tick() => {
                if conn.is_established() {
                    // Log errors here to check if queue is full
                    if let Err(e) = conn.dgram_send(&[MessageType::Heartbeat as u8]) {
                        // Ignore Done (Queue full), but log others
                        if e != quiche::Error::Done {
                            backend_debug(&app, format!("Heartbeat queue failed: {:?}", e));
                        }
                    }
                }
            }

            cmd = rx.recv() => {
                if let Some(command) = cmd {
                    if conn.is_established() {
                        let res = match command {
                            QuicCommand::SendMousePos { x, y } => {
                                let mut data = Vec::with_capacity(9);
                                data.push(MessageType::MousePosition as u8);
                                data.extend_from_slice(&x.to_le_bytes());
                                data.extend_from_slice(&y.to_le_bytes());
                                conn.dgram_send(&data)
                            },
                            QuicCommand::SendMarkerPos { x, y, name } => {
                                let mut data = Vec::new();
                                data.push(MessageType::MarkerPosition as u8);
                                data.extend_from_slice(&x.to_le_bytes());
                                data.extend_from_slice(&y.to_le_bytes());
                                data.extend_from_slice(name.as_bytes());
                                conn.dgram_send(&data)
                            }
                        };

                        // CHECK FOR SEND ERRORS
                        if let Err(e) = res {
                            backend_error(&app, format!("dgram_send failed: {:?}", e));
                        }
                    } else {
                        // THIS IS LIKELY YOUR PROBLEM
                        backend_debug(&app, "Skipping send: Handshake not yet established".into());
                    }
                } else {
                    break;
                }
            }

            read_result = socket.recv_from(&mut buf) => {
                let (len, from) = read_result?;
                let pkt_buf = &mut buf[..len];
                let recv_info = quiche::RecvInfo { from, to: local_addr };

                match conn.recv(pkt_buf, recv_info) {
                    Ok(_) => {
                        // Check if connection just finished handshake
                        if !is_connected && conn.is_established() {
                            is_connected = true;
                            backend_debug(&app, "QUIC Handshake Complete! Connected.".into());

                            // --- SEND LOGIN PACKET ---
                            let mut login_data = Vec::new();
                            login_data.push(MessageType::Login as u8);
                            login_data.extend_from_slice(auth_token.as_bytes());

                            if let Err(e) = conn.dgram_send(&login_data) {
                                backend_error(&app, format!("Failed to queue Login: {:?}", e));
                            }
                        }

                        while let Ok(dgram_len) = conn.dgram_recv(&mut out) {
                            handle_datagram(&app, &out[..dgram_len]);
                        }
                    },
                    Err(e) => {
                        // Log handshake errors specifically
                        if !is_connected && e != quiche::Error::Done {
                             backend_debug(&app, format!("Handshake recv error: {:?}", e));
                        }
                    }
                }
            }
        }

        // FLUSH OUTGOING
        loop {
            match conn.send(&mut out) {
                Ok((write, send_info)) => {
                    socket.send_to(&out[..write], send_info.to).await?;
                }
                Err(quiche::Error::Done) => break,
                Err(e) => {
                    backend_error(&app, format!("QUIC Send Error: {:?}", e));
                    conn.close(false, 0x1, b"fail")?;
                    break;
                }
            }
        }

        if conn.is_closed() {
            backend_debug(
                &app,
                format!("Connection closed. Stats: {:?}", conn.stats()),
            );
            break;
        }
    }

    Ok(())
}

fn handle_datagram(app: &AppHandle, data: &[u8]) {
    if data.is_empty() {
        return;
    }

    match data[0] {
        x if x == MessageType::MousePosition as u8 && data.len() == 9 => {
            let x = f32::from_le_bytes(data[1..5].try_into().unwrap());
            let y = f32::from_le_bytes(data[5..9].try_into().unwrap());
            let _ = app.emit("mouse-position", Coordinates { x, y });
        }
        x if x == MessageType::MarkerPosition as u8 && data.len() >= 9 => {
            let x = f32::from_le_bytes(data[1..5].try_into().unwrap());
            let y = f32::from_le_bytes(data[5..9].try_into().unwrap());
            let marker_name = String::from_utf8_lossy(&data[9..]).to_string();
            let _ = app.emit("marker-position", MarkerCoordinates { x, y, marker_name });
        }
        _ => {}
    }
}
