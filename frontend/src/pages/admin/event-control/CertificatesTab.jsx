import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Send, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useConfirmDialog from '../../../hooks/useConfirmDialog';

const isCanceledRequest = (error) => error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';

export default function CertificatesTab({ eventId, event }) {
    const [sending, setSending] = useState(false);
    const [dryRunLoading, setDryRunLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [sendResult, setSendResult] = useState(null);
    const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
    const [previewError, setPreviewError] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const previewBlobUrlRef = useRef(null);
    const { confirm, dialog } = useConfirmDialog();
    const configs = event?.certificateConfigs || {};
    const participationTemplateUrl = configs?.participation?.templateUrl || event?.certificateTemplateUrl;

    const revokePreviewBlob = () => {
        if (previewBlobUrlRef.current) {
            URL.revokeObjectURL(previewBlobUrlRef.current);
            previewBlobUrlRef.current = null;
        }
    };

    const loadPreview = (signal) => {
        if (!participationTemplateUrl) {
            revokePreviewBlob();
            setPreviewBlobUrl(null);
            return;
        }

        setPreviewError(null);
        setPreviewLoading(true);
        api.get(`/admin/events/${eventId}/certificates/template?type=participation`, { responseType: 'blob', signal })
            .then(res => {
                const nextBlobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                revokePreviewBlob();
                previewBlobUrlRef.current = nextBlobUrl;
                setPreviewBlobUrl(nextBlobUrl);
            })
            .catch(err => {
                if (isCanceledRequest(err)) return;
                console.error('Failed to load certificate preview:', err);
                const msg = err.response?.data?.error
                    || (err.response?.status === 401 ? 'Template authentication failed - try re-uploading the certificate template'
                    : 'Could not load certificate preview');
                setPreviewError(msg);
            })
            .finally(() => {
                if (!signal?.aborted) setPreviewLoading(false);
            });
    };

    useEffect(() => {
        const controller = new AbortController();
        loadPreview(controller.signal);
        return () => {
            controller.abort();
            revokePreviewBlob();
        };
    }, [eventId, participationTemplateUrl]);

    const handleSend = async (dryRun = false) => {
        const confirmed = await confirm({
            title: dryRun ? 'Check certificate recipients?' : 'Send certificates?',
            message: dryRun
                ? 'This checks how many checked-in attendees currently match the certificate rules.'
                : 'Certificates will be generated for all eligible checked-in attendees. This can send emails immediately.',
            confirmLabel: dryRun ? 'Check recipients' : 'Send certificates',
            tone: dryRun ? 'info' : 'warning',
        });
        if (!confirmed) return;

        try {
            if (dryRun) setDryRunLoading(true);
            else {
                setSending(true);
                setSendResult(null);
            }

            const res = await api.post(`/admin/events/${eventId}/certificates`, { dryRun });

            if (dryRun) {
                setStats(res.data);
                toast.success(`Found ${res.data.count} recipients`);
            } else {
                setSendResult(res.data);
                if ((res.data.generated || res.data.sent || 0) > 0) {
                    toast.success(res.data.message || `${res.data.generated || res.data.sent} certificate(s) generated`);
                } else {
                    toast.error(res.data.message || 'No certificates were generated');
                }
            }
        } catch (error) {
            const errData = error.response?.data;
            toast.error(errData?.error || 'Failed to send certificates');
            if (errData) setSendResult(errData);
        } finally {
            if (dryRun) setDryRunLoading(false);
            else setSending(false);
        }
    };

    const hasAnyConfig = event.certificateEnabled ||
        event.certificateTemplateUrl ||
        Object.values(configs).some(c => c?.templateUrl);

    if (!hasAnyConfig) {
        return (
            <div className="admin-card min-w-0 p-8 text-center">
                {dialog}
                <Award className="mx-auto mb-3 text-[#aaa096]" size={48} />
                <h3 className="mb-1.5 text-lg font-bold text-[#f7efe3]">Certificates Not Configured</h3>
                <p className="mx-auto mb-4 max-w-md text-sm admin-muted">
                    Upload a template and map fields on the Edit Event page.
                </p>
                <Link to={`/admin/events/${eventId}/edit`} className="admin-primary-action inline-flex">
                    Configure Certificate
                </Link>
            </div>
        );
    }

    const hasTemplate = participationTemplateUrl;

    return (
        <div className="space-y-4">
            {dialog}
            <div className="admin-card min-w-0 p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-bold text-[#f7efe3]">Certificate Dashboard</h2>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                    <div className="min-w-0 md:col-span-3">
                        <h3 className="mb-1.5 text-xs font-semibold uppercase text-[#aaa096]">Preview</h3>
                        <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#12100e]" style={{ height: '360px' }}>
                            {previewBlobUrl ? (
                                <iframe
                                    src={previewBlobUrl}
                                    className="w-full h-full"
                                    title="Certificate Preview"
                                />
                            ) : previewError ? (
                                <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
                                    <XCircle className="text-red-400" size={36} />
                                    <p className="break-words text-sm text-red-300">{previewError}</p>
                                    <button type="button" onClick={() => loadPreview()} className="text-xs font-bold text-[#f7efe3] underline decoration-[#E23744] underline-offset-4 hover:text-white">
                                        Retry
                                    </button>
                                </div>
                            ) : previewLoading || hasTemplate ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 admin-muted">
                                    <div className="h-8 w-8 animate-spin rounded-full border-r-2 border-t-2 border-[#E23744]/30 border-t-[#E23744]"></div>
                                    <span className="text-sm">Loading preview...</span>
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-[#8f857c]">No Preview</div>
                            )}
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-col justify-center gap-3 md:col-span-2">
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
                            <h4 className="mb-1.5 text-sm font-semibold text-[#f7efe3]">Ready to Send</h4>
                            <p className="mb-3 text-xs admin-muted">
                                Certificates will be generated and emailed to all attendees who have checked in.
                            </p>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => handleSend(true)}
                                    disabled={dryRunLoading || sending}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-[#aaa096] transition-all hover:border-[#f2e7d8]/25 hover:text-[#f7efe3] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {dryRunLoading ? 'Checking...' : 'Check Count'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleSend(false)}
                                    disabled={sending}
                                    className="admin-primary-action inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Send size={16} className={sending ? 'animate-spin' : ''} />
                                    {sending ? 'Sending...' : 'Send Certificates'}
                                </button>
                            </div>
                        </div>

                        {stats && (
                            <div className="rounded-[1.25rem] border border-[#E23744]/20 bg-[#E23744]/10 p-4">
                                <p className="break-words text-[#f7efe3]">
                                    <strong>Dry Run Result:</strong> {stats.count} certificates will be sent.
                                </p>
                            </div>
                        )}

                        {sendResult && (
                            <div className={`rounded-[1.25rem] border p-4 ${(sendResult.generated || sendResult.sent || 0) > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                <p className={`break-words ${(sendResult.generated || sendResult.sent || 0) > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                    <strong>Issue Result:</strong> {sendResult.generated || 0} generated, {sendResult.sent || 0} emailed, {sendResult.failed || 0} failed
                                    {sendResult.total ? ` out of ${sendResult.total} total` : ''}
                                </p>
                                {sendResult.errors && sendResult.errors.length > 0 && (
                                    <div className="mt-2 max-h-32 overflow-y-auto text-sm text-red-400">
                                        {sendResult.errors.map((e, i) => (
                                            <div key={i} className="truncate">{e.email}: {e.error || e.reason || 'Unknown error'}</div>
                                        ))}
                                    </div>
                                )}
                                {sendResult.emailErrors && sendResult.emailErrors.length > 0 && (
                                    <div className="mt-2 max-h-32 overflow-y-auto text-sm text-amber-300">
                                        {sendResult.emailErrors.map((e, i) => (
                                            <div key={i} className="truncate">{e.email}: email failed, certificate generated</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
