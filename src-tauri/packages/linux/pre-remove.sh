#!/bin/bash

find_first_file() {
    for f in "$@"; do
        if [ -f "$f" ]; then
            echo "$f"
            return 0
        fi
    done
    return 1
}

UNINSTALLER=$(find_first_file \
    /usr/bin/clash-ultra-service-uninstall \
    /usr/bin/clash-ultra-service-uninstall-* \
    2>/dev/null || true)

if [ -n "$UNINSTALLER" ]; then
    "$UNINSTALLER" || true
fi

. /etc/os-release

if [ "$ID" = "deepin" ]; then
    if [ -f "/usr/share/applications/clash-ultra.desktop" ]; then
        echo "Removing deepin desktop file"
        rm -vf "/usr/share/applications/clash-ultra.desktop"
    fi
fi
