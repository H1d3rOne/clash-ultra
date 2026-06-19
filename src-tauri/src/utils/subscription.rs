use anyhow::{Context as _, Result, bail};
use base64::{Engine as _, engine::general_purpose};
use regex::Regex;
use serde_json::{Map, Value, json};
use serde_yaml_ng::{Mapping, Sequence, Value as YamlValue};
use std::collections::{HashMap, HashSet};
use tauri::Url;

type JsonMap = Map<String, Value>;

pub fn normalize_remote_profile_data(data: &str) -> Result<String> {
    normalize_remote_profile_data_with_template(data, None)
}

pub fn normalize_remote_profile_data_with_template(data: &str, template: Option<&str>) -> Result<String> {
    let data = data.trim_start_matches('\u{feff}').trim();
    if let Ok(mut yaml) = serde_yaml_ng::from_str::<Mapping>(data)
        && is_clash_yaml_mapping(&yaml)
    {
        ensure_default_rule_template_with_template(&mut yaml, template);
        return serde_yaml_ng::to_string(&yaml).context("failed to serialize normalized Clash/Mihomo YAML");
    }

    let proxies = parse_subscription_proxies(data)?;
    if proxies.is_empty() {
        bail!("profile data is neither Clash/Mihomo YAML nor supported node subscription");
    }

    build_clash_yaml_with_template(proxies, template)
}

fn is_clash_yaml_mapping(yaml: &Mapping) -> bool {
    yaml.contains_key("proxies") || yaml.contains_key("proxy-providers")
}

pub const DEFAULT_RULE_GROUP_NAME: &str = "节点选择";
pub const DEFAULT_RULE_TEMPLATE_PLACEHOLDER_PROXIES: &str = "__ALL_PROXIES__";
pub const DEFAULT_RULE_TEMPLATE_PLACEHOLDER_PROXY_PROVIDERS: &str = "__ALL_PROXY_PROVIDERS__";

pub const DEFAULT_RULE_TEMPLATE: &str = r"proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
rules:
  - MATCH,节点选择
";

/// Ensure a profile without rules still has a minimal, deterministic rule
/// template:
///
/// - one manual `select` group named `节点选择` when nodes/providers exist;
/// - one fallback rule `MATCH,节点选择`;
/// - or `MATCH,DIRECT` when the profile has no outbound source at all.
///
/// This is used for remote/local profiles that only provide nodes and no rules,
/// so system proxy, TUN, port listeners and other entries all get a valid rule
/// path instead of direct node binding.
pub fn ensure_default_rule_template(config: &mut Mapping) {
    ensure_default_rule_template_with_template(config, None);
}

pub fn ensure_default_rule_template_with_template(config: &mut Mapping, template: Option<&str>) {
    let has_rules = config
        .get("rules")
        .and_then(YamlValue::as_sequence)
        .is_some_and(|rules| !rules.is_empty());
    if has_rules {
        return;
    }

    if !has_outbound_source(config) {
        apply_builtin_default_rule_template(config);
        return;
    }

    let template = template
        .map(str::trim)
        .filter(|template| !template.is_empty())
        .unwrap_or(DEFAULT_RULE_TEMPLATE);

    if apply_default_rule_template(config, template).is_ok() {
        return;
    }

    apply_builtin_default_rule_template(config);
}

fn apply_builtin_default_rule_template(config: &mut Mapping) {
    let target = ensure_default_select_group(config).unwrap_or_else(|| "DIRECT".into());
    let mut rules = Sequence::new();
    rules.push(YamlValue::String(format!("MATCH,{target}")));
    config.insert(YamlValue::String("rules".into()), YamlValue::Sequence(rules));
}

fn apply_default_rule_template(config: &mut Mapping, template: &str) -> Result<()> {
    let mut template = serde_yaml_ng::from_str::<Mapping>(template).context("default rule template is invalid yaml")?;
    normalize_default_rule_template_mapping(&mut template);
    expand_default_rule_template(config, &mut template);
    merge_default_rule_template(config, template);
    Ok(())
}

