use std::{future::Future, sync::Arc, time::Duration};

use reqwest::{Client, Proxy, Url, cookie::Jar};
use serde::Deserialize;
use tauri::command;
use tokio::task::JoinSet;

use clash_ultra_logging::{Type, logging};

mod bahamut;
mod bilibili;
mod chatgpt;
mod claude;
mod disney_plus;
mod gemini;
mod netflix;
mod prime_video;
mod spotify;
mod tiktok;
mod types;
mod utils;
mod youtube;

pub use types::UnlockItem;

use bahamut::check_bahamut_anime;
use bilibili::{check_bilibili_china_mainland, check_bilibili_hk_mc_tw};
use chatgpt::check_chatgpt_combined;
use claude::check_claude;
use disney_plus::check_disney_plus;
use gemini::check_gemini;
use netflix::check_netflix;
use prime_video::check_prime_video;
use spotify::check_spotify;
use tiktok::check_tiktok;
use utils::get_local_date_string;
use youtube::check_youtube_premium;

type UnlockResults = Vec<UnlockItem>;

const DEFAULT_UNLOCK_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UnlockProxyTarget {
    proxy_host: Option<String>,
    proxy_port: Option<u16>,
    proxy_type: Option<String>,
}

impl UnlockProxyTarget {
    fn normalized_host(&self) -> String {
        match self
            .proxy_host
            .as_deref()
            .map(str::trim)
            .filter(|host| !host.is_empty())
        {
            Some("0.0.0.0") | Some("::") | Some("[::]") => "127.0.0.1".into(),
            Some(host) => host.trim_matches(['[', ']']).into(),
            None => "127.0.0.1".into(),
        }
    }

    fn normalized_type(&self) -> &str {
        match self.proxy_type.as_deref().map(str::trim) {
            Some(proxy_type) if proxy_type.eq_ignore_ascii_case("socks") => "socks",
            Some(proxy_type) if proxy_type.eq_ignore_ascii_case("socks5") => "socks",
            _ => "http",
        }
    }

    fn proxy_url(&self) -> Option<String> {
        let port = self.proxy_port?;
        if port == 0 {
            return None;
        }

        let scheme = if self.normalized_type() == "socks" {
            "socks5h"
        } else {
            // mixed/http listeners both accept HTTP proxy requests.
            "http"
        };

        Some(format!("{scheme}://{}:{port}", self.normalized_host()))
    }
}

pub(super) fn build_unlock_client(
    proxy: Option<&UnlockProxyTarget>,
    cookie_store: Option<Arc<Jar>>,
    user_agent: Option<&str>,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .use_rustls_tls()
        .user_agent(user_agent.unwrap_or(DEFAULT_UNLOCK_USER_AGENT))
        .timeout(Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .tcp_keepalive(Duration::from_secs(60))
        .connection_verbose(true);

    if let Some(cookie_store) = cookie_store {
        builder = builder.cookie_provider(cookie_store);
    }

    if let Some(proxy_url) = proxy.and_then(UnlockProxyTarget::proxy_url) {
        let proxy = Proxy::all(&proxy_url).map_err(|err| format!("创建测试代理失败 {proxy_url}: {err}"))?;
        builder = builder.proxy(proxy);
    }

    builder.build().map_err(|err| format!("创建HTTP客户端失败: {err}"))
}

fn spawn_unlock_check<F, Fut>(tasks: &mut JoinSet<UnlockResults>, client: Arc<Client>, check: F)
where
    F: FnOnce(Arc<Client>) -> Fut + Send + 'static,
    Fut: Future<Output = UnlockResults> + Send + 'static,
{
    tasks.spawn(async move { check(client).await });
}

fn single_result(item: UnlockItem) -> UnlockResults {
    vec![item]
}

fn normalize_custom_test_url(target: &str) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("请输入域名或 URL".into());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    let parsed = Url::parse(&candidate).map_err(|err| format!("URL 格式不正确: {err}"))?;
    match parsed.host_str() {
        Some(_) => Ok(parsed.to_string()),
        None => Err("URL 缺少有效域名或 IP".into()),
    }
}

fn compact_error_message(err: &reqwest::Error) -> String {
    let message = err.to_string();
    let mut compact = message.chars().take(180).collect::<String>();
    if message.chars().count() > 180 {
        compact.push('…');
    }
    compact
}

#[command]
pub async fn get_unlock_items() -> Result<Vec<UnlockItem>, String> {
    Ok(types::default_unlock_items())
}

#[command]
pub async fn check_single_url(
    target: String,
    proxy_host: Option<String>,
    proxy_port: Option<u16>,
    proxy_type: Option<String>,
) -> Result<UnlockItem, String> {
    let normalized_url = normalize_custom_test_url(&target)?;
    let proxy_target = UnlockProxyTarget {
        proxy_host,
        proxy_port,
        proxy_type,
    };
    let proxy_target = proxy_target.proxy_port.is_some().then_some(proxy_target);
    let client = build_unlock_client(proxy_target.as_ref(), None, None)?;

    let check_time = Some(get_local_date_string());

    match client.get(&normalized_url).send().await {
        Ok(response) => {
            let status = response.status();
            let final_url = response.url().to_string();
            let region = if final_url != normalized_url {
                Some(format!("HTTP {} · {}", status.as_u16(), final_url))
            } else {
                Some(format!("HTTP {}", status.as_u16()))
            };

            Ok(UnlockItem {
                name: normalized_url,
                status: if status.as_u16() < 500 {
                    "Yes".to_string()
                } else {
                    "Failed".to_string()
                },
                region,
                check_time,
            })
        }
        Err(err) => Ok(UnlockItem {
            name: normalized_url,
            status: "Failed".to_string(),
            region: Some(compact_error_message(&err)),
            check_time,
        }),
    }
}

#[command]
pub async fn check_media_unlock(
    proxy_host: Option<String>,
    proxy_port: Option<u16>,
    proxy_type: Option<String>,
) -> Result<Vec<UnlockItem>, String> {
    let proxy_target = UnlockProxyTarget {
        proxy_host,
        proxy_port,
        proxy_type,
    };
    let proxy_target = proxy_target.proxy_port.is_some().then_some(proxy_target);
    let client = build_unlock_client(proxy_target.as_ref(), None, None)?;

    let mut tasks = JoinSet::new();
    let client_arc = Arc::new(client);

    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_bilibili_china_mainland(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_bilibili_hk_mc_tw(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        check_chatgpt_combined(&client).await
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_claude(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_gemini(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_youtube_premium(&client).await)
    });
    let bahamut_proxy_target = proxy_target.clone();
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), move |client| async move {
        single_result(check_bahamut_anime(&client, bahamut_proxy_target.as_ref()).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_netflix(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_disney_plus(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_spotify(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_tiktok(&client).await)
    });
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        single_result(check_prime_video(&client).await)
    });

    let mut results = Vec::new();
    while let Some(res) = tasks.join_next().await {
        match res {
            Ok(items) => results.extend(items),
            Err(e) => logging!(error, Type::Network, "任务执行失败: {e}"),
        }
    }

    Ok(results)
}
