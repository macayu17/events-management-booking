import { useState, useEffect, useRef } from 'react';
import { UserPlus, Trash2, Shield, QrCode, Eye, X, Crown, Copy } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import useConfirmDialog from '../hooks/useConfirmDialog';
import Modal from './Modal';

const ROLES = [
    { id: 'SUPER_MANAGER', label: 'Super Manager', description: 'Full access + forms + financials', icon: Crown, color: 'text-[#f7efe3]' },
    { id: 'MANAGER', label: 'Manager', description: 'Edit event + check-in + analytics', icon: Shield, color: 'text-[#E23744]' },
    { id: 'SCANNER', label: 'Scanner', description: 'Check-in only', icon: QrCode, color: 'text-[#aaa096]' },
    { id: 'STAFF', label: 'Staff', description: 'View only', icon: Eye, color: 'text-[#aaa096]' }
];

export default function TeamManagement({ eventId }) {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [inviteData, setInviteData] = useState({ email: '', name: '', role: 'STAFF' });
    const [inviting, setInviting] = useState(false);
    const inviteCloseButtonRef = useRef(null);
    const { confirm, dialog } = useConfirmDialog();

    useEffect(() => {
        fetchMembers();
    }, [eventId]);

    const fetchMembers = async () => {
        try {
            const res = await api.get(`/admin/events/${eventId}/team`);
            setMembers(res.data);
        } catch (error) {
            console.error('Failed to fetch team members');
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!inviteData.email) return toast.error('Email is required');

        setInviting(true);
        try {
            const response = await api.post(`/admin/events/${eventId}/team`, inviteData);
            toast.success('Team member invited!');
            if (response.data?.inviteUrl && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(response.data.inviteUrl);
                    toast.success('Invite link copied');
                } catch {
                    toast('Invite link is available in the team list');
                }
            }
            setShowInvite(false);
            setInviteData({ email: '', name: '', role: 'STAFF' });
            fetchMembers();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to invite');
        } finally {
            setInviting(false);
        }
    };

    const copyInviteLink = async (inviteUrl) => {
        if (!inviteUrl) return toast.error('Invite link is unavailable');
        try {
            await navigator.clipboard.writeText(inviteUrl);
            toast.success('Invite link copied');
        } catch {
            toast.error('Could not copy invite link');
        }
    };

    const handleRemove = async (memberId) => {
        const member = members.find(item => item.id === memberId);
        const confirmed = await confirm({
            title: 'Remove team member?',
            message: `${member?.name || member?.email || 'This team member'} will lose access to this event.`,
            confirmLabel: 'Remove member',
        });
        if (!confirmed) return;
        try {
            await api.delete(`/admin/events/${eventId}/team/${memberId}`);
            toast.success('Member removed');
            fetchMembers();
        } catch (error) {
            toast.error('Failed to remove member');
        }
    };

    const handleRoleChange = async (memberId, newRole) => {
        try {
            await api.put(`/admin/events/${eventId}/team/${memberId}`, { role: newRole });
            toast.success('Role updated');
            fetchMembers();
        } catch (error) {
            toast.error('Failed to update role');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f7efe3] border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {dialog}
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h3 className="text-xl font-bold text-[#f7efe3]">Team Members</h3>
                    <p className="break-words text-sm admin-muted">Manage who can access and manage this event</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowInvite(true)}
                    className="admin-primary-action inline-flex items-center justify-center gap-2"
                >
                    <UserPlus size={18} />
                    Invite Member
                </button>
            </div>

            {/* Invite Modal */}
            {showInvite && (
                <Modal
                    ariaLabelledby="invite-team-title"
                    ariaDescribedby="invite-team-description"
                    initialFocusRef={inviteCloseButtonRef}
                    onClose={() => setShowInvite(false)}
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    panelClassName="admin-card max-h-[calc(100dvh-2rem)] max-w-md w-full overflow-y-auto overscroll-contain p-6 animate-fade-in"
                >
                        <div className="flex items-center justify-between mb-6">
                            <h4 id="invite-team-title" className="text-lg font-bold text-[#f7efe3]">Invite Team Member</h4>
                            <p id="invite-team-description" className="sr-only">
                                Add a teammate by email and choose the event access role.
                            </p>
                            <button
                                type="button"
                                ref={inviteCloseButtonRef}
                                aria-label="Close invite modal"
                                onClick={() => setShowInvite(false)}
                                className="admin-icon-button"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleInvite} className="space-y-4">
                            <div>
                                <label htmlFor="team-invite-email" className="mb-1 block text-sm font-medium text-[#aaa096]">Email *</label>
                                <input
                                    id="team-invite-email"
                                    name="teamInviteEmail"
                                    type="email"
                                    autoComplete="email"
                                    value={inviteData.email}
                                    onChange={e => setInviteData({ ...inviteData, email: e.target.value })}
                                    placeholder="teammate@example.com"
                                    className="input"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="team-invite-name" className="mb-1 block text-sm font-medium text-[#aaa096]">Name (optional)</label>
                                <input
                                    id="team-invite-name"
                                    name="teamInviteName"
                                    type="text"
                                    autoComplete="name"
                                    value={inviteData.name}
                                    onChange={e => setInviteData({ ...inviteData, name: e.target.value })}
                                    placeholder="Aarav Mehta"
                                    className="input"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-[#aaa096]">Role</label>
                                <div className="space-y-2">
                                    {ROLES.map(role => (
                                        <label
                                            key={role.id}
                                            className={`flex cursor-pointer items-center gap-3 rounded-[1.1rem] border p-3 transition-all focus-within:ring-2 focus-within:ring-[#E23744] focus-within:ring-offset-2 focus-within:ring-offset-[#12100e] ${inviteData.role === role.id
                                                ? 'border-[#E23744] bg-[#E23744]/10'
                                                : 'border-white/10 bg-white/[0.03] hover:border-[#f2e7d8]/25'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="role"
                                                value={role.id}
                                                checked={inviteData.role === role.id}
                                                onChange={e => setInviteData({ ...inviteData, role: e.target.value })}
                                                className="sr-only"
                                            />
                                            <role.icon size={18} className={role.color} />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-[#f7efe3]">{role.label}</p>
                                                <p className="break-words text-xs text-[#8f857c]">{role.description}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" disabled={inviting} className="admin-primary-action w-full disabled:cursor-not-allowed disabled:opacity-60">
                                {inviting ? 'Inviting...' : 'Send Invite'}
                            </button>
                        </form>
                </Modal>
            )}

            {/* Team List */}
            {members.length === 0 ? (
                <div className="admin-card py-12 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                        <UserPlus className="text-[#aaa096]" size={24} />
                    </div>
                    <p className="mb-2 admin-muted">No team members yet</p>
                    <p className="text-sm text-[#8f857c]">Invite people to help manage this event</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {members.map(member => {
                        return (
                            <div key={member.id} className="admin-card admin-card-hover group flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f2e7d8]/20 bg-[#E23744] font-bold text-white shadow-lg shadow-[#E23744]/20">
                                    {(member.name || member.email)[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="truncate font-medium text-[#f7efe3]">{member.name || member.email}</p>
                                    <p className="truncate text-sm admin-muted">{member.email}</p>
                                </div>
                                <select
                                    name={`teamRole-${member.id}`}
                                    aria-label={`Role for ${member.name || member.email}`}
                                    value={member.role}
                                    onChange={e => handleRoleChange(member.id, e.target.value)}
                                    className="input w-full px-3 py-1.5 text-sm sm:w-auto"
                                >
                                    {ROLES.map(role => (
                                        <option key={role.id} value={role.id}>{role.label}</option>
                                    ))}
                                </select>
                                {!member.acceptedAt && member.inviteUrl && (
                                    <button
                                        type="button"
                                        aria-label={`Copy invite link for ${member.name || member.email}`}
                                        onClick={() => copyInviteLink(member.inviteUrl)}
                                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-[#aaa096] transition-colors hover:border-[#f2e7d8]/25 hover:text-[#f7efe3]"
                                    >
                                        <Copy size={16} />
                                        Copy invite
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleRemove(member.id)}
                                    aria-label={`Remove ${member.name || member.email}`}
                                    className="admin-icon-button hover:border-[#E23744]/40 hover:bg-[#E23744] hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
