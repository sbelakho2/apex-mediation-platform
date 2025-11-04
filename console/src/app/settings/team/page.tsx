'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { ArrowLeft, Users, UserPlus, Mail, MoreVertical, Shield, Code, Banknote, Crown } from 'lucide-react'
import type { TeamMember, TeamInvitation } from '@/types'

const roleIcons = {
  owner: Crown,
  admin: Shield,
  developer: Code,
  finance: Banknote,
}

const roleDescriptions = {
  admin: 'Full access to settings, placements, and team management',
  developer: 'Manage placements and view analytics, no billing access',
  finance: 'View revenue, manage payouts, limited placement access',
}

export default function TeamSettingsPage() {
  const [isInviting, setIsInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'developer' | 'finance'>('developer')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team', 'members'],
    queryFn: async () => {
      const { data } = await teamApi.listMembers()
      return data
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (invitation: TeamInvitation) => {
      await teamApi.inviteMember(invitation)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
      setMessage({ type: 'success', text: 'Invitation sent successfully.' })
      setEmail('')
      setIsInviting(false)
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to send invitation. Please try again.' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await teamApi.removeMember(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
      setMessage({ type: 'success', text: 'Team member removed.' })
      setMenuOpen(null)
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to remove team member.' })
    },
  })

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      await teamApi.resendInvite(id)
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Invitation resent.' })
      setMenuOpen(null)
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to resend invitation.' })
    },
  })

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    inviteMutation.mutate({ email: email.trim(), role })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/90 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                <Users className="h-6 w-6" aria-hidden={true} />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-600">Collaboration</p>
                <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Team Access</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Invite teammates and assign roles to collaborate securely.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsInviting(!isInviting)}
              className="btn btn-primary flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" aria-hidden={true} />
              Invite Member
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {message && (
          <div
            className={`card flex items-start gap-3 ${
              message.type === 'success'
                ? 'bg-success-50 border-success-200'
                : 'bg-danger-50 border-danger-200'
            }`}
          >
            <p className="text-sm text-gray-700">{message.text}</p>
          </div>
        )}

        {isInviting && (
          <form onSubmit={handleInvite} className="card space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Invite New Team Member</h2>
            <div>
              <label htmlFor="email" className="label">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Role</label>
              <div className="space-y-2">
                {(['admin', 'developer', 'finance'] as const).map((r) => (
                  <label
                    key={r}
                    className={`card cursor-pointer border transition ${
                      role === r ? 'border-primary-500 ring-2 ring-primary-100' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-semibold capitalize text-gray-900">{r}</p>
                        <p className="text-xs text-gray-600 mt-1">{roleDescriptions[r]}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsInviting(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary flex items-center gap-2"
                disabled={inviteMutation.isPending}
              >
                <Mail className="h-4 w-4" aria-hidden={true} />
                {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}

        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Members ({members.length})</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg animate-pulse">
                  <div className="h-10 w-10 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" aria-hidden={true} />
              <p className="text-sm text-gray-600">No team members yet. Invite your first collaborator!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => {
                const RoleIcon = roleIcons[member.role]
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm">
                      {member.name?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{member.name || member.email}</p>
                        <span
                          className={`badge ${
                            member.status === 'active'
                              ? 'badge-success'
                              : member.status === 'invited'
                              ? 'badge-warning'
                              : 'badge-neutral'
                          }`}
                        >
                          {member.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                        <RoleIcon className="h-3 w-3" aria-hidden={true} />
                        <span className="capitalize">{member.role}</span>
                        {member.email !== member.name && <span>• {member.email}</span>}
                      </div>
                    </div>
                    {member.role !== 'owner' && (
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                          className="p-2 hover:bg-gray-100 rounded"
                        >
                          <MoreVertical className="h-4 w-4 text-gray-600" aria-hidden={true} />
                        </button>
                        {menuOpen === member.id && (
                          <div className="absolute right-0 mt-2 w-40 bg-white border rounded-lg shadow-lg z-10">
                            {member.status === 'invited' && (
                              <button
                                onClick={() => resendMutation.mutate(member.id)}
                                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                              >
                                Resend Invite
                              </button>
                            )}
                            <button
                              onClick={() => removeMutation.mutate(member.id)}
                              className="block w-full px-4 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
