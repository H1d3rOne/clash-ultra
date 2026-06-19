use super::{IClashTemp, IProfiles, IVerge, IVergePortProxy, PrfItem, PrfSelected};
use crate::{
    config::{profiles_append_item_safe, runtime::IRuntime},
    constants::{files, timing},
    core::{CoreManager, handle, service, tray, validate::CoreConfigValidator},
    enhance,
    process::AsyncHandler,
    utils::{dirs, help, subscription::ensure_default_rule_template_with_template},
};
use anyhow::{Context as _, Result, anyhow};
use backon::{ExponentialBuilder, Retryable as _};
use clash_ultra_draft::Draft;
use clash_ultra_logging::{Type, logging, logging_error};
use serde_yaml_ng::{Mapping, Value};
use smartstring::alias::String;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
use tokio::sync::OnceCell;
use tokio::time::sleep;

pub struct Config {
    clash_config: Draft<IClashTemp>,
    app_config: Draft<IVerge>,
    profiles_config: Draft<IProfiles>,
    runtime_config: Draft<IRuntime>,
}

impl Config {
    pub async fn global() -> &'static Self {
        static CONFIG: OnceCell<Config> = OnceCell::const_new();
        CONFIG
            .get_or_init(|| async {
                Self {
                    clash_config: Draft::new(IClashTemp::new().await),
                    app_config: Draft::new(IVerge::new().await),
                    profiles_config: Draft::new(IProfiles::new().await),
                    runtime_config: Draft::new(IRuntime::new()),
                }
            })
            .await
    }

    pub async fn clash() -> Draft<IClashTemp> {
        Self::global().await.clash_config.clone()
    }

    pub async fn app_config() -> Draft<IVerge> {
        Self::global().await.app_config.clone()
    }

    pub async fn profiles() -> Draft<IProfiles> {
        Self::global().await.profiles_config.clone()
    }

    pub async fn runtime() -> Draft<IRuntime> {
        Self::global().await.runtime_config.clone()
    }

    /// 初始化订阅
    pub async fn init_config() -> Result<()> {
        Self::ensure_default_profile_items().await?;

        let verge = Self::app_config().await.latest_arc();
        clash_ultra_i18n::sync_locale(verge.language.as_deref());

        // init Tun mode
        // 与原项目保持一致：启动时不自动提权安装服务。
        // 如果当前不是管理员且服务不可用，则关闭遗留的 TUN 配置，用户可在设置中手动安装服务。
        let handle = handle::Handle::app_handle();
        let is_admin = tauri_plugin_clash_ultra_sysinfo::is_current_app_handle_admin(handle);
        let is_service_available = service::is_service_available().await.is_ok();
        if !is_admin && !is_service_available {
            let verge = Self::app_config().await;
            verge.edit_draft(|d| {
                d.enable_tun_mode = Some(false);
            });
            verge.apply();
            let _ = tray::Tray::global().update_menu().await;

            // 分离数据获取和异步调用避免Send问题
            let verge_data = Self::app_config().await.latest_arc();
            logging_error!(Type::Core, verge_data.save_file().await);
        }

        let validation_result = Self::generate_and_validate().await?;

        if let Some((msg_type, msg_content)) = validation_result {
            sleep(timing::STARTUP_ERROR_DELAY).await;
            handle::Handle::notice_message(msg_type, msg_content);
        }

        {
            let profiles = Self::profiles().await.data_arc();
            // Logging error internally
            let _ = profiles.cleanup_orphaned_files().await;
        }

        Ok(())
    }

    // Ensure "Merge" and "Script" profile items exist, adding them if missing.
    async fn ensure_default_profile_items() -> Result<()> {
        let profiles = Self::profiles().await;
        if profiles.latest_arc().get_item("Merge").is_err() {
            let merge_item = &mut PrfItem::from_merge(Some("Merge".into()))?;
            profiles_append_item_safe(merge_item).await?;
        }
        if profiles.latest_arc().get_item("Script").is_err() {
            let script_item = &mut PrfItem::from_script(Some("Script".into()))?;
            profiles_append_item_safe(script_item).await?;
        }
        Ok(())
    }

    async fn generate_and_validate() -> Result<Option<(&'static str, String)>> {
        // 生成运行时配置
        if let Err(err) = Self::generate().await {
            let error_msg: String = err.to_string().into();
            logging!(error, Type::Config, "生成运行时配置失败: {}", error_msg);
            CoreManager::global()
                .use_default_config("config_validate::boot_error", &error_msg)
                .await?;
            return Ok(Some(("config_validate::boot_error", error_msg)));
        }
        logging!(info, Type::Config, "生成运行时配置成功");

        // 生成运行时配置文件并验证
        let config_result = Self::generate_file(ConfigType::Run).await;

        if config_result.is_ok() {
            // 验证配置文件
            logging!(info, Type::Config, "开始验证配置");

            match CoreConfigValidator::global().validate_config_outcome().await {
                Ok(outcome) if outcome.is_valid() => {
                    logging!(info, Type::Config, "配置验证成功");
                    // 前端没有必要知道验证成功的消息，也没有事件驱动
                    // Some(("config_validate::success", String::new()))
                    Ok(None)
                }
                Ok(outcome) => {
                    let error_msg: String = outcome.to_string().into();
                    logging!(
                        warn,
                        Type::Config,
                        "[首次启动] 配置验证未通过，使用默认最小配置启动: {}",
                        error_msg
                    );
                    CoreManager::global()
                        .use_default_config("config_validate::boot_error", &error_msg)
                        .await?;
                    Ok(Some(("config_validate::boot_error", error_msg)))
                }
                Err(err) => {
                    logging!(warn, Type::Config, "验证过程执行失败: {}", err);
                    CoreManager::global()
                        .use_default_config("config_validate::process_terminated", "")
                        .await?;
                    Ok(Some(("config_validate::process_terminated", String::new())))
                }
            }
        } else {
            logging!(warn, Type::Config, "生成配置文件失败，使用默认配置");
            CoreManager::global()
                .use_default_config("config_validate::error", "")
                .await?;
            Ok(Some(("config_validate::error", String::new())))
        }
    }

    pub async fn generate_file(typ: ConfigType) -> Result<PathBuf> {
        let path = match typ {
            ConfigType::Run => dirs::app_home_dir()?.join(files::RUNTIME_CONFIG),
            ConfigType::Check => dirs::app_home_dir()?.join(files::CHECK_CONFIG),
        };

        let runtime = Self::runtime().await;
        let runtime_lastest = runtime.latest_arc();
        // Fall back to committed config if runtime config is missing
        let runtime_data = runtime.data_arc();
        let config = runtime_lastest
            .config
            .as_ref()
            .or_else(|| runtime_data.config.as_ref())
            .ok_or_else(|| anyhow!("failed to generate runtime config, might need to restart application"))?;

        help::save_yaml(&path, config, Some("# Generated by Clash Ultra")).await?;
        Ok(path)
    }

    pub async fn generate() -> Result<()> {
        let (mut config, exists_keys, logs) = enhance::enhance().await?;

        let verge = Self::app_config().await.latest_arc();
        apply_port_proxies(
            &mut config,
            verge.port_proxies.as_deref(),
            verge.enabled_profile_uids.as_deref(),
        )
        .await?;
        sanitize_tunnels_proxy(&mut config);

        Self::runtime().await.edit_draft(|d| {
            *d = IRuntime {
                config: Some(config),
                exists_keys,
                chain_logs: logs,
            }
        });

        Ok(())
    }

    pub async fn verify_config_initialization() {
        let backoff = ExponentialBuilder::default()
            .with_min_delay(std::time::Duration::from_millis(100))
            .with_max_delay(std::time::Duration::from_secs(2))
            .with_factor(2.0)
            .with_max_times(10);

        if let Err(e) = (|| async {
            if Self::runtime().await.latest_arc().config.is_some() {
                return Ok::<(), anyhow::Error>(());
            }
            Self::generate().await
        })
        .retry(backoff)
        .await
        {
            logging!(error, Type::Setup, "Config init verification failed: {}", e);
        }
    }

    // 升级草稿为正式数据，并写入文件。避免用户行为丢失。
    // 仅在应用退出、重启、关机监听事件启用
    pub async fn apply_all_and_save_file() {
        logging!(info, Type::Config, "save all draft data");
        let save_clash_task = AsyncHandler::spawn(|| async {
            let clash = Self::clash().await;
            clash.apply();
            logging_error!(Type::Config, clash.data_arc().save_config().await);
        });

        let save_verge_task = AsyncHandler::spawn(|| async {
            let verge = Self::app_config().await;
            verge.apply();
            logging_error!(Type::Config, verge.data_arc().save_file().await);
        });

        let save_profiles_task = AsyncHandler::spawn(|| async {
            let profiles = Self::profiles().await;
            profiles.apply();
            logging_error!(Type::Config, profiles.data_arc().save_file().await);
        });

        let _ = tokio::join!(save_clash_task, save_verge_task, save_profiles_task);
        logging!(info, Type::Config, "save all draft data finished");
    }
}