fn normalize_default_rule_template_mapping(template: &mut Mapping) {
    if let Some(groups) = template.get_mut("proxy-groups").and_then(YamlValue::as_sequence_mut) {
        for group in groups {
            let Some(group) = group.as_mapping_mut() else {
                continue;
            };
            let is_default_proxy_group = group.get("name").and_then(YamlValue::as_str) == Some(DEFAULT_RULE_GROUP_NAME);
            if !is_default_proxy_group {
                continue;
            }

            if let Some(proxies) = group.get_mut("proxies").and_then(YamlValue::as_sequence_mut) {
                proxies.retain(|proxy| proxy.as_str() != Some("DIRECT"));
            }
        }
    }

    if let Some(providers) = template.get_mut("rule-providers").and_then(YamlValue::as_mapping_mut) {
        for provider in providers.values_mut() {
            let Some(provider) = provider.as_mapping_mut() else {
                continue;
            };
            let url = provider
                .get("url")
                .and_then(YamlValue::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            let format = provider
                .get("format")
                .and_then(YamlValue::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();

            if format == "text" && url.contains("loyalsoldier/clash-rules") {
                provider.insert(YamlValue::String("format".into()), YamlValue::String("yaml".into()));
            }
        }
    }

    if let Some(rules) = template.get_mut("rules").and_then(YamlValue::as_sequence_mut) {
        for rule in rules {
            let Some(rule_text) = rule.as_str() else {
                continue;
            };
            let parts = rule_text
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>();
            if parts
                .first()
                .is_some_and(|rule_type| rule_type.eq_ignore_ascii_case("GEOIP"))
                && parts.len() == 3
            {
                *rule = YamlValue::String(format!("{rule_text},no-resolve"));
            }
        }
    }
}

fn expand_default_rule_template(config: &Mapping, template: &mut Mapping) {
    let proxy_names = collect_yaml_named_sequence(config, "proxies");
    let provider_names = collect_yaml_mapping_keys(config, "proxy-providers");

    if let Some(groups) = template.get_mut("proxy-groups").and_then(YamlValue::as_sequence_mut) {
        for group in groups {
            let Some(group) = group.as_mapping_mut() else {
                continue;
            };
            expand_template_string_sequence(
                group,
                "proxies",
                DEFAULT_RULE_TEMPLATE_PLACEHOLDER_PROXIES,
                &proxy_names,
            );
            expand_template_string_sequence(
                group,
                "use",
                DEFAULT_RULE_TEMPLATE_PLACEHOLDER_PROXY_PROVIDERS,
                &provider_names,
            );
        }
    }
}

fn expand_template_string_sequence(mapping: &mut Mapping, key: &str, placeholder: &str, values: &[String]) {
    let key = YamlValue::String(key.into());
    let Some(items) = mapping.get_mut(&key).and_then(YamlValue::as_sequence_mut) else {
        return;
    };

    let mut expanded = Sequence::new();
    for item in items.iter() {
        if item.as_str() == Some(placeholder) {
            for value in values {
                expanded.push(YamlValue::String(value.clone()));
            }
        } else {
            expanded.push(item.clone());
        }
    }

    expanded.retain(|item| item.as_str().is_none_or(|item| item != placeholder));
    if expanded.is_empty() {
        mapping.remove(&key);
    } else {
        mapping.insert(key, YamlValue::Sequence(expanded));
    }
}

fn merge_default_rule_template(config: &mut Mapping, template: Mapping) {
    for (key, value) in template {
        match key.as_str() {
            Some("proxy-groups") => merge_default_template_proxy_groups(config, value),
            Some("rules") => {
                config.insert(key, value);
            }
            _ => {
                config.entry(key).or_insert(value);
            }
        }
    }
}

fn merge_default_template_proxy_groups(config: &mut Mapping, value: YamlValue) {
    let Some(source_groups) = value.as_sequence() else {
        return;
    };

    let target_value = config
        .entry(YamlValue::String("proxy-groups".into()))
        .or_insert_with(|| YamlValue::Sequence(Sequence::new()));
    let Some(target_groups) = target_value.as_sequence_mut() else {
        return;
    };

    let mut existing = target_groups
        .iter()
        .filter_map(|group| {
            group
                .as_mapping()
                .and_then(|group| group.get("name"))
                .and_then(YamlValue::as_str)
                .map(str::to_owned)
        })
        .collect::<HashSet<_>>();

    for group in source_groups {
        let name = group
            .as_mapping()
            .and_then(|group| group.get("name"))
            .and_then(YamlValue::as_str);
        if let Some(name) = name
            && !existing.insert(name.to_owned())
        {
            continue;
        }
        target_groups.push(group.clone());
    }
}

fn ensure_default_select_group(config: &mut Mapping) -> Option<String> {
    if has_proxy_group(config, DEFAULT_RULE_GROUP_NAME) {
        return Some(DEFAULT_RULE_GROUP_NAME.into());
    }

    if let Some(name) = first_proxy_group_name(config) {
        return Some(name);
    }

    let proxy_names = collect_yaml_named_sequence(config, "proxies");
    let provider_names = collect_yaml_mapping_keys(config, "proxy-providers");

    if proxy_names.is_empty() && provider_names.is_empty() {
        return None;
    }

    let groups = config
        .entry(YamlValue::String("proxy-groups".into()))
        .or_insert_with(|| YamlValue::Sequence(Sequence::new()));
    let groups = groups.as_sequence_mut()?;

    let mut group = Mapping::new();
    group.insert(
        YamlValue::String("name".into()),
        YamlValue::String(DEFAULT_RULE_GROUP_NAME.into()),
    );
    group.insert(YamlValue::String("type".into()), YamlValue::String("select".into()));

    if !proxy_names.is_empty() {
        let mut proxies = Sequence::new();
        for name in proxy_names {
            proxies.push(YamlValue::String(name));
        }
        group.insert(YamlValue::String("proxies".into()), YamlValue::Sequence(proxies));
    }

    if !provider_names.is_empty() {
        let mut providers = Sequence::new();
        for name in provider_names {
            providers.push(YamlValue::String(name));
        }
        group.insert(YamlValue::String("use".into()), YamlValue::Sequence(providers));
    }

    groups.push(YamlValue::Mapping(group));
    Some(DEFAULT_RULE_GROUP_NAME.into())
}

fn has_outbound_source(config: &Mapping) -> bool {
    !collect_yaml_named_sequence(config, "proxies").is_empty()
        || !collect_yaml_mapping_keys(config, "proxy-providers").is_empty()
        || first_proxy_group_name(config).is_some()
}

fn first_proxy_group_name(config: &Mapping) -> Option<String> {
    config
        .get("proxy-groups")
        .and_then(YamlValue::as_sequence)
        .and_then(|groups| {
            groups.iter().find_map(|group| {
                group
                    .as_mapping()
                    .and_then(|group| group.get("name"))
                    .and_then(YamlValue::as_str)
                    .map(str::to_owned)
                    .filter(|name| !name.is_empty())
            })
        })
}

fn has_proxy_group(config: &Mapping, name: &str) -> bool {
    config
        .get("proxy-groups")
        .and_then(YamlValue::as_sequence)
        .is_some_and(|groups| {
            groups.iter().any(|group| {
                group
                    .as_mapping()
                    .and_then(|group| group.get("name"))
                    .and_then(YamlValue::as_str)
                    == Some(name)
            })
        })
}

fn collect_yaml_named_sequence(config: &Mapping, key: &str) -> Vec<String> {
    config
        .get(key)
        .and_then(YamlValue::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.as_mapping()
                        .and_then(|mapping| mapping.get("name"))
                        .and_then(YamlValue::as_str)
                        .map(str::to_owned)
                })
                .filter(|name| !name.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn collect_yaml_mapping_keys(config: &Mapping, key: &str) -> Vec<String> {
    config
        .get(key)
        .and_then(YamlValue::as_mapping)
        .map(|mapping| {
            mapping
                .keys()
                .filter_map(YamlValue::as_str)
                .map(str::to_owned)
                .filter(|name| !name.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn build_clash_yaml_with_template(proxies: Vec<JsonMap>, template: Option<&str>) -> Result<String> {
    let profile = json!({
        "proxies": proxies,
        "proxy-groups": [],
        "rules": []
    });

    let mut profile = serde_yaml_ng::to_value(profile)
        .context("failed to convert subscription to yaml")?
        .as_mapping()
        .cloned()
        .unwrap_or_default();
    ensure_default_rule_template_with_template(&mut profile, template);

    serde_yaml_ng::to_string(&profile).context("failed to serialize converted subscription")
}

fn parse_subscription_proxies(data: &str) -> Result<Vec<JsonMap>> {
    let mut proxies = Vec::new();
    let mut names = HashSet::new();
    let mut fingerprints = HashSet::new();

    for content in collect_decoded_contents(data) {
        for proxy in parse_sing_box_json(&content)
            .into_iter()
            .chain(parse_uri_content(&content)?)
        {
            let fingerprint = proxy_fingerprint(&proxy);
            if !fingerprints.insert(fingerprint) {
                continue;
            }

            let name = proxy
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Proxy")
                .trim()
                .to_owned();
            let unique_name = unique_name(&name, &mut names);

            let mut proxy = proxy;
            proxy.insert("name".into(), Value::String(unique_name));
            proxies.push(proxy);
        }
    }

    Ok(proxies)
}

fn collect_decoded_contents(data: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    let mut queue = vec![data.trim().to_owned()];

    let mut index = 0;
    while index < queue.len() {
        let content = queue[index].trim().to_owned();
        index += 1;
        if content.is_empty() || !seen.insert(content.clone()) {
            continue;
        }

        if let Some(decoded) = decode_base64_text(&content) {
            let decoded = decoded.trim().to_owned();
            if !decoded.is_empty() && decoded != content && !seen.contains(&decoded) {
                queue.push(decoded);
            }
        }

        result.push(content);
    }

    result
}

fn decode_base64_text(input: &str) -> Option<String> {
    let normalized = input
        .split_whitespace()
        .collect::<String>()
        .replace('-', "+")
        .replace('_', "/");
    if normalized.is_empty() {
        return None;
    }

    let pad_len = normalized.len() % 4;
    let padded = if pad_len == 0 {
        normalized
    } else {
        format!("{}{}", normalized, "=".repeat(4 - pad_len))
    };

    let bytes = general_purpose::STANDARD.decode(padded.as_bytes()).ok()?;
    if bytes
        .iter()
        .any(|byte| *byte < 0x20 && !matches!(*byte, b'\n' | b'\r' | b'\t'))
    {
        return None;
    }
    String::from_utf8(bytes).ok()
}

fn parse_uri_content(content: &str) -> Result<Vec<JsonMap>> {
    let mut candidates = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if !line.is_empty() {
            candidates.push(line.to_owned());
        }
    }

    let re = Regex::new(
        r"(?i)\b(?:ss|ssr|vmess|vless|trojan|anytls|hysteria2|hy2|hysteria|hy|tuic|wireguard|wg|http|https|socks5|socks)://\S+",
    )?;
    for matched in re.find_iter(content) {
        candidates.push(matched.as_str().trim().to_owned());
    }

    let mut proxies = Vec::new();
    let mut seen = HashSet::new();
    for candidate in candidates {
        if !seen.insert(candidate.clone()) {
            continue;
        }
        if let Some(proxy) = parse_proxy_uri(&candidate) {
            proxies.push(proxy);
        }
    }

    Ok(proxies)
}

fn parse_proxy_uri(uri: &str) -> Option<JsonMap> {
    let scheme = uri.split_once("://")?.0.to_ascii_lowercase();
    match scheme.as_str() {
        "ss" => parse_ss_uri(uri),
        "vmess" => parse_vmess_uri(uri),
        "vless" => parse_vless_uri(uri),
        "trojan" => parse_trojan_uri(uri),
        "anytls" => parse_anytls_uri(uri),
        "hysteria" | "hy" => parse_hysteria_uri(uri),
        "hysteria2" | "hy2" => parse_hysteria2_uri(uri),
        "tuic" => parse_tuic_uri(uri),
        "wireguard" | "wg" => parse_wireguard_uri(uri),
        "http" | "https" => parse_http_uri(uri),
        "socks" | "socks5" => parse_socks_uri(uri),
        _ => None,
    }
}

fn parse_sing_box_json(content: &str) -> Vec<JsonMap> {
    let Ok(value) = serde_json::from_str::<Value>(content) else {
        return Vec::new();
    };

    let outbounds = value
        .as_array()
        .cloned()
        .or_else(|| value.get("outbounds").and_then(Value::as_array).cloned())
        .unwrap_or_default();

    outbounds
        .iter()
        .filter_map(|outbound| outbound.as_object())
        .filter_map(sing_box_outbound_to_proxy)
        .collect()
}

fn sing_box_outbound_to_proxy(outbound: &JsonMap) -> Option<JsonMap> {
    let outbound_type = get_str(outbound, &["type"])?.to_ascii_lowercase();
    let server = get_str(outbound, &["server"]);
    let port = get_u16(outbound, &["server_port", "serverPort", "port"]);
    let name = get_str(outbound, &["tag", "name"]).unwrap_or_else(|| {
        format!(
            "{} {}:{}",
            outbound_type,
            server.clone().unwrap_or_default(),
            port.unwrap_or_default()
        )
    });

    let mut proxy = match outbound_type.as_str() {
        "shadowsocks" | "ss" => {
            let mut proxy = base_proxy("ss", name, server?, port?);
            insert_string(&mut proxy, "cipher", get_str(outbound, &["method"]));
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            proxy
        }
        "vmess" => {
            let mut proxy = base_proxy("vmess", name, server?, port?);
            insert_string(&mut proxy, "uuid", get_str(outbound, &["uuid"]));
            insert_number(
                &mut proxy,
                "alterId",
                get_u64(outbound, &["alter_id", "alterId"]).or(Some(0)),
            );
            insert_string(
                &mut proxy,
                "cipher",
                get_str(outbound, &["security"]).or_else(|| Some("auto".into())),
            );
            apply_sing_box_tls(&mut proxy, outbound, "servername");
            apply_sing_box_transport(&mut proxy, outbound);
            proxy
        }
        "vless" => {
            let mut proxy = base_proxy("vless", name, server?, port?);
            insert_string(&mut proxy, "uuid", get_str(outbound, &["uuid"]));
            insert_string(&mut proxy, "flow", get_str(outbound, &["flow"]));
            apply_sing_box_tls(&mut proxy, outbound, "servername");
            apply_sing_box_transport(&mut proxy, outbound);
            proxy
        }
        "trojan" => {
            let mut proxy = base_proxy("trojan", name, server?, port?);
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            apply_sing_box_transport(&mut proxy, outbound);
            proxy
        }
        "hysteria" => {
            let mut proxy = base_proxy("hysteria", name, server?, port?);
            insert_string(&mut proxy, "auth", get_str(outbound, &["auth"]));
            insert_string(
                &mut proxy,
                "auth-str",
                get_str(outbound, &["auth_str", "authStr", "password"]),
            );
            insert_string(&mut proxy, "obfs", get_str(outbound, &["obfs"]));
            insert_string(&mut proxy, "up", get_str(outbound, &["up", "up_mbps", "upMbps"]));
            insert_string(
                &mut proxy,
                "down",
                get_str(outbound, &["down", "down_mbps", "downMbps"]),
            );
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            proxy
        }
        "hysteria2" | "hy2" => {
            let mut proxy = base_proxy("hysteria2", name, server?, port?);
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            let obfs = outbound.get("obfs").and_then(Value::as_object);
            insert_string(
                &mut proxy,
                "obfs",
                obfs.and_then(|o| get_str(o, &["type"]))
                    .or_else(|| get_str(outbound, &["obfs"])),
            );
            insert_string(
                &mut proxy,
                "obfs-password",
                obfs.and_then(|o| get_str(o, &["password"]))
                    .or_else(|| get_str(outbound, &["obfs_password", "obfs-password"])),
            );
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            proxy
        }
        "tuic" => {
            let mut proxy = base_proxy("tuic", name, server?, port?);
            insert_string(&mut proxy, "uuid", get_str(outbound, &["uuid"]));
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            insert_string(&mut proxy, "token", get_str(outbound, &["token"]));
            insert_string(
                &mut proxy,
                "congestion-controller",
                get_str(
                    outbound,
                    &["congestion_control", "congestionController", "congestion-controller"],
                ),
            );
            insert_string(
                &mut proxy,
                "udp-relay-mode",
                get_str(outbound, &["udp_relay_mode", "udpRelayMode", "udp-relay-mode"]),
            );
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            proxy
        }
        "anytls" => {
            let mut proxy = base_proxy("anytls", name, server?, port?);
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            proxy
        }
        "http" => {
            let mut proxy = base_proxy("http", name, server?, port?);
            insert_string(&mut proxy, "username", get_str(outbound, &["username"]));
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            proxy
        }
        "socks" | "socks5" => {
            let mut proxy = base_proxy("socks5", name, server?, port?);
            insert_string(&mut proxy, "username", get_str(outbound, &["username"]));
            insert_string(&mut proxy, "password", get_str(outbound, &["password"]));
            insert_bool(&mut proxy, "udp", get_bool(outbound, &["udp"]));
            apply_sing_box_tls(&mut proxy, outbound, "sni");
            proxy
        }
        "wireguard" => {
            let mut proxy = base_proxy("wireguard", name, server?, port?);
            insert_string(
                &mut proxy,
                "private-key",
                get_str(outbound, &["private_key", "privateKey"]),
            );
            insert_string(
                &mut proxy,
                "public-key",
                get_str(
                    outbound,
                    &["peer_public_key", "peerPublicKey", "public_key", "public-key"],
                ),
            );
            insert_string(
                &mut proxy,
                "pre-shared-key",
                get_str(outbound, &["pre_shared_key", "preSharedKey", "pre-shared-key"]),
            );
            insert_number(&mut proxy, "mtu", get_u64(outbound, &["mtu"]));
            insert_bool(&mut proxy, "udp", Some(true));
            if let Some(addresses) = get_string_array(outbound, &["local_address", "localAddress", "address"]) {
                for address in addresses {
                    let ip = address.split('/').next().unwrap_or_default();
                    if is_ipv4(ip) {
                        insert_string(&mut proxy, "ip", Some(ip.into()));
                    } else if ip.contains(':') {
                        insert_string(&mut proxy, "ipv6", Some(ip.into()));
                    }
                }
            }
            proxy
        }
        _ => return None,
    };

    insert_string(
        &mut proxy,
        "dialer-proxy",
        get_str(outbound, &["detour", "dialer_proxy", "dialer-proxy"]),
    );
    Some(proxy)
}

fn parse_vmess_uri(uri: &str) -> Option<JsonMap> {
    let raw = uri.strip_prefix("vmess://")?;
    let decoded = decode_base64_text(raw)?;
    let params = serde_json::from_str::<Value>(&decoded).ok()?;
    let params = params.as_object()?;
    let server = get_str(params, &["add"])?;
    let port = get_u16(params, &["port"])?;
    let name = get_str(params, &["ps", "remarks", "remark"]).unwrap_or_else(|| format!("VMess {server}:{port}"));

    let mut proxy = base_proxy("vmess", name, server, port);
    insert_string(&mut proxy, "uuid", get_str(params, &["id"]));
    insert_number(&mut proxy, "alterId", get_u64(params, &["aid", "alterId"]).or(Some(0)));
    insert_string(
        &mut proxy,
        "cipher",
        get_str(params, &["scy"]).or_else(|| Some("auto".into())),
    );

    let tls = get_str(params, &["tls"]).unwrap_or_default();
    if matches!(tls.as_str(), "tls" | "true" | "1") {
        insert_bool(&mut proxy, "tls", Some(true));
    }
    insert_string(&mut proxy, "servername", get_str(params, &["sni"]));

    let network = get_str(params, &["net", "type"]);
    apply_uri_transport(
        &mut proxy,
        network.as_deref(),
        get_str(params, &["host"]),
        get_str(params, &["path"]),
    );
    Some(proxy)
}

fn parse_vless_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default()?;
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("VLESS {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("vless", name, server, port);
    insert_string(&mut proxy, "uuid", Some(percent_decode(parsed.username())));
    insert_string(&mut proxy, "flow", get_hash_str(&query, &["flow"]));
    let security = get_hash_str(&query, &["security"])
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !security.is_empty() && security != "none" {
        insert_bool(&mut proxy, "tls", Some(true));
    }
    if get_hash_bool(&query, &["tls"]) == Some(true) {
        insert_bool(&mut proxy, "tls", Some(true));
    }
    insert_string(
        &mut proxy,
        "servername",
        get_hash_str(&query, &["sni", "servername", "peer"]),
    );
    insert_string(
        &mut proxy,
        "client-fingerprint",
        get_hash_str(&query, &["fp", "client-fingerprint"]),
    );
    insert_bool(
        &mut proxy,
        "skip-cert-verify",
        get_hash_bool(&query, &["skip-cert-verify", "allow-insecure", "insecure"]),
    );
    apply_reality_opts(&mut proxy, &query);
    apply_uri_transport(
        &mut proxy,
        get_hash_str(&query, &["type", "net", "network"]).as_deref(),
        get_hash_str(&query, &["host", "obfs-param"]),
        get_hash_str(&query, &["path", "service-name"]),
    );
    Some(proxy)
}

fn parse_trojan_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("Trojan {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("trojan", name, server, port);
    insert_string(&mut proxy, "password", Some(percent_decode(parsed.username())));
    insert_string(&mut proxy, "sni", get_hash_str(&query, &["sni", "peer"]));
    insert_bool(
        &mut proxy,
        "skip-cert-verify",
        get_hash_bool(&query, &["skip-cert-verify", "allow-insecure", "insecure"]),
    );
    apply_uri_transport(
        &mut proxy,
        get_hash_str(&query, &["type", "network"]).as_deref(),
        get_hash_str(&query, &["host"]),
        get_hash_str(&query, &["path", "service-name"]),
    );
    Some(proxy)
}

fn parse_anytls_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("AnyTLS {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("anytls", name, server, port);
    let password = parsed
        .password()
        .map(percent_decode)
        .or_else(|| Some(percent_decode(parsed.username())))
        .filter(|s| !s.is_empty());
    insert_string(
        &mut proxy,
        "password",
        get_hash_str(&query, &["password", "auth"]).or(password),
    );
    insert_string(&mut proxy, "sni", get_hash_str(&query, &["sni", "servername", "peer"]));
    insert_bool(
        &mut proxy,
        "skip-cert-verify",
        get_hash_bool(&query, &["skip-cert-verify", "allow-insecure", "insecure"]),
    );
    insert_bool(&mut proxy, "udp", Some(get_hash_bool(&query, &["udp"]).unwrap_or(true)));
    Some(proxy)
}

fn parse_hysteria2_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("Hysteria2 {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("hysteria2", name, server, port);
    insert_string(&mut proxy, "password", Some(percent_decode(parsed.username())));
    insert_string(&mut proxy, "sni", get_hash_str(&query, &["sni", "peer"]));
    insert_string(&mut proxy, "obfs", get_hash_str(&query, &["obfs"]));
    insert_string(
        &mut proxy,
        "obfs-password",
        get_hash_str(&query, &["obfs-password", "obfs_password"]),
    );
    insert_bool(
        &mut proxy,
        "skip-cert-verify",
        get_hash_bool(&query, &["insecure", "skip-cert-verify", "allow-insecure"]),
    );
    Some(proxy)
}

fn parse_hysteria_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("Hysteria {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("hysteria", name, server, port);
    insert_string(&mut proxy, "auth-str", get_hash_str(&query, &["auth", "auth-str"]));
    insert_string(&mut proxy, "sni", get_hash_str(&query, &["sni", "peer"]));
    insert_string(&mut proxy, "obfs", get_hash_str(&query, &["obfs", "obfsParam"]));
    insert_string(&mut proxy, "up", get_hash_str(&query, &["upmbps", "up"]));
    insert_string(&mut proxy, "down", get_hash_str(&query, &["downmbps", "down"]));
    insert_bool(
        &mut proxy,
        "skip-cert-verify",
        get_hash_bool(&query, &["insecure", "skip-cert-verify", "allow-insecure"]),
    );
    Some(proxy)
}

fn parse_tuic_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("TUIC {server}:{port}"));
    let query = query_map(&parsed);
    let (uuid, password) = parsed.username().split_once(':')?;

    let mut proxy = base_proxy("tuic", name, server, port);
    insert_string(&mut proxy, "uuid", Some(percent_decode(uuid)));
    insert_string(&mut proxy, "password", Some(percent_decode(password)));
    insert_string(&mut proxy, "sni", get_hash_str(&query, &["sni"]));
    insert_bool(
        &mut proxy,
        "skip-cert-verify",
        get_hash_bool(&query, &["skip-cert-verify", "allow-insecure"]),
    );
    Some(proxy)
}

fn parse_wireguard_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("WireGuard {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("wireguard", name, server, port);
    insert_string(&mut proxy, "private-key", Some(percent_decode(parsed.username())));
    insert_string(
        &mut proxy,
        "public-key",
        get_hash_str(&query, &["publickey", "public-key"]),
    );
    insert_string(&mut proxy, "pre-shared-key", get_hash_str(&query, &["pre-shared-key"]));
    insert_bool(&mut proxy, "udp", Some(get_hash_bool(&query, &["udp"]).unwrap_or(true)));
    Some(proxy)
}

fn parse_http_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("HTTP {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("http", name, server, port);
    if !parsed.username().is_empty() {
        insert_string(&mut proxy, "username", Some(percent_decode(parsed.username())));
    }
    if let Some(password) = parsed.password() {
        insert_string(&mut proxy, "password", Some(percent_decode(password)));
    }
    insert_bool(
        &mut proxy,
        "tls",
        Some(parsed.scheme() == "https").or_else(|| get_hash_bool(&query, &["tls"])),
    );
    Some(proxy)
}

fn parse_socks_uri(uri: &str) -> Option<JsonMap> {
    let parsed = Url::parse(uri).ok()?;
    let server = parsed.host_str()?.to_owned();
    let port = parsed.port_or_known_default().unwrap_or(443);
    let name = decoded_fragment(&parsed).unwrap_or_else(|| format!("SOCKS5 {server}:{port}"));
    let query = query_map(&parsed);

    let mut proxy = base_proxy("socks5", name, server, port);
    if !parsed.username().is_empty() {
        insert_string(&mut proxy, "username", Some(percent_decode(parsed.username())));
    }
    if let Some(password) = parsed.password() {
        insert_string(&mut proxy, "password", Some(percent_decode(password)));
    }
    insert_bool(&mut proxy, "udp", get_hash_bool(&query, &["udp"]));
    Some(proxy)
}

fn parse_ss_uri(uri: &str) -> Option<JsonMap> {
    let after_scheme = uri.strip_prefix("ss://")?;
    let (without_fragment, fragment) = after_scheme.split_once('#').unwrap_or((after_scheme, ""));
    let (main_raw, _) = without_fragment.split_once('?').unwrap_or((without_fragment, ""));
    let main = if main_raw.contains('@') {
        main_raw.to_owned()
    } else {
        decode_base64_text(main_raw)?
    };
    let at = main.rfind('@')?;
    let user_info = normalize_ss_user_info(&main[..at])?;
    let server_port = main[at + 1..].split('/').next()?;
    let port_idx = server_port.rfind(':')?;
    let server = server_port[..port_idx].to_owned();
    let port = server_port[port_idx + 1..].parse::<u16>().ok()?;
    let (cipher, password) = user_info.split_once(':')?;
    let cipher = normalize_ss_cipher(cipher)?;
    let name = percent_decode(fragment);
    let name = if name.is_empty() {
        format!("SS {server}:{port}")
    } else {
        name
    };

    let mut proxy = base_proxy("ss", name, server, port);
    insert_string(&mut proxy, "cipher", Some(cipher));
    insert_string(&mut proxy, "password", Some(percent_decode(password)));
    Some(proxy)
}

fn normalize_ss_user_info(raw: &str) -> Option<String> {
    let mut current = decode_base64_text(raw).unwrap_or_else(|| raw.to_owned());

    // Some public V2Ray subscriptions contain malformed nested SS userinfo like:
    // ss://base64("ss://base64(method:password)")@server:port#name
    // Unwrap it before splitting cipher/password; otherwise the cipher becomes
    // "ss" and mihomo rejects the generated config.
    for _ in 0..3 {
        let trimmed = current.trim();
        if !trimmed.to_ascii_lowercase().starts_with("ss://") {
            break;
        }

        let after_scheme = &trimmed[5..];
        let (without_fragment, _) = after_scheme.split_once('#').unwrap_or((after_scheme, ""));
        let (without_query, _) = without_fragment.split_once('?').unwrap_or((without_fragment, ""));
        let nested_user_info = without_query
            .split_once('@')
            .map_or(without_query, |(user_info, _)| user_info);
        let decoded = decode_base64_text(nested_user_info).unwrap_or_else(|| nested_user_info.to_owned());
        if decoded == current {
            break;
        }
        current = decoded;
    }

    current.contains(':').then_some(current)
}

fn normalize_ss_cipher(cipher: &str) -> Option<String> {
    let cipher = percent_decode(cipher).trim().to_ascii_lowercase();
    let cipher = match cipher.as_str() {
        "chacha20-poly1305" => "chacha20-ietf-poly1305",
        value => value,
    };

    matches!(
        cipher,
        "dummy"
            | "aes-128-gcm"
            | "aes-192-gcm"
            | "aes-256-gcm"
            | "lea-128-gcm"
            | "lea-192-gcm"
            | "lea-256-gcm"
            | "aes-128-gcm-siv"
            | "aes-256-gcm-siv"
            | "2022-blake3-aes-128-gcm"
            | "2022-blake3-aes-256-gcm"
            | "aes-128-cfb"
            | "aes-192-cfb"
            | "aes-256-cfb"
            | "aes-128-ctr"
            | "aes-192-ctr"
            | "aes-256-ctr"
            | "chacha20"
            | "chacha20-ietf"
            | "chacha20-ietf-poly1305"
            | "2022-blake3-chacha20-poly1305"
            | "rabbit128-poly1305"
            | "xchacha20-ietf-poly1305"
            | "xchacha20"
            | "aegis-128l"
            | "aegis-256"
            | "aez-384"
            | "deoxys-ii-256-128"
            | "rc4-md5"
    )
    .then_some(cipher.to_owned())
}

fn base_proxy(proxy_type: &str, name: String, server: String, port: u16) -> JsonMap {
    let mut proxy = JsonMap::new();
    proxy.insert("type".into(), Value::String(proxy_type.into()));
    proxy.insert("name".into(), Value::String(name));
    proxy.insert("server".into(), Value::String(server));
    proxy.insert("port".into(), Value::Number(port.into()));
    proxy
}

fn apply_sing_box_tls(proxy: &mut JsonMap, outbound: &JsonMap, server_name_key: &str) {
    let Some(tls) = outbound.get("tls").and_then(Value::as_object) else {
        return;
    };

    if get_bool(tls, &["enabled"]) == Some(true)
        && matches!(
            proxy.get("type").and_then(Value::as_str),
            Some("vmess" | "vless" | "http" | "socks5")
        )
    {
        insert_bool(proxy, "tls", Some(true));
    }
    insert_string(
        proxy,
        server_name_key,
        get_str(tls, &["server_name", "serverName", "sni"]),
    );
    insert_bool(
        proxy,
        "skip-cert-verify",
        get_bool(tls, &["insecure", "allow_insecure", "allowInsecure"]),
    );
    insert_string_array(proxy, "alpn", get_string_array(tls, &["alpn"]));

    if let Some(utls) = tls.get("utls").and_then(Value::as_object) {
        insert_string(proxy, "client-fingerprint", get_str(utls, &["fingerprint"]));
    }

    if let Some(reality) = tls.get("reality").and_then(Value::as_object)
        && get_bool(reality, &["enabled"]) != Some(false)
    {
        let public_key = get_str(reality, &["public_key", "publicKey", "public-key"]);
        let short_id = get_str(reality, &["short_id", "shortId", "short-id"]);
        if public_key.is_some() || short_id.is_some() {
            insert_bool(proxy, "tls", Some(true));
            let mut opts = JsonMap::new();
            insert_string(&mut opts, "public-key", public_key);
            insert_string(&mut opts, "short-id", short_id);
            proxy.insert("reality-opts".into(), Value::Object(opts));
        }
    }
}

fn apply_sing_box_transport(proxy: &mut JsonMap, outbound: &JsonMap) {
    let Some(transport) = outbound.get("transport").and_then(Value::as_object) else {
        return;
    };
    let transport_type = get_str(transport, &["type"])
        .unwrap_or_else(|| "tcp".into())
        .to_ascii_lowercase();
    if transport_type == "tcp" {
        insert_string(proxy, "network", Some("tcp".into()));
        return;
    }

    let path = get_str(transport, &["path"]);
    let headers = transport.get("headers").and_then(Value::as_object);
    match transport_type.as_str() {
        "ws" | "websocket" => {
            insert_string(proxy, "network", Some("ws".into()));
            let mut opts = JsonMap::new();
            insert_string(&mut opts, "path", path);
            if let Some(headers) = headers {
                opts.insert("headers".into(), normalize_headers_for_ws(headers));
            }
            proxy.insert("ws-opts".into(), Value::Object(opts));
        }
        "grpc" => {
            insert_string(proxy, "network", Some("grpc".into()));
            if let Some(service_name) = get_str(transport, &["service_name", "serviceName", "grpc_service_name"]) {
                proxy.insert("grpc-opts".into(), json!({ "grpc-service-name": service_name }));
            }
        }
        "httpupgrade" | "http_upgrade" => {
            insert_string(proxy, "network", Some("ws".into()));
            let mut opts = JsonMap::new();
            insert_bool(&mut opts, "v2ray-http-upgrade", Some(true));
            insert_bool(&mut opts, "v2ray-http-upgrade-fast-open", Some(true));
            insert_string(&mut opts, "path", path);
            if let Some(headers) = headers {
                opts.insert("headers".into(), normalize_headers_for_ws(headers));
            }
            proxy.insert("ws-opts".into(), Value::Object(opts));
        }
        "http" | "h2" => {
            insert_string(
                proxy,
                "network",
                Some(if transport_type == "h2" { "h2" } else { "http" }.into()),
            );
            let mut opts = JsonMap::new();
            if transport_type == "h2" {
                insert_string(&mut opts, "path", path);
                insert_string(&mut opts, "host", get_str(transport, &["host"]));
                if !opts.is_empty() {
                    proxy.insert("h2-opts".into(), Value::Object(opts));
                }
            } else {
                if let Some(path) = path {
                    opts.insert("path".into(), Value::Array(vec![Value::String(path)]));
                }
                if let Some(headers) = headers {
                    opts.insert("headers".into(), normalize_headers_for_http(headers));
                }
                if !opts.is_empty() {
                    proxy.insert("http-opts".into(), Value::Object(opts));
                }
            }
        }
        _ => {}
    }
}

fn apply_uri_transport(proxy: &mut JsonMap, network: Option<&str>, host: Option<String>, path: Option<String>) {
    let network = network
        .map(|s| if s == "websocket" { "ws" } else { s })
        .unwrap_or("tcp");
    if !matches!(network, "tcp" | "ws" | "grpc" | "http" | "h2" | "httpupgrade") {
        return;
    }
    let mihomo_network = if network == "httpupgrade" { "ws" } else { network };
    insert_string(proxy, "network", Some(mihomo_network.into()));

    match network {
        "ws" | "httpupgrade" => {
            let mut opts = JsonMap::new();
            insert_string(&mut opts, "path", path);
            if let Some(host) = host {
                opts.insert("headers".into(), json!({ "Host": host }));
            }
            if network == "httpupgrade" {
                insert_bool(&mut opts, "v2ray-http-upgrade", Some(true));
                insert_bool(&mut opts, "v2ray-http-upgrade-fast-open", Some(true));
            }
            if !opts.is_empty() {
                proxy.insert("ws-opts".into(), Value::Object(opts));
            }
        }
        "grpc" => {
            if let Some(service_name) = path {
                proxy.insert("grpc-opts".into(), json!({ "grpc-service-name": service_name }));
            }
        }
        _ => {}
    }
}

fn apply_reality_opts(proxy: &mut JsonMap, query: &HashMap<String, String>) {
    let public_key = get_hash_str(query, &["pbk", "public-key"]);
    let short_id = get_hash_str(query, &["sid", "short-id"]);
    if public_key.is_some() || short_id.is_some() {
        insert_bool(proxy, "tls", Some(true));
        let mut opts = JsonMap::new();
        insert_string(&mut opts, "public-key", public_key);
        insert_string(&mut opts, "short-id", short_id);
        proxy.insert("reality-opts".into(), Value::Object(opts));
    }
}

fn query_map(parsed: &Url) -> HashMap<String, String> {
    parsed
        .query_pairs()
        .map(|(key, value)| (key.replace('_', "-").to_ascii_lowercase(), value.into_owned()))
        .collect()
}

fn decoded_fragment(parsed: &Url) -> Option<String> {
    parsed.fragment().map(percent_decode).filter(|s| !s.trim().is_empty())
}

fn get_hash_str(query: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .map(|key| key.replace('_', "-").to_ascii_lowercase())
        .find_map(|key| query.get(&key).cloned())
        .filter(|s| !s.trim().is_empty())
}

fn get_hash_bool(query: &HashMap<String, String>, keys: &[&str]) -> Option<bool> {
    get_hash_str(query, keys).and_then(|value| parse_bool(&value))
}

fn get_str(map: &JsonMap, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| map.get(*key)).and_then(|value| match value {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_owned()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    })
}

fn get_u16(map: &JsonMap, keys: &[&str]) -> Option<u16> {
    get_u64(map, keys).and_then(|value| u16::try_from(value).ok())
}

fn get_u64(map: &JsonMap, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = map.get(*key)?;
        match value {
            Value::Number(n) => n.as_u64(),
            Value::String(s) => s.parse::<u64>().ok(),
            _ => None,
        }
    })
}

fn get_bool(map: &JsonMap, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| {
        let value = map.get(*key)?;
        match value {
            Value::Bool(b) => Some(*b),
            Value::Number(n) => Some(n.as_u64().unwrap_or_default() != 0),
            Value::String(s) => parse_bool(s),
            _ => None,
        }
    })
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Some(true),
        "false" | "0" | "no" => Some(false),
        _ => None,
    }
}

