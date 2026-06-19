import { Typography } from '@mui/material'
import React, { ReactNode } from 'react'

import { BaseErrorBoundary } from './base-error-boundary'

interface Props {
  title?: React.ReactNode // the page title
  header?: React.ReactNode // something behind title
  contentStyle?: React.CSSProperties
  children?: ReactNode
  full?: boolean
  className?: string
}

export const BasePage: React.FC<Props> = (props) => {
  const { title, header, contentStyle, full, children, className } = props

  return (
    <BaseErrorBoundary>
      <div className={['base-page', className].filter(Boolean).join(' ')}>
        <header data-tauri-drag-region="true" style={{ userSelect: 'none' }}>
          <Typography
            sx={{ fontSize: '20px', fontWeight: '700 ' }}
            data-tauri-drag-region="true"
          >
            {title}
          </Typography>

          {header}
        </header>

        <div className={full ? 'base-container no-padding' : 'base-container'}>
          <section>
            <div className="base-content" style={contentStyle}>
              {children}
            </div>
          </section>
        </div>
      </div>
    </BaseErrorBoundary>
  )
}
