import React from 'react'
import {render,screen} from '@testing-library/react'
import Page from '@/app/connect/chatgpt/page'
import {db} from '@/lib/db'
jest.mock('@/lib/auth/session',()=>({getAuthUser:jest.fn(async()=>({id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'}))}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
jest.mock('@/lib/chatgpt/config',()=>({chatgptConfig:()=>{throw new Error('Disabled')}}))
jest.mock('@/components/chatgpt/GrantRevokeButton',()=>({GrantRevokeButton:({grantId}:{grantId:string})=><button data-testid={grantId}>Revoke connection</button>}))
const query=db.query as unknown as jest.Mock<Promise<{rows:unknown[]}>,[string,unknown[]]>
beforeEach(()=>query.mockReset())
test('existing connections remain visible and revocable when new linking is disabled',async()=>{
  const id='22222222-2222-4222-8222-222222222222'
  query.mockResolvedValue({rows:[{id,scope:'projects:read',created_at:new Date('2026-10-01T00:00:00Z'),expires_at:new Date('2026-11-01T00:00:00Z')}]})
  render(await Page());expect(screen.getByRole('button',{name:'Revoke connection'})).toBeInTheDocument()
  expect(query.mock.calls[0][0]).toContain('WHERE user_id=$1');expect(query.mock.calls[0][1]).toEqual(['11111111-1111-4111-8111-111111111111'])
  expect(screen.queryByText('No active connections.')).toBeNull()
})
test('an unavailable connection store cannot be presented as no active grants',async()=>{
  query.mockRejectedValue(new Error('Synthetic store unavailable'));render(await Page())
  expect(screen.getByRole('alert')).toHaveTextContent('Connections could not be loaded');expect(screen.queryByText('No active connections.')).toBeNull()
})
