import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getUltraConfig, patchUltraConfig } from '@/services/cmds'
import { getPreloadConfig, setPreloadConfig } from '@/services/preload'

export const useAppConfig = () => {
  const qc = useQueryClient()
  const initialAppConfig = getPreloadConfig()

  const { data: appConfig, refetch } = useQuery({
    queryKey: ['getUltraConfig'],
    queryFn: async () => {
      const config = await getUltraConfig()
      setPreloadConfig(config)
      return config
    },
    initialData: initialAppConfig ?? undefined,
    staleTime: 5000,
  })

  const mutateAppConfig = (
    updaterOrData?:
      | IVergeConfig
      | ((prev: IVergeConfig | undefined) => IVergeConfig | undefined)
      | undefined,
    _revalidate?: boolean,
  ) => {
    if (updaterOrData === undefined) {
      void refetch()
      return
    }
    if (typeof updaterOrData === 'function') {
      const prev = qc.getQueryData<IVergeConfig>(['getUltraConfig'])
      const next = updaterOrData(prev)
      qc.setQueryData(['getUltraConfig'], next)
    } else {
      qc.setQueryData(['getUltraConfig'], updaterOrData)
    }
  }

  const patchAppConfig = useCallback(
    async (value: Partial<IVergeConfig>) => {
      await patchUltraConfig(value)
      await refetch()
    },
    [refetch],
  )

  return {
    appConfig,
    mutateAppConfig,
    patchAppConfig,
    // Legacy aliases retained while the rest of the UI code migrates.
    verge: appConfig,
    mutateVerge: mutateAppConfig,
    patchVerge: patchAppConfig,
  }
}

export const useVerge = useAppConfig
