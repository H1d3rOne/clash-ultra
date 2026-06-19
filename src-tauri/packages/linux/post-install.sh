#!/bin/bash

# Tauri externalBin inputs are target-triple suffixed in the build tree and
# stripped when copied for runtime sidecars, while Linux packages can vary by
# target/backend. Keep package hooks tolerant of both names.
for f in \
    /usr/bin/clash-ultra-service \
    /usr/bin/clash-ultra-service-* \
    /usr/bin/clash-ultra-service-install \
    /usr/bin/clash-ultra-service-install-* \
    /usr/bin/clash-ultra-service-uninstall \
    /usr/bin/clash-ultra-service-uninstall-*; do
    if [ -f "$f" ]; then
        chmod +x "$f" || true
    fi
done

. /etc/os-release

if [ "$ID" = "deepin" ]; then
    PACKAGE_NAME="$DPKG_MAINTSCRIPT_PACKAGE"
    DESKTOP_FILES=$(dpkg -L "$PACKAGE_NAME" 2>/dev/null | grep "\.desktop$")
    echo "$DESKTOP_FILES" | while IFS= read -r f; do
        if [ "$(basename "$f")" == "Clash Ultra.desktop" ]; then
            echo "Fixing deepin desktop file"
            mv -vf "$f" "/usr/share/applications/clash-ultra.desktop"
        fi
    done
fi