const PORT_PROXY_RULE_PREFIX: &str = "port-proxy-";

fn selected_entries_to_map(selected: Option<&[PrfSelected]>) -> HashMap<String, String> {
    selected
        .map(|items| {
            items
                .iter()
                .filter_map(|item| Some((item.name.as_ref()?.clone(), item.now.as_ref()?.clone())))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default()
}

async fn apply_port_proxies(
    config: &mut Mapping,
    port_proxies: Option<&[IVergePortProxy]>,
    enabled_profile_uids: Option<&[String]>,
) -> Result<()> {
    let Some(port_proxies) = port_proxies else {
        return Ok(());
    };

    let enabled_uid_set: HashSet<&str> = enabled_profile_uids
        .unwrap_or_default()
        .iter()
        .map(String::as_str)
        .collect();
    let active_port_proxies = port_proxies
        .iter()
        .filter(|item| {
            item.enabled.unwrap_or(true)
                && item
                    .subscription_uid
                    .as_deref()
                    .is_some_and(|uid| enabled_uid_set.contains(uid))
        })
        .cloned()
        .collect::<Vec<_>>();

    let profiles = Config::profiles().await;
    let profiles_arc = profiles.latest_arc();
    let current_profile_uid = profiles_arc.get_current().cloned();
    let fallback_selected_map = current_profile_uid
        .as_deref()
        .and_then(|uid| profiles_arc.get_item(uid).ok())
        .map(|item| selected_entries_to_map(item.selected.as_deref()))
        .unwrap_or_default();
    let runtime_rule_config = config.clone();
    let profile_config_map = read_port_proxy_subscription_configs(&active_port_proxies).await?;
    let proxy_name_map = merge_port_proxy_subscription_items(config, &profile_config_map).await?;

    let mut valid: HashSet<String> = HashSet::with_capacity(64);
    collect_names(config, "proxies", &mut valid);
    collect_names(config, "proxy-groups", &mut valid);
    valid.insert("DIRECT".into());
    valid.insert("REJECT".into());

    let port_proxy_listen = if config
        .get("allow-lan")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };

    let managed_ports: HashSet<u16> = port_proxies.iter().filter_map(|item| item.port).collect();
    let managed_names: HashSet<String> = port_proxies.iter().filter_map(|item| item.name.clone()).collect();

    remove_managed_port_proxy_sub_rules(config);

    let mut next_listeners = Vec::new();
    for item in active_port_proxies.iter() {
        let Some(port) = item.port else { continue };
        let chain_target = create_port_proxy_chain_target(config, item, &proxy_name_map, &mut valid);
        let proxy_type = item.r#type.as_deref().unwrap_or("mixed");
        if !matches!(proxy_type, "mixed" | "http" | "socks") {
            continue;
        }

        let id = item
            .id
            .as_deref()
            .unwrap_or_else(|| item.name.as_deref().unwrap_or("default"));
        let rule_name = format!("{PORT_PROXY_RULE_PREFIX}{id}");
        let name = item.name.as_deref().unwrap_or(&rule_name);

        let mut listener = Mapping::new();
        listener.insert("name".into(), name.into());
        listener.insert("type".into(), proxy_type.into());
        // 端口代理的局域网访问统一跟随 Clash 的 allow-lan：
        // - allow-lan=false: 只监听本机，避免无意暴露端口
        // - allow-lan=true : 监听全部地址，让局域网设备可访问这些端口代理
        listener.insert("listen".into(), port_proxy_listen.into());
        listener.insert("port".into(), port.into());
        if proxy_type != "http" {
            listener.insert("udp".into(), item.udp.unwrap_or(true).into());
        }

        if let Some(chain_target) = chain_target.filter(|target| valid.contains(target)) {
            // 端口级全局链式代理：该 listener 只借用端口作为入站，所有进入该端口的流量直接走独立链式出口，
            // 不再先经过订阅 rules / 动态节点组。关闭链式代理后恢复 rule 入站。
            listener.insert("proxy".into(), chain_target.as_str().into());
        } else {
            let route_mode = normalize_port_proxy_route_mode(item);
            let profile_key = get_port_proxy_profile_key(item);
            let source_config = profile_config_map.get(profile_key.as_str()).or_else(|| {
                (Some(profile_key.as_str()) == current_profile_uid.as_deref()).then_some(&runtime_rule_config)
            });
            let source_ref_map = proxy_name_map.get(profile_key.as_str());

            // 端口代理普通模式下仍然使用订阅 rules 决定走哪个代理组，但每个端口代理
            // 需要拥有自己独立的代理组运行副本，否则多个端口代理选择同一个订阅时，
            // select 代理组的“当前选中节点”会被共享。
            //
            // 这里仅端口化 proxy-groups 与 rules 引用；底层 proxies / providers 仍复用
            // 订阅级前缀后的名称，避免复制大量真实节点。
            let port_ref_map = source_config.map(|source| {
                let subscription_name = profiles_arc
                    .get_item(profile_key.as_str())
                    .ok()
                    .and_then(|item| item.name.clone())
                    .or_else(|| item.subscription_name.clone())
                    .unwrap_or_else(|| profile_key.clone());
                let item_selected_map = item
                    .selected
                    .as_ref()
                    .map(|selected| selected_entries_to_map(Some(selected.as_slice())))
                    .filter(|selected| !selected.is_empty())
                    .unwrap_or_else(|| fallback_selected_map.clone());
                merge_port_scoped_proxy_groups(
                    config,
                    source,
                    item,
                    source_ref_map,
                    subscription_name.as_str(),
                    &item_selected_map,
                    &mut valid,
                )
            });
            let effective_ref_map = port_ref_map.as_ref().or(source_ref_map);
            let fallback_target = resolve_port_proxy_target_with_ref(item, effective_ref_map)
                .or_else(|| first_port_proxy_group_target(source_config, effective_ref_map))
                .filter(|target| valid.contains(target))
                .unwrap_or_else(|| "DIRECT".into());
            match route_mode {
                "direct" => {
                    // 端口级直连：只影响当前 listener，不切换 Mihomo 顶层 direct mode。
                    listener.insert("proxy".into(), "DIRECT".into());
                }
                "global" => {
                    // 端口级全局：当前 listener 的所有流量直接进入该订阅的首选代理组/节点，
                    // 不再经过 rules；用户仍可在端口卡片内切换该端口自己的代理组选择。
                    listener.insert("proxy".into(), fallback_target.as_str().into());
                }
                _ => {
                    ensure_port_proxy_sub_rule(
                        config,
                        &rule_name,
                        source_config,
                        effective_ref_map,
                        fallback_target.as_str(),
                    );
                    listener.insert("rule".into(), rule_name.as_str().into());
                }
            }
        }

        next_listeners.push(Value::Mapping(listener));
    }

    let listeners = config
        .entry("listeners".into())
        .or_insert_with(|| Value::Sequence(Vec::new()));
    if let Some(items) = listeners.as_sequence_mut() {
        items.retain(|item| {
            let Some(mapping) = item.as_mapping() else {
                return true;
            };

            let managed_rule = mapping
                .get("rule")
                .and_then(|value| value.as_str())
                .is_some_and(|rule| rule.starts_with(PORT_PROXY_RULE_PREFIX));
            let managed_port = mapping
                .get("port")
                .and_then(|value| value.as_u64())
                .and_then(|port| u16::try_from(port).ok())
                .is_some_and(|port| managed_ports.contains(&port));
            let managed_name = mapping
                .get("name")
                .and_then(|value| value.as_str())
                .is_some_and(|name| managed_names.contains(name));

            !(managed_rule || managed_port || managed_name)
        });
        items.extend(next_listeners);
    }

    Ok(())
}

#[derive(Clone, Debug, Default)]
struct PortProxyRefMap {
    /// Outbound names used by rules and chains: proxies, proxy-groups and proxy-providers.
    outbound: HashMap<String, String>,
    /// Rule provider names used by RULE-SET rules.
    rule_providers: HashMap<String, String>,
    /// Sub-rule names used by SUB-RULE rules.
    sub_rules: HashMap<String, String>,
}

type PortProxyNameMap = HashMap<String, PortProxyRefMap>;
type PortProxyProfileConfigMap = HashMap<String, Mapping>;

fn normalize_port_proxy_route_mode(item: &IVergePortProxy) -> &str {
    match item.route_mode.as_deref() {
        Some("global") => "global",
        Some("direct") => "direct",
        _ => "rule",
    }
}

fn get_port_proxy_profile_key(item: &IVergePortProxy) -> String {
    item.subscription_uid.as_deref().unwrap_or("__current__").into()
}

fn get_port_proxy_subscription_uids(item: &IVergePortProxy) -> Vec<&str> {
    item.subscription_uid
        .as_deref()
        .map(|uid| vec![uid])
        .unwrap_or_default()
}

fn resolve_port_proxy_name(item: &IVergePortProxy, proxy_name_map: &PortProxyNameMap, proxy: &str) -> String {
    let profile_key = get_port_proxy_profile_key(item);
    proxy_name_map
        .get(&profile_key)
        .and_then(|refs| refs.outbound.get(proxy))
        .cloned()
        .unwrap_or_else(|| proxy.into())
}

fn resolve_port_proxy_target_with_ref(item: &IVergePortProxy, ref_map: Option<&PortProxyRefMap>) -> Option<String> {
    item.proxy.as_deref().map(|proxy| {
        ref_map
            .and_then(|refs| refs.outbound.get(proxy))
            .cloned()
            .unwrap_or_else(|| proxy.into())
    })
}

fn create_port_proxy_chain_target(
    config: &mut Mapping,
    item: &IVergePortProxy,
    proxy_name_map: &PortProxyNameMap,
    valid: &mut HashSet<String>,
) -> Option<String> {
    let chain = item.chain.as_ref()?;
    if !chain.enabled.unwrap_or(false) {
        return None;
    }

    let chain_nodes = chain
        .nodes
        .as_ref()?
        .iter()
        .filter(|name| !name.is_empty())
        .map(|name| resolve_port_proxy_name(item, proxy_name_map, name))
        .collect::<Vec<_>>();
    if chain_nodes.len() < 2 {
        return None;
    }

    let proxies_value = config
        .entry("proxies".into())
        .or_insert_with(|| Value::Sequence(Vec::new()));
    let proxies = proxies_value.as_sequence_mut()?;

    let mut existing_names = proxies
        .iter()
        .filter_map(|proxy| {
            proxy
                .as_mapping()
                .and_then(|mapping| mapping.get("name"))
                .and_then(|name| name.as_str())
                .map(String::from)
        })
        .collect::<HashSet<_>>();

    let chain_id = item.id.as_deref().or(item.name.as_deref()).unwrap_or("default");
    let mut previous_name: Option<String> = None;

    for (index, node_name) in chain_nodes.iter().enumerate() {
        let mut proxy_mapping = proxies.iter().find_map(|proxy| {
            let mapping = proxy.as_mapping()?;
            let name = mapping.get("name").and_then(|value| value.as_str())?;
            (name == node_name.as_str()).then(|| mapping.clone())
        })?;

        let clone_name = make_unique_port_proxy_chain_name(
            format!("__ultra_port_chain__{chain_id}__{index}__{node_name}").into(),
            &mut existing_names,
        );
        proxy_mapping.insert("name".into(), clone_name.as_str().into());
        proxy_mapping.remove("dialer-proxy");
        proxy_mapping.insert("x-ultra-port-proxy-chain".into(), chain_id.into());
        if let Some(previous_name) = previous_name.as_ref() {
            proxy_mapping.insert("dialer-proxy".into(), previous_name.as_str().into());
        }

        proxies.push(Value::Mapping(proxy_mapping));
        valid.insert(clone_name.clone());
        previous_name = Some(clone_name);
    }

    previous_name
}

fn make_unique_port_proxy_chain_name(base: String, existing_names: &mut HashSet<String>) -> String {
    if existing_names.insert(base.clone()) {
        return base;
    }

    let mut index = 2;
    loop {
        let candidate: String = format!("{base}__{index}").into();
        if existing_names.insert(candidate.clone()) {
            return candidate;
        }
        index += 1;
    }
}

fn ensure_port_proxy_sub_rule(
    config: &mut Mapping,
    rule_name: &str,
    source_config: Option<&Mapping>,
    source_ref_map: Option<&PortProxyRefMap>,
    fallback_target: &str,
) {
    if let (Some(source), Some(ref_map)) = (source_config, source_ref_map) {
        merge_port_proxy_sub_rules(config, source, ref_map);
    }

    let mut rules = source_config
        .and_then(|source| source.get("rules"))
        .and_then(Value::as_sequence)
        .cloned()
        .filter(|rules| !rules.is_empty())
        .unwrap_or_else(|| {
            let mut rules = Vec::new();
            rules.push(Value::String(format!("MATCH,{fallback_target}")));
            rules
        });
    if let Some(ref_map) = source_ref_map {
        rewrite_rule_targets(&mut rules, ref_map);
    }

    if !rules.iter().any(is_match_rule) {
        rules.push(Value::String(format!("MATCH,{fallback_target}")));
    }

    let sub_rules = config
        .entry("sub-rules".into())
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    if let Some(sub_rules) = sub_rules.as_mapping_mut() {
        sub_rules.insert(rule_name.into(), Value::Sequence(rules));
    }
}

fn merge_port_proxy_sub_rules(config: &mut Mapping, source: &Mapping, ref_map: &PortProxyRefMap) {
    let Some(source_sub_rules) = source.get("sub-rules").and_then(Value::as_mapping) else {
        return;
    };
    if source_sub_rules.is_empty() {
        return;
    }

    let target_sub_rules = config
        .entry("sub-rules".into())
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    let Some(target_sub_rules) = target_sub_rules.as_mapping_mut() else {
        return;
    };

    for (name, rules) in source_sub_rules {
        let Some(raw_name) = name.as_str() else {
            continue;
        };
        let Some(mapped_name) = ref_map.sub_rules.get(raw_name) else {
            continue;
        };
        let mapped_key = Value::String(mapped_name.to_string());
        if target_sub_rules.contains_key(&mapped_key) {
            continue;
        }

        let mut rules = rules.clone();
        if let Some(items) = rules.as_sequence_mut() {
            rewrite_rule_targets(items, ref_map);
        }
        target_sub_rules.insert(mapped_key, rules);
    }
}

fn is_match_rule(rule: &Value) -> bool {
    match rule {
        Value::String(rule) => {
            let rule = rule.trim_start();
            rule.get(..5).is_some_and(|prefix| prefix.eq_ignore_ascii_case("MATCH"))
        }
        Value::Sequence(items) => items
            .first()
            .and_then(Value::as_str)
            .is_some_and(|rule_type| rule_type.eq_ignore_ascii_case("MATCH")),
        Value::Mapping(mapping) => mapping
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(|rule_type| rule_type.eq_ignore_ascii_case("MATCH")),
        _ => false,
    }
}

fn rewrite_rule_targets(rules: &mut [Value], ref_map: &PortProxyRefMap) {
    for rule in rules {
        match rule {
            Value::String(rule) => {
                if let Some(next_rule) = rewrite_rule_string_target(rule, ref_map) {
                    *rule = next_rule.into();
                }
            }
            Value::Sequence(items) => rewrite_rule_sequence_target(items, ref_map),
            Value::Mapping(mapping) => rewrite_rule_mapping_target(mapping, ref_map),
            _ => {}
        }
    }
}

fn rewrite_rule_string_target(rule: &str, ref_map: &PortProxyRefMap) -> Option<String> {
    let mut parts = split_rule_fields(rule);
    let rule_type = parts.first().copied()?;

    let mut changed = if rule_type.eq_ignore_ascii_case("RULE-SET")
        && let Some(provider) = parts.get_mut(1)
        && let Some(mapped) = ref_map.rule_providers.get(*provider)
    {
        *provider = mapped.as_str();
        true
    } else {
        false
    };

    if rule_type.eq_ignore_ascii_case("SUB-RULE") {
        let sub_rule = parts.get_mut(2)?;
        let mapped = ref_map.sub_rules.get(*sub_rule)?;
        *sub_rule = mapped.as_str();
        return Some(parts.join(",").into());
    }

    if let Some(target_index) = rule_target_index(rule_type)
        && target_index < parts.len()
        && let Some(mapped) = ref_map.outbound.get(parts[target_index])
    {
        parts[target_index] = mapped.as_str();
        changed = true;
    }

    changed.then(|| parts.join(",").into())
}

fn split_rule_fields(rule: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut depth = 0usize;

    for (index, ch) in rule.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                parts.push(rule[start..index].trim());
                start = index + ch.len_utf8();
            }
            _ => {}
        }
    }

    parts.push(rule[start..].trim());
    parts
}

