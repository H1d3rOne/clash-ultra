import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useMemo, useRef } from 'react'

import { showNotice } from '@/services/notice-service'

interface Props {
  open: boolean
  proxyName: string
  groupName: string
  speedText: string
  errorText: string
  onClose: () => void
  onRetry: () => void
}

export const ProxySpeedErrorDialog = ({
  open,
  proxyName,
  groupName,
  speedText,
  errorText,
  onClose,
  onRetry,
}: Props) => {
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const detail = useMemo(
    () =>
      [
        `节点：${proxyName}`,
        `节点组：${groupName}`,
        `速度：${speedText}`,
        `时间：${new Date().toLocaleString()}`,
        '',
        '错误：',
        errorText,
      ].join('\n'),
    [errorText, groupName, proxyName, speedText],
  )

  const selectText = () => {
    const textarea = textRef.current
    if (!textarea) return
    textarea.focus()
    textarea.select()
  }

  const copyDetail = async () => {
    const errors: unknown[] = []

    try {
      await writeText(detail)
      showNotice.success('测速错误已复制到剪贴板')
      return
    } catch (err) {
      errors.push(err)
    }

    try {
      await navigator.clipboard.writeText(detail)
      showNotice.success('测速错误已复制到剪贴板')
      return
    } catch (err) {
      errors.push(err)
    }

    try {
      selectText()
      if (document.execCommand('copy')) {
        showNotice.success('测速错误已复制到剪贴板')
        return
      }
    } catch (err) {
      errors.push(err)
    }

    console.warn('[ProxySpeedErrorDialog] copy failed:', errors)
    showNotice.error('自动复制失败，请在弹窗中手动选择错误文本复制')
  }

  return (
    <Dialog open={open} fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>测速错误详情</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            可以点击“复制错误”；如果系统拦截剪贴板，也可以直接选中下面文本手动复制。
          </Typography>

          <TextField
            inputRef={textRef}
            value={detail}
            multiline
            fullWidth
            minRows={10}
            maxRows={18}
            onFocus={selectText}
            slotProps={{
              input: {
                readOnly: true,
                sx: {
                  alignItems: 'stretch',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 12,
                },
              },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={selectText}>全选文本</Button>
        <Button onClick={onRetry}>重新测速</Button>
        <Button variant="contained" onClick={copyDetail}>
          复制错误
        </Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
