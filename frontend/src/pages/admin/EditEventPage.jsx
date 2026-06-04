import { Suspense, lazy, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api, { getImageUrl } from '../../utils/api';
import toast from 'react-hot-toast';
import { Settings, Award } from 'lucide-react';
import { format } from 'date-fns';
import useConfirmDialog from '../../hooks/useConfirmDialog';
import EventDetailsForm from './EventDetailsForm';
import { buildEventDetailsPayload } from './eventDetailsPayload';

const CertificateDesigner = lazy(() => import('../../components/CertificateDesigner'));

export default function EditEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm();
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState(null);
  const [existingPosterPreview, setExistingPosterPreview] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [eventData, setEventData] = useState(null);
  const isCertificateTab = activeTab === 'certificate';
  const hasUnsavedChanges = isDirty || Boolean(posterFile);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    fetchEvent();
  }, [id]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleLeave = async () => {
    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: 'Discard event edits?',
        message: 'Your unsaved event changes and selected poster will be lost.',
        confirmLabel: 'Discard changes',
        tone: 'warning',
      });
      if (!confirmed) return;
    }
    navigate('/admin/events');
  };

  const fetchEvent = async () => {
    try {
      const response = await api.get(`/admin/events/${id}`);
      const event = response.data;
      setEventData(event);

      reset({
        title: event.title,
        description: event.description,
        location: event.location,
        startTime: format(new Date(event.startTime), "yyyy-MM-dd'T'HH:mm"),
        endTime: format(new Date(event.endTime), "yyyy-MM-dd'T'HH:mm"),
        capacity: event.capacity,
        price: event.priceCents / 100
      });

      const nextPosterPreview = event.posterUrl ? getImageUrl(event.posterUrl) : null;
      setExistingPosterPreview(nextPosterPreview);
      setPosterPreview(nextPosterPreview);
    } catch (error) {
      toast.error('Failed to fetch event');
      navigate('/admin/events');
    } finally {
      setFetchLoading(false);
    }
  };

  const handlePosterChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPosterFile(file);
      setPosterPreview(URL.createObjectURL(file));
    }
  };

  const handlePosterRemove = () => {
    setPosterFile(null);
    setPosterPreview(existingPosterPreview);
  };

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const eventData = buildEventDetailsPayload(data);

      await api.put(`/admin/events/${id}`, eventData);

      // Upload new poster if selected
      if (posterFile) {
        const formData = new FormData();
        formData.append('poster', posterFile);

        await api.post(`/admin/events/${id}/poster-upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      toast.success('Event updated successfully!');
      navigate('/admin/events');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to update event');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className={`${isCertificateTab ? 'max-w-7xl' : 'max-w-4xl'} mx-auto pb-20`}>
      {dialog}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="admin-eyebrow mb-2">Event setup</p>
          <h1 className="break-words text-3xl font-black tracking-tight text-[#f7efe3]">Edit event</h1>
          <p className="admin-muted mt-1 break-words text-sm">
            Update the event details, poster, and certificate templates.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLeave}
          className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#f7efe3] transition-colors hover:bg-white/[0.08]"
        >
          Back to events
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-8">
        <div className="flex w-fit rounded-full border border-white/10 bg-[#100e0c]/80 p-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'details' ? 'bg-[#f2e7d8] text-[#17110d] shadow-lg' : 'text-[#aaa096] hover:text-[#f7efe3]'
            }`}
          >
            <Settings size={16} />
            Details
          </button>
          <button
            onClick={() => setActiveTab('certificate')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'certificate' ? 'bg-[#f2e7d8] text-[#17110d] shadow-lg' : 'text-[#aaa096] hover:text-[#f7efe3]'
            }`}
          >
            <Award size={16} />
            Certificate
          </button>
        </div>
      </div>

      {activeTab === 'certificate' ? (
        <Suspense fallback={
          <div className="card flex min-h-[240px] items-center justify-center text-gray-400">
            Loading certificate studio...
          </div>
        }>
          <CertificateDesigner
            eventId={id}
            initialConfig={{
              templateUrl: eventData?.certificateTemplateUrl,
              mapping: eventData?.certificateMapping
            }}
            onSave={fetchEvent}
          />
        </Suspense>
      ) : (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <EventDetailsForm
          errors={errors}
          idPrefix="edit"
          onPosterChange={handlePosterChange}
          onPosterRemove={handlePosterRemove}
          posterFile={posterFile}
          posterPreview={posterPreview}
          register={register}
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={loading}
            className="admin-primary-action w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="btn btn-secondary w-full sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