fn rewrite_rule_sequence_target(items: &mut [Value], ref_map: &PortProxyRefMap) {
    let Some(rule_type) = items.first().and_then(Value::as_str).map(str::to_owned) else {
        return;
    };
    if rule_type.eq_ignore_ascii_case("RULE-SET")
        && let Some(provider) = items.get_mut(1)
        && let Some(mapped) = provider
            .as_str()
            .and_then(|provider| ref_map.rule_providers.get(provider))
    {
        *provider = mapped.as_str().into();
    } else if rule_type.eq_ignore_ascii_case("SUB-RULE") {
        if let Some(sub_rule) = items.get_mut(2)
            && let Some(mapped) = sub_rule.as_str().and_then(|name| ref_map.sub_rules.get(name))
        {
            *sub_rule = mapped.as_str().into();
        }
        return;
    }

    let Some(target_index) = rule_target_index(rule_type.as_str()) else {
        return;
    };
    let Some(target) = items.get_mut(target_index) else {
        return;
    };
    let Some(mapped) = target.as_str().and_then(|target| ref_map.outbound.get(target)) else {
        return;
    };
    *target = mapped.as_str().into();
}

fn rewrite_rule_mapping_target(mapping: &mut Mapping, ref_map: &PortProxyRefMap) {
    let rule_type = mapping.get("type").and_then(Value::as_str).map(str::to_owned);

    if rule_type
        .as_deref()
        .is_some_and(|rule_type| rule_type.eq_ignore_ascii_case("RULE-SET"))
    {
        for key in ["rule-set", "rule_set", "provider", "payload"] {
            let Some(value) = mapping.get_mut(key) else {
                continue;
            };
            let Some(mapped) = value.as_str().and_then(|provider| ref_map.rule_providers.get(provider)) else {
                continue;
            };
            *value = mapped.as_str().into();
        }
    }

    if rule_type
        .as_deref()
        .is_some_and(|rule_type| rule_type.eq_ignore_ascii_case("SUB-RULE"))
    {
        for key in [
            "sub-rule",
            "sub_rule",
            "sub-rule-name",
            "sub_rule_name",
            "rule",
            "name",
            "target",
        ] {
            let Some(value) = mapping.get_mut(key) else {
                continue;
            };
            let Some(mapped) = value.as_str().and_then(|name| ref_map.sub_rules.get(name)) else {
                continue;
            };
            *value = mapped.as_str().into();
        }
        return;
    }

    for key in ["proxy", "policy", "target"] {
        let Some(value) = mapping.get_mut(key) else {
            continue;
        };
        let Some(mapped) = value.as_str().and_then(|target| ref_map.outbound.get(target)) else {
            continue;
        };
        *value = mapped.as_str().into();
    }
}