fn get_string_array(map: &JsonMap, keys: &[&str]) -> Option<Vec<String>> {
    keys.iter().find_map(|key| {
        let value = map.get(*key)?;
        match value {
            Value::Array(arr) => Some(
                arr.iter()
                    .filter_map(|item| item.as_str().map(str::to_owned).or_else(|| Some(item.to_string())))
                    .filter(|item| !item.trim().is_empty())
                    .collect::<Vec<_>>(),
            ),
            Value::String(s) => Some(
                s.split(',')
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>(),
            ),
            _ => None,
        }
    })
}

fn insert_string(map: &mut JsonMap, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|s| !s.trim().is_empty()) {
        map.insert(key.into(), Value::String(value));
    }
}

fn insert_number(map: &mut JsonMap, key: &str, value: Option<u64>) {
    if let Some(value) = value {
        map.insert(key.into(), Value::Number(value.into()));
    }
}

fn insert_bool(map: &mut JsonMap, key: &str, value: Option<bool>) {
    if let Some(value) = value {
        map.insert(key.into(), Value::Bool(value));
    }
}

fn insert_string_array(map: &mut JsonMap, key: &str, value: Option<Vec<String>>) {
    if let Some(value) = value.filter(|arr| !arr.is_empty()) {
        map.insert(key.into(), Value::Array(value.into_iter().map(Value::String).collect()));
    }
}

