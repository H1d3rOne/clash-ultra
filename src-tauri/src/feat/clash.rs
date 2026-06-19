use crate::{
    config::Config,
    core::{CoreManager, handle, tray},
    feat::clean_async,
    process::AsyncHandler,
    utils,
};
use anyhow::{Context as _, bail};
use bytes::BytesMut;
use clash_ultra_logging::{Type, logging};
use futures::{StreamExt as _, stream};
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_yaml_ng::{Mapping, Value};
use smartstring::alias::String;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::Instant;

#[allow(clippy::expect_used)]
static TLS_CONFIG: Lazy<Arc<rustls::ClientConfig>> = Lazy::new(|| {
    let root_store = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("Failed to set TLS versions")
        .with_root_certificates(root_store)
        .with_no_client_auth();
    Arc::new(config)
});

static PROXY_SPEED_TEST_LOCK: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));
const TEST_PROXY_PREFIX: &str = "__ultra_test_proxy_";
const SPEED_TEST_LISTENER_PREFIX: &str = "__ultra_speed_test_";
const DELAY_TEST_LISTENER_PREFIX: &str = "__ultra_delay_test_";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySpeedTestResult {
    pub bytes: u64,
    pub elapsed_ms: u64,
    pub speed_bps: f64,
    pub source_url: String,
    pub fallback_index: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySpeedTestBatchItem {
    pub proxy_name: String,
    pub result: Option<ProxySpeedTestResult>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
struct SpeedTestListener {
    proxy_name: String,
    listener_name: String,
    port: u16,
    target_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyDelayTestResult {
    pub delay: u32,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyDelayTestBatchItem {
    pub proxy_name: String,
    pub result: Option<ProxyDelayTestResult>,
    pub error: Option<String>,
}

/// Restart the Clash core
pub async fn restart_clash_core() {
    match CoreManager::global().restart_core().await {
        Ok(_) => {
            handle::Handle::refresh_clash();
            handle::Handle::notice_message("set_config::ok", "ok");
        }
        Err(err) => {
            handle::Handle::notice_message("set_config::error", format!("{err}"));
            logging!(error, Type::Core, "{err}");
        }
    }
}

/// Restart the application
pub async fn restart_app() {
    logging!(debug, Type::System, "启动重启应用流程");
    // 设置退出标志
    handle::Handle::global().set_is_exiting();

    utils::server::shutdown_embedded_server();
    Config::apply_all_and_save_file().await;

    logging!(info, Type::System, "开始异步清理资源");
    let cleanup_result = clean_async().await;

    logging!(
        info,
        Type::System,
        "资源清理完成，退出代码: {}",
        if cleanup_result { 0 } else { 1 }
    );

    let app_handle = handle::Handle::app_handle();
    app_handle.restart();
}

fn after_change_clash_mode() {
    AsyncHandler::spawn(move || async {
        let mihomo = handle::Handle::mihomo().await;
        match mihomo.get_connections().await {
            Ok(connections) => {
                if let Some(connections_array) = connections.connections {
                    for connection in connections_array {
                        let _ = mihomo.close_connection(&connection.id).await;
                    }
                    drop(mihomo);
                }
            }
            Err(err) => {
                logging!(error, Type::Core, "Failed to get connections: {err}");
            }
        }
    });
}

async fn should_force_rule_mode_for_port_proxy() -> bool {
    let verge = Config::app_config().await.latest_arc();
    !verge.enable_system_proxy.unwrap_or(false)
        && !verge.enable_tun_mode.unwrap_or(false)
        && verge
            .port_proxies
            .as_ref()
            .is_some_and(|items| items.iter().any(|item| item.enabled.unwrap_or(false)))
}

/// Change Clash mode (rule/global/direct/script)
pub async fn change_clash_mode(mut mode: String) {
    if mode != "rule" && should_force_rule_mode_for_port_proxy().await {
        logging!(
            info,
            Type::Core,
            "port proxy mode is active; force clash mode from {mode} to rule"
        );
        mode = "rule".into();
    }

    let mut mapping = Mapping::new();
    mapping.insert(Value::from("mode"), Value::from(mode.as_str()));
    // Convert YAML mapping to JSON Value
    let json_value = serde_json::json!({
        "mode": mode
    });
    logging!(debug, Type::Core, "change clash mode to {mode}");
    match handle::Handle::mihomo().await.patch_base_config(&json_value).await {
        Ok(_) => {
            // 更新订阅
            let clash = Config::clash().await;
            clash.edit_draft(|d| d.patch_config(&mapping));
            clash.apply();

            // 分离数据获取和异步调用
            let clash_data = clash.data_arc();
            if clash_data.save_config().await.is_ok() {
                handle::Handle::refresh_clash();
                tray::Tray::global().update_menu_and_icon().await;
            }

            let is_auto_close_connection = Config::app_config()
                .await
                .data_arc()
                .auto_close_connection
                .unwrap_or(false);
            if is_auto_close_connection {
                after_change_clash_mode();
            }
        }
        Err(err) => logging!(error, Type::Core, "{err}"),
    }
}

/// Test delay to a URL through proxy.
/// HTTPS: measures TLS handshake time. HTTP: measures HEAD round-trip time.
pub async fn test_delay(url: String) -> anyhow::Result<u32> {
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
    use tokio::net::TcpStream;
    use tokio::time::Instant;

    let parsed = tauri::Url::parse(&url)?;
    let is_https = parsed.scheme() == "https";
    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("Invalid URL: no host"))?
        .to_string();
    let port = parsed.port().unwrap_or(if is_https { 443 } else { 80 });

    let verge = Config::app_config().await.latest_arc();
    let proxy_enabled = verge.enable_system_proxy.unwrap_or(false) || verge.enable_tun_mode.unwrap_or(false);
    let proxy_port = if proxy_enabled {
        Some(match verge.verge_mixed_port {
            Some(p) => p,
            None => Config::clash().await.data_arc().get_mixed_port(),
        })
    } else {
        None
    };

    tokio::time::timeout(Duration::from_secs(10), async {
        let start = Instant::now();
        let mut buf = BytesMut::with_capacity(1024);

        if is_https {
            let stream = match proxy_port {
                Some(pp) => {
                    let mut s = TcpStream::connect(format!("127.0.0.1:{pp}")).await?;
                    s.write_all(format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n").as_bytes())
                        .await?;
                    s.read_buf(&mut buf).await?;
                    if !buf.windows(3).any(|w| w == b"200") {
                        return Err(anyhow::anyhow!("Proxy CONNECT failed"));
                    }
                    s
                }
                None => TcpStream::connect(format!("{host}:{port}")).await?,
            };
            let connector = tokio_rustls::TlsConnector::from(Arc::clone(&TLS_CONFIG));
            let server_name = rustls::pki_types::ServerName::try_from(host.as_str())
                .map_err(|_| anyhow::anyhow!("Invalid DNS name: {host}"))?
                .to_owned();
            connector.connect(server_name, stream).await?;
        } else {
            let (mut stream, req) = match proxy_port {
                Some(pp) => (
                    TcpStream::connect(format!("127.0.0.1:{pp}")).await?,
                    format!("HEAD {url} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"),
                ),
                None => (
                    TcpStream::connect(format!("{host}:{port}")).await?,
                    format!("HEAD / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"),
                ),
            };
            stream.write_all(req.as_bytes()).await?;
            let _ = stream.read(&mut buf).await?;
        }

        // frontend treats 0 as timeout
        Ok((start.elapsed().as_millis() as u32).max(1))
    })
    .await
    .unwrap_or(Ok(10000u32))
}

/// Test proxy download speed by creating a temporary local mixed listener
/// that points directly to the specified proxy node.
pub async fn test_proxy_speed(
    proxy_name: String,
    url: Option<String>,
    timeout: Option<u64>,
    max_bytes: Option<u64>,
    profile_uid: Option<String>,
) -> anyhow::Result<ProxySpeedTestResult> {
    let mut items =
        test_proxy_speed_batch(vec![proxy_name.clone()], url, timeout, max_bytes, Some(1), profile_uid).await?;
    let item = items
        .pop()
        .ok_or_else(|| anyhow::anyhow!("speed test returned no result for {proxy_name}"))?;

    match item.result {
        Some(result) => Ok(result),
        None => bail!(
            item.error
                .unwrap_or_else(|| format!("speed test failed for {proxy_name}").into())
        ),
    }
}

/// Test multiple proxies in one runtime-config session. This avoids repeatedly
/// reloading mihomo while concurrent speed tests are still downloading.
pub async fn test_proxy_speed_batch(
    proxy_names: Vec<String>,
    url: Option<String>,
    timeout: Option<u64>,
    max_bytes: Option<u64>,
    concurrency: Option<usize>,
    profile_uid: Option<String>,
) -> anyhow::Result<Vec<ProxySpeedTestBatchItem>> {
    let _guard = PROXY_SPEED_TEST_LOCK.lock().await;
    let timeout = Duration::from_millis(timeout.unwrap_or(15_000).clamp(3_000, 120_000));
    let max_bytes = max_bytes
        .unwrap_or(20 * 1024 * 1024)
        .clamp(256 * 1024, 200 * 1024 * 1024);
    let actual_concurrency = concurrency.unwrap_or(1).clamp(1, 10);
    let speed_test_urls = resolve_speed_test_urls(url).await;
    let proxy_names = dedup_proxy_names(proxy_names);

    if proxy_names.is_empty() {
        return Ok(Vec::new());
    }

    let mut listeners = Vec::with_capacity(proxy_names.len());
    for proxy_name in proxy_names {
        listeners.push(SpeedTestListener {
            proxy_name,
            listener_name: format!("{SPEED_TEST_LISTENER_PREFIX}{}", nanoid::nanoid!(8)).into(),
            port: get_free_local_port().await?,
            target_name: String::new(),
        });
    }

    let (active_listeners, mut results) = add_test_listeners(&listeners, profile_uid.as_deref()).await?;

    let mut download_results = stream::iter(active_listeners.clone())
        .map(|listener| {
            let urls = speed_test_urls.clone();
            async move {
                let proxy_name = listener.proxy_name.clone();
                match run_proxy_speed_download_with_fallback(listener.port, &urls, timeout, max_bytes).await {
                    Ok(result) => {
                        logging!(
                            info,
                            Type::Core,
                            "Proxy speed test success: proxy={}, port={}, bytes={}, elapsed={}ms, speed={:.2} B/s, url={}",
                            proxy_name,
                            listener.port,
                            result.bytes,
                            result.elapsed_ms,
                            result.speed_bps,
                            result.source_url
                        );
                        ProxySpeedTestBatchItem {
                            proxy_name: listener.proxy_name,
                            result: Some(result),
                            error: None,
                        }
                    }
                    Err(err) => {
                        let error = err.to_string();
                        logging!(
                            warn,
                            Type::Core,
                            "Proxy speed test failed: proxy={}, port={}, error={}",
                            proxy_name,
                            listener.port,
                            error
                        );
                        ProxySpeedTestBatchItem {
                            proxy_name: listener.proxy_name,
                            result: None,
                            error: Some(error.into()),
                        }
                    }
                }
            }
        })
        .buffer_unordered(actual_concurrency)
        .collect::<Vec<_>>()
        .await;
    results.append(&mut download_results);

    if let Err(err) = remove_test_listeners(
        &active_listeners
            .iter()
            .map(|listener| listener.listener_name.clone())
            .collect::<Vec<_>>(),
    )
    .await
    {
        logging!(warn, Type::Core, "Failed to cleanup speed test listeners: {err}");
    }

    Ok(results)
}

pub async fn test_proxy_delay(
    proxy_name: String,
    url: Option<String>,
    timeout: Option<u64>,
    profile_uid: Option<String>,
) -> anyhow::Result<ProxyDelayTestResult> {
    let mut items = test_proxy_delay_batch(vec![proxy_name.clone()], url, timeout, Some(1), profile_uid).await?;
    let item = items
        .pop()
        .ok_or_else(|| anyhow::anyhow!("delay test returned no result for {proxy_name}"))?;

    match item.result {
        Some(result) => Ok(result),
        None => bail!(
            item.error
                .unwrap_or_else(|| format!("delay test failed for {proxy_name}").into())
        ),
    }
}

pub async fn test_proxy_delay_batch(
    proxy_names: Vec<String>,
    url: Option<String>,
    timeout: Option<u64>,
    concurrency: Option<usize>,
    profile_uid: Option<String>,
) -> anyhow::Result<Vec<ProxyDelayTestBatchItem>> {
    let _guard = PROXY_SPEED_TEST_LOCK.lock().await;
    let timeout = Duration::from_millis(timeout.unwrap_or(10_000).clamp(1_000, 120_000));
    let actual_concurrency = concurrency.unwrap_or(10).clamp(1, 10);
    let test_url = url
        .filter(|item| !item.trim().is_empty())
        .unwrap_or_else(|| "http://cp.cloudflare.com/generate_204".into());
    let proxy_names = dedup_proxy_names(proxy_names);

    if proxy_names.is_empty() {
        return Ok(Vec::new());
    }

    let mut listeners = Vec::with_capacity(proxy_names.len());
    for proxy_name in proxy_names {
        listeners.push(SpeedTestListener {
            proxy_name,
            listener_name: format!("{DELAY_TEST_LISTENER_PREFIX}{}", nanoid::nanoid!(8)).into(),
            port: get_free_local_port().await?,
            target_name: String::new(),
        });
    }

    let (active_listeners, setup_results) = add_test_listeners(&listeners, profile_uid.as_deref()).await?;

    let mut results = setup_results
        .into_iter()
        .map(|item| ProxyDelayTestBatchItem {
            proxy_name: item.proxy_name,
            result: None,
            error: item.error,
        })
        .collect::<Vec<_>>();

    let mut delay_results = stream::iter(active_listeners.clone())
        .map(|listener| {
            let test_url = test_url.clone();
            async move {
                let proxy_name = listener.proxy_name.clone();
                match run_proxy_delay_request(listener.port, &test_url, timeout).await {
                    Ok(result) => {
                        logging!(
                            info,
                            Type::Core,
                            "Proxy delay test success: proxy={}, target={}, port={}, delay={}ms, url={}",
                            proxy_name,
                            listener.target_name,
                            listener.port,
                            result.delay,
                            test_url
                        );
                        ProxyDelayTestBatchItem {
                            proxy_name: listener.proxy_name,
                            result: Some(result),
                            error: None,
                        }
                    }
                    Err(err) => {
                        let error = err.to_string();
                        logging!(
                            warn,
                            Type::Core,
                            "Proxy delay test failed: proxy={}, target={}, port={}, error={}",
                            proxy_name,
                            listener.target_name,
                            listener.port,
                            error
                        );
                        ProxyDelayTestBatchItem {
                            proxy_name: listener.proxy_name,
                            result: None,
                            error: Some(error.into()),
                        }
                    }
                }
            }
        })
        .buffer_unordered(actual_concurrency)
        .collect::<Vec<_>>()
        .await;
    results.append(&mut delay_results);

    if let Err(err) = remove_test_listeners(
        &active_listeners
            .iter()
            .map(|listener| listener.listener_name.clone())
            .collect::<Vec<_>>(),
    )
    .await
    {
        logging!(warn, Type::Core, "Failed to cleanup delay test listeners: {err}");
    }

    Ok(results)
}

async fn resolve_speed_test_urls(url: Option<String>) -> Vec<String> {
    if let Some(url) = url
        && !url.trim().is_empty()
    {
        return normalize_speed_test_urls(&url);
    }

    let configured = Config::app_config()
        .await
        .latest_arc()
        .default_speed_test
        .clone()
        .unwrap_or_default();
    let mut urls = normalize_speed_test_urls(&configured);
    urls.extend(DEFAULT_SPEED_TEST_URLS.iter().map(|item| (*item).into()));
    dedup_speed_test_urls(urls)
}

const DEFAULT_SPEED_TEST_URLS: &[&str] = &[
    "https://speed.cloudflare.com/__down?bytes=50000000",
    "https://cachefly.cachefly.net/20mb.test",
    "https://proof.ovh.net/files/10Mb.dat",
];

fn normalize_speed_test_urls(input: &str) -> Vec<String> {
    input
        .split(['\n', '\r', ',', ';'])
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(Into::into)
        .collect()
}

fn dedup_speed_test_urls(urls: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    urls.into_iter().filter(|url| seen.insert(url.clone())).collect()
}

fn dedup_proxy_names(names: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    names
        .into_iter()
        .map(|name| name.trim().into())
        .filter(|name: &String| !name.is_empty() && seen.insert(name.clone()))
        .collect()
}

async fn get_free_local_port() -> anyhow::Result<u16> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

async fn add_test_listeners(
    listeners_to_add: &[SpeedTestListener],
    profile_uid: Option<&str>,
) -> anyhow::Result<(Vec<SpeedTestListener>, Vec<ProxySpeedTestBatchItem>)> {
    let mut active_listeners = Vec::new();
    let mut results = Vec::new();
    let runtime_proxy_names = get_runtime_proxy_names().await;
    let profile_mapping = match profile_uid {
        Some(uid) => match read_profile_mapping_by_uid(uid).await {
            Ok(mapping) => Some(mapping),
            Err(err) => {
                logging!(
                    warn,
                    Type::Core,
                    "Failed to read profile mapping for proxy test, uid={uid}: {err}"
                );
                None
            }
        },
        None => None,
    };

    {
        let runtime = Config::runtime().await;
        runtime.edit_draft(|draft| -> anyhow::Result<()> {
            let config = draft.config.as_mut().context("runtime config is not ready")?;
            let profile_items = profile_mapping.as_ref().map(ProfileTestItems::from_mapping);
            let mut temp_name_map = HashMap::new();

            {
                let listeners = config
                    .entry("listeners".into())
                    .or_insert_with(|| Value::Sequence(Vec::new()))
                    .as_sequence_mut()
                    .context("runtime listeners is not a sequence")?;
                retain_test_listeners(listeners);
            }
            retain_temp_test_items(config);

            for item in listeners_to_add {
                let profile_target = profile_items.as_ref().and_then(|items| {
                    add_profile_test_target(config, items, &item.proxy_name, &mut temp_name_map, &mut HashSet::new())
                });
                let target_name = profile_target.unwrap_or_else(|| item.proxy_name.clone());

                let exists_in_config = runtime_proxy_exists(config, &target_name);
                let exists_in_runtime = runtime_proxy_names.contains(target_name.as_str());
                if !exists_in_config && !exists_in_runtime {
                    results.push(ProxySpeedTestBatchItem {
                        proxy_name: item.proxy_name.clone(),
                        result: None,
                        error: Some(format!("未找到可测速节点: {}", item.proxy_name).into()),
                    });
                    continue;
                }

                let listeners = config
                    .entry("listeners".into())
                    .or_insert_with(|| Value::Sequence(Vec::new()))
                    .as_sequence_mut()
                    .context("runtime listeners is not a sequence")?;
                let mut listener = Mapping::new();
                listener.insert("name".into(), item.listener_name.as_str().into());
                listener.insert("type".into(), "mixed".into());
                listener.insert("listen".into(), "127.0.0.1".into());
                listener.insert("port".into(), item.port.into());
                listener.insert("udp".into(), false.into());
                listener.insert("proxy".into(), target_name.as_str().into());
                listeners.push(Value::Mapping(listener));
                let mut active = item.clone();
                active.target_name = target_name;
                active_listeners.push(active);
            }
            Ok(())
        })?;
    }

    apply_runtime_draft().await?;
    Ok((active_listeners, results))
}

async fn get_runtime_proxy_names() -> HashSet<String> {
    match handle::Handle::mihomo().await.get_proxies().await {
        Ok(proxies) => proxies.proxies.into_keys().map(Into::into).collect::<HashSet<String>>(),
        Err(err) => {
            logging!(
                warn,
                Type::Core,
                "Failed to read runtime proxy names before test listener setup: {err}"
            );
            HashSet::new()
        }
    }
}

async fn read_profile_mapping_by_uid(uid: &str) -> anyhow::Result<Mapping> {
    let file = {
        let profiles = Config::profiles().await;
        let profiles_arc = profiles.latest_arc();
        let uid: String = uid.into();
        let item = profiles_arc.get_item(&uid)?;
        item.file
            .clone()
            .ok_or_else(|| anyhow::anyhow!("profile file is empty: {uid}"))?
    };
    let path = utils::dirs::app_profiles_dir()?.join(file.as_str());
    utils::help::read_mapping(&path).await
}

#[derive(Debug, Clone)]
struct ProfileTestItems {
    proxies: HashMap<String, Mapping>,
    groups: HashMap<String, Mapping>,
}

impl ProfileTestItems {
    fn from_mapping(mapping: &Mapping) -> Self {
        Self {
            proxies: collect_named_mappings(mapping, "proxies"),
            groups: collect_named_mappings(mapping, "proxy-groups"),
        }
    }
}

fn collect_named_mappings(source: &Mapping, key: &str) -> HashMap<String, Mapping> {
    let Some(items) = source.get(key).and_then(|value| value.as_sequence()) else {
        return HashMap::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let mapping = item.as_mapping()?.clone();
            let name = mapping.get("name")?.as_str()?.to_owned();
            Some((String::from(name), mapping))
        })
        .collect()
}

fn add_profile_test_target(
    config: &mut Mapping,
    profile_items: &ProfileTestItems,
    raw_name: &str,
    name_map: &mut HashMap<String, String>,
    visiting: &mut HashSet<String>,
) -> Option<String> {
    if matches!(raw_name, "DIRECT" | "REJECT" | "REJECT-DROP" | "PASS" | "COMPATIBLE") {
        return Some(raw_name.into());
    }
    if let Some(mapped) = name_map.get(raw_name) {
        return Some(mapped.clone());
    }
    if !visiting.insert(raw_name.into()) {
        return None;
    }

    let result = if let Some(source) = profile_items.proxies.get(raw_name) {
        let temp_name: String = format!("{TEST_PROXY_PREFIX}{}", nanoid::nanoid!(10)).into();
        name_map.insert(raw_name.into(), temp_name.clone());
        let mut mapping = source.clone();
        mapping.insert("name".into(), temp_name.as_str().into());
        rewrite_single_proxy_ref(config, profile_items, &mut mapping, "dialer-proxy", name_map, visiting);
        push_named_mapping(config, "proxies", mapping);
        Some(temp_name)
    } else if let Some(source) = profile_items.groups.get(raw_name) {
        let temp_name: String = format!("{TEST_PROXY_PREFIX}{}", nanoid::nanoid!(10)).into();
        name_map.insert(raw_name.into(), temp_name.clone());
        let mut mapping = source.clone();
        mapping.insert("name".into(), temp_name.as_str().into());
        rewrite_proxy_ref_sequence(config, profile_items, &mut mapping, "proxies", name_map, visiting);
        rewrite_proxy_ref_sequence(config, profile_items, &mut mapping, "all", name_map, visiting);
        rewrite_proxy_ref_sequence(config, profile_items, &mut mapping, "use", name_map, visiting);
        rewrite_single_proxy_ref(config, profile_items, &mut mapping, "now", name_map, visiting);
        push_named_mapping(config, "proxy-groups", mapping);
        Some(temp_name)
    } else {
        None
    };

    visiting.remove(raw_name);
    result
}

fn rewrite_single_proxy_ref(
    config: &mut Mapping,
    profile_items: &ProfileTestItems,
    mapping: &mut Mapping,
    key: &str,
    name_map: &mut HashMap<String, String>,
    visiting: &mut HashSet<String>,
) {
    let Some(name) = mapping.get(key).and_then(|value| value.as_str()).map(String::from) else {
        return;
    };
    if let Some(mapped_name) = add_profile_test_target(config, profile_items, &name, name_map, visiting) {
        mapping.insert(key.into(), mapped_name.as_str().into());
    }
}

fn rewrite_proxy_ref_sequence(
    config: &mut Mapping,
    profile_items: &ProfileTestItems,
    mapping: &mut Mapping,
    key: &str,
    name_map: &mut HashMap<String, String>,
    visiting: &mut HashSet<String>,
) {
    let Some(items) = mapping.get_mut(key).and_then(|value| value.as_sequence_mut()) else {
        return;
    };

    for item in items {
        if let Some(name) = item.as_str().map(String::from) {
            if let Some(mapped_name) = add_profile_test_target(config, profile_items, &name, name_map, visiting) {
                *item = mapped_name.as_str().into();
            }
            continue;
        }

        if let Some(mapping) = item.as_mapping_mut()
            && let Some(name) = mapping.get("name").and_then(|value| value.as_str()).map(String::from)
            && let Some(mapped_name) = add_profile_test_target(config, profile_items, &name, name_map, visiting)
        {
            mapping.insert("name".into(), mapped_name.as_str().into());
        }
    }
}

fn push_named_mapping(config: &mut Mapping, key: &str, mapping: Mapping) {
    let value = config.entry(key.into()).or_insert_with(|| Value::Sequence(Vec::new()));
    if let Some(items) = value.as_sequence_mut() {
        items.push(Value::Mapping(mapping));
    }
}

async fn remove_test_listeners(listener_names: &[String]) -> anyhow::Result<()> {
    {
        let runtime = Config::runtime().await;
        runtime.edit_draft(|draft| {
            let Some(config) = draft.config.as_mut() else {
                return;
            };
            if let Some(listeners) = config.get_mut("listeners").and_then(|value| value.as_sequence_mut()) {
                retain_listener_by_names(listeners, listener_names);
            }
            retain_temp_test_items(config);
        });
    }

    apply_runtime_draft().await
}

async fn apply_runtime_draft() -> anyhow::Result<()> {
    match CoreManager::global().update_runtime_config(|_| {}).await {
        Ok(outcome) if outcome.is_valid() => Ok(()),
        Ok(outcome) => bail!("{outcome}"),
        Err(err) => Err(err),
    }
}

fn retain_listener_by_names(listeners: &mut Vec<Value>, listener_names: &[String]) {
    let names = listener_names
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();
    listeners.retain(|item| {
        item.as_mapping()
            .and_then(|mapping| mapping.get("name"))
            .and_then(|name| name.as_str())
            .is_none_or(|name| !names.contains(name))
    });
}

fn retain_test_listeners(listeners: &mut Vec<Value>) {
    listeners.retain(|item| {
        item.as_mapping()
            .and_then(|mapping| mapping.get("name"))
            .and_then(|name| name.as_str())
            .is_none_or(|name| {
                !name.starts_with(SPEED_TEST_LISTENER_PREFIX) && !name.starts_with(DELAY_TEST_LISTENER_PREFIX)
            })
    });
}

fn retain_temp_test_items(config: &mut Mapping) {
    retain_named_items_by_prefix(config, "proxies", TEST_PROXY_PREFIX);
    retain_named_items_by_prefix(config, "proxy-groups", TEST_PROXY_PREFIX);
}

fn retain_named_items_by_prefix(config: &mut Mapping, key: &str, prefix: &str) {
    let Some(items) = config.get_mut(key).and_then(|value| value.as_sequence_mut()) else {
        return;
    };

    items.retain(|item| {
        item.as_mapping()
            .and_then(|mapping| mapping.get("name"))
            .and_then(|name| name.as_str())
            .is_none_or(|name| !name.starts_with(prefix))
    });
}

fn runtime_proxy_exists(config: &Mapping, proxy_name: &str) -> bool {
    matches!(proxy_name, "DIRECT" | "REJECT" | "REJECT-DROP" | "PASS" | "COMPATIBLE")
        || sequence_has_name(config, "proxies", proxy_name)
        || sequence_has_name(config, "proxy-groups", proxy_name)
}

fn sequence_has_name(config: &Mapping, key: &str, proxy_name: &str) -> bool {
    config
        .get(key)
        .and_then(|value| value.as_sequence())
        .is_some_and(|items| {
            items.iter().any(|item| {
                item.as_mapping()
                    .and_then(|mapping| mapping.get("name"))
                    .and_then(|name| name.as_str())
                    == Some(proxy_name)
            })
        })
}

async fn run_proxy_speed_download(
    port: u16,
    url: &str,
    timeout: Duration,
    max_bytes: u64,
) -> anyhow::Result<ProxySpeedTestResult> {
    let proxy = reqwest::Proxy::all(format!("http://127.0.0.1:{port}"))?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .connect_timeout(Duration::from_secs(10))
        // Speed test only needs raw byte count. Disable transparent decoding so
        // broken/mismatched Content-Encoding headers from speed-test mirrors or
        // intermediate proxies do not turn the whole test into
        // "error decoding response body".
        .no_gzip()
        .no_brotli()
        .no_zstd()
        .no_deflate()
        .build()?;

    let request = client
        .get(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .header(reqwest::header::USER_AGENT, "Clash-Ultra-Speed-Test/1.0")
        .send();
    let mut response = tokio::time::timeout(timeout, request)
        .await
        .with_context(|| format!("speed test request timed out after {}ms: {url}", timeout.as_millis()))?
        .with_context(|| format!("failed to request speed test url: {url}"))?;

    if !response.status().is_success() {
        bail!("speed test url returned status {}", response.status());
    }

    let start = Instant::now();
    let mut downloaded = 0u64;
    while downloaded < max_bytes {
        let Some(remaining) = timeout.checked_sub(start.elapsed()) else {
            break;
        };
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining, response.chunk()).await {
            Ok(Ok(Some(chunk))) => {
                downloaded = downloaded.saturating_add(chunk.len() as u64);
            }
            Ok(Ok(None)) => break,
            Ok(Err(err)) => {
                if downloaded > 0 {
                    logging!(
                        warn,
                        Type::Core,
                        "Proxy speed test stream interrupted after {} bytes from {}: {}",
                        downloaded,
                        url,
                        err
                    );
                    break;
                }
                return Err(err).with_context(|| format!("failed to read speed test response body: {url}"));
            }
            Err(_) => break,
        }
    }

    let elapsed = start.elapsed();
    let elapsed_ms = elapsed.as_millis().max(1) as u64;
    if downloaded == 0 {
        bail!(
            "speed test downloaded 0 bytes before timeout {}ms from {}",
            timeout.as_millis(),
            url
        );
    }

    Ok(ProxySpeedTestResult {
        bytes: downloaded,
        elapsed_ms,
        speed_bps: downloaded as f64 / elapsed.as_secs_f64().max(0.001),
        source_url: url.into(),
        fallback_index: 0,
    })
}

async fn run_proxy_delay_request(port: u16, url: &str, timeout: Duration) -> anyhow::Result<ProxyDelayTestResult> {
    let proxy = reqwest::Proxy::all(format!("http://127.0.0.1:{port}"))?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .connect_timeout(std::cmp::min(timeout, Duration::from_secs(10)))
        .redirect(reqwest::redirect::Policy::none())
        .no_gzip()
        .no_brotli()
        .no_zstd()
        .no_deflate()
        .build()?;

    let start = Instant::now();
    let head = client
        .head(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .header(reqwest::header::USER_AGENT, "Clash-Ultra-Delay-Test/1.0")
        .send();

    match tokio::time::timeout(timeout, head).await {
        Ok(Ok(response)) if response.status().as_u16() < 500 => {
            let elapsed_ms = start.elapsed().as_millis().max(1) as u64;
            return Ok(ProxyDelayTestResult {
                delay: elapsed_ms.min(u32::MAX as u64) as u32,
                elapsed_ms,
            });
        }
        Ok(Ok(response)) => {
            logging!(
                debug,
                Type::Core,
                "Proxy delay HEAD returned status {}, fallback to GET: {}",
                response.status(),
                url
            );
        }
        Ok(Err(err)) => {
            logging!(
                debug,
                Type::Core,
                "Proxy delay HEAD failed, fallback to GET: {} => {}",
                url,
                err
            );
        }
        Err(_) => bail!("delay test timed out after {}ms: {url}", timeout.as_millis()),
    }

    let get = client
        .get(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .header(reqwest::header::RANGE, "bytes=0-0")
        .header(reqwest::header::USER_AGENT, "Clash-Ultra-Delay-Test/1.0")
        .send();
    let response = tokio::time::timeout(timeout, get)
        .await
        .with_context(|| format!("delay test timed out after {}ms: {url}", timeout.as_millis()))?
        .with_context(|| format!("failed to request delay test url: {url}"))?;

    if response.status().as_u16() >= 500 {
        bail!("delay test url returned status {}", response.status());
    }

    let elapsed_ms = start.elapsed().as_millis().max(1) as u64;
    Ok(ProxyDelayTestResult {
        delay: elapsed_ms.min(u32::MAX as u64) as u32,
        elapsed_ms,
    })
}

async fn run_proxy_speed_download_with_fallback(
    port: u16,
    urls: &[String],
    timeout: Duration,
    max_bytes: u64,
) -> anyhow::Result<ProxySpeedTestResult> {
    let mut errors = Vec::new();

    for (index, url) in urls.iter().enumerate() {
        match run_proxy_speed_download(port, url, timeout, max_bytes).await {
            Ok(mut result) => {
                result.fallback_index = index;
                return Ok(result);
            }
            Err(err) => {
                errors.push(format!("[{}] {} => {}", index + 1, url, err));
            }
        }
    }

    bail!("all speed test urls failed: {}", errors.join(" | "))
}