fn rule_target_index(rule_type: &str) -> Option<usize> {
    let rule_type = rule_type.trim().to_ascii_uppercase();
    match rule_type.as_str() {
        "MATCH" => Some(1),
        "IP-CIDR" | "IP-CIDR6" | "IP-ASN" | "GEOIP" | "GEOSITE" | "DOMAIN" | "DOMAIN-SUFFIX" | "DOMAIN-KEYWORD"
        | "DOMAIN-REGEX" | "PROCESS-NAME" | "PROCESS-PATH" | "PROCESS-PATH-REGEX" | "SRC-IP-CIDR" | "DST-PORT"
        | "SRC-PORT" | "IN-PORT" | "IN-TYPE" | "IN-NAME" | "NETWORK" | "UID" | "GID" | "RULE-SET" | "SCRIPT" => Some(2),
        "AND" | "OR" | "NOT" => Some(2),
        _ => None,
    }
}

async fn read_port_proxy_subscription_configs(port_proxies: &[IVergePortProxy]) -> Result<PortProxyProfileConfigMap> {
    let default_rule_template = Config::app_config().await.latest_arc().default_rule_template.clone();
    let profiles = Config::profiles().await;
    let profiles_arc = profiles.latest_arc();
    let current_profile_uid = profiles_arc.get_current().map(String::as_str);
    let profile_uids: HashSet<&str> = port_proxies
        .iter()
        .filter(|item| item.enabled.unwrap_or(true))
        .flat_map(get_port_proxy_subscription_uids)
        .filter(|uid| Some(*uid) != current_profile_uid)
        .collect();

    if profile_uids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut profile_config_map = HashMap::new();

    for uid in profile_uids {
        let Ok(item) = profiles_arc.get_item(uid) else {
            continue;
        };

        let mut mapping = read_profile_mapping(item)
            .await
            .with_context(|| format!("failed to read port proxy subscription profile {uid}"))?;
        ensure_default_rule_template_with_template(&mut mapping, default_rule_template.as_deref());
        profile_config_map.insert(uid.into(), mapping);
    }

    Ok(profile_config_map)
}