fn normalize_headers_for_ws(headers: &JsonMap) -> Value {
    Value::Object(
        headers
            .iter()
            .filter_map(|(key, value)| {
                let value = match value {
                    Value::String(s) => s.clone(),
                    Value::Array(arr) => arr
                        .iter()
                        .find_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_default(),
                    _ => value.to_string(),
                };
                (!value.is_empty()).then(|| (key.clone(), Value::String(value)))
            })
            .collect(),
    )
}

fn normalize_headers_for_http(headers: &JsonMap) -> Value {
    Value::Object(
        headers
            .iter()
            .map(|(key, value)| {
                let values = match value {
                    Value::Array(arr) => arr
                        .iter()
                        .map(|item| item.as_str().map(ToOwned::to_owned).unwrap_or_else(|| item.to_string()))
                        .collect::<Vec<_>>(),
                    Value::String(s) => vec![s.clone()],
                    _ => vec![value.to_string()],
                };
                (
                    key.clone(),
                    Value::Array(values.into_iter().map(Value::String).collect()),
                )
            })
            .collect(),
    )
}

fn percent_decode(value: &str) -> String {
    percent_encoding::percent_decode_str(value)
        .decode_utf8_lossy()
        .to_string()
}

fn unique_name(name: &str, used_names: &mut HashSet<String>) -> String {
    let base = if name.trim().is_empty() { "Proxy" } else { name.trim() };
    if used_names.insert(base.to_owned()) {
        return base.to_owned();
    }

    let mut index = 2;
    loop {
        let candidate = format!("{base} {index}");
        if used_names.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}

fn proxy_fingerprint(proxy: &JsonMap) -> String {
    ["type", "server", "port", "uuid", "password", "cipher", "name"]
        .iter()
        .map(|key| proxy.get(*key).map(Value::to_string).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("|")
}

fn is_ipv4(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() == 4 && parts.iter().all(|part| part.parse::<u8>().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base64_v2ray_subscription() -> Result<(), Box<dyn std::error::Error>> {
        let vmess = general_purpose::STANDARD.encode(
            r#"{"v":"2","ps":"VMess Test","add":"example.com","port":"443","id":"00000000-0000-0000-0000-000000000001","aid":"0","scy":"auto","net":"ws","type":"none","host":"example.com","path":"/ws","tls":"tls","sni":"example.com"}"#,
        );
        let raw = format!(
            "vmess://{}\nhysteria2://password@example.org:8443?sni=example.org#HY2%20Test",
            vmess
        );
        let encoded = general_purpose::STANDARD.encode(raw.as_bytes());

        let normalized = normalize_remote_profile_data(&encoded)?;

        assert!(normalized.contains("proxies:"));
        assert!(normalized.contains("proxy-groups:"));
        assert!(normalized.contains("VMess Test"));
        assert!(normalized.contains("HY2 Test"));
        Ok(())
    }

    #[test]
    fn normalizes_sing_box_json_subscription() -> Result<(), Box<dyn std::error::Error>> {
        let raw = r#"{
          "outbounds": [
            { "type": "selector", "tag": "auto", "outbounds": ["SS Test"] },
            {
              "type": "shadowsocks",
              "tag": "SS Test",
              "server": "example.com",
              "server_port": 8388,
              "method": "aes-128-gcm",
              "password": "secret"
            }
          ]
        }"#;

        let normalized = normalize_remote_profile_data(raw)?;

        assert!(normalized.contains("proxies:"));
        assert!(normalized.contains("proxy-groups:"));
        assert!(normalized.contains("SS Test"));
        assert!(normalized.contains("aes-128-gcm"));
        Ok(())
    }
}
