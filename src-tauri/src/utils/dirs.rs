use crate::core::{CoreManager, handle, manager::RunningMode};
use anyhow::Result;
use async_trait::async_trait;
use clash_ultra_logging::{Type, logging};
use once_cell::sync::OnceCell;
#[cfg(unix)]
use std::iter;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager as _;

#[cfg(not(feature = "ultra-dev"))]
pub static APP_ID: &str = "clash-ultra";
#[cfg(not(feature = "ultra-dev"))]
pub static BACKUP_DIR: &str = "clash-ultra-backup";
#[cfg(not(feature = "ultra-dev"))]
pub static LEGACY_APP_ID: &str = "app.clash-ultra.desktop";

#[cfg(feature = "ultra-dev")]
pub static APP_ID: &str = "clash-ultra-dev";
#[cfg(feature = "ultra-dev")]
pub static BACKUP_DIR: &str = "clash-ultra-backup-dev";
#[cfg(feature = "ultra-dev")]
pub static LEGACY_APP_ID: &str = "app.clash-ultra.desktop.dev";

pub static PORTABLE_FLAG: OnceCell<bool> = OnceCell::new();
static APP_HOME_MIGRATION_DONE: OnceCell<bool> = OnceCell::new();

pub const CLASH_CONFIG: &str = "config.yaml";
pub const APP_CONFIG: &str = "ultra.yaml";
pub const PROFILE_YAML: &str = "profiles.yaml";