async fn merge_port_proxy_subscription_items(
    config: &mut Mapping,
    profile_config_map: &PortProxyProfileConfigMap,
) -> Result<PortProxyNameMap> {
    if profile_config_map.is_empty() {
        return Ok(HashMap::new());
    }

    let current_profile_uid = Config::profiles().await.latest_arc().get_current().cloned();
    let profiles = Config::profiles().await;
    let profiles_arc = profiles.latest_arc();
    let mut proxy_name_map = HashMap::new();

    for (uid, mapping) in profile_config_map {
        if Some(uid.as_str()) == current_profile_uid.as_deref() {
            continue;
        }

        let prefix = profiles_arc
            .get_item(uid)
            .ok()
            .and_then(|item| item.name.as_deref())
            .unwrap_or(uid.as_str());
        let names = merge_prefixed_subscription(config, mapping, uid, prefix);
        proxy_name_map.insert(uid.clone(), names);
    }

    Ok(proxy_name_map)
}

fn make_subscription_scoped_name(prefix: &str, name: &str) -> String {
    format!("{prefix} - {name}").into()
}

fn merge_prefixed_subscription(target: &mut Mapping, source: &Mapping, uid: &str, prefix: &str) -> PortProxyRefMap {
    let proxy_names = collect_sequence_names(source, "proxies");
    let group_names = collect_sequence_names(source, "proxy-groups");
    let proxy_provider_names = collect_mapping_keys(source, "proxy-providers");
    let rule_provider_names = collect_mapping_keys(source, "rule-providers");
    let sub_rule_names = collect_mapping_keys(source, "sub-rules");

    let mut ref_map = PortProxyRefMap::default();
    for name in proxy_names
        .iter()
        .chain(group_names.iter())
        .chain(proxy_provider_names.iter())
    {
        ref_map
            .outbound
            .insert(name.clone(), make_subscription_scoped_name(prefix, name));
    }
    for name in rule_provider_names.iter() {
        ref_map
            .rule_providers
            .insert(name.clone(), make_subscription_scoped_name(prefix, name));
    }
    for name in sub_rule_names.iter() {
        ref_map
            .sub_rules
            .insert(name.clone(), make_subscription_scoped_name(prefix, name));
    }

    merge_prefixed_named_sequence(target, source, "proxies", &ref_map.outbound, uid);
    merge_prefixed_named_sequence(target, source, "proxy-groups", &ref_map.outbound, uid);
    merge_prefixed_mapping(target, source, "proxy-providers", &ref_map.outbound, uid);
    merge_prefixed_mapping(target, source, "rule-providers", &ref_map.rule_providers, uid);

    ref_map
}

