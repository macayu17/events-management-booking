import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import useConfirmDialog from '../../hooks/useConfirmDialog';
import EventDetailsForm from './EventDetailsForm';
import { buildEventDetailsPayload } from './eventDetailsPayload';

export default function CreateEventPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm();
  const [loading, setLoading] = useState(false);
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState(null);
  const hasUnsavedChanges = isDirty || Boolean(posterFile);
  const { confirm, dialog } = useConfirmDialog();

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
        title: 'Discard event draft?',
        message: 'Your unsaved event details and selected poster will be lost.',
        confirmLabel: 'Discard changes',
        tone: 'warning',
      });
      if (!confirmed) return;
    }
    navigate('/admin/events');
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
    setPosterPreview(null);
  };

  const onSubmit = async (data) => {
    setLoading(true);

    try {
      const eventData = buildEventDetailsPayload(data);

      const response = await api.post('/admin/events', eventData);
      const event = response.data;

      // Upload poster if selected
      if (posterFile) {
        const formData = new FormData();
        formData.append('poster', posterFile);

        await api.post(`/admin/events/${event.id}/poster-upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      toast.success('Event created successfully!');
      navigate('/admin/events');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl pb-20">
      {dialog}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="admin-eyebrow mb-2">Event setup</p>
          <h1 className="break-words text-3xl font-black tracking-tight text-[#f7efe3]">Create event</h1>
          <p className="admin-muted mt-1 max-w-2xl break-words text-sm">
            Add the details attendees will see before publishing the event.
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <EventDetailsForm
          errors={errors}
          idPrefix="create"
          onPosterChange={handlePosterChange}
          onPosterRemove={handlePosterRemove}
          posterFile={posterFile}
          posterPreview={posterPreview}
          priceDefaultValue="0"
          register={register}
          showPlaceholders
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={loading}
            className="admin-primary-action w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {loading ? 'Creating...' : 'Create Event'}
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
    </div>
  );
}