/// init portable flag
pub fn init_portable_flag() -> Result<()> {
    use tauri::utils::platform::current_exe;

    let app_exe = current_exe()?;
    if let Some(dir) = app_exe.parent() {
        let dir = PathBuf::from(dir).join(".config/PORTABLE");

        if dir.exists() {
            PORTABLE_FLAG.get_or_init(|| true);
        }
    }
    PORTABLE_FLAG.get_or_init(|| false);
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

fn migrate_legacy_app_home_dir(base_dir: &Path, current_dir: &Path) {
    APP_HOME_MIGRATION_DONE.get_or_init(|| {
        let legacy_dir = base_dir.join(LEGACY_APP_ID);

        if current_dir.exists() || !legacy_dir.exists() || legacy_dir == current_dir {
            return false;
        }

        if let Some(parent) = current_dir.parent()
            && let Err(err) = fs::create_dir_all(parent)
        {
            logging!(
                warn,
                Type::File,
                "Failed to create app data parent {:?}: {}",
                parent,
                err
            );
            return false;
        }

        match fs::rename(&legacy_dir, current_dir) {
            Ok(()) => {
                logging!(
                    info,
                    Type::File,
                    "Migrated app data directory {:?} to {:?}",
                    legacy_dir,
                    current_dir
                );
                true
            }
            Err(rename_err) => match copy_dir_recursive(&legacy_dir, current_dir) {
                Ok(()) => {
                    logging!(
                        warn,
                        Type::File,
                        "Copied legacy app data directory {:?} to {:?}, but failed to rename it: {}",
                        legacy_dir,
                        current_dir,
                        rename_err
                    );
                    true
                }
                Err(copy_err) => {
                    logging!(
                        warn,
                        Type::File,
                        "Failed to migrate legacy app data directory {:?} to {:?}: rename error: {}; copy error: {}",
                        legacy_dir,
                        current_dir,
                        rename_err,
                        copy_err
                    );
                    false
                }
            },
        }
    });
}

/// get the app home dir
pub fn app_home_dir() -> Result<PathBuf> {
    use tauri::utils::platform::current_exe;

    let flag = PORTABLE_FLAG.get().unwrap_or(&false);
    if *flag {
        let app_exe = current_exe()?;
        let app_exe = dunce::canonicalize(app_exe)?;
        let app_dir = app_exe
            .parent()
            .ok_or_else(|| anyhow::anyhow!("failed to get the portable app dir"))?;
        let portable_config_dir = PathBuf::from(app_dir).join(".config");
        let current_dir = portable_config_dir.join(APP_ID);
        migrate_legacy_app_home_dir(&portable_config_dir, &current_dir);
        return Ok(current_dir);
    }

    // 避免在Handle未初始化时崩溃
    let app_handle = handle::Handle::app_handle();

    match app_handle.path().data_dir() {
        Ok(dir) => {
            let current_dir = dir.join(APP_ID);
            migrate_legacy_app_home_dir(&dir, &current_dir);
            Ok(current_dir)
        }
        Err(e) => {
            logging!(error, Type::File, "Failed to get the app home directory: {e}");
            Err(anyhow::anyhow!("Failed to get the app homedirectory"))
        }
    }
}

/// get the resources dir
pub fn app_resources_dir() -> Result<PathBuf> {
    // 避免在Handle未初始化时崩溃
    let app_handle = handle::Handle::app_handle();

    match app_handle.path().resource_dir() {
        Ok(dir) => Ok(dir.join("resources")),
        Err(e) => {
            logging!(error, Type::File, "Failed to get the resource directory: {e}");
            Err(anyhow::anyhow!("Failed to get the resource directory"))
        }
    }
}

/// profiles dir
pub fn app_profiles_dir() -> Result<PathBuf> {
    Ok(app_home_dir()?.join("profiles"))
}

/// icons dir
pub fn app_icons_dir() -> Result<PathBuf> {
    Ok(app_home_dir()?.join("icons"))
}

pub fn find_target_icons(target: &str) -> Result<Option<String>> {
    let icons_dir = app_icons_dir()?;
    let icon_path = fs::read_dir(&icons_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .find(|path| {
            let prefix_matches = path
                .file_prefix()
                .and_then(|p| p.to_str())
                .is_some_and(|prefix| prefix.starts_with(target));
            let ext_matches = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("ico") || ext.eq_ignore_ascii_case("png"));
            prefix_matches && ext_matches
        });

    icon_path.map(|path| path_to_str(&path).map(|s| s.into())).transpose()
}

/// logs dir
pub fn app_logs_dir() -> Result<PathBuf> {
    Ok(app_home_dir()?.join("logs"))
}

// latest app log
pub fn app_latest_log() -> Result<PathBuf> {
    Ok(app_logs_dir()?.join("latest.log"))
}

/// local backups dir
pub fn local_backup_dir() -> Result<PathBuf> {
    let dir = app_home_dir()?.join(BACKUP_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn clash_path() -> Result<PathBuf> {
    Ok(app_home_dir()?.join(CLASH_CONFIG))
}

pub fn app_config_path() -> Result<PathBuf> {
    Ok(app_home_dir()?.join(APP_CONFIG))
}

pub fn profiles_path() -> Result<PathBuf> {
    Ok(app_home_dir()?.join(PROFILE_YAML))
}

#[cfg(target_os = "macos")]
pub fn service_path() -> Result<PathBuf> {
    let res_dir = app_resources_dir()?;
    Ok(res_dir.join("clash-ultra-service"))
}

#[cfg(windows)]
pub fn service_path() -> Result<PathBuf> {
    let res_dir = app_resources_dir()?;
    Ok(res_dir.join("clash-ultra-service.exe"))
}

pub fn sidecar_log_dir() -> Result<PathBuf> {
    let log_dir = app_logs_dir()?.join("sidecar");
    let _ = std::fs::create_dir_all(&log_dir);

    Ok(log_dir)
}

pub fn service_log_dir() -> Result<PathBuf> {
    let log_dir = app_logs_dir()?.join("service");
    let _ = std::fs::create_dir_all(&log_dir);

    Ok(log_dir)
}

pub fn clash_latest_log() -> Result<PathBuf> {
    match *CoreManager::global().get_running_mode() {
        RunningMode::Service => Ok(service_log_dir()?.join("service_latest.log")),
        RunningMode::Sidecar | RunningMode::NotRunning => Ok(sidecar_log_dir()?.join("sidecar_latest.log")),
    }
}

pub fn path_to_str(path: &PathBuf) -> Result<&str> {
    let path_str = path
        .as_os_str()
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("failed to get path from {:?}", path))?;
    Ok(path_str)
}

pub fn get_encryption_key() -> Result<Vec<u8>> {
    let app_dir = app_home_dir()?;
    let key_path = app_dir.join(".encryption_key");

    if key_path.exists() {
        // Read existing key
        fs::read(&key_path).map_err(|e| anyhow::anyhow!("Failed to read encryption key: {}", e))
    } else {
        // Generate and save new key
        let mut key = vec![0u8; 32];
        getrandom::fill(&mut key)?;

        // Ensure directory exists
        if let Some(parent) = key_path.parent() {
            fs::create_dir_all(parent).map_err(|e| anyhow::anyhow!("Failed to create key directory: {}", e))?;
        }
        // Save key
        fs::write(&key_path, &key).map_err(|e| anyhow::anyhow!("Failed to save encryption key: {}", e))?;
        Ok(key)
    }
}

#[cfg(unix)]
pub fn ensure_mihomo_safe_dir() -> Option<PathBuf> {
    iter::once("/tmp")
        .map(PathBuf::from)
        .find(|path| path.exists())
        .or_else(|| {
            std::env::var_os("HOME").and_then(|home| {
                let home_config = PathBuf::from(home).join(".config");
                if home_config.exists() || fs::create_dir_all(&home_config).is_ok() {
                    Some(home_config)
                } else {
                    logging!(error, Type::File, "Failed to create safe directory: {home_config:?}");
                    None
                }
            })
        })
}

#[cfg(unix)]
pub fn ipc_path() -> Result<PathBuf> {
    #[cfg(feature = "ultra-dev")]
    const IPC_FILE: &str = "ultra-mihomo-dev.sock";
    #[cfg(not(feature = "ultra-dev"))]
    const IPC_FILE: &str = "ultra-mihomo.sock";

    ensure_mihomo_safe_dir()
        .or_else(|| app_home_dir().ok())
        .map(|base_dir| {
            let ipc_dir = base_dir.join("ultra");
            let _ = fs::create_dir_all(&ipc_dir);
            ipc_dir.join(IPC_FILE)
        })
        .ok_or_else(|| anyhow::anyhow!("Failed to determine ipc path"))
}

#[cfg(target_os = "windows")]
pub fn ipc_path() -> Result<PathBuf> {
    Ok(PathBuf::from(r"\\.\pipe\ultra-mihomo"))
}
#[async_trait]
pub trait PathBufExec {
    async fn remove_if_exists(&self) -> Result<()>;
}

#[async_trait]
impl PathBufExec for PathBuf {
    async fn remove_if_exists(&self) -> Result<()> {
        if self.exists() {
            tokio::fs::remove_file(self).await?;
            logging!(info, Type::File, "Removed file: {:?}", self);
        }
        Ok(())
    }
}