fn make_port_proxy_scope_prefix(item: &IVergePortProxy, subscription_name: &str) -> String {
    let port_proxy_name = item
        .name
        .as_deref()
        .filter(|name| !name.trim().is_empty())
        .map(str::to_owned)
        .or_else(|| item.port.map(|port| port.to_string()))
        .or_else(|| item.id.clone().map(|id| id.to_string()))
        .unwrap_or_else(|| "端口代理".into());

    format!("{subscription_name}({port_proxy_name})").into()
}

fn make_port_proxy_group_name(item: &IVergePortProxy, subscription_name: &str, group_name: &str) -> String {
    make_subscription_scoped_name(
        make_port_proxy_scope_prefix(item, subscription_name).as_str(),
        group_name,
    )
}

fn make_port_proxy_sub_rule_name(item: &IVergePortProxy, sub_rule_name: &str) -> String {
    let id = item
        .id
        .as_deref()
        .or(item.name.as_deref())
        .map(str::to_owned)
        .or_else(|| item.port.map(|port| port.to_string()))
        .unwrap_or_else(|| "default".into());

    format!("{PORT_PROXY_RULE_PREFIX}{id}-{sub_rule_name}").into()
}

fn merge_port_scoped_proxy_groups(
    target: &mut Mapping,
    source: &Mapping,
    item: &IVergePortProxy,
    subscription_ref_map: Option<&PortProxyRefMap>,
    subscription_name: &str,
    selected_map: &HashMap<String, String>,
    valid: &mut HashSet<String>,
) -> PortProxyRefMap {
    let proxy_names = collect_sequence_names(source, "proxies");
    let group_names = collect_sequence_names(source, "proxy-groups");
    let proxy_provider_names = collect_mapping_keys(source, "proxy-providers");
    let rule_provider_names = collect_mapping_keys(source, "rule-providers");
    let sub_rule_names = collect_mapping_keys(source, "sub-rules");

    let mut ref_map = PortProxyRefMap::default();

    // 节点与 proxy-provider 仍复用订阅级名称；只有代理组改为端口级名称。
    for name in proxy_names.iter().chain(proxy_provider_names.iter()) {
        let mapped = subscription_ref_map
            .and_then(|refs| refs.outbound.get(name))
            .cloned()
            .unwrap_or_else(|| name.clone());
        ref_map.outbound.insert(name.clone(), mapped);
    }

    for name in group_names.iter() {
        ref_map
            .outbound
            .insert(name.clone(), make_port_proxy_group_name(item, subscription_name, name));
    }

    for name in rule_provider_names.iter() {
        let mapped = subscription_ref_map
            .and_then(|refs| refs.rule_providers.get(name))
            .cloned()
            .unwrap_or_else(|| name.clone());
        ref_map.rule_providers.insert(name.clone(), mapped);
    }

    for name in sub_rule_names.iter() {
        ref_map
            .sub_rules
            .insert(name.clone(), make_port_proxy_sub_rule_name(item, name));
    }

    merge_port_scoped_proxy_group_sequence(
        target,
        source,
        item,
        &ref_map.outbound,
        subscription_name,
        selected_map,
        valid,
    );

    ref_map
}

