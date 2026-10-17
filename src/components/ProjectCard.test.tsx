import React from 'react'
import { render, screen } from '@testing-library/react'
import ProjectCard from './ProjectCard'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

jest.mock('@/components/shared/ProjectWorkflowBadge', () => () => null)

it('keeps project navigation keyboard-accessible and avoids presenting failed counts as zero', () => {
  render(
    <ProjectCard
      openLabel="Open project"
      project={{
        id: 'project-1',
        name: 'North road survey',
        created_at: '2026-10-17T23:00:00.000Z',
        countsAvailable: false,
        utm_zone: null,
        hemisphere: null,
      }}
    />,
  )

  expect(screen.getByRole('link', { name: 'North road survey' })).toHaveAttribute('href', '/project/project-1')
  expect(screen.getAllByText('—')).toHaveLength(2)
  expect(screen.getByText('Not set')).toBeInTheDocument()
  expect(screen.getByText(/Created: 17 Oct 2026/)).toBeInTheDocument()
  expect(screen.queryByText('undefined')).not.toBeInTheDocument()
})
