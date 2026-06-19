use super::CmdResult;
use crate::{cmd::StringifyErr as _, config::IVerge, feat};
use clash_ultra_draft::SharedDraft;

/// 获取 Clash Ultra 应用配置
#[tauri::command]
pub async fn get_ultra_config() -> CmdResult<SharedDraft<IVerge>> {
    feat::fetch_app_config().await.stringify_err()
}

/// 修改 Clash Ultra 应用配置
#[tauri::command]
pub async fn patch_ultra_config(payload: IVerge) -> CmdResult {
    feat::patch_app_config(&payload, false).await.stringify_err()
}