fn merge_port_scoped_proxy_group_sequence(
    target: &mut Mapping,
    source: &Mapping,
    item: &IVergePortProxy,
    name_map: &HashMap<String, String>,
    subscription_name: &str,
    selected_map: &HashMap<String, String>,
    valid: &mut HashSet<String>,
) {
    let Some(source_items) = source.get("proxy-groups").and_then(|v| v.as_sequence()) else {
        return;
    };

    let target_value = target
        .entry("proxy-groups".into())
        .or_insert_with(|| Value::Sequence(Vec::new()));
    let Some(target_items) = target_value.as_sequence_mut() else {
        return;
    };

    let mut existing = HashSet::new();
    for item in target_items.iter() {
        if let Some(name) = item
            .as_mapping()
            .and_then(|mapping| mapping.get("name"))
            .and_then(|name| name.as_str())
        {
            existing.insert(name.to_owned());
        }
    }

    let scope_prefix = make_port_proxy_scope_prefix(item, subscription_name);
    let port_proxy_id = item.id.as_deref().unwrap_or_default();
    let subscription_uid = item.subscription_uid.as_deref().unwrap_or_default();

    for source_item in source_items {
        let mut cloned = source_item.clone();
        let Some(mapping) = cloned.as_mapping_mut() else {
            continue;
        };
        let Some(raw_name) = mapping.get("name").and_then(|name| name.as_str()) else {
            continue;
        };
        let Some(port_group_name) = name_map.get(raw_name).cloned() else {
            continue;
        };

        if !existing.insert(port_group_name.to_string()) {
            valid.insert(port_group_name);
            continue;
        }

        mapping.insert("name".into(), port_group_name.as_str().into());
        rewrite_group_refs(mapping, "proxies", name_map);
        rewrite_group_refs(mapping, "all", name_map);
        rewrite_group_refs(mapping, "use", name_map);
        rewrite_single_group_ref(mapping, "now", name_map);
        restore_port_scoped_group_now(mapping, port_group_name.as_str(), selected_map);
        mapping.insert("x-ultra-port-proxy-id".into(), port_proxy_id.into());
        mapping.insert("x-ultra-port-proxy-subscription".into(), subscription_uid.into());
        mapping.insert("x-ultra-port-proxy-scope".into(), scope_prefix.as_str().into());

        valid.insert(port_group_name);
        target_items.push(cloned);
    }
}

fn first_port_proxy_group_target(source: Option<&Mapping>, ref_map: Option<&PortProxyRefMap>) -> Option<String> {
    let first_group = source
        .and_then(|source| source.get("proxy-groups"))
        .and_then(Value::as_sequence)
        .and_then(|groups| groups.first())
        .and_then(Value::as_mapping)
        .and_then(|mapping| mapping.get("name"))
        .and_then(Value::as_str)?;

    Some(
        ref_map
            .and_then(|refs| refs.outbound.get(first_group))
            .cloned()
            .unwrap_or_else(|| first_group.into()),
    )
}

fn collect_sequence_names(source: &Mapping, key: &str) -> Vec<String> {
    let Some(items) = source.get(key).and_then(|v| v.as_sequence()) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            item.as_mapping()
                .and_then(|mapping| mapping.get("name"))
                .and_then(|name| name.as_str())
                .map(String::from)
        })
        .filter(|name| !name.is_empty())
        .collect()
}

fn collect_mapping_keys(source: &Mapping, key: &str) -> Vec<String> {
    source
        .get(key)
        .and_then(Value::as_mapping)
        .map(|mapping| {
            mapping
                .keys()
                .filter_map(Value::as_str)
                .map(String::from)
                .filter(|name| !name.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn merge_prefixed_named_sequence(
    target: &mut Mapping,
    source: &Mapping,
    key: &str,
    name_map: &HashMap<String, String>,
    uid: &str,
) {
    let Some(source_items) = source.get(key).and_then(|v| v.as_sequence()) else {
        return;
    };

    let target_value = target.entry(key.into()).or_insert_with(|| Value::Sequence(Vec::new()));
    let Some(target_items) = target_value.as_sequence_mut() else {
        return;
    };

    let mut existing = HashSet::new();
    for item in target_items.iter() {
        if let Some(name) = item
            .as_mapping()
            .and_then(|mapping| mapping.get("name"))
            .and_then(|name| name.as_str())
        {
            existing.insert(name.to_owned());
        }
    }

    for item in source_items {
        let mut item = item.clone();
        let Some(mapping) = item.as_mapping_mut() else {
            continue;
        };
        let Some(raw_name) = mapping.get("name").and_then(|name| name.as_str()) else {
            continue;
        };
        let Some(prefixed_name) = name_map.get(raw_name).cloned() else {
            continue;
        };

        if !existing.insert(prefixed_name.to_string()) {
            continue;
        }

        mapping.insert("name".into(), prefixed_name.as_str().into());
        rewrite_group_refs(mapping, "proxies", name_map);
        rewrite_group_refs(mapping, "all", name_map);
        rewrite_group_refs(mapping, "use", name_map);
        rewrite_single_group_ref(mapping, "now", name_map);
        rewrite_single_group_ref(mapping, "dialer-proxy", name_map);
        mapping.insert("x-ultra-port-proxy-subscription".into(), uid.into());
        target_items.push(item);
    }
}

fn rewrite_single_group_ref(mapping: &mut Mapping, key: &str, name_map: &HashMap<String, String>) {
    let Some(value) = mapping.get_mut(key) else {
        return;
    };
    let Some(name) = value.as_str() else {
        return;
    };
    let Some(mapped_name) = name_map.get(name) else {
        return;
    };
    *value = mapped_name.as_str().into();
}

fn restore_port_scoped_group_now(mapping: &mut Mapping, group_name: &str, selected_map: &HashMap<String, String>) {
    let Some(saved_now) = selected_map.get(group_name) else {
        return;
    };

    // 只恢复仍然存在于该端口级代理组里的节点，避免订阅更新后留下无效 now。
    // provider 型代理组的节点由内核运行时展开，YAML 中通常只有 use 字段，
    // 这里无法静态验证节点列表，因此只要存在 provider 引用就允许恢复保存的 now。
    let exists_in_proxies = mapping
        .get("proxies")
        .and_then(Value::as_sequence)
        .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(saved_now.as_str())));
    let exists_in_all = mapping
        .get("all")
        .and_then(Value::as_sequence)
        .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(saved_now.as_str())));
    let has_provider_use = mapping
        .get("use")
        .and_then(Value::as_sequence)
        .is_some_and(|items| !items.is_empty());

    if exists_in_proxies || exists_in_all || has_provider_use {
        mapping.insert("now".into(), saved_now.as_str().into());
    }
}

fn rewrite_group_refs(mapping: &mut Mapping, key: &str, name_map: &HashMap<String, String>) {
    let Some(items) = mapping.get_mut(key).and_then(|v| v.as_sequence_mut()) else {
        return;
    };

    for item in items {
        if let Some(name) = item.as_str()
            && let Some(mapped_name) = name_map.get(name)
        {
            *item = mapped_name.as_str().into();
        }
    }
}

