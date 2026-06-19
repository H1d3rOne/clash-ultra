use std::sync::OnceLock;

use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use sysinfo::{CpuRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Runtime, State, command};
use tauri_plugin_clipboard_manager::{ClipboardExt as _, Error};

use crate::Platform;

#[derive(Serialize)]
pub struct SystemInfo {
    pub system_name: String,
    pub system_version: String,
    pub system_kernel_version: String,
    pub system_arch: String,
    pub app_version: String,
    pub app_core_mode: String,
    pub app_is_admin: bool,
}

impl From<Platform> for SystemInfo {
    fn from(platform: Platform) -> Self {
        Self {
            system_name: platform.sysinfo.system_name,
            system_version: platform.sysinfo.system_version,
            system_kernel_version: platform.sysinfo.system_kernel_version,
            system_arch: platform.sysinfo.system_arch,
            app_version: platform.appinfo.app_version,
            app_core_mode: platform.appinfo.app_core_mode,
            app_is_admin: platform.appinfo.app_is_admin,
        }
    }
}

#[command]
pub fn get_system_info(state: State<'_, RwLock<Platform>>) -> Result<SystemInfo, Error> {
    let platform = state.inner().read();
    Ok(SystemInfo::from(platform.clone()))
}

/// 获取应用的运行时间（毫秒）
#[command]
pub fn get_app_uptime(state: State<'_, RwLock<Platform>>) -> Result<u128, Error> {
    Ok(state.inner().read().appinfo.app_startup_time.elapsed().as_millis())
}

/// 检查应用是否以管理员身份运行
#[command]
pub fn app_is_admin(state: State<'_, RwLock<Platform>>) -> Result<bool, Error> {
    Ok(state.inner().read().appinfo.app_is_admin)
}

#[command]
pub fn export_diagnostic_info<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, RwLock<Platform>>,
) -> Result<(), Error> {
    let info = state.inner().read().to_string();
    let clipboard = app_handle.clipboard();
    clipboard.write_text(info)
}

static CPU_SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();

/// 获取系统全局 CPU 占用率（百分比）。
/// sysinfo 需要两次采样间隔才能得到有效值，首次调用会返回 0。
#[command]
pub fn get_system_usage() -> f32 {
    let system = CPU_SYSTEM.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing().with_cpu_usage()),
        ))
    });
    let mut system = system.lock();
    system.refresh_cpu_usage();
    system.global_cpu_usage()
}