fn merge_prefixed_mapping(
    target: &mut Mapping,
    source: &Mapping,
    key: &str,
    name_map: &HashMap<String, String>,
    uid: &str,
) {
    let Some(source_mapping) = source.get(key).and_then(|v| v.as_mapping()) else {
        return;
    };

    let target_value = target
        .entry(key.into())
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    let Some(target_mapping) = target_value.as_mapping_mut() else {
        return;
    };

    for (name, value) in source_mapping {
        let Some(raw_name) = name.as_str() else {
            continue;
        };
        let Some(prefixed_name) = name_map.get(raw_name) else {
            continue;
        };
        let prefixed_key = Value::String(prefixed_name.to_string());
        if target_mapping.contains_key(&prefixed_key) {
            continue;
        }

        let mut value = value.clone();
        if let Some(mapping) = value.as_mapping_mut() {
            mapping.insert("x-ultra-port-proxy-subscription".into(), uid.into());
        }
        target_mapping.insert(prefixed_key, value);
    }
}

async fn read_profile_mapping(item: &PrfItem) -> Result<Mapping> {
    let file = item
        .file
        .as_ref()
        .ok_or_else(|| anyhow!("failed to get the file field"))?;
    let path = dirs::app_profiles_dir()?.join(file.as_str());
    help::read_mapping(&path).await
}

fn remove_managed_port_proxy_sub_rules(config: &mut Mapping) {
    let Some(sub_rules_map) = config.get_mut("sub-rules").and_then(|value| value.as_mapping_mut()) else {
        return;
    };

    sub_rules_map.retain(|name, _| {
        name.as_str()
            .is_none_or(|name| !name.starts_with(PORT_PROXY_RULE_PREFIX))
    });
}

fn sanitize_tunnels_proxy(config: &mut Mapping) {
    // tunnels 和 listeners 都可以指定 proxy；运行时生成配置前移除无效引用，避免核心校验失败。
    let should_validate_tunnels = config
        .get("tunnels")
        .and_then(|v| v.as_sequence())
        .is_some_and(|items| proxy_refs_need_validation(items));
    let should_validate_listeners = config
        .get("listeners")
        .and_then(|v| v.as_sequence())
        .is_some_and(|items| proxy_refs_need_validation(items));

    if !should_validate_tunnels && !should_validate_listeners {
        return;
    }

    // 在需要时，收集可用目标（proxies + proxy-groups + 内建）
    let mut valid: HashSet<String> = HashSet::with_capacity(64);
    collect_names(config, "proxies", &mut valid);
    collect_names(config, "proxy-groups", &mut valid);
    collect_legacy_proxy_group_names(config, &mut valid);

    valid.insert("DIRECT".into());
    valid.insert("REJECT".into());

    if should_validate_tunnels {
        sanitize_proxy_sequence(config, "tunnels", &valid);
    }
    if should_validate_listeners {
        sanitize_proxy_sequence(config, "listeners", &valid);
    }
}

fn sanitize_proxy_sequence(config: &mut Mapping, key: &str, valid: &HashSet<String>) {
    let Some(items) = config.get_mut(key).and_then(|v| v.as_sequence_mut()) else {
        return;
    };

    for item in items {
        let Some(mapping) = item.as_mapping_mut() else { continue };

        let Some(proxy_name) = mapping.get("proxy").and_then(|v| v.as_str()) else {
            continue;
        };

        if proxy_name == "DIRECT" || proxy_name == "REJECT" {
            continue;
        }

        if !valid.contains(proxy_name) {
            mapping.remove("proxy");
        }
    }
}

// tunnels/listeners 存在且至少有一条 proxy 需要校验时才返回 true
fn proxy_refs_need_validation(items: &[Value]) -> bool {
    items.iter().any(|item| {
        item.as_mapping()
            .and_then(|t| t.get("proxy"))
            .and_then(|p| p.as_str())
            .is_some_and(|name| name != "DIRECT" && name != "REJECT")
    })
}

fn collect_legacy_proxy_group_names(config: &Mapping, out: &mut HashSet<String>) {
    let Some(groups) = config.get("proxy-groups").and_then(|v| v.as_sequence()) else {
        return;
    };

    for group in groups {
        let Some(mapping) = group.as_mapping() else { continue };
        let Some(sequence) = mapping
            .get("proxies")
            .or_else(|| mapping.get("use"))
            .and_then(|v| v.as_sequence())
        else {
            continue;
        };

        for item in sequence {
            if let Some(name) = item.as_str() {
                out.insert(name.into());
            }
        }
    }
}

fn collect_names(config: &Mapping, list_key: &str, out: &mut HashSet<String>) {
    let Some(Value::Sequence(seq)) = config.get(list_key) else {
        return;
    };

    for item in seq {
        let Value::Mapping(map) = item else {
            continue;
        };
        if let Some(Value::String(n)) = map.get("name")
            && !n.is_empty()
        {
            out.insert(n.into());
        }
    }
}

#[derive(Debug)]
pub enum ConfigType {
    Run,
    Check,
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::mem;

    #[test]
    #[allow(unused_variables)]
    #[allow(clippy::expect_used)]
    fn test_prfitem_from_merge_size() {
        let merge_item = PrfItem::from_merge(Some("Merge".into())).expect("Failed to create merge item in test");
        let prfitem_size = mem::size_of_val(&merge_item);
        // Boxed version
        let boxed_merge_item = Box::new(merge_item);
        let box_prfitem_size = mem::size_of_val(&boxed_merge_item);
        // The size of Box<T> is always pointer-sized (usually 8 bytes on 64-bit)
        // assert_eq!(box_prfitem_size, mem::size_of::<Box<PrfItem>>());
        assert!(box_prfitem_size < prfitem_size);
    }

    #[test]
    #[allow(unused_variables)]
    fn test_draft_size_non_boxed() {
        let draft = Draft::new(IRuntime::new());
        let iruntime_size = std::mem::size_of_val(&draft);
        assert_eq!(iruntime_size, std::mem::size_of::<Draft<IRuntime>>());
    }

    #[test]
    #[allow(unused_variables)]
    fn test_draft_size_boxed() {
        let draft = Draft::new(Box::new(IRuntime::new()));
        let box_iruntime_size = std::mem::size_of_val(&draft);
        assert_eq!(box_iruntime_size, std::mem::size_of::<Draft<Box<IRuntime>>>());
    }
}
